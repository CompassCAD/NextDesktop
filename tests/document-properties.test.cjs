const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function loader(overrides = {}, globals = {}) {
  const cache = new Map()
  return function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    vm.runInNewContext(
      code,
      {
        exports,
        structuredClone,
        console,
        ...globals,
        require: (id) =>
          Object.hasOwn(overrides, id)
            ? overrides[id]
            : load(path.resolve(path.dirname(file), id + '.ts'))
      },
      { filename: file }
    )
    return exports
  }
}
const load = loader()
const model = load('src/renderer/src/utils/DocumentProperties.ts')
const {
  defaultDocumentProperties: defaults,
  paperDimensions,
  worldPaperDimensions,
  encodeDocument,
  decodeDocument,
  validateDocumentProperties
} = model
const { Line } = load('src/renderer/src/engine/Component.ts')
const { LogicDisplay } = load('src/renderer/src/engine/Logic.ts')

test('Next round trip preserves document metadata and centimetre geometry; legacy stays an array', () => {
  const p = {
    ...defaults(),
    name: 'House',
    author: 'Architect',
    canvas: 'paper',
    scaleDenominator: 100
  }
  const geometry = [new Line(0, 0, 100, 200)]
  const source = encodeDocument(geometry, p, true)
  const result = decodeDocument(source, true)
  assert.equal(result.properties.name, 'House')
  assert.equal(result.properties.scaleDenominator, 100)
  assert.equal(result.components[0].x2, 100)
  assert.equal(encodeDocument(geometry, p, false), JSON.stringify(geometry))
  assert.equal(decodeDocument(encodeDocument(geometry, p, false), false).properties, null)
})

test('paper orientation, margins, reduction and enlargement have physical units', () => {
  const p = { ...defaults(), paper: 'A4', orientation: 'portrait', scaleDenominator: 100 }
  assert.equal(worldPaperDimensions(p).width, 2100)
  assert.equal(worldPaperDimensions(p).height, 2970)
  assert.equal(worldPaperDimensions(p).margin, 100)
  assert.equal(paperDimensions({ ...p, orientation: 'landscape' }).width, 297)
  assert.equal(worldPaperDimensions({ ...p, scaleDenominator: 1, scaleNumerator: 2 }).width, 10.5)
  assert.equal(paperDimensions({ ...p, paper: 'Letter' }).width, 215.9)
  assert.equal(paperDimensions({ ...p, paper: 'custom', widthMm: 400, heightMm: 200 }).height, 400)
})

test('invalid properties and future file versions are rejected', () => {
  for (const patch of [
    { scaleNumerator: 0 },
    { scaleDenominator: Infinity },
    { marginMm: 105 },
    { measurementPrecision: 1.5 },
    { widthMm: NaN },
    { measurementUnit: 'yards' },
    { paper: 'unknown' },
    { name: 5 },
    { canvas: 'unknown' },
    { showPaper: 'yes' }
  ]) {
    assert.throws(() => validateDocumentProperties({ ...defaults(), ...patch }))
  }
  assert.throws(() => decodeDocument('{broken', true))
  assert.throws(() =>
    decodeDocument('{"format":"CompassCAD.Next","version":2,"components":[]}', true)
  )
  assert.throws(() => decodeDocument(encodeDocument([], defaults(), true), false))
  assert.throws(() => decodeDocument('[]', true))
})

function fixture() {
  const calls = { writes: [], messages: [], dialogs: [], prompts: 0 }
  const state = {
    path: 'drawing.cnext',
    content: encodeDocument([new Line(0, 0, 100, 0)], defaults(), true),
    answer: 'yes',
    failWrite: false
  }
  const api = {
    showOpenFileDialog: async () => state.path,
    showSaveFileDialog: async (options) => {
      calls.dialogs.push(options)
      return state.path
    },
    readFile: () => state.content,
    writeFile: (file, data) => {
      if (state.failWrite) throw new Error('disk full')
      calls.writes.push({ file, data })
    }
  }
  const file = loader(
    {
      '../engine/Engine': {},
      '../engine/Logic': { LogicDisplay },
      '../locales/Locale': { getLocaleKey: (key) => key },
      './dxfparse': { convertDxfToCompassCad: () => [] },
      '../components/Toast': { toast: (message) => calls.messages.push(message) },
      '../components/GenericPrompt': {
        callGenericPrompt: async () => {
          calls.prompts++
          return state.answer
        }
      }
    },
    { window: { api } }
  )('src/renderer/src/utils/FileImporter.ts')
  const renderer = {
    logicDisplay: new LogicDisplay(),
    documentProperties: null,
    unitMeasure: 'm',
    measurementPrecision: 2,
    undoStack: ['old'],
    redoStack: ['old'],
    setDocumentProperties(p) {
      this.documentProperties = p ? validateDocumentProperties(p) : null
    },
    cleanUpBeforeImport() {},
    postDoAfterComponentImport() {},
    fitDocumentPaper() {},
    onZoomUpdate() {}
  }
  renderer.logicDisplay.components = [new Line(5, 5, 25, 25)]
  return { calls, state, file, renderer }
}

