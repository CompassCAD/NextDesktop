/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, globals = {}) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      exports,
      require,
      Buffer,
      URL,
      fetch,
      setTimeout,
      clearTimeout,
      AbortController,
      TextDecoder,
      console,
      ...globals
    }
  )
  return exports
}
const { ExtensionService, parseManifest } = load('src/main/ExtensionService.ts')
const { SettingsStore } = load('src/main/SettingsStore.ts')
const { ExtensionDecisions } = load('src/main/ExtensionDecisions.ts')
function fixture(t, permissions = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-extension-'))
  let disabled = []
  const service = new ExtensionService(dir, () => disabled)
  const file = path.join(dir, 'sample.lua')
  fs.writeFileSync(file, '-- @compasscad ' + JSON.stringify({ name: 'Sample', permissions }) + '\n')
  t.after(() => {
    service.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return {
    dir,
    service,
    file,
    disable: () => {
      disabled = ['sample.lua']
      service.reconcile()
    }
  }
}

test('Allow and Deny persist through new service and settings store instances', async (t) => {
  const { dir, file } = fixture(t, ['web.request'])
  const config = path.join(dir, '.test-config')
  const create = () => new ExtensionService(dir, () => [], new ExtensionDecisions(new SettingsStore(config)))
  let service = create()
  assert.ok(await service.activate('sample.lua', async () => true))
  service.dispose()
  service = create()
  assert.ok(await service.activate('sample.lua', async () => { throw Error('Unexpected repeated prompt') }))
  service.dispose()
  fs.appendFileSync(file, '\n-- New extension version')
  service = create()
  let prompts = 0
  assert.equal(await service.activate('sample.lua', async () => { prompts++; return false }), null)
  assert.equal(prompts, 1)
  service.dispose()
  service = create()
  assert.equal(await service.activate('sample.lua', async () => { throw Error('Repeated denial prompt') }), null)
  service.dispose()
  const store = new SettingsStore(config)
  store.update('set', { extensionPermissionRevisions: JSON.stringify({ 'sample.lua': 'reset-1' }) })
  service = create()
  assert.ok(await service.activate('sample.lua', async () => { prompts++; return true }))
  assert.equal(prompts, 2)
  service.dispose()
})

test('failed decision persistence never authorizes an extension', async (t) => {
  const { dir } = fixture(t, ['web.request'])
  const decisions = new ExtensionDecisions({
    read: () => ({}), update: () => { throw Error('Disk full') }
  })
  const service = new ExtensionService(dir, () => [], decisions)
  await assert.rejects(service.activate('sample.lua', async () => true), /Disk full/)
  service.dispose()
})
test('manifest discovery never executes code; unknown permissions fail closed', async (t) => {
  const { service } = fixture(t, ['shell.execute'])
  assert.match((await service.list())[0].error, /Unsupported/)
  await assert.rejects(
    service.activate('sample.lua', async () => true),
    /Unsupported/
  )
  assert.equal(parseManifest('legacy.lua', 'error("not executed")').permissions.length, 0)
  assert.throws(() => parseManifest('bad.lua', '-- @compasscad {'), /JSON/)
  await assert.rejects(
    service.activate('../sample.lua', async () => true),
    /Invalid/
  )
})
test('denial, undeclared access, blacklist and changed code never authorize OS access', async (t) => {
  const { service, file, disable } = fixture(t, ['filesystem.read'])
  assert.equal(await service.activate('sample.lua', async () => false), null)
  const active = await service.activate('sample.lua', async () => true)
  await assert.rejects(
    service.call(active.token, 'filesystem.write', { path: file, data: 'bad' }),
    /Permission denied/
  )
  await assert.rejects(service.call('forged', 'filesystem.read', { path: file }), /not active/)
  await assert.rejects(
    service.activate('sample.lua', async () => {
      fs.appendFileSync(file, '-- changed')
      return true
    }),
    /changed/
  )
  disable()
  await assert.rejects(service.call(active.token, 'filesystem.read', { path: file }), /not active/)
  assert.equal(
    await service.activate('sample.lua', async () => {
      throw Error('must not prompt')
    }),
    null
  )
})
test('approved filesystem, loopback server and WebRequest work and revoke cleanly', async (t) => {
  const { dir, service, disable } = fixture(t, [
    'filesystem.read',
    'filesystem.write',
    'server.listen',
    'web.request'
  ])
  const { token } = await service.activate('sample.lua', async () => true)
  const file = path.join(dir, 'hello.txt')
  await service.call(token, 'filesystem.write', { path: file, data: 'hello' })
  assert.equal(await service.call(token, 'filesystem.read', { path: file }), 'hello')
  assert.ok((await service.call(token, 'filesystem.list', { path: dir })).includes('hello.txt'))
  await assert.rejects(service.call(token, 'filesystem.read', { path: 'relative.txt' }), /absolute/)
  await assert.rejects(service.call(token, 'web.request', { url: 'file:///etc/passwd' }), /HTTP/)
  const server = await service.call(token, 'server.start', { port: 0, body: 'hello from Lua' })
  const response = await service.call(token, 'web.request', { url: server.url })
  assert.equal(response.status, 200)
  assert.equal(response.body, 'hello from Lua')
  const other = await service.activate('sample.lua', async () => true)
  await assert.rejects(service.call(other.token, 'server.stop', { id: server.id }), /Unknown/)
  const second = await service.call(other.token, 'server.start', { body: 'second' })
  disable()
  await assert.rejects(fetch(second.url))
})

const { LuaPluginHost } = load('src/renderer/src/plugins/LuaBridge.ts', {
  require: (id) => (id.endsWith('/Component') ? { componentTypes: {} } : require(id))
})
test('Lua cannot access JS, OS, loaders or another extension state; canvas bridge remains present', () => {
  const host = new LuaPluginHost()
  try {
    host.addExtension(
      'a.lua',
      `
      assert(js == nil and io == nil and os == nil and debug == nil and package == nil)
      assert(loadfile == nil and dofile == nil and load == nil)
      assert(not pcall(require, 'js'))
      assert(not pcall(require, 'io'))
      assert(type(require('engine').line) == 'function')
      _G.privateValue = 'secret'
      require('ui').registerTab('Test', function() return require('ui').Text({value='A'}) end)
    `,
      'token-a'
    )
    host.addExtension(
      'b.lua',
      `
      assert(privateValue == nil and _G.privateValue == nil)
      require('ui').registerTab('Test', function() return require('ui').Text({value='B'}) end)
    `,
      'token-b'
    )
    assert.equal(host.listGroups().length, 2)
    assert.equal(host.renderTab(JSON.stringify(['a.lua', 'Test'])).props.value, 'A')
    assert.equal(host.renderTab(JSON.stringify(['b.lua', 'Test'])).props.value, 'B')
    host.removeExtension('a.lua')
    assert.equal(host.renderTab(JSON.stringify(['a.lua', 'Test'])), null)
    assert.equal(host.listGroups().length, 1)
  } finally {
    host.dispose()
  }
})

test('sample extension runs asynchronous server, WebRequest and filesystem callbacks through Lua', async (t) => {
  const { service, file, dir } = fixture(t)
  const source = fs.readFileSync('examples/extensions/permissions-demo.lua', 'utf8')
  fs.writeFileSync(file, source)
  const { token } = await service.activate('sample.lua', async () => true)
  const { LuaPluginHost: Host } = load('src/renderer/src/plugins/LuaBridge.ts', {
    require: (id) => (id.endsWith('/Component') ? { componentTypes: {} } : require(id)),
    window: { api: { extensionCall: (...args) => service.call(...args) } }
  })
  const host = new Host()
  t.after(() => host.dispose())
  host.addExtension('sample.lua', source, token)
  const render = () => host.renderTab(JSON.stringify(['sample.lua', 'Permissions demo']))
  const waitFor = async (text) => {
    for (let i = 0; i < 200; i++) {
      if (render().children[0].props.value.includes(text)) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.fail('Callback did not update UI: ' + render().children[0].props.value)
  }
  render().children[1].props.onClick()
  await waitFor('returned: Hello from CompassCAD Lua!')
  const url = render().children[0].props.value.split(' returned:')[0]
  render().children[3].props.onChange(path.join(dir, 'sample.txt'))
  render().children[4].props.onClick()
  await waitFor('true')
  render().children[5].props.onClick()
  await waitFor('Written by the Lua permissions demo.')
  host.removeExtension('sample.lua')
  service.deactivate('sample.lua')
  await assert.rejects(fetch(url))
})

test('closing the application during consent cancels activation', async (t) => {
  const { service } = fixture(t, ['web.request'])
  await assert.rejects(
    service.activate('sample.lua', async () => {
      service.dispose()
      return true
    }),
    /changed|cancelled/
  )
})
