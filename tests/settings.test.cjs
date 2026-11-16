/* Plain CommonJS Node test harness; TypeScript sources are compiled in memory. */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require, ...globals }, { filename: file })
  return exports
}
const { SettingsStore } = load('src/main/SettingsStore.ts')
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-settings-test-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return path.join(dir, 'compasscad', '.compasscfg')
}
test('persists strings, unknown and prototype-like keys across restarts', (t) => {
  const file = fixture(t)
  const store = new SettingsStore(file)
  assert.equal(Object.keys(store.read()).length, 0)
  store.update('set', JSON.parse('{"fontSize":"24","custom":"keep","__proto__":"safe"}'))
  const restarted = new SettingsStore(file)
  assert.equal(restarted.read().fontSize, '24')
  assert.equal(restarted.read().__proto__, 'safe')
  restarted.update('set', { language: 'ja' })
  restarted.update('remove', { fontSize: '' })
  assert.equal(restarted.read().custom, 'keep')
  assert.equal(restarted.read().fontSize, undefined)
  restarted.update('clear')
  assert.equal(Object.keys(new SettingsStore(file).read()).length, 0)
})
test('malformed files and failed commits preserve original data', (t) => {
  const file = fixture(t)
  const store = new SettingsStore(file)
  store.update('set', { language: 'en' })
  fs.mkdirSync(file + '.tmp')
  assert.throws(() => store.update('set', { language: 'ja' }))
  assert.equal(store.read().language, 'en')
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).language, 'en')
  fs.writeFileSync(file, '{broken')
  assert.throws(() => new SettingsStore(file).update('set', { language: 'ja' }))
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken')
  fs.writeFileSync(file, '{"language":42}')
  assert.throws(() => new SettingsStore(file).read())
})
test('renderer API coerces strings, migrates once, and propagates errors', (t) => {
  const store = new SettingsStore(fixture(t))
  let fail = false
  let changes = 0
  const { settingsStorage: storage, migrateSettings } = load(
    'src/renderer/src/utils/SettingsStorage.ts',
    {
      Event: class {},
      localStorage: { getItem: (key) => (key === 'language' ? 'id' : null) },
      window: {
        dispatchEvent: () => changes++,
        api: {
          settingsStorage: (op, entries) =>
            fail
              ? { error: 'disk full' }
              : { values: op === 'read' ? store.read() : store.update(op, entries) }
        }
      }
    }
  )
  assert.equal(storage.getItem('missing'), null)
  storage.setItem('number', 42)
  assert.equal(storage.getItem('number'), '42')
  assert.equal(storage.length, 1)
  assert.equal(storage.key(0), 'number')
  assert.equal(storage.key(99), null)
  migrateSettings()
  assert.equal(storage.getItem('language'), 'id')
  storage.setItem('language', 'en')
  migrateSettings()
  assert.equal(storage.getItem('language'), 'en')
  const before = changes
  fail = true
  assert.throws(() => storage.setItem('language', 'ja'), /disk full/)
  assert.equal(storage.getItem('language'), 'en')
  assert.equal(changes, before)
  fail = false
  storage.removeItem('number')
  assert.equal(storage.getItem('number'), null)
  storage.clear()
  assert.equal(storage.length, 0)
})