test('open Next then legacy resets per-document properties and history', async () => {
  const f = fixture()
  await f.file.openFileAndParse(f.renderer)
  assert.equal(f.renderer.documentProperties.measurementUnit, 'mm')
  assert.equal(f.renderer.undoStack.length, 1)
  assert.equal(f.renderer.redoStack.length, 0)
  f.state.path = 'OLD.CCAD'
  f.state.content = JSON.stringify([new Line(1, 2, 3, 4)])
  await f.file.openFileAndParse(f.renderer)
  assert.equal(f.renderer.documentProperties, null)
  assert.equal(f.renderer.logicDisplay.components[0].x2, 3)
})

test('invalid and cancelled opens leave the design, properties and history intact', async () => {
  const f = fixture()
  const original = f.renderer.logicDisplay.components
  f.state.content = '{broken'
  await f.file.openFileAndParse(f.renderer)
  assert.equal(f.renderer.logicDisplay.components, original)
  assert.equal(f.renderer.undoStack[0], 'old')
  f.state.content = encodeDocument([null], defaults(), true)
  await f.file.openFileAndParse(f.renderer)
  assert.equal(f.renderer.logicDisplay.components, original)
  f.state.path = undefined
  await f.file.openFileAndParse(f.renderer)
  assert.equal(f.renderer.logicDisplay.components, original)
})

test('legacy export requires acknowledgement and never serializes properties', async () => {
  const f = fixture()
  f.renderer.documentProperties = defaults()
  f.state.path = 'export.ccad'
  f.state.answer = 'no'
  await f.file.saveFile(f.renderer)
  assert.equal(f.calls.writes.length, 0)
  f.state.answer = 'yes'
  await f.file.saveFile(f.renderer)
  assert.equal(f.calls.prompts, 2)
  assert.ok(Array.isArray(JSON.parse(f.calls.writes[0].data)))
  assert.equal(f.renderer.documentProperties.measurementUnit, 'mm')
})

test('failed save and cancelled save never report success or retain the failed path', async () => {
  const f = fixture()
  f.state.failWrite = true
  await f.file.saveFile(f.renderer)
  assert.equal(f.calls.writes.length, 0)
  assert.ok(f.calls.messages[0].startsWith('documentProperties.saveError'))
  assert.equal(f.renderer.documentProperties, null)
  f.state.failWrite = false
  f.state.path = undefined
  await f.file.saveFile(f.renderer)
  assert.equal(f.calls.writes.length, 0)
  assert.equal(f.calls.dialogs.length, 2)
})

test('properties on a legacy document redirect Save to Next and leave the legacy file untouched', async () => {
  const f = fixture()
  f.state.path = 'old.ccad'
  f.state.content = '[]'
  await f.file.openFileAndParse(f.renderer)
  f.renderer.documentProperties = { ...defaults(), name: 'New title' }
  f.state.path = 'new.cnext'
  await f.file.saveFile(f.renderer)
  assert.equal(f.calls.dialogs[0].defaultPath, 'old.cnext')
  assert.equal(f.calls.writes[0].file, 'new.cnext')
  assert.equal(JSON.parse(f.calls.writes[0].data).document.name, 'New title')
})

test('new designs reset properties, file target and history and keep template independent', () => {
  const f = fixture()
  const p = { ...defaults(), canvas: 'paper', paper: 'A3' }
  f.file.createNewFile(f.renderer, p)
  p.paper = 'A0'
  assert.equal(f.renderer.documentProperties.paper, 'A3')
  assert.equal(f.renderer.logicDisplay.components.length, 0)
  assert.equal(f.renderer.undoStack[0], '[]')
  assert.equal(f.renderer.redoStack.length, 0)
})

