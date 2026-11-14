import { test, expect } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CompassMcpServer } from '../src/main/CompassMcpServer'
import { createMcpExecutor } from '../src/renderer/src/engine/McpDesign'
import { readMcpSettings } from '../src/shared/Mcp'
import { createServer } from 'node:net'

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}
function drawing() {
  const renderer = {
    logicDisplay: { components: [] as unknown[] },
    readonly: false,
    isEditing: false,
    setSelection() {},
    undoStack: [] as string[],
    saveState() {
      this.undoStack.push(JSON.stringify(this.logicDisplay.components))
    }
  }
  const execute = createMcpExecutor(renderer as never)
  return { renderer, execute }
}
test('SDK client creates and edits a design, isolates cursors, rejects stale revisions and enforces read-only', async () => {
  const { renderer, execute } = drawing()
  const server = new CompassMcpServer(
    async (request) =>
      request.tool === 'get_canvas_screenshot'
        ? {
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
            mimeType: 'image/png',
            width: 1,
            height: 1,
            viewport: { left: 0, top: 0, right: 10, bottom: 10, units: 'cm' }
          }
        : execute(request),
    () => {}
  )
  const settings = {
    mcpEnabled: 'true',
    mcpPort: String(await freePort()),
    mcpToken: 'test-token-'.repeat(5)
  }
  const status = await server.configure(settings)
  expect(status.error).toBeUndefined()
  const connect = async (name: string) => {
    const client = new Client({ name, version: '1.0' })
    const transport = new StreamableHTTPClientTransport(new URL(status.endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${settings.mcpToken}` } }
    })
    await client.connect(transport)
    return { client, transport }
  }
  const first = await connect('claude-ai')
  const second = await connect('ChatGPT')
  try {
    expect((await first.client.listTools()).tools).toHaveLength(6)
    expect(server.status().agents).toHaveLength(2)
    expect(server.status().agents[0]).toMatchObject({
      name: 'Claude',
      color: '#D97757',
      profile: 'claude'
    })
    expect(server.status().agents[1]).toMatchObject({
      name: 'ChatGPT',
      color: '#10A37F',
      profile: 'chatgpt'
    })
    expect(server.status().agents[0].color).not.toBe(server.status().agents[1].color)
    const call = (name: string, args = {}) => first.client.callTool({ name, arguments: args })
    const screenshot = await call('get_canvas_screenshot')
    expect(screenshot.isError).toBeUndefined()
    expect(screenshot.content).toContainEqual(
      expect.objectContaining({ type: 'image', mimeType: 'image/png' })
    )
    expect((await call('get_canvas_screenshot', { maxDimension: 99999 })).isError).toBe(true)
    expect((await call('set_cursor', { x: 10, y: 20, color: '#123456' })).isError).toBeUndefined()
    expect(server.status().agents[0]).toMatchObject({ x: 10, y: 20, color: '#123456' })
    expect(server.status().agents[1].x).toBe(0)
    expect(
      (
        await call('add_components', {
          components: [
            { kind: 'rectangle', x1: 0, y1: 0, x2: 100, y2: 50 },
            { kind: 'label', x: 5, y: 5, text: 'Room' }
          ]
        })
      ).isError
    ).toBeUndefined()
    expect(renderer.logicDisplay.components).toHaveLength(2)
    expect(renderer.undoStack).toHaveLength(1)
    const design = await call('get_design')
    const revision = JSON.parse((design.content as { text: string }[])[0].text).result.revision
    expect((await call('delete_components', { revision: 'stale', indexes: [0] })).isError).toBe(
      true
    )
    expect((await call('delete_components', { revision, indexes: [99] })).isError).toBe(true)
    expect(renderer.undoStack).toHaveLength(1)
    expect((await call('delete_components', { revision, indexes: [0] })).isError).toBeUndefined()
    expect(renderer.logicDisplay.components).toHaveLength(1)
    expect(
      (await call('add_components', { components: [{ kind: 'point', x: 1e20, y: 0 }] })).isError
    ).toBe(true)
    renderer.isEditing = true
    expect(
      (await call('add_components', { components: [{ kind: 'point', x: 1, y: 0 }] })).isError
    ).toBe(true)
    renderer.isEditing = false
    await second.transport.terminateSession()
    expect(server.status().agents).toHaveLength(1)
    await server.configure({ ...settings, mcpAllowEdits: 'false' })
    const third = await connect('Viewer')
    try {
      expect(
        (await third.client.callTool({ name: 'get_canvas_screenshot', arguments: {} })).isError
      ).toBeUndefined()
      expect(
        (
          await third.client.callTool({
            name: 'add_components',
            arguments: { components: [{ kind: 'point', x: 0, y: 0 }] }
          })
        ).isError
      ).toBe(true)
    } finally {
      await third.client.close()
    }
  } finally {
    await first.client.close()
    await second.client.close()
    await server.stop()
  }
  expect(server.status().agents).toHaveLength(0)
}, 20000)

test('HTTP authentication, origin checks, invalid settings, and port conflicts', async () => {
  const server = new CompassMcpServer(
    async () => ({}),
    () => {}
  )
  const settings = {
    mcpEnabled: 'true',
    mcpPort: String(await freePort()),
    mcpToken: 'x'.repeat(40)
  }
  const status = await server.configure(settings)
  const other = new CompassMcpServer(
    async () => ({}),
    () => {}
  )
  try {
    expect((await fetch(status.endpoint)).status).toBe(401)
    expect(
      (
        await fetch(status.endpoint, {
          headers: { Authorization: `Bearer ${settings.mcpToken}`, Origin: 'https://example.com' }
        })
      ).status
    ).toBe(403)
    expect(
      (
        await fetch(status.endpoint, {
          headers: { Authorization: `Bearer ${settings.mcpToken}`, 'mcp-session-id': 'missing' }
        })
      ).status
    ).toBe(404)
    expect((await other.configure(settings)).error).toBeDefined()
    expect(other.status().running).toBe(false)
    expect(() => readMcpSettings({ ...settings, mcpPort: 'NaN' })).toThrow()
    expect(() => readMcpSettings({ ...settings, mcpToken: 'short' })).toThrow()
  } finally {
    await server.stop()
    await other.stop()
  }
})

test('expired commands and mixed invalid batches never mutate the drawing', () => {
  const { renderer, execute } = drawing()
  const request = {
    id: '1',
    tool: 'add_components' as const,
    args: { components: [{ kind: 'point', x: 1, y: 2 }] },
    agent: { id: 'a', name: 'a', color: '#123456', x: 0, y: 0 },
    deadline: 0
  }
  expect(() => execute(request)).toThrow('expired')
  expect(() =>
    execute({
      ...request,
      deadline: Date.now() + 1000,
      args: {
        components: [
          { kind: 'point', x: 0, y: 0 },
          { kind: 'point', x: NaN, y: 0 }
        ]
      }
    })
  ).toThrow()
  expect(renderer.logicDisplay.components).toHaveLength(0)
  expect(renderer.undoStack).toHaveLength(0)
})

test('cursor follows camera and zoom while keeping its size, label and agent color', async () => {
  const { drawMcpCursors } = await import('../src/renderer/src/engine/McpCursors')
  const calls: unknown[][] = []
  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    stroke() {},
    moveTo(...args: number[]) {
      calls.push(['move', ...args])
    },
    lineTo(...args: number[]) {
      calls.push(['line', ...args])
    },
    fill() {
      calls.push(['fill', this.fillStyle])
    },
    roundRect(...args: number[]) {
      calls.push(['badge', ...args])
    },
    measureText() {
      return { width: 50 }
    },
    fillText(...args: unknown[]) {
      calls.push(['text', ...args, this.fillStyle])
    }
  }
  drawMcpCursors(
    context as never,
    [{ id: 'abcd-123', name: 'Designer', color: '#123456', x: 10, y: 20 }],
    5,
    -10,
    2
  )
  expect(calls).toContainEqual(['move', 30, 20])
  expect(calls).toContainEqual(['line', 34, 36])
  expect(calls).toContainEqual(['fill', '#123456'])
  expect(calls).toContainEqual(['badge', 45, 36, 58, 20, 5])
  expect(calls).toContainEqual(['text', 'Designer', 49, 50, '#ffffff'])
})

// Playback tests use a deterministic clock; update() records frames even without a focused-window RAF.
test('MCP playback redraws intermediate cursor positions and adds components in order', async () => {
  const { createMcpPlayback } = await import('../src/renderer/src/engine/McpPlayback')
  const { renderer } = drawing()
  const frames: Array<{ x: number; count: number }> = []
  const agent = { id: 'playback', name: 'AI', color: '#123456', x: 0, y: 0 }
  const animated = Object.assign(renderer, {
    mcpAgents: [agent],
    markDirty() {},
    update() {
      frames.push({ x: agent.x, count: renderer.logicDisplay.components.length })
    }
  })
  const playback = createMcpPlayback(
    animated as never,
    () => {},
    async () => {}
  )
  const request = {
    id: 'play',
    tool: 'add_components' as const,
    args: {
      components: [
        { kind: 'point', x: 100, y: 10 },
        { kind: 'point', x: 200, y: 20 }
      ]
    },
    agent: { ...agent },
    deadline: Date.now() + 45_000
  }
  const pending = playback.execute(request)
  const queuedRead = playback.execute({ ...request, id: 'read', tool: 'get_design', args: {} })
  expect(renderer.logicDisplay.components).toHaveLength(0)
  const result = (await pending) as { completed: number; cursor: { x: number } }
  expect(result.completed).toBe(2)
  expect(result.cursor.x).toBe(200)
  expect(frames.some((frame) => frame.x > 0 && frame.x < 100 && frame.count === 0)).toBe(true)
  expect(frames.some((frame) => frame.x > 100 && frame.x < 200 && frame.count === 1)).toBe(true)
  expect(renderer.undoStack).toHaveLength(2)
  expect(((await queuedRead) as { components: unknown[] }).components).toHaveLength(2)
  playback.dispose()
})

test('MCP playback stops safely on user edits, disconnection, disposal and revoked access', async () => {
  const { createMcpPlayback } = await import('../src/renderer/src/engine/McpPlayback')
  for (const reason of ['user edit', 'disconnect', 'dispose', 'permission']) {
    const { renderer } = drawing()
    const agent = { id: 'cancel', name: 'AI', color: '#123456', x: 0, y: 0 }
    const animated = Object.assign(renderer, { mcpAgents: [agent], markDirty() {}, update() {} })
    let allowed = true
    let interrupted = false
    const playback = createMcpPlayback(
      animated as never,
      () => {
        if (!allowed) throw new Error('Revoked')
      },
      async () => {
        if (renderer.logicDisplay.components.length === 1 && !interrupted) {
          interrupted = true
          if (reason === 'user edit') renderer.logicDisplay.components.push({ user: true })
          if (reason === 'disconnect') animated.mcpAgents = []
          if (reason === 'dispose') playback.dispose()
          if (reason === 'permission') allowed = false
        }
      }
    )
    const request = {
      id: 'cancel',
      tool: 'add_components' as const,
      args: {
        components: [
          { kind: 'point', x: 10, y: 10 },
          { kind: 'point', x: 20, y: 20 }
        ]
      },
      agent,
      deadline: Date.now() + 45_000
    }
    await expect(playback.execute(request)).rejects.toThrow('Completed 1 edit(s)')
    expect(renderer.undoStack).toHaveLength(1)
    expect(renderer.logicDisplay.components).toHaveLength(reason === 'user edit' ? 2 : 1)
    playback.dispose()
  }
})

test('playback animates explicit cursor moves and deletes indexes without index shifting', async () => {
  const { createMcpPlayback } = await import('../src/renderer/src/engine/McpPlayback')
  const { renderer } = drawing()
  const agent = { id: 'tools', name: 'AI', color: '#123456', x: 0, y: 0 }
  const animated = Object.assign(renderer, { mcpAgents: [agent], markDirty() {}, update() {} })
  const playback = createMcpPlayback(
    animated as never,
    () => {},
    async () => {}
  )
  const base = { id: 'tools', agent, deadline: Date.now() + 45_000 }
  await playback.execute({ ...base, tool: 'set_cursor', args: { x: 50, y: 60, color: '#abcdef' } })
  expect(agent).toMatchObject({ x: 50, y: 60, color: '#abcdef' })
  await playback.execute({
    ...base,
    tool: 'add_components',
    args: { components: [0, 1, 2].map((x) => ({ kind: 'point', x, y: 0 })) }
  })
  const design = (await playback.execute({ ...base, tool: 'get_design', args: {} })) as {
    revision: string
  }
  await playback.execute({
    ...base,
    tool: 'delete_components',
    args: { revision: design.revision, indexes: [0, 2] }
  })
  expect(renderer.logicDisplay.components).toHaveLength(1)
  expect(renderer.logicDisplay.components[0]).toMatchObject({ x: 1 })
  expect(renderer.undoStack).toHaveLength(5)
  playback.dispose()
})

test('canvas capture redraws before encoding, scales HiDPI output and reports viewport without changing history', async () => {
  const { captureMcpCanvas } = await import('../src/renderer/src/engine/McpScreenshot')
  const calls: string[] = []
  const source = { width: 3200, height: 1800 }
  const renderer = {
    displayRef: source,
    logicDisplay: { components: [] },
    displayWidth: 1600,
    displayHeight: 900,
    zoom: 2,
    cOutX: 100,
    cOutY: -50,
    markDirty() {
      calls.push('dirty')
    },
    update() {
      calls.push('update')
    }
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: '',
      fillRect() {},
      drawImage(image: unknown) {
        expect(image).toBe(source)
        calls.push('draw')
      }
    }),
    toDataURL: () => {
      calls.push('encode')
      return 'data:image/png;base64,cG5n'
    }
  }
  const result = captureMcpCanvas(renderer as never, 1280, () => canvas as never)
  expect(calls).toEqual(['dirty', 'update', 'draw', 'encode'])
  expect(result).toMatchObject({
    width: 1280,
    height: 720,
    data: 'cG5n',
    mimeType: 'image/png',
    viewport: { left: -500, top: -175, right: 300, bottom: 275, units: 'cm' }
  })
  expect(renderer.logicDisplay.components).toHaveLength(0)
  canvas.toDataURL = () => {
    throw new Error('SecurityError')
  }
  expect(() => captureMcpCanvas(renderer as never, 1280, () => canvas as never)).toThrow(
    'Canvas capture failed'
  )
  source.width = 0
  expect(() => captureMcpCanvas(renderer as never, 1280, () => canvas as never)).toThrow(
    'not ready'
  )
})

test('screenshot waits for queued edits and remains available on a read-only canvas', async () => {
  const { createMcpPlayback } = await import('../src/renderer/src/engine/McpPlayback')
  const { renderer } = drawing()
  const agent = { id: 'capture', name: 'AI', color: '#123456', x: 0, y: 0 }
  let capturedCount = -1
  const animated = Object.assign(renderer, {
    mcpAgents: [agent],
    markDirty() {},
    update() {},
    displayRef: { width: 100, height: 100 },
    displayWidth: 100,
    displayHeight: 100,
    zoom: 1,
    cOutX: 0,
    cOutY: 0
  })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillRect() {},
          drawImage() {
            capturedCount = renderer.logicDisplay.components.length
          }
        }),
        toDataURL: () => 'data:image/png;base64,cG5n'
      })
    }
  })
  const playback = createMcpPlayback(
    animated as never,
    () => {},
    async () => {}
  )
  const base = { id: 'capture', agent, deadline: Date.now() + 45_000 }
  try {
    const edit = playback.execute({
      ...base,
      tool: 'add_components',
      args: { components: [{ kind: 'point', x: 10, y: 10 }] }
    })
    const capture = playback.execute({ ...base, tool: 'get_canvas_screenshot', args: {} })
    await edit
    expect(((await capture) as { mimeType: string }).mimeType).toBe('image/png')
    expect(capturedCount).toBe(1)
    renderer.readonly = true
    renderer.isEditing = true
    await playback.execute({ ...base, tool: 'get_canvas_screenshot', args: {} })
    expect(renderer.undoStack).toHaveLength(1)
  } finally {
    playback.dispose()
    if (previous) Object.defineProperty(globalThis, 'document', previous)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('agent profiles normalize known names without mislabeling unknown clients', async () => {
  const { resolveAgentIdentity } = await import('../src/shared/AgentIdentity')
  for (const name of [
    'Claude',
    'claude-ai',
    'CLAUDE DESKTOP',
    'claude-code',
    '@anthropic/claude-code'
  ]) {
    expect(resolveAgentIdentity(name, '#ffffff')).toMatchObject({
      name: 'Claude',
      color: '#D97757',
      profile: 'claude'
    })
  }
  expect(resolveAgentIdentity('chat-gpt', '#ffffff')).toMatchObject({
    name: 'ChatGPT',
    profile: 'chatgpt'
  })
  expect(resolveAgentIdentity('codex-cli', '#ffffff')).toMatchObject({
    name: 'Codex',
    profile: 'codex'
  })
  expect(resolveAgentIdentity('Gemini CLI', '#ffffff')).toMatchObject({
    name: 'Gemini',
    profile: 'gemini'
  })
  expect(resolveAgentIdentity('GitHub Copilot', '#ffffff')).toMatchObject({
    name: 'Copilot',
    profile: 'copilot'
  })
  expect(resolveAgentIdentity('Cursor', '#ffffff')).toMatchObject({
    name: 'Cursor',
    profile: 'cursor'
  })
  expect(resolveAgentIdentity('Claudette', '#123456')).toEqual({
    name: 'Claudette',
    color: '#123456'
  })
  expect(resolveAgentIdentity('  Zean  ', '#123456')).toEqual({ name: 'Zean', color: '#123456' })
  expect(resolveAgentIdentity('mcp-remote', '#123456')).toEqual({
    name: 'mcp-remote',
    color: '#123456'
  })
  expect(resolveAgentIdentity('   ', '#123456')).toEqual({ name: 'Guest', color: '#123456' })
})