const options = load('src/renderer/src/utils/SettingsOptions.ts')
test('metric and imperial conversions preserve physical distances', () => {
  assert.equal(options.formatMeasurement(100, 'm', 2), '1.00 m')
  assert.equal(options.formatMeasurement(2.54, 'in', 3), '1.000 in')
  assert.equal(options.formatMeasurement(30.48, 'ft', 0), '1 ft')
  assert.equal(options.formatMeasurement(1, 'mm', 1), '10.0 mm')
  assert.equal(options.resolveUnit('unknown'), 'm')
  assert.equal(options.resolveUnit('__proto__'), 'm')
})
test('numeric settings reject empty, nonfinite, out of range and fractional integer values', () => {
  for (const key of Object.keys(options.numericSettings)) {
    const rule = options.numericSettings[key]
    assert.ok(options.validNumericSetting(key, rule.default))
    for (const value of ['', ' ', 'NaN', 'Infinity', -1, rule.max + 1]) {
      assert.equal(options.validNumericSetting(key, value), false)
    }
  }
  assert.ok(options.validNumericSetting('gridSpacing', 2.54))
  assert.equal(options.validNumericSetting('gridSpacing', 0), false)
  assert.equal(options.validNumericSetting('measurementPrecision', 2.5), false)
})
test('every locale resolves Settings keys with English fallback and translates the menu entry', () => {
  const root = 'src/renderer/src/locales/'
  const en = JSON.parse(fs.readFileSync(root + 'en.json', 'utf8'))
  for (const code of ['fr', 'id', 'ja', 'sv', 'zh']) {
    const locale = JSON.parse(fs.readFileSync(root + code + '.json', 'utf8'))
    const { getLocaleKey } = load(root + 'Locale.ts', {
      navigator: { language: code },
      require: (id) => id.endsWith('.json')
        ? { default: JSON.parse(fs.readFileSync(path.join(root, id), 'utf8')) }
        : id.includes('Preferences') ? { preference: () => code } : { settingsStorage: {} }
    })
    for (const key of Object.keys(en.settings)) {
      assert.equal(getLocaleKey('settings.' + key), locale.settings[key] ?? en.settings[key], code + ': ' + key)
    }
    assert.equal(locale.editor.menu.settings, locale.settings.title)
    for (const value of Object.values(locale.settings)) assert.ok(value.trim().length)
  }
})
test('renderer applies preferences and snaps to the custom grid without changing geometry', () => {
  const values = { snap: 'true', measurementUnit: 'in' }
  const numbers = {
    gridSpacing: 2.54,
    snapTolerance: 14,
    maximumStack: 100,
    measurementPrecision: 3
  }
  const { GraphicsRenderer } = load('src/renderer/src/engine/Engine.ts', {
    performance: { now: () => 0 },
    require: (id) =>
      id.endsWith('/Preferences')
        ? {
            preference: (key, fallback) => values[key] ?? fallback,
            numberPreference: (_key, fallback) => fallback,
            numericPreference: (key) => numbers[key]
          }
        : id.endsWith('/SettingsOptions')
          ? options
          : {}
  })
  const renderer = Object.create(GraphicsRenderer.prototype)
  renderer.markDirty = () => {}
  renderer.logicDisplay = { components: [{ x: 25.4, y: 50.8 }] }
  const before = JSON.stringify(renderer.logicDisplay)
  renderer.applyPreferences()
  assert.equal(renderer.gridSpacing, 2.54)
  assert.equal(renderer.snapTolerance, 14)
  assert.equal(renderer.maximumStack, 100)
  assert.equal(renderer.unitMeasure, 'in')
  assert.equal(renderer.unitConversionFactor, 1 / 2.54)
  assert.equal(renderer.measurementPrecision, 3)
  Object.assign(renderer, {
    mouse: { cursorXGlobal: 3, cursorYGlobal: 5 },
    offsetX: 0,
    offsetY: 0,
    displayWidth: 0,
    displayHeight: 0,
    zoom: 1,
    camX: 0,
    camY: 0
  })
  assert.equal(renderer.getCursorXLocal(), 2.54)
  assert.equal(renderer.getCursorYLocal(), 5.08)
  values.snap = 'false'
  values.measurementUnit = 'ft'
  renderer.applyPreferences()
  assert.equal(renderer.getCursorXLocal(), 3)
  assert.equal(renderer.getCursorYLocal(), 5)
  assert.equal(renderer.unitConversionFactor, 1 / 30.48)
  assert.equal(JSON.stringify(renderer.logicDisplay), before)
})