function loadRenderer() {
  const exports = {}
  const code = ts.transpileModule(fs.readFileSync('src/renderer/src/engine/Engine.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const settings = load('src/renderer/src/utils/SettingsOptions.ts')
  vm.runInNewContext(code, {
    exports,
    console,
    Event,
    performance,
    window: { dispatchEvent() {} },
    require: (id) =>
      id === '../locales/Locale'
        ? { getLocaleKey: (key) => key }
        : id === '../utils/DocumentProperties'
          ? model
          : id === '../utils/DocumentFrame'
            ? load('src/renderer/src/utils/DocumentFrame.ts')
            : id === '../utils/SettingsOptions'
              ? settings
              : id === '../utils/Preferences'
                ? {
                    preference: (_key, fallback) => fallback,
                    numberPreference: (_key, fallback) => fallback,
                    numericPreference: (key) => settings.numericSettings[key].default
                  }
                : id === '../utils/MeasurementAnnotation'
                  ? load('src/renderer/src/utils/MeasurementAnnotation.ts')
                  : {}
  })
  return exports.GraphicsRenderer
}

test('app preferences respect document units and changing properties preserves geometry and undo history', () => {
  const r = Object.create(loadRenderer().prototype)
  r.logicDisplay = { components: [new Line(0, 0, 100, 200)] }
  r.undoStack = ['original']
  r.redoStack = ['future']
  r.markDirty = () => {}
  const geometry = r.logicDisplay.components
  r.setDocumentProperties({
    ...defaults(),
    measurementUnit: 'ft',
    measurementPrecision: 4,
    scaleDenominator: 100
  })
  r.applyPreferences()
  assert.equal(r.unitMeasure, 'ft')
  assert.equal(r.measurementPrecision, 4)
  assert.equal(r.logicDisplay.components, geometry)
  assert.equal(r.logicDisplay.components[0].x2, 100)
  assert.equal(r.undoStack[0], 'original')
  assert.equal(r.redoStack[0], 'future')
  r.setDocumentProperties(null)
  assert.equal(r.unitMeasure, 'm')
  assert.equal(r.measurementPrecision, 2)
})

test('A6 fit uses world zoom and remains navigable without changing exported sizes', () => {
  const r = Object.create(loadRenderer().prototype)
  Object.assign(r, {
    documentProperties: { ...defaults(), canvas: 'paper', paper: 'A6', orientation: 'portrait' },
    displayWidth: 1200,
    displayHeight: 800,
    offsetX: 0,
    offsetY: 0,
    mouse: { cursorXGlobal: 600, cursorYGlobal: 400 },
    markDirty() {},
    cleanLog() {},
    onZoomUpdate() {}
  })
  const geometry = [new Line(0, 0, 5, 10)]
  const before = encodeDocument(geometry, r.documentProperties, true)
  r.fitDocumentPaper()
  const fittedZoom = r.zoom
  assert.equal(r.viewZoom, fittedZoom)
  const world = worldPaperDimensions(r.documentProperties)
  assert.ok(Math.abs(world.height * r.zoom - 640) < 0.0001)
  assert.ok(Math.abs(world.width / world.height - 105 / 148) < 0.0001)
  r.setZoom(1.5)
  r.zoom = r.targetZoom
  assert.ok(Math.abs(r.viewZoom - fittedZoom * 1.5) < 1e-10)
  r.setZoom(fittedZoom / r.viewZoom)
  r.zoom = r.targetZoom
  assert.ok(Math.abs(r.viewZoom - fittedZoom) < 1e-10)
  r.setZoom(0.9)
  r.zoom = r.targetZoom
  assert.ok(Math.abs(r.viewZoom - fittedZoom * 0.9) < 1e-10)
  r.setZoom(14.9 / r.viewZoom)
  r.zoom = r.targetZoom
  assert.ok(Math.abs(r.viewZoom - 14.9) < 0.0001)
  r.setZoom(2)
  assert.ok(Math.abs(r.targetZoom - 29.8) < 0.0001)
  const previous = r.targetZoom
  for (const factor of [NaN, Infinity, 0, -1, 1e20]) r.setZoom(factor)
  assert.equal(r.targetZoom, previous)
  assert.equal(encodeDocument(geometry, r.documentProperties, true), before)
  assert.equal(encodeDocument(geometry, r.documentProperties, false), JSON.stringify(geometry))
})

test('all paper presets fit with an honest world zoom and removing paper preserves the camera', () => {
  const r = Object.create(loadRenderer().prototype)
  Object.assign(r, { displayWidth: 1200, displayHeight: 800, markDirty() {} })
  for (const paper of Object.keys(model.paperSizes)) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const scaleDenominator of [1, 100, 1000]) {
        r.documentProperties = {
          ...defaults(),
          canvas: 'paper',
          paper,
          orientation,
          scaleDenominator
        }
        r.fitDocumentPaper()
        const world = worldPaperDimensions(r.documentProperties)
        assert.equal(r.viewZoom, r.zoom)
        const width = world.width * r.zoom
        const height = world.height * r.zoom
        assert.ok(width <= 960.00001 && height <= 640.00001)
        assert.ok(Math.abs(width - 960) < 0.00001 || Math.abs(height - 640) < 0.00001)
      }
    }
  }
  r.applyPreferences = () => {}
  const previousZoom = r.zoom
  r.setDocumentProperties(null)
  assert.equal(r.zoom, previousZoom)
  assert.equal(r.viewZoom, previousZoom)
})

test('title blocks stay within the bottom-left margins for every paper and scale', () => {
  const { documentTitleBlockLayout } = load('src/renderer/src/utils/DocumentFrame.ts')
  for (const paper of Object.keys(model.paperSizes)) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const scaleDenominator of [1, 100]) {
        const p = {
          ...defaults(),
          canvas: 'paper',
          paper,
          orientation,
          scaleDenominator,
          author: 'Designer'
        }
        const sheet = worldPaperDimensions(p)
        const block = documentTitleBlockLayout(p)
        assert.ok(Math.abs(block.x - (-sheet.width / 2 + sheet.margin)) < 1e-8)
        assert.ok(Math.abs(block.y + block.height - (sheet.height / 2 - sheet.margin)) < 1e-8)
        assert.ok(block.width <= sheet.width - 2 * sheet.margin + 1e-8)
        assert.ok(block.height <= (sheet.height - 2 * sheet.margin) * 0.3 + 1e-8)
        assert.equal(block.cells.find((cell) => cell.field === 'author').value, 'Designer')
        assert.equal(
          block.cells.find((cell) => cell.field === 'scale').value,
          '1:' + scaleDenominator
        )
        for (const cell of block.cells) {
          assert.ok(cell.x >= block.x && cell.y >= block.y)
          assert.ok(cell.x + cell.width <= block.x + block.width + 1e-8)
          assert.ok(cell.y + cell.height <= block.y + block.height + 1e-8)
        }
      }
    }
  }
})

test('title block defaults migrate old Next documents and the visibility flag round trips', () => {
  const old = defaults()
  delete old.showTitleBlock
  assert.equal(validateDocumentProperties(old).showTitleBlock, true)
  const source = encodeDocument([], { ...defaults(), showTitleBlock: false }, true)
  assert.equal(decodeDocument(source, true).properties.showTitleBlock, false)
  assert.throws(() => validateDocumentProperties({ ...defaults(), showTitleBlock: 'yes' }))
})

test('drawing frame uses stroke glyphs, contains metadata and leaves component geometry untouched', () => {
  const r = Object.create(loadRenderer().prototype)
  const paths = [],
    text = [],
    rectangles = []
  Object.assign(r, {
    documentProperties: { ...defaults(), canvas: 'paper', paper: 'A6', author: 'Designer' },
    cOutX: 0,
    cOutY: 0,
    zoom: 40,
    logicDisplay: { components: [] },
    context: {
      save() {},
      restore() {},
      setLineDash() {},
      fillRect() {
        throw new Error('Document frame must remain unfilled')
      },
      beginPath() {},
      clip() {},
      stroke() {},
      strokeRect(...values) {
        rectangles.push(values)
      },
      rect() {},
      moveTo(...values) {
        paths.push(values)
      },
      lineTo(...values) {
        paths.push(values)
      }
    },
    _getSpacedGlyphs(value) {
      text.push(value)
      return [
        {
          commands: [
            { x: 0, y: 0, command: 'PD' },
            { x: 10, y: 10, command: 'MP' }
          ]
        }
      ]
    }
  })
  r.drawDocumentFrame()
  assert.equal(rectangles.length, 8)
  assert.ok(text.includes('Designer'))
  assert.ok(text.includes('1:100'))
  assert.ok(paths.length > 0)
  assert.equal(r.logicDisplay.components.length, 0)
  r.documentProperties.showTitleBlock = false
  r.drawDocumentFrame()
  assert.equal(rectangles.length, 8)
  r.documentProperties.showTitleBlock = true
  r.documentProperties.canvas = 'infinite'
  r.drawDocumentFrame()
  assert.equal(rectangles.length, 8)
})

test('new paper and infinite designs retain the current zoom without fitting the paper', () => {
  for (const canvas of ['paper', 'infinite']) {
    for (const zoom of [0.02, 1.15, 40]) {
      const f = fixture()
      Object.assign(f.renderer, {
        zoom,
        targetZoom: zoom,
        fitDocumentPaper() {
          throw new Error('New design must not auto-fit')
        }
      })
      f.file.createNewFile(f.renderer, { ...defaults(), canvas, paper: 'A6' })
      assert.equal(f.renderer.zoom, zoom)
      assert.equal(f.renderer.targetZoom, zoom)
      assert.equal(f.renderer.camX, 0)
      assert.equal(f.renderer.camY, 0)
    }
  }
})

test('paper properties never change world strokes, markers, labels, or measurement paths', () => {
  const r = Object.create(loadRenderer().prototype)
  const trace = []
  const record = (name) => (...args) => trace.push([name, ...args])
  const context = Object.fromEntries(['save', 'restore', 'translate', 'rotate', 'beginPath',
    'moveTo', 'lineTo', 'closePath', 'fill', 'stroke'].map(name => [name, record(name)]))
  Object.defineProperty(context, 'lineWidth', { set: record('width') })
  Object.assign(r, {
    context, cOutX: 12, cOutY: -4, zoom: 1, mode: 0, modes: { Move: 1 },
    unitMeasure: 'mm', measurementPrecision: 2,
    markDirty() {}, cleanLog() {}, getColorWithOpacityFromCache: () => '#fff',
    getBatchPath(_color, width) {
      trace.push(['width', width])
      return Object.fromEntries(['moveTo', 'lineTo', 'arc'].map(name => [name, record(name)]))
    },
    _getSpacedGlyphs: () => [{ commands: [
      { command: 'PD', x: 0, y: 0 }, { command: 'MP', x: 10, y: 10 }
    ] }]
  })
  const draw = () => {
    trace.length = 0
    r.drawLine(0, 0, 100, 0, '#fff', 2, 100)
    r.drawRectangle(0, 0, 100, 50, '#fff', 2, 100)
    r.drawCircle(0, 0, 30, 0, '#fff', 2, 100)
    r.drawArc(0, 0, 30, 0, 0, 30, '#fff', 2, 100)
    r.drawPoint(0, 0, '#fff', 3, 100)
    r.drawLabel(0, 0, 3, 'Label', '#fff', 18, 100)
    r.drawPolygon([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }], '#fff', '#fff', 2, 100, true)
    r.drawMeasure(0, 0, 100, 0, '#fff', 2, 100, 30)
    return JSON.stringify(trace)
  }
  for (const zoom of [0.01, 0.3, 1, 40]) {
    r.zoom = zoom
    r.setDocumentProperties({ ...defaults(), canvas: 'infinite' })
    const original = draw()
    assert.equal(trace[0][1], 2 * zoom)
    for (const scaleDenominator of [1, 4, 100, 1000]) {
      for (const showPaper of [true, false]) {
        r.setDocumentProperties({ ...defaults(), canvas: 'paper', scaleDenominator, showPaper })
        assert.equal(draw(), original)
        assert.equal(r.zoom, zoom)
      }
    }
  }
})

test('zoom keeps the same world point under the cursor for both canvas modes', () => {
  const r = Object.create(loadRenderer().prototype)
  for (const canvas of ['paper', 'infinite']) {
    Object.assign(r, { documentProperties: { ...defaults(), canvas }, zoom: 0.02,
      camX: 70, camY: -30, displayWidth: 1200, displayHeight: 800,
      offsetX: 10, offsetY: 20, mouse: { cursorXGlobal: 900, cursorYGlobal: 200 },
      cleanLog() {}, markDirty() {} })
    const screenX = 900 - 10 - 600, screenY = 200 - 20 - 400
    const x = screenX / r.zoom - r.camX, y = screenY / r.zoom - r.camY
    for (const factor of [1.5, 0.5, 10, 0.01]) {
      r.setZoom(factor)
      r.zoom = r.targetZoom
      assert.ok(Math.abs((x + r.camX) * r.zoom - screenX) < 1e-8)
      assert.ok(Math.abs((y + r.camY) * r.zoom - screenY) < 1e-8)
    }
  }
})

test('new document scale gives radius 2 a 0.2 mm print width without migrating saved scales', () => {
  const p = defaults()
  assert.equal(2 * 10 * p.scaleNumerator / p.scaleDenominator, 0.2)
  const components = [new Line(0, 0, 100, 0)]
  for (const scaleDenominator of [1, 4, 100]) {
    const source = encodeDocument(components, { ...p, canvas: 'paper', scaleDenominator }, true)
    const decoded = decodeDocument(source, true)
    assert.equal(decoded.properties.scaleDenominator, scaleDenominator)
    assert.equal(decoded.components[0].radius, 2)
    assert.equal(decoded.components[0].x2, 100)
  }
})
