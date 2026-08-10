import {
  Circle,
  Component,
  componentTypes,
  Line,
  Measure,
  Point,
  Rectangle,
  Shape,
  Label,
  Arc,
  Picture,
  Polygon,
  BoundBox
} from './Component'
import { KeyboardHandler, MouseHandler } from './Input'
import { LogicDisplay } from './Logic'
import DefaultCursor from '../assets/cursors/normal.svg'
import CrosshairCursor from '../assets/cursors/crosshair.svg'
import MoveCursor from '../assets/cursors/move.svg'
import NavigateDragCursor from '../assets/cursors/navigate-drag.svg'
import NavigateIdleCursor from '../assets/cursors/navigate-idle.svg'
import Nwse1 from '../assets/cursors/nwse-1.svg'
import Nwse2 from '../assets/cursors/nwse-2.svg'
import RotateCursor from '../assets/cursors/rotate.svg'
import { callTextPrompt } from '@renderer/components/TextPrompt'
import { DerakumaParser } from './fontobene/Derakuma'
import AnsiFont from './fontobene/ansifont.bene'
import AnsiCJK from './fontobene/ansifont-beta-cjk.bene'
import * as Types from '../engine/Types'
import { LRUCache, QuadTree, QuadTreeBounds } from './CacheDatas'

let lastTime = performance.now()
let frameCount = 0
let fps = 0

export interface GenericDefiner {
  [key: string]: number
}

export interface HandleProperties {
  x: number
  y: number
  id: string
  cursor: string
}
export interface Vector2 {
  x: number
  y: number
}

export const _num2hex = (value: number) => {
  const clampedNum = Math.max(0, Math.min(100, value))
  const scaledValue = Math.round(clampedNum * 2.55)
  let hexString = scaledValue.toString(16)
  hexString = hexString.padStart(2, '0')
  return hexString.toUpperCase()
}

export class GraphicsRenderer {
  modes: GenericDefiner
  mouseAction: GenericDefiner
  readonly: boolean
  mode: number
  enableHighDPI: boolean
  previousColor: string | null
  previousRadius: number | null
  displayFont: string
  temporarySelectedComponent: number | null
  selectedComponent: number | null
  temporaryComponentType: number | null
  temporaryShape: Shape | null
  temporaryPoints: number[] | null[]
  selectedColor: string
  selectedRadius: number
  logicDisplay: LogicDisplay | null
  undoStack: string[]
  redoStack: string[]
  temporaryObjectArray: any[]
  temporaryVectors: Vector2[]
  temporaryVectorIndex: number
  imageCache: LRUCache<string, HTMLImageElement | 'ERROR'>
  displayWidth: number
  displayHeight: number
  offsetX: number
  offsetY: number
  camX: number
  camY: number
  zoom: number
  zoomIn: number
  zoomOut: number
  currentZoom: number
  targetZoom: number
  zoomSpeed: number
  camMoving: boolean
  xCNaught: number
  yCNaught: number
  cOutX: number
  cOutY: number
  recordingMode: boolean
  showGrid: boolean
  showOrigin: boolean
  showRules: boolean
  gridPointer: boolean
  gridSpacing: number
  conversionFactor: number
  unitFactor: number
  unitConversionFactor: number
  unitName: string
  unitMeasure: string
  snap: boolean
  snapTolerance: number
  fontSize: number
  maximumStack: number
  displayRef: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  defaultTooltip: string
  tooltip: string
  keyboard: KeyboardHandler | null
  mouse: MouseHandler | null
  handles: HandleProperties[]
  fb: DerakumaParser
  dragHandle: string | null
  private dragRotationOrigin: Vector2 | null
  private dragHandlePositions: Map<string, Vector2> | null
  lastSelectedComponent: number | null;
  _debugMode: boolean;
  private _debugHitboxes: Map<string, { start: Vector2, end: Vector2, func?: () => void }> = new Map();
  private _dirty: boolean;
  private _colorCache: Map<string, string>;
  private _quadtree: QuadTree<Component> | null = null;
  private _isQuadtreeDirty: boolean = true;
  private _componentIndexes: Map<Component, number> = new Map();
  private _dragDidModify: boolean = false;
  private _pathBatches: Map<string, { path: Path2D; strokeStyle: string; lineWidth: number; lineJoin: CanvasLineJoin }> = new Map();
  private _WARNING_MAYLAGSHIT_debugMode: boolean;
  private _test_enableExperimentalCJK: boolean;

  constructor(displayRef: HTMLCanvasElement | null, width: number, height: number) {
    this.modes = {
      AddPoint: 1,
      AddLine: 2,
      AddCircle: 3,
      AddRectangle: 4,
      AddArc: 5,
      AddMeasure: 6,
      AddLabel: 7,
      AddShape: 8,
      AddPicture: 9,
      AddPolygon: 10,
      AddBoundbox: 11,
      Delete: 20,
      Navigate: 22,
      Move: 23,
      Select: 25
    }
    this.mouseAction = {
      Move: 0,
      Down: 1,
      Up: 2
    }
    this.readonly = false
    this.enableHighDPI = true
    this.mode = this.modes.Select
    this.previousColor = null
    this.previousRadius = null
    this.displayFont = 'Geist Mono'
    this.temporarySelectedComponent = null
    this.selectedComponent = null
    this.temporaryComponentType = null
    this.temporaryShape = null
    this.temporaryPoints = [null, null, null, null, null, null]
    this.selectedColor = '#0080ff'
    this.selectedRadius = 2
    this.undoStack = []
    this.redoStack = []
    this.temporaryObjectArray = []
    this.temporaryVectorIndex = 0
    this.temporaryVectors = []
    this.imageCache = new LRUCache(256);
    this.displayWidth = width
    this.displayHeight = height
    this.offsetX = 0
    this.offsetY = 0
    this.camX = 0
    this.camY = 0
    this.zoom = 1
    this.zoomIn = 3 / 2
    this.zoomOut = 2 / 3
    this.currentZoom = 1
    this.targetZoom = 1
    this.zoomSpeed = 0.05
    this.camMoving = false
    this.xCNaught = 0
    this.yCNaught = 0
    this.cOutX = 0
    this.cOutY = 0
    this.showGrid = true
    this.showOrigin = false
    this.showRules = true
    this.gridPointer = false
    this.gridSpacing = 10
    this.conversionFactor = 1
    this.unitName = 'px'
    this.unitMeasure = 'm'
    this.unitFactor = 1
    this.unitConversionFactor = 1 / 100
    this.snap = true
    this.recordingMode = false
    this.snapTolerance = 10
    this.fontSize = 18
    this.maximumStack = 50
    this.displayRef = displayRef != null ? displayRef : null
    this.defaultTooltip = 'CompassCAD'
    this.tooltip = this.defaultTooltip
    this.keyboard = null
    this.mouse = null
    this.context = null
    this.logicDisplay = null
    this.handles = []
    this.dragHandle = ''
    this.dragRotationOrigin = null
    this.dragHandlePositions = null
    this.lastSelectedComponent = null
    this._dirty = false;
    this._colorCache = new Map();
    this._test_enableExperimentalCJK = true;
    this.fb = new DerakumaParser(this._test_enableExperimentalCJK ? AnsiCJK : AnsiFont);
    this._WARNING_MAYLAGSHIT_debugMode = false;
    this._debugMode = import.meta.env.DEV;
  }

  private _lastCamX = NaN;
  private _lastCamY = NaN;
  private _lastZoom = NaN;
  private _lastOffsetX = NaN;
  private _lastOffsetY = NaN;
  private _glyphLayoutCache: Map<string, any> = new Map();
  private _textWidthCache: Map<string, number> = new Map();
  private _bulkImportActive: boolean = false;
  private static readonly MIN_VISIBLE_PX = 1;
  private static SPACE_PER_CHAR = 1.8;
  private _charSpacingOverrides: Map<string, number> = new Map();
  private _spacedGlyphLayoutCache: Map<string, any[]> = new Map();
  private _drawHitBoxBoundaries: boolean = false;
  private _isEnteringHitbox: boolean = false;
  private _enableTopDebugStrings: boolean = true;
  private _copiableDebugStrings: string = "";
  private _debugToast: {
    text: string
    color: string
    expiresAt: number
    durationMs: number
  } | null = null

  private showDebugToast(
    text: string,
    options?: { color?: string; durationMs?: number }
  ) {
    const durationMs = options?.durationMs ?? 1200
    this._debugToast = {
      text,
      color: options?.color ?? '#ffff00',
      durationMs,
      expiresAt: performance.now() + durationMs
    }
    this.markDirty(`debug toast: ${text}`)
  }

  private _measureTextCached(text: string): number {
    let w = this._textWidthCache.get(text)
    if (w === undefined) {
      w = this.context!.measureText(text).width
      this._textWidthCache.set(text, w)
    }
    return w
  }

  private appendDebugHitboxes(id: string, start: Vector2, end: Vector2, func?: () => void) {
    // Store hitboxes in the renderer's canonical coordinate system:
    // - canvas-local pixel coordinates (origin = top-left) are converted into
    // - centered canvas coordinates (origin = canvas center) which is what the
    //   drawing context uses after the translate(this.displayWidth/2, this.displayHeight/2).
    const canvas = this.displayRef;
    let startCanvas = { x: start.x, y: start.y };
    let endCanvas = { x: end.x, y: end.y };

    if (canvas) {
      const rect = canvas.getBoundingClientRect();

      // Heuristic to accept either canvas-local coords (0..width) or page/client coords.
      const inCanvasSpace = (p: Vector2) =>
        p.x >= 0 && p.x <= rect.width && p.y >= 0 && p.y <= rect.height;
      const inClientSpace = (p: Vector2) =>
        p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;

      if (inClientSpace(start) || inClientSpace(end)) {
        // Convert from page/client coordinates -> canvas-local
        startCanvas = { x: start.x - rect.left, y: start.y - rect.top };
        endCanvas = { x: end.x - rect.left, y: end.y - rect.top };
      } else if (!inCanvasSpace(start) || !inCanvasSpace(end)) {
        // If neither heuristic matches, still attempt to interpret them as canvas-local
        // but clamp to bounds to avoid wildly off-screen values.
        startCanvas = {
          x: Math.max(0, Math.min(rect.width, startCanvas.x)),
          y: Math.max(0, Math.min(rect.height, startCanvas.y))
        };
        endCanvas = {
          x: Math.max(0, Math.min(rect.width, endCanvas.x)),
          y: Math.max(0, Math.min(rect.height, endCanvas.y))
        };
      }
    }

    // Convert to centered coords (matching the translated drawing origin).
    const centeredStart = { x: startCanvas.x - this.displayWidth / 2, y: startCanvas.y - this.displayHeight / 2 };
    const centeredEnd = { x: endCanvas.x - this.displayWidth / 2, y: endCanvas.y - this.displayHeight / 2 };

    this._debugHitboxes.set(id, { start: centeredStart, end: centeredEnd, func });
  }

  private _internal_getGlyphsInASynchronousManner(text: string): any[] | null {
    const cached = this._glyphLayoutCache.get(text);
    if (cached) return cached;

    const glyphs = this.fb.getSentenceCommand(text);
    this.cleanLog(glyphs);
    this._glyphLayoutCache.set(text, glyphs);
    this.markDirty('resolving glyph layout: ' + text);
    return glyphs; // was `return null` — caller got nothing on the first lookup
  }

  setIndividualCharacterSpacing(char: string, spacing: number) {
    this._charSpacingOverrides.set(char, spacing)
    this._spacedGlyphLayoutCache.clear()
    this.markDirty(`character spacing updated for '${char}'`)
  }

  setSentencedCharacterSpacings(spacings: Record<string, number>) {
    for (const [char, spacing] of Object.entries(spacings)) {
      this._charSpacingOverrides.set(char, spacing)
    }
    this._spacedGlyphLayoutCache.clear()
    this.markDirty('bulk character spacing update')
  }

  private _getCharSpacing(char: string): number {
    return this._charSpacingOverrides.get(char) ?? GraphicsRenderer.SPACE_PER_CHAR
  }

  private _getSpacedGlyphs(text: string): any[] | null {
    const cached = this._spacedGlyphLayoutCache.get(text)
    if (cached) return cached

    const rawGlyphs = this._internal_getGlyphsInASynchronousManner(text)
    if (!rawGlyphs) return null

    let cumulativeOffset = 0
    const spaced = rawGlyphs.map((glyph, i) => {
      const shifted = {
        ...glyph,
        commands: glyph.commands.map((cmd: any) => ({ ...cmd, x: cmd.x + cumulativeOffset }))
      }
      cumulativeOffset += this._getCharSpacing(text[i] ?? '')
      return shifted
    })

    this._spacedGlyphLayoutCache.set(text, spaced)
    return spaced
  }

  markDirty(why: string = 'unknown') {
    this._dirty = true;
    this.cleanLog(`Marked as dirty: ${why}`);
  }

  cleanLog(content: any) {
    if (this._WARNING_MAYLAGSHIT_debugMode) {
      console.log(`[renderer] ${content}`);
    }
  }

  private getColorWithOpacityFromCache(color: string, opacity: number): string {
    const key = color + '|' + opacity
    let v = this._colorCache.get(key)
    if (!v) { v = color + _num2hex(opacity); this._colorCache.set(key, v) }
    return v
  }

  private lastCursorClientX = -Infinity
  private lastCursorClientY = -Infinity

  didCursorActuallyMove(e: MouseEvent | any): boolean {
    const cx = e.clientX
    const cy = e.clientY
    if (cx === this.lastCursorClientX && cy === this.lastCursorClientY) {
      return false
    }
    this.lastCursorClientX = cx
    this.lastCursorClientY = cy
    return true
  }

  private drawDebugToast() {
    if (!this._debugToast) return

    const now = performance.now()
    if (now >= this._debugToast.expiresAt) {
      this._debugToast = null
      return
    }

    // Keep repainting while visible
    this.markDirty('debug toast active')

    const remaining = this._debugToast.expiresAt - now
    const fadeMs = Math.min(250, this._debugToast.durationMs * 0.25)
    const opacity01 = remaining < fadeMs ? remaining / fadeMs : 1

    // drawRawFontobeneAtLocation expects opacity in 0..100 in your codebase
    const opacity = Math.max(0, Math.min(100, Math.round(opacity01 * 100)))

    this.drawRawFontobeneAtLocation(
      0, // center of translated canvas
      0,
      this._debugToast.text,
      this._debugToast.color,
      2.2,
      1.5,
      opacity,
      0,
      'center',
      'middle'
    )
  }

  copyDebugStrings = async () => {
    try {
      await navigator.clipboard.writeText(this._copiableDebugStrings)
      this.showDebugToast('Copied debug info to clipboard', {
        color: '#ffff00',
        durationMs: 1500
      })
    } catch (err) {
      this.showDebugToast('Failed to copy debug info', {
        color: '#ff6666',
        durationMs: 1800
      })
      this.cleanLog(err)
    }
  }

  copyDebugSnapshot = () => {
    this.displayRef?.toBlob(async (blob) => {
      if (!blob) {
        this.showDebugToast('CANNOT generate blob', {
          color: '#ff6666',
          durationMs: 1800
        });
        return; // important: stop here
      }

      try {
        const item = new ClipboardItem({ "image/png": blob });
        await navigator.clipboard.write([item]);

        this.showDebugToast('Copied canvas snapshot to clipboard', {
          color: '#ffff00',
          durationMs: 1500
        });
      } catch (e) {
        this.showDebugToast(`CANNOT copy (why: ${String(e)})`, {
          color: '#ff6666',
          durationMs: 1800
        });
      }
    }, "image/png");
  };

  toggleTopDebug = () => {
    this._enableTopDebugStrings = !this._enableTopDebugStrings;
  }

  async start() {
    this.markDirty('Engine started');
    this.logicDisplay = new LogicDisplay()
    this.zoom = 1
    this.temporaryObjectArray = []
    this.keyboard = new KeyboardHandler()
    this.mouse = new MouseHandler()
    this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
    const context = this.displayRef?.getContext('2d')
    if (!context) {
      throw new Error('Failed to get 2D context')
    }
    this.context = context;
    this.appendDebugHitboxes('test', { x: 560, y: 552 }, { x: 775, y: 580 }, this.copyDebugStrings);
    this.appendDebugHitboxes('test1', { x: 800, y: 552 }, { x: 1090, y: 580 }, this.copyDebugSnapshot);
    this.appendDebugHitboxes('test2', { x: 1110, y: 552 }, { x: 1235, y: 580 }, this.toggleTopDebug);
    await this.fb.ready();
    this.markDirty('after font load');
  }
  scaleForHighDPI(dpi: number) {
    if (this.enableHighDPI) {
      this.cleanLog('ok, scaling')
      this.context?.scale(dpi, dpi)
    }
  }
  drawUnscalableStrokeVector(vectors: Vector2[], x: number, y: number) {
    this.context!.strokeStyle = "#fff";
    this.context!.lineWidth = 1;
    this.context?.beginPath();
    const minScale = 1.1; // never shrink the vector below this world-scale factor
    const invZoom = Math.max(1 / this.zoom, minScale);
    for (let i = 0; i < vectors.length; i++) {
      const px = (x + this.cOutX) * this.zoom + vectors[i].x * invZoom;
      const py = (y + this.cOutY) * this.zoom + vectors[i].y * invZoom;
      if (i == 0) {
        this.context?.moveTo(px, py);
      } else {
        this.context?.lineTo(px, py);
      }
    }
    this.context?.closePath();
    this.context?.stroke();
  }
  cleanUpBeforeImport() {
    this._quadtree = null;
    this._isQuadtreeDirty = true;
    this._componentIndexes.clear();
    this.markDirty('import started');
  }
  refreshSelectionTools() {
    if (this.selectedComponent !== null && this.logicDisplay?.components[this.selectedComponent]) {
      // we gonna draw a line bois
      switch (this.logicDisplay?.components[this.selectedComponent].type) {
        case componentTypes.line:
          const lineThingy = this.logicDisplay?.components[this.selectedComponent] as Line;
          const lineRotation = lineThingy.rotation ?? 0
          let selLineX1 = lineThingy.x1, selLineY1 = lineThingy.y1
          let selLineX2 = lineThingy.x2, selLineY2 = lineThingy.y2
          if (lineRotation) {
            const origin = this.getRotationOrigin(lineThingy)
            const p1 = this.rotatePoint(lineThingy.x1, lineThingy.y1, origin.x, origin.y, lineRotation)
            const p2 = this.rotatePoint(lineThingy.x2, lineThingy.y2, origin.x, origin.y, lineRotation)
            selLineX1 = p1.x; selLineY1 = p1.y
            selLineX2 = p2.x; selLineY2 = p2.y
          }
          this.context?.save();
          this.context!.strokeStyle = this.selectedColor;
          this.context!.lineWidth = 2;
          this.context!.beginPath();
          this.context!.moveTo(selLineX1 * this.zoom + this.cOutX * this.zoom, selLineY1 * this.zoom + this.cOutY * this.zoom);
          this.context!.lineTo(selLineX2 * this.zoom + this.cOutX * this.zoom, selLineY2 * this.zoom + this.cOutY * this.zoom);
          this.context?.stroke();
          this.context?.restore();
          break;
      }
      if (this.zoom >= 0.5) this.drawComponentSize(this.logicDisplay?.components[this.selectedComponent]);
      const selectedComponent: Component = this.logicDisplay?.components[this.selectedComponent]
      const handles = this.getComponentHandles(selectedComponent)
      for (const handle of handles) {
        if (handle.id === 'rotate') this.drawRotationCrosshair(handle.x, handle.y)
        else this.drawPoint(handle.x, handle.y, '#fff', 2, 100)
      }

    }
  }
  private drawRotationCrosshair(x: number, y: number): void {
    if (!this.context) return
    const cx = (x + this.cOutX) * this.zoom
    const cy = (y + this.cOutY) * this.zoom
    this.context.save()
    this.context.strokeStyle = this.selectedColor
    this.context.lineWidth = 1.5
    this.context.beginPath()
    this.context.moveTo(cx - 7, cy)
    this.context.lineTo(cx + 7, cy)
    this.context.moveTo(cx, cy - 7)
    this.context.lineTo(cx, cy + 7)
    this.context.arc(cx, cy, 4, 0, Math.PI * 2)
    this.context.stroke()
    this.context.restore()
  }
  drawComponentSize(component: Component) {
    if (!component || !component.type) return
    let displayText = ''
    switch (component.type) {
      case componentTypes.rectangle:
      case componentTypes.boundBox:
      case componentTypes.line:
        const line = component as Line
        displayText = `${Number(Math.abs(line.x2 - line.x1).toFixed(2))} × ${Number(Math.abs(line.y2 - line.y1).toFixed(2))}`
        break
      case componentTypes.measure:
        const measure = component as Measure
        displayText = `L: ${Number(Math.abs(measure.x2 - measure.x1).toFixed(2))} (${Number(this.getDistance(measure.x1, measure.y1, measure.x2, measure.y2) / 100).toFixed(2)}m)`
        break
      case componentTypes.circle:
        const circle = component as Circle
        displayText = `RAD: ${Number(Math.abs(this.getDistance(circle.x1, circle.y1, circle.x2, circle.y2)).toFixed(2))}`
        break
      case componentTypes.arc:
        const arc = component as Arc
        displayText = `RAD: ${Number(Math.abs(this.getDistance(arc.x1, arc.y1, arc.x2, arc.y2)).toFixed(2))}, COV: ${Math.round((Number(Math.abs(this.getAngle(arc.x1, arc.y1, arc.x3, arc.y3)).toFixed(2)) / Math.PI) * 180)}°`
        break
      default:
        return
    }
    if (this.context) {
      this.context.font = `18px 'Radio Canada Big', sans-serif`
      const textWidth = this._measureTextCached(displayText);
      const boxWidth = textWidth + 20
      const dummyLine = component as Line
      const boxX =
        ((dummyLine.x2 - dummyLine.x1) / 2 + dummyLine.x1 + this.cOutX) * this.zoom - boxWidth / 2
      const boxY = (dummyLine.y2 + this.cOutY) * this.zoom + 7.5
      this.context.fillStyle = this.selectedColor
      this.context.beginPath()
      this.context.roundRect(boxX, boxY, boxWidth, 25, 5)
      this.context.fill()
      this.context.closePath()
      this.context.fillStyle = '#fff'
      this.context.textBaseline = 'middle'
      this.context.textAlign = 'center'
      const secondDummyLine = component as Line
      this.context.fillText(
        displayText,
        ((secondDummyLine.x2 - secondDummyLine.x1) / 2 + secondDummyLine.x1 + this.cOutX) *
        this.zoom,
        boxY + 15
      )
    }
  }
  getComponentHandles(component: Component) {
    if (this.selectedComponent != null) {
      switch (component.type) {
        case componentTypes.rectangle:
        case componentTypes.boundBox:
          this.handles = []
          const rect = component as Rectangle
          this.handles.push({
            x: rect.x1,
            y: rect.y1,
            id: 'start',
            cursor: Nwse1
          })
          this.handles.push({
            x: rect.x2,
            y: rect.y1,
            id: 'top-right',
            cursor: Nwse2
          })
          this.handles.push({
            x: rect.x2,
            y: rect.y2,
            id: 'bottom-right',
            cursor: Nwse1
          })
          this.handles.push({
            x: rect.x1,
            y: rect.y2,
            id: 'bottom-left',
            cursor: Nwse2
          })
          break
        case componentTypes.line:
        case componentTypes.measure:
        case componentTypes.circle:
          this.handles = []
          const lineComponent = component as Line
          this.handles.push({
            x: lineComponent.x1,
            y: lineComponent.y1,
            id: 'start',
            cursor: MoveCursor
          })
          this.handles.push({
            x: lineComponent.x2,
            y: lineComponent.y2,
            id: 'end',
            cursor: MoveCursor
          })
          break
        case componentTypes.arc:
          this.handles = []
          const arcComponent = component as Arc
          this.handles.push({
            x: arcComponent.x1,
            y: arcComponent.y1,
            id: 'start',
            cursor: Nwse1
          })
          this.handles.push({
            x: arcComponent.x2,
            y: arcComponent.y2,
            id: 'mid',
            cursor: Nwse2
          })
          this.handles.push({
            x: arcComponent.x3,
            y: arcComponent.y3,
            id: 'end',
            cursor: MoveCursor
          })
          break
        case componentTypes.point:
        case componentTypes.label:
        case componentTypes.picture:
        case componentTypes.shape:
          this.handles = []
          const singlePointComponent = component as Point
          this.handles.push({
            x: singlePointComponent.x,
            y: singlePointComponent.y,
            id: 'miscellaneous',
            cursor: MoveCursor
          })
          break
        case componentTypes.polygon:
          this.handles = []
          this.handles.length = 0
          const polygonComponent = component as Polygon
          polygonComponent.vectors.forEach((polygonHandle, index) => {
            this.handles.push({
              x: polygonHandle.x,
              y: polygonHandle.y,
              id: `handle-${index}`,
              cursor: MoveCursor
            })
          })
          break
      }

      const rotation = component.rotation ?? 0
      if (rotation && !this.isSelfPivotingComponent(component.type)) {
        const origin = this.getRotationOrigin(component)
        this.handles = this.handles.map((handle) => {
          const rotated = this.rotatePoint(handle.x, handle.y, origin.x, origin.y, rotation)
          return { ...handle, x: rotated.x, y: rotated.y }
        })
      }

      // The rotation crosshair is the axis itself, so it belongs at the exact
      // horizontal and vertical centre of the component.
      if (!this.isSelfPivotingComponent(component.type) && this.handles.length) {
        const origin = this.getRotationOrigin(component)
        this.handles.push({
          x: origin.x,
          y: origin.y,
          id: 'rotate',
          cursor: RotateCursor
        })
      }
    }
    return this.handles
  }
  getCursorXRaw() {
    return (
      Math.floor(this.mouse!.cursorXGlobal - this.offsetX - this.displayWidth / 2) / this.zoom -
      this.camX
    )
  }
  getCursorYRaw() {
    return (
      Math.floor(this.mouse!.cursorYGlobal - this.offsetY - this.displayHeight / 2) / this.zoom -
      this.camY
    )
  }
  getCursorXLocal(): number {
    const baseGridSpacing = this.gridSpacing
    const rawXLocal =
      (this.mouse!.cursorXGlobal - this.offsetX - this.displayWidth / 2) / this.zoom - this.camX

    if (!this.snap) {
      return rawXLocal
    }

    return Math.round(rawXLocal / baseGridSpacing) * baseGridSpacing
  }

  getCursorYLocal(): number {
    const baseGridSpacing = this.gridSpacing
    const rawYLocal =
      (this.mouse!.cursorYGlobal - this.offsetY - this.displayHeight / 2) / this.zoom - this.camY

    if (!this.snap) {
      return rawYLocal
    }

    return Math.round(rawYLocal / baseGridSpacing) * baseGridSpacing
  }

  getCursorXInFrame(): number {
    const screenX = this.mouse!.cursorXGlobal - this.offsetX - this.displayWidth / 2
    const worldX = screenX / this.zoom - this.cOutX

    if (!this.snap) {
      // If snapping is off, return the raw value converted to frame coordinates.
      return (worldX + this.cOutX) * this.zoom
    }

    // If snapping is on, perform the snapping calculation as before.
    const gridSize = this.gridSpacing
    const snappedX = Math.round(worldX / gridSize) * gridSize
    return (snappedX + this.cOutX) * this.zoom
  }

  getCursorYInFrame(): number {
    const screenY = this.mouse!.cursorYGlobal - this.offsetY - this.displayHeight / 2
    const worldY = screenY / this.zoom - this.cOutY

    if (!this.snap) {
      // If snapping is off, return the raw value converted to frame coordinates.
      return (worldY + this.cOutY) * this.zoom
    }

    // If snapping is on, perform the snapping calculation as before.
    const gridSize = this.gridSpacing
    const snappedY = Math.round(worldY / gridSize) * gridSize
    return (snappedY + this.cOutY) * this.zoom
  }
  updateCamera() {
    this.cOutX = this.camX
    this.cOutY = this.camY
    if (this.camMoving) {
      this.cOutX += this.getCursorXRaw() - this.xCNaught
      this.cOutY += this.getCursorYRaw() - this.yCNaught
    }
    const changed =
      this.camX !== this._lastCamX ||
      this.camY !== this._lastCamY ||
      this.zoom !== this._lastZoom ||
      this.offsetX !== this._lastOffsetX ||
      this.offsetY !== this._lastOffsetY

    if (changed) {
      this._lastCamX = this.camX
      this._lastCamY = this.camY
      this._lastZoom = this.zoom
      this._lastOffsetX = this.offsetX
      this._lastOffsetY = this.offsetY
      this.markDirty('Camera updated')
    }
  }
  // modify saveState() to respect the guard
  saveState(invalidateSpatialIndex: boolean = true) {
    if (this._bulkImportActive) return // suppressed during bulk import; caller snapshots once at the end
    this.cleanLog('saving state')
    this.undoStack.push(JSON.stringify(this.logicDisplay?.components))
    this.cleanLog(this.undoStack)
    if (this.undoStack.length > this.maximumStack) {
      this.undoStack.shift()
    }
    this.redoStack = []
    if (invalidateSpatialIndex) this._isQuadtreeDirty = true
    if (this.onComponentArrayChanged) {
      this.cleanLog('array changed defined, firing')
      this.onComponentArrayChanged()
    }
    this.markDirty('state save');
  }
  getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2))
  }
  getAngle(x1: number, y1: number, x2: number, y2: number) {
    var PI = Math.PI
    var dx = x2 - x1
    var dy = y2 - y1
    var theta = Math.atan2(dy, dx)
    var scaledAngle = theta * (3.15 / PI)
    return scaledAngle
  }
  private getCameraWorldBounds(): QuadTreeBounds {
    const padding = 50
    const halfW = this.displayWidth / 2
    const halfH = this.displayHeight / 2
    return {
      minX: (-halfW - padding) / this.zoom - this.cOutX,
      maxX: (halfW + padding) / this.zoom - this.cOutX,
      minY: (-halfH - padding) / this.zoom - this.cOutY,
      maxY: (halfH + padding) / this.zoom - this.cOutY
    }
  }
  private rebuildQuadtree(components: Component[]): void {
    if (components.length === 0) { this._quadtree = null; this._isQuadtreeDirty = false; return }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const boxed: { c: Component; bbox: QuadTreeBounds; index: number }[] = []
    this._componentIndexes.clear()
    for (let index = 0; index < components.length; index++) {
      const c = components[index]
      if (c.active === false) continue
      const bbox = this.getComponentBoundaryBox(c)
      boxed.push({ c, bbox, index })
      minX = Math.min(minX, bbox.minX); minY = Math.min(minY, bbox.minY)
      maxX = Math.max(maxX, bbox.maxX); maxY = Math.max(maxY, bbox.maxY)
    }
    if (boxed.length === 0) {
      this._quadtree = null
      this._isQuadtreeDirty = false
      return
    }
    const margin = 100
    const tree = new QuadTree<Component>(
      { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin }
    )
    for (const { c, bbox, index } of boxed) {
      tree.insert(c, bbox)
      this._componentIndexes.set(c, index)
    }
    this._quadtree = tree
    this._isQuadtreeDirty = false
  }
  private updateQuadtreeEntry(component: Component): void {
    if (!this._quadtree || this._isQuadtreeDirty || !this._quadtree.update(component, this.getComponentBoundaryBox(component))) {
      this._isQuadtreeDirty = true
    }
  }
  private isComponentInCamera(bbox: { minX: number, minY: number, maxX: number, maxY: number }): boolean {
    const padding = 50
    const halfW = this.displayWidth / 2
    const halfH = this.displayHeight / 2
    const screenMinX = (bbox.minX + this.cOutX) * this.zoom
    const screenMaxX = (bbox.maxX + this.cOutX) * this.zoom
    const screenMinY = (bbox.minY + this.cOutY) * this.zoom
    const screenMaxY = (bbox.maxY + this.cOutY) * this.zoom
    return (
      screenMaxX >= -halfW - padding &&
      screenMinX <= halfW + padding &&
      screenMaxY >= -halfH - padding &&
      screenMinY <= halfH + padding
    )
  }
  // Shared so bbox and drawLabel can never disagree about wrapping.
  private wrapLabelLines(text: string, maxLength = 24): string[] {
    const words = (text ?? '').split(' ')
    const lines: string[] = []
    let tmpLength = 0, tmpText = ''
    for (const w of words) {
      tmpLength += w.length + 1
      tmpText += (tmpText ? ' ' : '') + w
      if (tmpLength > maxLength) {
        lines.push(tmpText)
        tmpLength = 0
        tmpText = ''
      }
    }
    if (tmpText.trim().length > 0) lines.push(tmpText)
    return lines.length > 0 ? lines : ['']
  }
  private getComponentBoundaryBox(component: Component): { minX: number, minY: number, maxX: number, maxY: number } {
    const bounds = this.getUnrotatedComponentBoundaryBox(component)
    const rotation = component.rotation ?? 0
    if (!rotation) return bounds

    const origin = this.getRotationOrigin(component)
    const corners = [
      this.rotatePoint(bounds.minX, bounds.minY, origin.x, origin.y, rotation),
      this.rotatePoint(bounds.maxX, bounds.minY, origin.x, origin.y, rotation),
      this.rotatePoint(bounds.maxX, bounds.maxY, origin.x, origin.y, rotation),
      this.rotatePoint(bounds.minX, bounds.maxY, origin.x, origin.y, rotation)
    ]
    return {
      minX: Math.min(...corners.map(p => p.x)),
      minY: Math.min(...corners.map(p => p.y)),
      maxX: Math.max(...corners.map(p => p.x)),
      maxY: Math.max(...corners.map(p => p.y))
    }
  }

  private getUnrotatedComponentBoundaryBox(component: Component): { minX: number, minY: number, maxX: number, maxY: number } {
    switch (component.type) {
      case componentTypes.point:
        const p = component as Point
        return { minX: p.x - p.radius, minY: p.y - p.radius, maxX: p.x + p.radius, maxY: p.y + p.radius }
        break;
      case componentTypes.line:
        const l = component as Line
        return { minX: Math.min(l.x1, l.x2), minY: Math.min(l.y1, l.y2), maxX: Math.max(l.x1, l.x2), maxY: Math.max(l.y1, l.y2) }
        break;
      case componentTypes.circle:
        const c = component as Circle
        const cRadius = this.getDistance(c.x1, c.y1, c.x2, c.y2)
        return { minX: c.x1 - cRadius, minY: c.y1 - cRadius, maxX: c.x1 + cRadius, maxY: c.y1 + cRadius }
        break;
      case componentTypes.rectangle:
        const r = component as Rectangle
        return { minX: Math.min(r.x1, r.x2), minY: Math.min(r.y1, r.y2), maxX: Math.max(r.x1, r.x2), maxY: Math.max(r.y1, r.y2) }
        break;
      case componentTypes.measure:
        const m = component as Measure
        return { minX: Math.min(m.x1, m.x2), minY: Math.min(m.y1, m.y2), maxX: Math.max(m.x1, m.x2), maxY: Math.max(m.y1, m.y2) }
        break;
      case componentTypes.arc:
        const arc = component as Arc
        // The rendered segment can pass outside its three control points.
        // Indexing the full circle is conservative but never frustum-culls it.
        const arcRadius = this.getDistance(arc.x1, arc.y1, arc.x2, arc.y2) + arc.radius / 2
        return { minX: arc.x1 - arcRadius, minY: arc.y1 - arcRadius, maxX: arc.x1 + arcRadius, maxY: arc.y1 + arcRadius }
        break;
      case componentTypes.polygon: {
        const poly = component as Polygon
        const xs = poly.vectors.map(v => v.x), ys = poly.vectors.map(v => v.y)
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
      }
      case componentTypes.picture: {
        const pic = component as Picture
        const cached = this.imageCache.get(pic.pictureSource)
        const width = cached && cached !== 'ERROR' ? cached.naturalWidth : 512
        const height = cached && cached !== 'ERROR' ? cached.naturalHeight : 512
        return { minX: pic.x - pic.radius, minY: pic.y - pic.radius, maxX: pic.x + width, maxY: pic.y + height }
      }
      case componentTypes.boundBox: {
        const b = component as BoundBox
        return { minX: Math.min(b.x1, b.x2), minY: Math.min(b.y1, b.y2), maxX: Math.max(b.x1, b.x2), maxY: Math.max(b.y1, b.y2) }
      }
      case componentTypes.label: {
        const lbl = component as Label
        const fontSize = lbl.fontSize ?? 14
        const localDiff = 30
        const rowStep = localDiff + fontSize / 2          // matches drawLabel's currentLineY step
        const avgCharWidth = fontSize * 0.6

        // Use the SAME wrap logic as drawLabel, not raw '\n' splitting.
        const wrappedLines = (lbl.text ?? '').split('\n').flatMap(l => this.wrapLabelLines(l))
        const longestLineLen = Math.max(1, ...wrappedLines.map(l => l.length))

        const approxWidth = longestLineLen * avgCharWidth
        const totalRows = wrappedLines.length
        const approxHeight = (totalRows - 1) * rowStep + fontSize * 1.2

        const verticalPad = fontSize * 1.5
        return {
          minX: lbl.x - avgCharWidth,          // small horizontal pad (draw uses x - 5 offset)
          minY: lbl.y - approxHeight - verticalPad,
          maxX: lbl.x + approxWidth,
          maxY: lbl.y + verticalPad
        }
      }
      case componentTypes.shape: {
        const shp = component as Shape
        if (!shp.components || shp.components.length === 0) {
          return { minX: shp.x, minY: shp.y, maxX: shp.x, maxY: shp.y }
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const child of shp.components) {
          const cb = this.getUnrotatedComponentBoundaryBox(child)
          minX = Math.min(minX, cb.minX); minY = Math.min(minY, cb.minY)
          maxX = Math.max(maxX, cb.maxX); maxY = Math.max(maxY, cb.maxY)
        }
        return {
          minX: Math.min(shp.x, minX + shp.x), minY: Math.min(shp.y, minY + shp.y),
          maxX: Math.max(shp.x, maxX + shp.x), maxY: Math.max(shp.y, maxY + shp.y)
        }
      }
      default:
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
    }
  }
  private getScreenFootprintPx(component: Component, bbox: QuadTreeBounds): number {
    switch (component.type) {
      case componentTypes.point:
        return (component as Point).radius * this.zoom * 2
      case componentTypes.label:
        return (component as Label).fontSize * this.zoom
      case componentTypes.picture:
        return Number.POSITIVE_INFINITY // never LOD-cull; treated as always-visible
      default: {
        // Lines/circles/rects/arcs/polygons/boundboxes: use the larger bbox
        // dimension as a cheap footprint estimate. A perfectly horizontal
        // line has zero bbox height but nonzero width, so this correctly
        // doesn't cull it — only genuinely tiny/degenerate geometry gets cut.
        const w = (bbox.maxX - bbox.minX) * this.zoom
        const h = (bbox.maxY - bbox.minY) * this.zoom
        return Math.max(w, h)
      }
    }
  }
  drawAllComponents(components: Component[], moveByX: number, moveByY: number, useSpatialIndex: boolean = false) {
    if (useSpatialIndex) {
      if (this._isQuadtreeDirty || !this._quadtree) this.rebuildQuadtree(components)
      const viewport = this.getCameraWorldBounds()
      const candidates = this._quadtree
        ? this._quadtree.query(viewport)
        : components.map(c => ({ item: c, bbox: this.getComponentBoundaryBox(c) }))
      for (const { item: component, bbox } of candidates) {
        if (component.active == false) continue;
        if (!this.isComponentInCamera(bbox)) continue;
        if (this.getScreenFootprintPx(component, bbox) < GraphicsRenderer.MIN_VISIBLE_PX) continue;
        this.drawComponent(component, moveByX, moveByY)
      }
      return
    }
    for (let i = 0; i < components.length; i++) {
      if (components[i].active == false) continue;
      const bbox = this.getComponentBoundaryBox(components[i])
      if (!this.isComponentInCamera(bbox)) continue;
      if (this.getScreenFootprintPx(components[i], bbox) < GraphicsRenderer.MIN_VISIBLE_PX) continue;
      this.drawComponent(components[i], moveByX, moveByY)
    }
  }
  private rotatePoint(px: number, py: number, ox: number, oy: number, rotation: number): Vector2 {
    if (!rotation) return { x: px, y: py }
    const r = (rotation * Math.PI) / 180
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    const dx = px - ox
    const dy = py - oy
    return {
      x: ox + dx * cos - dy * sin,
      y: oy + dx * sin + dy * cos
    }
  }

  /**
   * Preserve the rendered positions of the handles that were not dragged.
   * Components such as a line and rectangle rotate around their derived
   * centre, so simply writing one unrotated endpoint changes that centre and
   * makes every other visible endpoint "spring" away from the cursor.
   */
  private dragRotatedHandleWithoutSpring(component: Component, handleId: string, target: Vector2): boolean {
    const positions = this.dragHandlePositions
    const rotation = component.rotation ?? 0
    if (!positions || !rotation) return false

    const locked = (id: string) => positions.get(id)
    const unrotate = (point: Vector2, center: Vector2) =>
      this.rotatePoint(point.x, point.y, center.x, center.y, -rotation)

    if (component.type === componentTypes.line || component.type === componentTypes.measure) {
      const line = component as Line
      const fixed = locked(handleId === 'start' ? 'end' : handleId === 'end' ? 'start' : '')
      if (!fixed) return false
      const center = { x: (target.x + fixed.x) / 2, y: (target.y + fixed.y) / 2 }
      const start = unrotate(handleId === 'start' ? target : fixed, center)
      const end = unrotate(handleId === 'end' ? target : fixed, center)
      line.x1 = start.x; line.y1 = start.y
      line.x2 = end.x; line.y2 = end.y
      return true
    }

    if (component.type === componentTypes.rectangle || component.type === componentTypes.boundBox) {
      const rectangle = component as Rectangle
      const opposite: Record<string, string> = {
        start: 'bottom-right',
        'top-right': 'bottom-left',
        'bottom-left': 'top-right',
        'bottom-right': 'start'
      }
      const fixed = locked(opposite[handleId])
      if (!fixed) return false
      const center = { x: (target.x + fixed.x) / 2, y: (target.y + fixed.y) / 2 }
      const draggedModel = unrotate(target, center)
      const fixedModel = unrotate(fixed, center)
      if (handleId === 'start' || handleId === 'bottom-right') {
        rectangle.x1 = handleId === 'start' ? draggedModel.x : fixedModel.x
        rectangle.y1 = handleId === 'start' ? draggedModel.y : fixedModel.y
        rectangle.x2 = handleId === 'bottom-right' ? draggedModel.x : fixedModel.x
        rectangle.y2 = handleId === 'bottom-right' ? draggedModel.y : fixedModel.y
      } else {
        rectangle.x1 = handleId === 'bottom-left' ? draggedModel.x : fixedModel.x
        rectangle.y1 = handleId === 'top-right' ? draggedModel.y : fixedModel.y
        rectangle.x2 = handleId === 'top-right' ? draggedModel.x : fixedModel.x
        rectangle.y2 = handleId === 'bottom-left' ? draggedModel.y : fixedModel.y
      }
      return true
    }

    if (component.type === componentTypes.circle && handleId === 'start') {
      const circle = component as Circle
      const fixed = locked('end')
      if (!fixed) return false
      circle.x1 = target.x
      circle.y1 = target.y
      const end = unrotate(fixed, target)
      circle.x2 = end.x
      circle.y2 = end.y
      return true
    }

    if (component.type === componentTypes.arc && handleId === 'start') {
      const arc = component as Arc
      const mid = locked('mid')
      const end = locked('end')
      if (!mid || !end) return false
      arc.x1 = target.x
      arc.y1 = target.y
      const modelMid = unrotate(mid, target)
      const modelEnd = unrotate(end, target)
      arc.x2 = modelMid.x
      arc.y2 = modelMid.y
      arc.x3 = modelEnd.x
      arc.y3 = modelEnd.y
      return true
    }

    if (component.type === componentTypes.polygon) {
      const polygon = component as Polygon
      const rendered = polygon.vectors.map((_, index) => positions.get(`handle-${index}`))
      const draggedIndex = Number(handleId.replace('handle-', ''))
      if (!Number.isInteger(draggedIndex) || !rendered.every((p): p is Vector2 => !!p)) return false
      rendered[draggedIndex] = target
      const center = {
        x: rendered.reduce((sum, point) => sum + point.x, 0) / rendered.length,
        y: rendered.reduce((sum, point) => sum + point.y, 0) / rendered.length
      }
      polygon.vectors.forEach((_, index) => {
        const point = unrotate(rendered[index], center)
        polygon.vectors[index].x = point.x
        polygon.vectors[index].y = point.y
      })
      return true
    }

    return false
  }

  // Pivot each component rotates around, matching the origins used by the
  // corresponding drawX() methods. Needed so selection handles/outlines line
  // up with what's actually rendered, and so dragging a handle on a rotated
  // component writes back sane (un-rotated) model coordinates.
  private getRotationOrigin(component: Component): Vector2 {
    switch (component.type) {
      case componentTypes.line:
      case componentTypes.measure:
      case componentTypes.rectangle:
      case componentTypes.boundBox: {
        const c = component as Line | Rectangle
        return { x: (c.x1 + c.x2) / 2, y: (c.y1 + c.y2) / 2 }
      }
      case componentTypes.circle:
      case componentTypes.arc: {
        const c = component as Circle | Arc
        return { x: c.x1, y: c.y1 }
      }
      case componentTypes.polygon: {
        const poly = component as Polygon
        const cx = poly.vectors.reduce((s, v) => s + v.x, 0) / poly.vectors.length
        const cy = poly.vectors.reduce((s, v) => s + v.y, 0) / poly.vectors.length
        return { x: cx, y: cy }
      }
      case componentTypes.label:
        return this.getLabelTextRotationOrigin(component as Label)
      default: {
        const p = component as Point
        return { x: p.x, y: p.y }
      }
    }
  }

  // Types whose handle(s) sit exactly on the rotation pivot (they rotate
  // in place), so rotation never needs to move the handle/model coordinates.
  private isSelfPivotingComponent(type: Component['type']): boolean {
    return (
      type === componentTypes.point ||
      type === componentTypes.picture ||
      type === componentTypes.shape
    )
  }

  // Labels are glyph paths, so their visual center is more
  // accurate than an estimate based on character count. This is shared by
  // drawing, handles, and hit-testing to keep every rotation path aligned.
  private getLabelTextRotationOrigin(label: Pick<Label, 'x' | 'y' | 'text' | 'fontSize'>): Vector2 {
    let y = label.y
    const localDiff = 30
    const fontSize = label.fontSize
    // Glyph coordinates live in world space. drawLabel applies this.zoom once
    // when converting those coordinates to canvas pixels.
    const targetFontScale = fontSize / 10
    const lines = (label.text ?? '').split('\n').flatMap(line => this.wrapLabelLines(line))
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    lines.forEach((line, lineIndex) => {
      const glyphs = this._getSpacedGlyphs(line)
      if (!glyphs) return
      const anchorY = y + lineIndex * (localDiff + fontSize / 2)
      glyphs.forEach(glyph => glyph.commands.forEach(cmd => {
        const x = label.x + cmd.x * targetFontScale * 0.75 - 5
        const pointY = anchorY - cmd.y * targetFontScale
        minX = Math.min(minX, x); maxX = Math.max(maxX, x)
        minY = Math.min(minY, pointY); maxY = Math.max(maxY, pointY)
      }))
    })

    return Number.isFinite(minX)
      ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      : { x: label.x, y }
  }

  drawComponent(component: Component, moveByX: number, moveByY: number) {
    const rotation = component.rotation ?? 0
    switch (component.type) {
      case componentTypes.point: {
        const p = component as Point
        this.drawPoint(p.x + moveByX, p.y + moveByY, p.color, p.radius, p.opacity, rotation)
        break
      }
      case componentTypes.line: {
        const l = component as Line
        this.drawLine(
          l.x1 + moveByX,
          l.y1 + moveByY,
          l.x2 + moveByX,
          l.y2 + moveByY,
          l.color,
          l.radius,
          l.opacity,
          rotation
        )
        break
      }
      case componentTypes.circle: {
        const c = component as Circle
        this.drawCircle(
          c.x1 + moveByX,
          c.y1 + moveByY,
          c.x2 + moveByX,
          c.y2 + moveByY,
          c.color,
          c.radius,
          c.opacity,
          rotation
        )
        break
      }
      case componentTypes.rectangle: {
        const r = component as Rectangle
        this.drawRectangle(
          r.x1 + moveByX,
          r.y1 + moveByY,
          r.x2 + moveByX,
          r.y2 + moveByY,
          r.color,
          r.radius,
          r.opacity,
          rotation
        )
        break
      }
      case componentTypes.measure: {
        const m = component as Measure
        this.drawMeasure(
          m.x1 + moveByX,
          m.y1 + moveByY,
          m.x2 + moveByX,
          m.y2 + moveByY,
          m.color,
          m.radius,
          m.opacity,
          rotation
        )
        break
      }
      case componentTypes.label: {
        const label = component as Label
        this.drawLabel(
          label.x + moveByX,
          label.y + moveByY,
          label.radius,
          label.text,
          label.color,
          label.fontSize,
          label.opacity,
          rotation
        )
        break
      }
      case componentTypes.arc: {
        const arc = component as Arc
        this.drawArc(
          arc.x1 + moveByX,
          arc.y1 + moveByY,
          arc.x2 + moveByX,
          arc.y2 + moveByY,
          arc.x3 + moveByX,
          arc.y3 + moveByY,
          arc.color,
          arc.radius,
          arc.opacity,
          rotation
        )
        break
      }
      case componentTypes.shape: {
        const shape = component as Shape
        this.drawShape(shape, rotation)
        break
      }
      case componentTypes.picture: {
        const pic = component as Picture
        this.drawPicture(pic.x + moveByX, pic.y + moveByY, pic.pictureSource, pic.opacity, rotation)
        break
      }
      case componentTypes.polygon: {
        const polygon = component as Polygon
        this.drawPolygon(
          polygon.vectors,
          polygon.color,
          polygon.strokeColor,
          polygon.radius,
          polygon.opacity,
          polygon.enableStroke,
          rotation
        )
        break
      }
      case componentTypes.boundBox: {
        const boundbox = component as BoundBox
        this.drawRectangle(boundbox.x1, boundbox.y1, boundbox.x2, boundbox.y2, '#e9e9e9', 2, 50, rotation)
        break
      }
    }
  }

  drawTemporaryComponent() {
    const rotation = 0 // temporary preview rotation source (set from UI state later if needed)
    switch (this.temporaryComponentType) {
      case componentTypes.point:
        this.drawPoint(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.line:
        this.drawLine(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.circle:
        this.drawCircle(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        this.drawMeasure(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.rectangle:
        this.drawRectangle(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        this.drawMeasure(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        this.drawMeasure(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[1]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        this.drawMeasure(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[0]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.measure:
        this.drawMeasure(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.arc:
        this.cleanLog(`temporary points: ${this.temporaryPoints[0]}`)
        this.drawArc(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.temporaryPoints[2]!,
          this.temporaryPoints[3]!,
          this.temporaryPoints[4]!,
          this.temporaryPoints[5]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.shape:
        if (this.temporaryShape) {
          this.drawShape(this.temporaryShape, rotation)
        }
        break
      case componentTypes.picture:
        this.drawPoint(
          this.temporaryPoints[0]!,
          this.temporaryPoints[1]!,
          this.selectedColor,
          this.selectedRadius,
          100,
          rotation
        )
        break
      case componentTypes.polygon:
        this.drawPolygon(
          [...this.temporaryVectors, { x: this.getCursorXLocal(), y: this.getCursorYLocal() }],
          this.selectedColor,
          '#ffffff',
          this.selectedRadius,
          100,
          true,
          rotation
        )
        break
    }
  }
  drawUserCursor(x: number, y: number, rotation: number = 0) {
    const mouseShapeVectors: Vector2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 16 },
      { x: 8, y: 10 },
      { x: 15, y: 8 },
      { x: 0, y: 0 }
    ]
    this.context?.save()
    if (rotation) {
      this.context?.translate(x, y)
      this.context?.rotate((rotation * Math.PI) / 180)
      this.context?.translate(-x, -y)
    }
    this.context?.beginPath()
    this.context?.moveTo(x + mouseShapeVectors[0].x, y + mouseShapeVectors[0].y)
    mouseShapeVectors.forEach((point, index) => {
      if (index > 0) this.context?.lineTo(x + point.x, y + point.y)
    })
    this.context?.closePath()
    this.context!.fillStyle = '#0080ff'
    this.context?.fill()
    this.context!.strokeStyle = '#e9e9e9'
    this.context!.lineWidth = 1
    this.context?.stroke()
    this.context?.restore()
  }
  drawPoint(x: number, y: number, color: string, radius: number, opacity: number, rotation: number = 0) {
    if (!this.context) return
    const cx = (x + this.cOutX) * this.zoom
    const cy = (y + this.cOutY) * this.zoom

    if (this.selectedComponent != null || this.mode == this.modes.Move) {
      this.context.save()
      if (rotation) {
        this.context.translate(cx, cy)
        this.context.rotate((rotation * Math.PI) / 180)
        this.context.translate(-cx, -cy)
      }
      this.context.lineWidth = 2
      this.context.fillStyle = '#ffffff'
      this.context.strokeStyle = this.selectedColor
      this.context.beginPath()
      this.context.rect(cx - 4, cy - 4, 8, 8)
      this.context.closePath()
      this.context.fill()
      this.context.stroke()
      this.context.restore()
      return
    }

    const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
    const path = this.getBatchPath(strokeStyle, 3 * this.zoom)
    const r = 2 * this.zoom
    path.moveTo(cx + r, cy)
    path.arc(cx, cy, r, 0, Math.PI * 2, false)
  }
  private getBatchPath(strokeStyle: string, lineWidth: number, lineJoin: CanvasLineJoin = 'miter'): Path2D {
    const key = strokeStyle + '|' + lineWidth + '|' + lineJoin
    let bucket = this._pathBatches.get(key)
    if (!bucket) {
      bucket = { path: new Path2D(), strokeStyle, lineWidth, lineJoin }
      this._pathBatches.set(key, bucket)
    }
    return bucket.path
  }

  flushBatchedPaths(): void {
    if (!this.context || this._pathBatches.size === 0) return
    this.context.lineCap = 'round'
    for (const { path, strokeStyle, lineWidth, lineJoin } of this._pathBatches.values()) {
      this.context.strokeStyle = strokeStyle
      this.context.lineWidth = lineWidth
      this.context.lineJoin = lineJoin
      this.context.stroke(path)
    }
    this._pathBatches.clear()
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, color: string, radius: number, opacity: number, rotation: number = 0) {
    if (!this.context) return
    const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
    const path = this.getBatchPath(strokeStyle, radius * this.zoom)

    let ax = x1, ay = y1, bx = x2, by = y2
    if (rotation) {
      const ox = (x1 + x2) / 2
      const oy = (y1 + y2) / 2
      const p1 = this.rotatePoint(x1, y1, ox, oy, rotation)
      const p2 = this.rotatePoint(x2, y2, ox, oy, rotation)
      ax = p1.x; ay = p1.y; bx = p2.x; by = p2.y
    }

    path.moveTo((ax + this.cOutX) * this.zoom, (ay + this.cOutY) * this.zoom)
    path.lineTo((bx + this.cOutX) * this.zoom, (by + this.cOutY) * this.zoom)
  }

  drawCircle(x1: number, y1: number, x2: number, y2: number, color: string, radius: number, opacity: number, rotation: number = 0) {
    if (!this.context) return
    const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
    const path = this.getBatchPath(strokeStyle, radius * this.zoom)

    let c1x = x1, c1y = y1, c2x = x2, c2y = y2
    if (rotation) {
      const ox = x1, oy = y1
      const rp = this.rotatePoint(x2, y2, ox, oy, rotation)
      c2x = rp.x; c2y = rp.y
    }

    const cx = (c1x + this.cOutX) * this.zoom
    const cy = (c1y + this.cOutY) * this.zoom
    const r = this.getDistance(c1x, c1y, c2x, c2y) * this.zoom
    path.moveTo(cx + r, cy)
    path.arc(cx, cy, r, 0, Math.PI * 2, false)
  }

  drawRectangle(x1: number, y1: number, x2: number, y2: number, color: string, radius: number, opacity: number, rotation: number = 0) {
    if (!this.context) return
    const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
    const path = this.getBatchPath(strokeStyle, radius * this.zoom)

    let p1 = { x: x1, y: y1 }
    let p2 = { x: x2, y: y1 }
    let p3 = { x: x2, y: y2 }
    let p4 = { x: x1, y: y2 }

    if (rotation) {
      const ox = (x1 + x2) / 2
      const oy = (y1 + y2) / 2
      p1 = this.rotatePoint(p1.x, p1.y, ox, oy, rotation)
      p2 = this.rotatePoint(p2.x, p2.y, ox, oy, rotation)
      p3 = this.rotatePoint(p3.x, p3.y, ox, oy, rotation)
      p4 = this.rotatePoint(p4.x, p4.y, ox, oy, rotation)
    }

    path.moveTo((p1.x + this.cOutX) * this.zoom, (p1.y + this.cOutY) * this.zoom)
    path.lineTo((p2.x + this.cOutX) * this.zoom, (p2.y + this.cOutY) * this.zoom)
    path.lineTo((p3.x + this.cOutX) * this.zoom, (p3.y + this.cOutY) * this.zoom)
    path.lineTo((p4.x + this.cOutX) * this.zoom, (p4.y + this.cOutY) * this.zoom)
    path.lineTo((p1.x + this.cOutX) * this.zoom, (p1.y + this.cOutY) * this.zoom)
  }

  drawArrowhead(
    x: number,
    y: number,
    angle: number,
    length: number,
    offset: number,
    color: string,
    radius: number,
    opacity: number,
    rotation: number = 0
  ) {
    var arrowX = x + length * Math.cos(angle)
    var arrowY = y + length * Math.sin(angle)
    var offsetX = offset * Math.cos(angle + Math.PI / 2)
    var offsetY = offset * Math.sin(angle + Math.PI / 2)

    this.drawLine(x, y, arrowX + offsetX, arrowY + offsetY, color, radius, opacity, rotation)
    this.drawLine(x, y, arrowX - offsetX, arrowY - offsetY, color, radius, opacity, rotation)
    this.drawLine(
      arrowX + offsetX,
      arrowY + offsetY,
      arrowX - offsetX,
      arrowY - offsetY,
      color,
      radius,
      opacity,
      rotation
    )
  }

  drawRawFontobeneAtLocation(
    x: number,
    y: number,
    text: string,
    color?: string,
    fontSize?: number,
    thickness?: number,
    opacity?: number,
    rotation?: number,
    textAlign: 'left' | 'center' = 'left',
    textBaseline: 'middle' | 'top' | 'bottom' = 'bottom'
  ) {
    this.cleanLog(`Getting text for ${text}`);
    if (!this.context) return;

    const glyphs = this._getSpacedGlyphs(text)
    if (!glyphs) return;

    const targetColor = color || '#E9E9E9';
    const targetOpacity = opacity !== undefined ? opacity : 1.0;
    const targetFontSize = fontSize || this.fontSize;
    const targetThickness = thickness || 0.5;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const glyph of glyphs) {
      for (const cmd of glyph.commands) {
        if (cmd.x < minX) minX = cmd.x;
        if (cmd.x > maxX) maxX = cmd.x;
        if (cmd.y < minY) minY = cmd.y;
        if (cmd.y > maxY) maxY = cmd.y;
      }
    }

    const fbWidth = (maxX >= minX) ? (maxX - minX) * targetFontSize : 0;
    const fbHeight = (maxY >= minY) ? (maxY - minY) * targetFontSize : targetFontSize;

    let localOffsetX = 0;
    if (textAlign === 'center') localOffsetX = -fbWidth / 2;

    let localOffsetY = 0;
    if (textBaseline === 'middle') localOffsetY = fbHeight / 2;
    else if (textBaseline === 'top') localOffsetY = fbHeight;

    this.context.save();
    this.context.translate(x, y);
    if (rotation) this.context.rotate(rotation);

    this.context.strokeStyle = targetColor + _num2hex(targetOpacity);
    this.context.lineWidth = targetThickness * this.zoom;
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';

    this.context.beginPath();

    for (const glyph of glyphs) {
      for (const cmd of glyph.commands) {
        const px = (cmd.x * targetFontSize) + localOffsetX;
        const py = (-cmd.y * targetFontSize) + localOffsetY;
        if (cmd.command === 'PD') this.context.moveTo(px, py);
        else if (cmd.command === 'MP') this.context.lineTo(px, py);
      }
    }

    this.context.stroke();
    this.context.restore();
    return fbWidth;
  }

  drawMeasure(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    radius: number,
    opacity: number,
    rotation: number = 0
  ) {
    let ax1 = x1, ay1 = y1, ax2 = x2, ay2 = y2
    if (rotation) {
      const ox = (x1 + x2) / 2
      const oy = (y1 + y2) / 2
      const p1 = this.rotatePoint(x1, y1, ox, oy, rotation)
      const p2 = this.rotatePoint(x2, y2, ox, oy, rotation)
      ax1 = p1.x; ay1 = p1.y; ax2 = p2.x; ay2 = p2.y
    }

    let distance = this.getDistance(ax1, ay1, ax2, ay2) * this.unitFactor * this.unitConversionFactor
    let angle = Math.atan2(ay2 - ay1, ax2 - ax1)
    var defaultArrowLength = 25
    var arrowOffset = 5
    let arrowLength = defaultArrowLength
    let localZoom = this.zoom
    let localDiff = 0
    if (this.zoom <= 0.25) {
      localZoom = 0.5
      localDiff = 20
    }
    const distanceText = distance.toFixed(2) + '' + this.unitMeasure

    const targetFontSize = 2 * this.zoom;
    const glyphs = this._getSpacedGlyphs(distanceText)
    if (!glyphs) return;
    let maxX = 0;
    if (glyphs && glyphs.length > 0) {
      maxX = glyphs.reduce((max, g) => Math.max(max, g.commands.reduce((m, c) => Math.max(m, c.x), 0)), 0);
    }
    const calculatedTextWidth = maxX * targetFontSize;

    const minDistanceForFullArrow = (defaultArrowLength * 2) / 100
    if (distance < minDistanceForFullArrow) {
      arrowLength = (distance / minDistanceForFullArrow) * defaultArrowLength
    }
    const isShortDistance = distance < minDistanceForFullArrow * 2
    const midX = (ax1 + ax2) / 2
    const midY = (ay1 + ay2) / 2
    const textOffsetY = isShortDistance ? (750 / 100) * this.zoom : 0

    if (!isShortDistance) {
      const basePadding = 20
      const adaptivePadding = basePadding * this.zoom
      const labelGap = (calculatedTextWidth + adaptivePadding) / this.zoom

      const halfGapX = (labelGap / 2) * Math.cos(angle)
      const halfGapY = (labelGap / 2) * Math.sin(angle)

      this.drawLine(ax1, ay1, midX - halfGapX, midY - halfGapY, color, radius, opacity, 0)
      this.drawLine(midX + halfGapX, midY + halfGapY, ax2, ay2, color, radius, opacity, 0)
    }

    this.drawArrowhead(ax1, ay1, angle, arrowLength, arrowOffset, color, radius, opacity, 0)
    this.drawArrowhead(ax2, ay2, angle, -arrowLength, arrowOffset, color, radius, opacity, 0)

    let posX = midX * this.zoom + this.cOutX * this.zoom;
    let posY = midY * this.zoom + textOffsetY * 2 + this.cOutY * this.zoom;

    if (localDiff !== 0) {
      posX += localDiff * Math.sin(angle);
      posY -= localDiff * Math.cos(angle);
    }

    this.drawRawFontobeneAtLocation(
      posX,
      posY,
      distanceText,
      color,
      targetFontSize,
      radius,
      opacity,
      angle,
      'center',
      isShortDistance ? 'top' : 'middle'
    );
  }

  drawLabel(
    x: number,
    y: number,
    radius: number,
    text: string,
    color: string,
    fontSize: number,
    opacity: number,
    rotation: number = 0
  ) {
    if (!this.context) return;

    const rotationOrigin = this.getLabelTextRotationOrigin({ x, y, text, fontSize })

    const localDiff = 30;
    // Keep label glyphs in world space. The screen conversion below applies
    // this.zoom, so including it here would make labels scale as zoom squared.
    const targetFontScale = fontSize / 10;
    const condensedWidthScale = 0.75;

    const maxLength = 24;
    let tmpLength = 0;
    let tmpText = '';
    const arrText = text.split(' ');
    const lines: string[] = [];

    for (let i = 0; i < arrText.length; i++) {
      tmpLength += arrText[i].length + 1;
      tmpText += (tmpText ? ' ' : '') + arrText[i];
      if (tmpLength > maxLength) {
        lines.push(tmpText);
        tmpLength = 0;
        tmpText = '';
      }
    }
    if (tmpText.trim().length > 0) lines.push(tmpText);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineText = lines[lineIndex];
      const glyphs = this._getSpacedGlyphs(lineText)
      if (!glyphs) continue;

      const currentLineY = y + (lineIndex * (localDiff + (fontSize / 2)));
      const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
      const path = this.getBatchPath(strokeStyle, (radius / 2) * this.zoom, 'round')

      const anchorX = x
      const anchorY = currentLineY

      for (const glyph of glyphs) {
        for (const cmd of glyph.commands) {
          let lx = (cmd.x * targetFontScale * condensedWidthScale) - 5
          let ly = (-cmd.y * targetFontScale)
          if (rotation) {
            const rp = this.rotatePoint(
              lx + anchorX,
              ly + anchorY,
              rotationOrigin.x,
              rotationOrigin.y,
              rotation
            )
            lx = rp.x - anchorX
            ly = rp.y - anchorY
          }
          const px = (this.cOutX + anchorX + lx) * this.zoom
          const py = (this.cOutY + anchorY + ly) * this.zoom
          if (cmd.command === 'PD') path.moveTo(px, py)
          else if (cmd.command === 'MP') path.lineTo(px, py)
        }
      }
      this.context.stroke();
    }
  }
  drawArc(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    color: string,
    radius: number,
    opacity: number,
    rotation: number = 0
  ) {
    if (!this.context) return
    let ax2 = x2, ay2 = y2, ax3 = x3, ay3 = y3
    if (rotation) {
      const p2 = this.rotatePoint(x2, y2, x1, y1, rotation)
      const p3 = this.rotatePoint(x3, y3, x1, y1, rotation)
      ax2 = p2.x; ay2 = p2.y; ax3 = p3.x; ay3 = p3.y
    }
    const firstAngle = this.getAngle(x1, y1, ax2, ay2)
    const secondAngle = this.getAngle(x1, y1, ax3, ay3)
    const strokeStyle = this.getColorWithOpacityFromCache(color, opacity)
    const path = this.getBatchPath(strokeStyle, radius * this.zoom)
    const cx = (x1 + this.cOutX) * this.zoom
    const cy = (y1 + this.cOutY) * this.zoom
    const r = this.getDistance(x1, y1, ax2, ay2) * this.zoom
    path.moveTo(cx + r * Math.cos(firstAngle), cy + r * Math.sin(firstAngle))
    path.arc(cx, cy, r, firstAngle, secondAngle, false)
  }

  drawShape(shape: Shape, rotation: number = 0) {
    if (rotation && shape.components?.length) {
      const ox = shape.x, oy = shape.y
      const rotatedChildren = shape.components.map((c) => {
        const copy: any = { ...c }
        const rotateCoordinates = (xKey: string, yKey: string) => {
          if (typeof copy[xKey] !== 'number' || typeof copy[yKey] !== 'number') return
          const point = this.rotatePoint(copy[xKey], copy[yKey], 0, 0, rotation)
          copy[xKey] = point.x
          copy[yKey] = point.y
        }
        rotateCoordinates('x', 'y')
        rotateCoordinates('x1', 'y1')
        rotateCoordinates('x2', 'y2')
        rotateCoordinates('x3', 'y3')
        if (Array.isArray(copy.vectors)) {
          copy.vectors = copy.vectors.map((v: Vector2) => this.rotatePoint(v.x, v.y, 0, 0, rotation))
        }
        return copy as Component
      })
      this.drawAllComponents(rotatedChildren, ox, oy, false)
    } else {
      this.drawAllComponents(shape.components, shape.x, shape.y, false)
    }
    this.drawPoint(shape.x, shape.y, shape.color, shape.radius, shape.opacity, rotation)
  }

  drawPicture(x: number, y: number, basedURL: string, opacity: number, rotation: number = 0) {
    this.drawPoint(x, y, '#00ffff', 2, opacity, rotation)
    if (!this.imageCache.has(basedURL)) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = basedURL
      img.onerror = () => { this.imageCache.set(basedURL, 'ERROR') }
      img.onload = () => {
        this.imageCache.set(basedURL, img)
        this._isQuadtreeDirty = true
        this.markDirty('picture dimensions resolved')
      }
    } else {
      const cached = this.imageCache.get(basedURL)
      this.renderImage(x, y, cached === 'ERROR' ? null : (cached as HTMLImageElement), opacity, rotation)
    }
  }

  renderImage(
    x: number,
    y: number,
    img: HTMLImageElement | null,
    opacity: number,
    rotation: number = 0
  ) {
    if (!img || img === null) {
      const errorShape: Shape = {
        components: [
          new Circle(0, 0, 10, 10, 2, '#ff0000', opacity),
          new Line(-7, -7, 7, 7, 2, '#ff0000', opacity),
          new Line(-7, 7, 7, -7, 2, '#ff0000', opacity),
          new Label(17, 6, 'Image Error', this.fontSize, opacity)
        ],
        x: x,
        y: y,
        color: '#ffffff',
        radius: 2,
        opacity: opacity,
        active: true,
        rotation: 0,
        name: 'Error shape shit',
        type: componentTypes.shape,
        addComponent: function (component: Component) {
          this.components.push(component)
        }
      }
      this.drawShape(errorShape, rotation)
      return
    }
    const width = img.naturalWidth * this.zoom || 100
    const height = img.naturalHeight * this.zoom || 100
    if (this.context) {
      const dx = (x + this.cOutX) * this.zoom
      const dy = (y + this.cOutY) * this.zoom
      this.context.save()
      this.context.globalAlpha = opacity / 100
      if (rotation) {
        this.context.translate(dx, dy)
        this.context.rotate((rotation * Math.PI) / 180)
        this.context.translate(-dx, -dy)
      }
      this.context.drawImage(img, dx, dy, width, height)
      this.context.restore()
      this.context.globalAlpha = 1
    }
  }
  drawPolygon(
    vectors: Vector2[],
    fillColor: string,
    strokeColor: string,
    radius: number,
    opacity: number,
    enableStroke: boolean,
    rotation: number = 0
  ) {
    if (vectors.length < 2) return
    let drawVectors = vectors
    if (rotation) {
      const cx = vectors.reduce((s, v) => s + v.x, 0) / vectors.length
      const cy = vectors.reduce((s, v) => s + v.y, 0) / vectors.length
      drawVectors = vectors.map(v => this.rotatePoint(v.x, v.y, cx, cy, rotation))
    }

    this.context!.lineWidth = radius * this.zoom
    this.context!.globalAlpha = opacity / 100
    this.context!.fillStyle = fillColor
    this.context!.strokeStyle = strokeColor
    this.context!.beginPath()
    this.context!.moveTo(
      (drawVectors[0].x + this.cOutX) * this.zoom,
      (drawVectors[0].y + this.cOutY) * this.zoom
    )
    for (let i = 1; i < drawVectors.length; i++) {
      this.context!.lineTo(
        (drawVectors[i].x + this.cOutX) * this.zoom,
        (drawVectors[i].y + this.cOutY) * this.zoom
      )
    }
    this.context!.closePath()
    this.context!.fill()
    if (enableStroke) this.context!.stroke()
    this.context!.globalAlpha = 1
  }
  drawOrigin(cx: number, cy: number) {
    if (this.context) {
      this.context.lineWidth = 1
      this.context.strokeStyle = '#fff'

      this.context.beginPath()
      this.context.moveTo(cx * this.zoom, -this.displayHeight)
      this.context.lineTo(cx * this.zoom, this.displayHeight)
      this.context.closePath()
      this.context.stroke()

      this.context.beginPath()
      this.context.moveTo(-this.displayWidth, cy * this.zoom)
      this.context.lineTo(this.displayWidth, cy * this.zoom)
      this.context.closePath()
      this.context.stroke()
    }
  }
  drawRules() {
    if (this.context) {
      if (!this.showRules) return

      if (this.gridPointer) {
        this.context.lineWidth = 0.2
        this.context.strokeStyle = '#ccc'

        this.context.beginPath()
        this.context.moveTo(this.getCursorXInFrame(), -this.displayHeight)
        this.context.lineTo(this.getCursorXInFrame(), this.displayHeight)
        this.context.closePath()
        this.context.stroke()

        this.context.beginPath()
        this.context.moveTo(-this.displayWidth, this.getCursorYInFrame())
        this.context.lineTo(this.displayWidth, this.getCursorYInFrame())
        this.context.closePath()
        this.context.stroke()
      }
    }
  }
  flagQuadtreeDirty(dirty: boolean) {
    this._isQuadtreeDirty = dirty;
  }
  drawGrid(camXoff: number, camYoff: number) {
    const ctx = this.context
    if (!ctx) return

    // --- Tunables ---
    const targetPixelSpacing = 40 // ideal on-screen distance between dots
    const minPixelSpacing = 4     // never draw dots closer than this
    const majorMultiplier = 10   // every Nth *base* grid line is "major"
    const minorDotSize = 1
    const majorDotSize = 2.5

    // On-screen spacing if we drew every base grid line, at current zoom.
    const baseScreenSpacing = this.gridSpacing * this.zoom

    // Guard against degenerate input (zoom/gridSpacing == 0 => would loop forever).
    if (!isFinite(baseScreenSpacing) || baseScreenSpacing <= 0) return

    // How many base grid lines to skip so the visible spacing stays near
    // targetPixelSpacing. Rounding log2 to an integer snaps to powers of two,
    // so the skip factor changes in discrete, non-flickering steps as you zoom
    // continuously in/out (same technique used by adaptive grids in design tools).
    const rawSkip = targetPixelSpacing / baseScreenSpacing
    const skipPower = Math.max(0, Math.round(Math.log2(Math.max(rawSkip, 1))))
    const skipFactor = Math.pow(2, skipPower)

    const effectiveSpacing = baseScreenSpacing * skipFactor

    // If spacing is still tiny (extreme zoom-out), bail rather than drawing a
    // dot-per-pixel mush.
    if (effectiveSpacing < minPixelSpacing) return

    const leftBound = -this.displayWidth / 2
    const rightBound = this.displayWidth / 2
    const topBound = -this.displayHeight / 2
    const bottomBound = this.displayHeight / 2

    const camScreenX = camXoff * this.zoom
    const camScreenY = camYoff * this.zoom

    // Work in integer "grid steps" anchored at world-space origin (x=0 <=> ix=0),
    // rather than accumulating floats. This avoids drift, and multiplying the
    // step index by skipFactor gives the exact base-grid index used for
    // major-line detection below.
    const startIndexX = Math.floor((leftBound - camScreenX) / effectiveSpacing) - 1
    const endIndexX = Math.ceil((rightBound - camScreenX) / effectiveSpacing) + 1
    const startIndexY = Math.floor((topBound - camScreenY) / effectiveSpacing) - 1
    const endIndexY = Math.ceil((bottomBound - camScreenY) / effectiveSpacing) + 1

    ctx.fillStyle = '#cccccc75'

    for (let ix = startIndexX; ix <= endIndexX; ix++) {
      const x = ix * effectiveSpacing
      const screenX = x + camScreenX
      // Real culling: skip columns entirely outside the viewport.
      if (screenX < leftBound || screenX > rightBound) continue

      const baseIndexX = ix * skipFactor
      const isMajorX = baseIndexX % majorMultiplier === 0

      for (let iy = startIndexY; iy <= endIndexY; iy++) {
        const y = iy * effectiveSpacing
        const screenY = y + camScreenY
        // Real culling: skip points entirely outside the viewport.
        if (screenY < topBound || screenY > bottomBound) continue

        const baseIndexY = iy * skipFactor
        const isMajor = isMajorX && baseIndexY % majorMultiplier === 0

        const size = isMajor ? majorDotSize : minorDotSize
        // Center the dot on its grid point regardless of size.
        ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size)
      }
    }
  }
  moveComponent(index: number, x: number, y: number): boolean {
    if (index !== null && this.logicDisplay) {
      const component = this.logicDisplay.components[index]

      switch (component.type) {
        case componentTypes.point:
        case componentTypes.label:
        case componentTypes.picture:
        case componentTypes.shape:
          const singlePointComponent = component as Point | Label | Picture | Shape
          const dx = x - singlePointComponent.x
          const dy = y - singlePointComponent.y
          singlePointComponent.x += dx
          singlePointComponent.y += dy
          break

        case componentTypes.line:
        case componentTypes.circle:
        case componentTypes.rectangle:
        case componentTypes.boundBox:
        case componentTypes.measure:
          const twoPointComponent = component as Line | Circle | Rectangle | Measure
          const dx2 = x - twoPointComponent.x1
          const dy2 = y - twoPointComponent.y1
          twoPointComponent.x1 += dx2
          twoPointComponent.y1 += dy2
          twoPointComponent.x2 += dx2
          twoPointComponent.y2 += dy2
          break

        case componentTypes.arc:
          const arc = component as Arc
          const dx3 = x - arc.x1
          const dy3 = y - arc.y1
          arc.x1 += dx3
          arc.y1 += dy3
          arc.x2 += dx3
          arc.y2 += dy3
          arc.x3 += dx3
          arc.y3 += dy3
          break
      }
      this.updateQuadtreeEntry(component)
      this.markDirty('Component moved');
      return true
    }
    return false
  }
  selectComponent(index: number) {
    this.selectedComponent = index
    if (index != null) {
      this.selectedComponent = index
      if (this.mode === this.modes.Move) {
        this.previousColor = this.logicDisplay!.components[index].color
        this.previousRadius = this.logicDisplay!.components[index].radius
        this.logicDisplay!.components[index].color = this.selectedColor
        this.logicDisplay!.components[index].radius = this.selectedRadius
      }
    }
  }
  unselectComponent() {
    if (this.selectedComponent != null) {
      if (this.mode === this.modes.Move && this.previousColor) {
        this.logicDisplay!.components[this.selectedComponent].color = this.previousColor
        if (this.previousRadius !== null) {
          this.logicDisplay!.components[this.selectedComponent].radius = this.previousRadius
        }
        this.previousColor = null
        this.previousRadius = null
      }
      this.selectedComponent = null
    }
  }
  resetMode() {
    this.temporaryComponentType = null
    this.temporaryShape = null
    this.temporaryVectors = []
    this.temporaryVectorIndex = 0

    for (var i = 0; i < this.temporaryPoints.length; i++) delete this.temporaryPoints[i]

    this.mode = -1
    this.tooltip = this.defaultTooltip
  }
  setMode(mode: number) {
    this.unselectComponent()
    this.resetMode()

    if (this.readonly) this.mode = this.modes.Navigate
    else this.mode = mode
    this.markDirty('changing modes');

    if (this.onModeChange) {
      this.onModeChange()
    }
  }
  setModeShape(getShape: () => Shape) {
    this.setMode(this.modes.AddShape)
    this.temporaryShape = getShape()
  }
  findIntersectionWith(x: number, y: number) {
    if (!this.logicDisplay) return null

    // Track all intersections with their distances
    interface Intersection {
      index: number
      distance: number
      type: number
      pointType: string
    }

    const intersections: Intersection[] = []
    const snapBox = this.snapTolerance / this.zoom

    if (this._isQuadtreeDirty || !this._quadtree) this.rebuildQuadtree(this.logicDisplay.components)
    const candidates = this._quadtree
      ? this._quadtree.query({ minX: x - snapBox, minY: y - snapBox, maxX: x + snapBox, maxY: y + snapBox })
      : this.logicDisplay.components.map(item => ({ item, bbox: this.getComponentBoundaryBox(item) }))

    // Querying the spatial index reduces pointer work from O(all components)
    // to O(nearby components). Keep original indexes for existing priorities.
    for (const { item } of candidates) {
      const i = this._componentIndexes.get(item)
      if (i === undefined || item.active === false) continue

      // Calculate intersection data
      const intersection = this.calculateIntersection(i, x, y)
      if (intersection) {
        intersections.push({
          index: i,
          distance: intersection.distance,
          type: this.logicDisplay.components[i].type,
          pointType: intersection.pointType
        })
      }
    }

    // If no intersections found, return null
    if (intersections.length === 0) return null

    // Sort intersections by priority rules
    return this.getPrioritizedIntersection(intersections)
  }

  private calculateIntersection(
    index: number,
    x: number,
    y: number
  ): { distance: number; pointType: string } | null {
    const component = this.logicDisplay!.components[index]
    const tolerance = this.snapTolerance / this.zoom

    // Rendering applies rotation to model coordinates. Perform the inverse
    // operation here so picking uses the geometry the user can actually see.
    const rotation = component.rotation ?? 0
    if (rotation) {
      const origin = this.getRotationOrigin(component)
      const local = this.rotatePoint(x, y, origin.x, origin.y, -rotation)
      x = local.x
      y = local.y
    }

    switch (component.type) {
      case componentTypes.point:
      case componentTypes.label:
      case componentTypes.picture:
      case componentTypes.shape:
        const pointComponent = component as Point
        const delta = this.getDistance(x, y, pointComponent.x, pointComponent.y)
        if (delta <= tolerance) {
          return { distance: delta, pointType: 'center' }
        }
        break

      case componentTypes.line:
      case componentTypes.circle:
      case componentTypes.measure:
        const lineComponent = component as Line
        const delta1 = this.getDistance(x, y, lineComponent.x1, lineComponent.y1)
        const delta2 = this.getDistance(x, y, lineComponent.x2, lineComponent.y2)
        if (delta1 <= tolerance || delta2 <= tolerance) {
          return {
            distance: Math.min(delta1, delta2),
            pointType: delta1 < delta2 ? 'start' : 'end'
          }
        }
        break

      case componentTypes.rectangle:
      case componentTypes.boundBox:
        const rectComponent = component as Rectangle
        // Check all 4 corners of rectangle
        const nw = this.getDistance(x, y, rectComponent.x1, rectComponent.y1)
        const ne = this.getDistance(x, y, rectComponent.x2, rectComponent.y1)
        const sw = this.getDistance(x, y, rectComponent.x1, rectComponent.y2)
        const se = this.getDistance(x, y, rectComponent.x2, rectComponent.y2)

        const minDist = Math.min(nw, ne, sw, se)
        if (minDist <= tolerance) {
          let pointType
          if (minDist === nw) pointType = 'nw'
          else if (minDist === ne) pointType = 'ne'
          else if (minDist === sw) pointType = 'sw'
          else pointType = 'se'

          return {
            distance: minDist,
            pointType: pointType
          }
        }
        break

      case componentTypes.arc:
        const arcComponent = component as Arc
        const deltaCenter = this.getDistance(x, y, arcComponent.x1, arcComponent.y1)
        const deltaStart = this.getDistance(x, y, arcComponent.x2, arcComponent.y2)
        const deltaEnd = this.getDistance(x, y, arcComponent.x3, arcComponent.y3)

        if (deltaCenter <= tolerance || deltaStart <= tolerance || deltaEnd <= tolerance) {
          const minDelta = Math.min(deltaCenter, deltaStart, deltaEnd)
          return {
            distance: minDelta,
            pointType:
              minDelta === deltaCenter ? 'center' : minDelta === deltaStart ? 'start' : 'end'
          }
        }
        break
      case componentTypes.polygon:
        const polygonComponent = component as Polygon
        for (let i = 0; i < polygonComponent.vectors.length; i++) {
          const vector = polygonComponent.vectors[i]
          const delta = this.getDistance(x, y, vector.x, vector.y)
          if (delta <= tolerance) {
            return { distance: delta, pointType: 'vector-' + i }
          }
        }
    }
    return null
  }

  private getPrioritizedIntersection(
    intersections: Array<{ index: number; distance: number; type: number; pointType: string }>
  ): number {
    // Sort by priority rules
    intersections.sort((a, b) => {
      // 1. First priority: Distance (closer = higher priority)
      if (Math.abs(a.distance - b.distance) > 0.1) {
        return a.distance - b.distance
      }

      // 2. Second priority: Component type
      const typePriority: { [key: number]: number } = {
        [componentTypes.point]: 1,
        [componentTypes.label]: 2,
        [componentTypes.picture]: 2,
        [componentTypes.shape]: 3,
        [componentTypes.line]: 4,
        [componentTypes.circle]: 5,
        [componentTypes.rectangle]: 6,
        [componentTypes.arc]: 7,
        [componentTypes.measure]: 8
      }

      if (typePriority[a.type] !== typePriority[b.type]) {
        return typePriority[a.type] - typePriority[b.type]
      }

      // 3. Third priority: Point type within component
      const pointTypePriority: { [key: string]: number } = {
        center: 1,
        start: 2,
        end: 3
      }

      return (pointTypePriority[a.pointType] || 0) - (pointTypePriority[b.pointType] || 0)
    })

    // Return the index of the highest priority intersection
    return intersections[0].index
  }
  undo() {
    if (this.undoStack.length > 0) {
      // Remove the last state from the undoStack and push it to the redoStack
      const state = this.undoStack.pop()
      if (state) {
        this.redoStack.push(state)
      }

      // Get the new last state from the undoStack (if any) to apply to the logicDisplay
      const lastState = this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null

      if (lastState) {
        this.logicDisplay!.components = []
        this.logicDisplay?.importJSON(JSON.parse(lastState), this.logicDisplay.components)
        this.cleanUpBeforeImport()
        if (this.onComponentArrayChanged) {
          this.cleanLog('[renderer] array changed defined, firing')
          this.onComponentArrayChanged()
        }
      } else return

      this.update() // Re-render the canvas
    }
  }
  redo() {
    if (this.redoStack.length > 0) {
      // Move the current state to the undoStack
      this.undoStack.push(JSON.stringify(this.logicDisplay!.components))

      // Get the last state from the redoStack
      const state = this.redoStack.pop()
      this.cleanLog('upcoming state')
      this.cleanLog(state) // Log the state (optional)
      this.cleanLog('parsed state')
      this.cleanLog(JSON.parse(state != null ? state : '[]')) // Log the parsed state (optional)

      // Clear the current components
      this.logicDisplay!.components = []

      // Update the display with the next state
      this.logicDisplay?.importJSON(
        JSON.parse(state != null ? state : '[]'),
        this.logicDisplay.components
      )
      this.cleanUpBeforeImport()
      if (this.onComponentArrayChanged) {
        this.cleanLog('[renderer] array changed defined, firing')
        this.onComponentArrayChanged()
      }
      this.update() // Re-render the canvas
    }
  }
  public onComponentChangeCallback: (() => void) | null = null
  public onModeChange: (() => void) | null = null
  public onComponentArrayChanged: (() => void) | null = null
  public onZoomUpdate: (() => void) | null = null

  private notifyComponentChange() {
    if (this.onComponentChangeCallback) {
      this.onComponentChangeCallback()
    }
    this.cleanLog('component changed')
    this.markDirty('Component changed');
  }

  forcefullyRemoveSelectedComponentOnActiveIndex() {
    this.cleanLog('attempting to delete component');
    this.cleanLog('selected component: ' + this.temporarySelectedComponent);
    if (this.temporarySelectedComponent != null) {
      if (this.logicDisplay!.components.length == 0) this._quadtree = null;
      this.logicDisplay!.components.splice(this.temporarySelectedComponent, 1);
      this.markDirty('component deleted');
      this.temporarySelectedComponent = null;
      this.selectedComponent = null;      // <-- added: was left stale, pointing at a
      this.lastSelectedComponent = null;  // <-- shifted/invalid index after splice,
      this._isQuadtreeDirty = true;
      this.displayRef?.focus();           //     which threw inside refreshSelectionTools()
      this.saveState();
    } else {                              //     and got silently swallowed, freezing the canvas
      this.cleanLog('not deleting, nothing was selected');
    }
  }

  rotateSelected() {
    if (this.logicDisplay && this.selectedComponent != null) {
      const component = this.logicDisplay.components[this.selectedComponent];
      component.rotation = this.normalizeRotation((component.rotation ?? 0) + 90)
      this.updateQuadtreeEntry(component)
      this.notifyComponentChange()
      this.saveState();
    }
  }

  private normalizeRotation(rotation: number): number {
    const normalized = rotation % 360
    return normalized < 0 ? normalized + 360 : normalized
  }

  private toDebugCanvasSpace(v: Vector2): Vector2 {
    return {
      x: v.x - this.displayWidth / 2,
      y: v.y - this.displayHeight / 2
    };
  }

  postDoAfterComponentImport() {
    if (this.onComponentArrayChanged) this.onComponentArrayChanged();
    this.markDirty('refresh after component import');
  }

  async performAction(e: MouseEvent, action: number) {
    switch (this.mode) {
      case this.modes.AddPoint:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          }
          this.temporaryPoints[0] = this.getCursorXLocal()
          this.temporaryPoints[1] = this.getCursorYLocal()
        } else if (action === this.mouseAction.Down) {
          this.logicDisplay?.addComponent(
            new Point(this.temporaryPoints[0]!, this.temporaryPoints[1]!)
          )
          this.saveState()
        }
        this.tooltip = 'Add point (press esc to cancel)'
        break

      case this.modes.AddLine:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.line) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.line
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.line) {
            this.logicDisplay?.addComponent(
              new Line(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!
              )
            )
            this.temporaryPoints[0] = this.temporaryPoints[2]
            this.temporaryPoints[1] = this.temporaryPoints[3]
            this.saveState()
          }
        }
        this.tooltip = 'Add line (press esc to cancel)'
        break

      case this.modes.AddCircle:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.circle) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.circle
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.circle) {
            this.logicDisplay?.addComponent(
              new Circle(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!
              )
            )
            this.saveState()
          }
        }
        this.tooltip = 'Add circle (press esc to cancel)'
        break

      case this.modes.AddArc:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.circle) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.arc) {
            this.temporaryPoints[4] = this.getCursorXLocal()
            this.temporaryPoints[5] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.circle
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.circle) {
            this.temporaryComponentType = componentTypes.arc
            this.temporaryPoints[4] = this.getCursorXLocal()
            this.temporaryPoints[5] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.arc) {
            this.cleanLog('adding new arc')
            this.logicDisplay?.addComponent(
              new Arc(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!,
                this.temporaryPoints[4]!,
                this.temporaryPoints[5]!
              )
            )
            this.saveState()
          }
        }
        this.tooltip = 'Add arc (press esc to cancel)'
        break

      case this.modes.AddRectangle:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.rectangle) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.rectangle
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.rectangle) {
            this.logicDisplay?.addComponent(
              new Rectangle(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!
              )
            )
            this.saveState()
          }
        }
        this.tooltip = 'Add rectangle (press esc to cancel)'
        break
      case this.modes.AddBoundbox:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.rectangle) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.rectangle
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.rectangle) {
            this.logicDisplay?.addComponent(
              new BoundBox(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!
              )
            )
          }
        }
        break
      case this.modes.AddMeasure:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.measure) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryComponentType = componentTypes.measure
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.measure) {
            this.logicDisplay?.addComponent(
              new Measure(
                this.temporaryPoints[0]!,
                this.temporaryPoints[1]!,
                this.temporaryPoints[2]!,
                this.temporaryPoints[3]!
              )
            )
            this.saveState()
          }
        }
        this.tooltip = 'Measure (press esc to cancel)'
        break

      case this.modes.AddLabel:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          const text = await callTextPrompt('Add text...')
          if (text && text.length > 0) {
            this.logicDisplay?.addComponent(
              new Label(this.temporaryPoints[0]!, this.temporaryPoints[1]!, text, this.fontSize)
            )
            this.saveState()
            this.setMode(this.modes.Select)
          }
        }
        this.tooltip = 'Add label (press esc to cancel)'
        break

      case this.modes.AddShape:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.shape
          } else if (this.temporaryComponentType === componentTypes.shape && this.temporaryShape) {
            this.temporaryShape.x = this.getCursorXLocal()
            this.temporaryShape.y = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryShape) {
            this.logicDisplay?.addComponent(this.temporaryShape)
            this.saveState()
          }
        }
        this.tooltip = 'Add shape (press esc to cancel)'
        break

      case this.modes.AddPicture:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        if (action === this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          const url = await callTextPrompt('Enter a valid Image URL')
          if (url && url.length > 0) {
            this.logicDisplay?.addComponent(
              new Picture(this.temporaryPoints[0]!, this.temporaryPoints[1]!, url)
            )
            this.saveState()
            this.setMode(this.modes.Select)
          }
        }
        this.tooltip = 'Add Picture (press esc to cancel)'
        break
      case this.modes.AddPolygon:
        this.displayRef!.style.cursor = `url("${CrosshairCursor}") 16 16, crosshair`
        this.tooltip = 'Add Polygon'
        let firstVec: Vector2 = {
          x: 0,
          y: 0
        }
        if (action == this.mouseAction.Move) {
          if (this.temporaryComponentType === null) {
            this.temporaryComponentType = componentTypes.point
          } else if (this.temporaryComponentType === componentTypes.point) {
            this.temporaryPoints[0] = this.getCursorXLocal()
            this.temporaryPoints[1] = this.getCursorYLocal()
          } else if (this.temporaryComponentType === componentTypes.polygon) {
            this.temporaryPoints[2] = this.getCursorXLocal()
            this.temporaryPoints[3] = this.getCursorYLocal()
          }
        } else if (action === this.mouseAction.Down) {
          if (this.temporaryComponentType == componentTypes.point) {
            firstVec.x = this.getCursorXLocal()
            firstVec.y = this.getCursorYLocal()
            this.temporaryComponentType = componentTypes.polygon
            this.temporaryVectors.push(firstVec)
            this.temporaryVectorIndex++
          } else if (this.temporaryComponentType === componentTypes.polygon) {
            let tempVector: Vector2 = {
              x: this.getCursorXLocal(),
              y: this.getCursorYLocal()
            }
            if (
              this.temporaryVectors.length > 0 &&
              tempVector.x === this.temporaryVectors[0].x &&
              tempVector.y === this.temporaryVectors[0].y
            ) {
              this.logicDisplay?.addComponent(new Polygon(this.temporaryVectors))
              this.temporaryComponentType = null
              this.temporaryVectorIndex = 0
              this.temporaryVectors = []
              this.saveState()
              this.update()
            } else if (
              this.temporaryVectors.length > 0 &&
              Math.abs(tempVector.x - this.temporaryVectors[0].x) < 10 &&
              Math.abs(tempVector.y - this.temporaryVectors[0].y) < 10
            ) {
              this.temporaryVectors.push(tempVector)
              this.temporaryVectors.push({
                x: this.temporaryVectors[0].x,
                y: this.temporaryVectors[0].y
              })
              this.logicDisplay?.addComponent(new Polygon(this.temporaryVectors))
              this.temporaryComponentType = null
              this.temporaryVectors = []
              this.saveState()
              this.update()
            } else {
              this.temporaryVectors.push(tempVector)
              this.temporaryVectorIndex++
              this.temporaryPoints[0] = this.temporaryVectors[this.temporaryVectorIndex - 1].x
              this.temporaryPoints[1] = this.temporaryVectors[this.temporaryVectorIndex - 1].y
            }
          }
        }
        break
      case this.modes.Navigate:
        this.displayRef!.style.cursor = `url("${NavigateIdleCursor}") 16 16, default`
        if (action === this.mouseAction.Down) {
          this.camMoving = true
          this.xCNaught = this.getCursorXRaw()
          this.yCNaught = this.getCursorYRaw()
          this.displayRef!.style.cursor = `url("${NavigateDragCursor}") 16 16, default`
        } else if (action === this.mouseAction.Up) {
          this.camMoving = false
          this.camX += this.getCursorXRaw() - this.xCNaught
          this.camY += this.getCursorYRaw() - this.yCNaught
          this.displayRef!.style.cursor = `url("${NavigateIdleCursor}") 16 16, default`
        } else if (action === this.mouseAction.Move) {
          if (this.camMoving)
            this.displayRef!.style.cursor = `url("${NavigateDragCursor}") 16 16, default`
          else this.displayRef!.style.cursor = `url("${NavigateIdleCursor}") 16 16, default`
        }
        this.tooltip = 'Navigate'
        break

      case this.modes.Move:
        this.displayRef!.style.cursor = `url("${DefaultCursor}") 6 6, default`
        if (action === this.mouseAction.Move) {
          if (this.selectedComponent === null) {
            this.temporarySelectedComponent =
              this.findIntersectionWith(this.getCursorXLocal(), this.getCursorYLocal()) ?? null
          } else {
            if (this.logicDisplay) {
              if (this.moveComponent(
                this.selectedComponent,
                this.getCursorXLocal(),
                this.getCursorYLocal()
              )) this._dragDidModify = true
            }
          }
        } else if (action === this.mouseAction.Down) {
          if (this.selectedComponent === null) {
            this.selectedComponent = this.temporarySelectedComponent
          } else {
            this.selectedComponent = null
            if (this._dragDidModify) {
              this.saveState(false)
              this._dragDidModify = false
            }
          }
        }
        this.tooltip = 'Move (click a node point to select, esc to cancel)'
        break

      case this.modes.Delete:
        this.displayRef!.style.cursor = `url("${DefaultCursor}") 6 6, default`
        if (action === this.mouseAction.Move) {
          if (this.selectedComponent === null) {
            this.temporarySelectedComponent =
              this.findIntersectionWith(this.getCursorXLocal(), this.getCursorYLocal()) ?? null
          }
        } else if (action === this.mouseAction.Down) {
          if (
            this.temporarySelectedComponent !== null &&
            this.logicDisplay?.components[this.temporarySelectedComponent]
          ) {
            this.forcefullyRemoveSelectedComponentOnActiveIndex();
            this.saveState()
          }
        }
        this.tooltip = 'Delete (click a node point to delete, esc to cancel)'
        break
      case this.modes.Select:
        this.displayRef!.style.cursor = `url("${DefaultCursor}") 6 6, default`
        if (action == this.mouseAction.Move) {
          this.cleanLog('mouse moved during select')
          if (this.selectedComponent == null) {
            this.temporarySelectedComponent = this.findIntersectionWith(
              this.getCursorXRaw(),
              this.getCursorYRaw()
            )
          } else {
            // Get the selected component
            const component = this.logicDisplay?.components[this.selectedComponent]

            // If actively dragging a handle
            if (this.dragHandle) {
              if (this.dragHandle === 'rotate' && component && this.dragRotationOrigin) {
                // Rotation is deliberately unsnapped: the crosshair is a
                // precision control, so every cursor direction is available.
                const cursorX = this.getCursorXRaw()
                const cursorY = this.getCursorYRaw()
                const origin = this.dragRotationOrigin
                const angle = Math.atan2(cursorY - origin.y, cursorX - origin.x) * 180 / Math.PI + 90
                const rotation = this.normalizeRotation(angle)
                if (component.rotation !== rotation) {
                  component.rotation = rotation
                  this._dragDidModify = true
                  this.updateQuadtreeEntry(component)
                  this.notifyComponentChange()
                }
                break
              }
              // Get cursor position in world coordinates
              let localX, localY
              if (this.snap) {
                // Use uniform grid snapping regardless of grid spacing
                const snapToUniformGrid = (value: number) => {
                  const baseGridSize = this.gridSpacing
                  return Math.round(value / baseGridSize) * baseGridSize
                }
                localX = snapToUniformGrid(this.getCursorXLocal())
                localY = snapToUniformGrid(this.getCursorYLocal())
              } else {
                // Allow free movement when snap is disabled
                localX = this.getCursorXLocal()
                localY = this.getCursorYLocal()
              }

              // Update component based on type
              if (component) {
                let componentModified = false // Flag to check if component was modified

                if (this.dragRotatedHandleWithoutSpring(component, this.dragHandle, { x: localX, y: localY })) {
                  this._dragDidModify = true
                  this.updateQuadtreeEntry(component)
                  this.notifyComponentChange()
                  break
                }

                // The cursor position above is in world/screen space, which is
                // where the handle is actually drawn (getComponentHandles rotates
                // handles into that space to match rendering). But component
                // fields (x1/y1/x2/y2/etc.) are stored un-rotated - drawComponent
                // rotates them at render time. So before writing the dragged
                // point back into the model, rotate it backwards around the same
                // pivot the renderer uses, to get back to model space.
                const dragRotation = component.rotation ?? 0
                let modelX = localX
                let modelY = localY
                if (dragRotation && !this.isSelfPivotingComponent(component.type)) {
                  const origin = this.getRotationOrigin(component)
                  const unrotated = this.rotatePoint(localX, localY, origin.x, origin.y, -dragRotation)
                  modelX = unrotated.x
                  modelY = unrotated.y
                }

                switch (component.type) {
                  case componentTypes.line:
                  case componentTypes.measure:
                  case componentTypes.circle:
                    const lineComponent = component as Line
                    if (this.dragHandle === 'start') {
                      if (lineComponent.x1 !== modelX || lineComponent.y1 !== modelY) {
                        lineComponent.x1 = modelX
                        lineComponent.y1 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'end') {
                      if (lineComponent.x2 !== modelX || lineComponent.y2 !== modelY) {
                        lineComponent.x2 = modelX
                        lineComponent.y2 = modelY
                        componentModified = true
                      }
                    }
                    break
                  case componentTypes.rectangle:
                  case componentTypes.boundBox:
                    const rectComponent = component as Rectangle
                    if (this.dragHandle === 'start') {
                      // NW resize
                      if (rectComponent.x1 !== modelX || rectComponent.y1 !== modelY) {
                        rectComponent.x1 = modelX
                        rectComponent.y1 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'top-right') {
                      // NE resize
                      if (rectComponent.x2 !== modelX || rectComponent.y1 !== modelY) {
                        rectComponent.x2 = modelX
                        rectComponent.y1 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'bottom-left') {
                      // SW resize
                      if (rectComponent.x1 !== modelX || rectComponent.y2 !== modelY) {
                        rectComponent.x1 = modelX
                        rectComponent.y2 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'bottom-right') {
                      // SE resize
                      if (rectComponent.x2 !== modelX || rectComponent.y2 !== modelY) {
                        rectComponent.x2 = modelX
                        rectComponent.y2 = modelY
                        componentModified = true
                      }
                    }
                    break
                  case componentTypes.arc:
                    const arcComponent = component as Arc
                    if (this.dragHandle === 'start') {
                      if (arcComponent.x1 !== modelX || arcComponent.y1 !== modelY) {
                        arcComponent.x1 = modelX
                        arcComponent.y1 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'mid') {
                      if (arcComponent.x2 !== modelX || arcComponent.y2 !== modelY) {
                        arcComponent.x2 = modelX
                        arcComponent.y2 = modelY
                        componentModified = true
                      }
                    } else if (this.dragHandle === 'end') {
                      if (arcComponent.x3 !== modelX || arcComponent.y3 !== modelY) {
                        arcComponent.x3 = modelX
                        arcComponent.y3 = modelY
                        componentModified = true
                      }
                    }
                    break
                  case componentTypes.point:
                  case componentTypes.label:
                  case componentTypes.picture:
                    const pointComponent = component as Point
                    if (pointComponent.x !== localX || pointComponent.y !== localY) {
                      pointComponent.x = localX
                      pointComponent.y = localY
                      componentModified = true
                    }
                    break
                  case componentTypes.polygon:
                    const poly = component as Polygon
                    if (this.dragHandle && this.dragHandle.startsWith('handle-')) {
                      const handleIndex = parseInt(this.dragHandle.split('-')[1])
                      if (handleIndex >= 0 && handleIndex < poly.vectors.length) {
                        if (
                          poly.vectors[handleIndex].x !== modelX ||
                          poly.vectors[handleIndex].y !== modelY
                        ) {
                          poly.vectors[handleIndex].x = modelX
                          poly.vectors[handleIndex].y = modelY
                          componentModified = true
                        }
                      }
                    }
                    break
                }
                if (componentModified) {
                  this._dragDidModify = true
                  this.updateQuadtreeEntry(component)
                  // Notify the client that the component has changed
                  this.notifyComponentChange()
                }
              }
            } else {
              // Enhanced handle detection (rest of this block remains the same)
              const handleSize = 5 / this.zoom // Consistent handle size in world units
              const handles = component ? this.getComponentHandles(component) : []
              let isOverHandle = false

              // The rotation axis can overlap a component's centre handle, so
              // test it first. It must use unsnapped coordinates: snapping the
              // pointer makes its hit area drift as zoom changes.
              const orderedHandles = [...handles].sort((a, b) =>
                Number(b.id === 'rotate') - Number(a.id === 'rotate')
              )
              for (const handle of orderedHandles) {
                const isRotationHandle = handle.id === 'rotate'
                const cursorX = isRotationHandle ? this.getCursorXRaw() : this.getCursorXLocal()
                const cursorY = isRotationHandle ? this.getCursorYRaw() : this.getCursorYLocal()
                const hitSize = isRotationHandle ? 8 / this.zoom : handleSize
                const dx = cursorX - handle.x
                const dy = cursorY - handle.y
                const distSquared = dx * dx + dy * dy

                // Check if cursor is over handle using world coordinates
                if (distSquared < hitSize * hitSize) {
                  this.displayRef!.style.cursor = `url("${handle.cursor}") 16 16, default`
                  isOverHandle = true
                  break
                }
              }

              if (!isOverHandle) {
                this.displayRef!.style.cursor = `url("${DefaultCursor}") 6 6, default`
              }
            }
          }
        } else if (action == this.mouseAction.Down) {
          this.cleanLog('mouse down during select')
          if (this.selectedComponent !== null) {
            this.cleanLog('selected component' + this.selectedComponent)
            const component = this.logicDisplay?.components[this.selectedComponent]
            if (
              component &&
              component.type !== componentTypes.point &&
              component.type !== componentTypes.picture
            ) {
              const handles = component ? this.getComponentHandles(component) : []
              const handleSize = 5 / this.zoom

              const orderedHandles = [...handles].sort((a, b) =>
                Number(b.id === 'rotate') - Number(a.id === 'rotate')
              )
              for (const handle of orderedHandles) {
                // Check collision in world coordinates
                const isRotationHandle = handle.id === 'rotate'
                const cursorX = isRotationHandle ? this.getCursorXRaw() : this.getCursorXLocal()
                const cursorY = isRotationHandle ? this.getCursorYRaw() : this.getCursorYLocal()
                const hitSize = isRotationHandle ? 8 / this.zoom : handleSize
                const dx = cursorX - handle.x
                const dy = cursorY - handle.y
                const distSquared = dx * dx + dy * dy

                if (distSquared < hitSize * hitSize) {
                  this.dragHandle = handle.id
                  this.dragHandlePositions = new Map(
                    handles.map(currentHandle => [currentHandle.id, { x: currentHandle.x, y: currentHandle.y }])
                  )
                  this.dragRotationOrigin = handle.id === 'rotate'
                    ? this.getRotationOrigin(component)
                    : null
                  // No need to notify here, as mouse.Move will handle updates
                  return
                }
              }
            }
          }

          if (this.temporarySelectedComponent != null) {
            this.cleanLog('selected component' + this.temporarySelectedComponent)
            if (this.selectedComponent === this.temporarySelectedComponent) {
              this.unselectComponent()
              this.handles = []
            } else {
              this.selectedComponent = this.temporarySelectedComponent
              this.selectComponent(this.temporarySelectedComponent)
            }
            // In case a new component is selected or unselected
            this.notifyComponentChange()
          } else {
            if (this.selectedComponent !== null) {
              // Only unselect if something was selected
              this.unselectComponent()
              this.notifyComponentChange() // Notify if selection is cleared
            }
          }
        } else if (action == this.mouseAction.Up) {
          if (this._dragDidModify) {
            // Snapshot once per completed drag; serializing 100k components on
            // every pointer event was the main source of render starvation.
            this.saveState(false)
            this._dragDidModify = false
          }
          this.dragHandle = null
          this.dragRotationOrigin = null
          this.dragHandlePositions = null
          this.displayRef!.style.cursor = 'url("../") 0 0, default'
          // After releasing the drag, ensure the state is up-to-date
          this.notifyComponentChange()
        }

        if (this.selectedComponent !== null) {
          const selectedComponent = this.logicDisplay!.components[this.selectedComponent]
          if (
            selectedComponent.type !== componentTypes.point &&
            selectedComponent.type !== componentTypes.picture
          ) {
            const handlePoints = this.getComponentHandles(selectedComponent)
            if (this.lastSelectedComponent !== this.selectedComponent) {
              this.dragHandle = null
              this.lastSelectedComponent = this.selectedComponent
            }
          }
        }

        this.tooltip = 'Select (click to select/deselect)'
        break
    }
    this.markDirty('Action performed: ' + action + ' in mode: ' + this.mode)
    // Misc event clickers in debug mode
    // Misc event clickers in debug mode
    if (this._debugMode) {
      // Compute cursor position relative to the canvas and then to centered coords
      const canvas = this.displayRef;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const cursorCanvasX = this.mouse!.cursorXGlobal - rect.left;
        const cursorCanvasY = this.mouse!.cursorYGlobal - rect.top;
        const cursor = {
          x: cursorCanvasX - this.displayWidth / 2,
          y: cursorCanvasY - this.displayHeight / 2
        };

        let enteredAny = false;
        for (const { start, end, func } of this._debugHitboxes.values()) {
          const minX = Math.min(start.x, end.x), maxX = Math.max(start.x, end.x);
          const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y);

          if (cursor.x >= minX && cursor.x <= maxX && cursor.y >= minY && cursor.y <= maxY) {
            enteredAny = true;
            if (action === this.mouseAction.Move) {
              this._isEnteringHitbox = true;
            } else if (action === this.mouseAction.Down) {
              if (func) {
                func();
              }
            }
            // continue checking other hitboxes so multiple overlapping ones can trigger if needed
          }
        }
        if (!enteredAny) {
          this._isEnteringHitbox = false;
        }
      }
    }
  }
  setZoom(zoomFactor: number) {
    var newZoom = this.zoom * zoomFactor
    this.cleanLog(newZoom)

    // Zoom interval control
    if (newZoom <= 0.05 || newZoom >= 15) return

    this.targetZoom = newZoom
    const viewportCenterX = this.displayWidth / 2
    const viewportCenterY = this.displayHeight / 2
    const cursorOffsetX = (this.mouse!.cursorXGlobal - this.offsetX - viewportCenterX) / this.zoom
    const cursorOffsetY = (this.mouse!.cursorYGlobal - this.offsetY - viewportCenterY) / this.zoom
    const zoomDiff = this.targetZoom - this.zoom
    this.camX -= cursorOffsetX * (zoomDiff / this.zoom)
    this.camY -= cursorOffsetY * (zoomDiff / this.zoom)
    this.cleanLog('onZoomUpdate callback?' + this.onZoomUpdate);
    this.markDirty('Zoom updated');
  }
  clearGrid() {
    if (this.context) {
      this.context.restore()
      this.context.fillStyle = '#1d1d1d'
      this.context.fillRect(0, 0, this.displayWidth, this.displayHeight)
      this.context.save()
      this.context.translate(this.displayWidth / 2, this.displayHeight / 2)
      this.context.strokeStyle = '#E9E9E9'
      this.context.lineWidth = 0.15
    }
  }
  getTooltip() {
    var text = this.tooltip
    return (
      text +
      ` (${fps} FPS, dx=${Math.floor(this.getCursorXLocal())};dy=${Math.floor(this.getCursorYLocal())})`
    )
  }
  /*private async fontobeneTest() {
    const glyphs = await this.fb.layoutText('Hello!');

    this.context!.strokeStyle = '#E9E9E9';
    this.context!.lineWidth = 0.5 * this.zoom;
    this.context!.lineCap = 'round';
    this.context!.lineJoin = 'round';
    this.context?.beginPath();
    for (const glyph of glyphs) {
      for (const cmd of glyph.commands) {
        const px = (cmd.x + this.cOutX) * this.zoom;
        const py = (-cmd.y + this.cOutY) * this.zoom;
        if (cmd.command === 'PD') this.context?.moveTo(px, py);
        else if (cmd.command === 'MP') this.context?.lineTo(px, py);
        // 'PU' intentionally does nothing — it's just a marker
      }
    }
    this.context?.stroke();
  }*/
  update() {
    if (!this._dirty) {
      // this.cleanLog('update wants to be called but i am not dirty, skipping');
      return;
    } else this.cleanLog('update called, dirty flag is true, proceeding with update');
    this._dirty = false;
    this.offsetX = this.displayRef!.offsetLeft
    this.offsetY = this.displayRef!.offsetTop
    this.zoom = this.targetZoom
    this.updateCamera()
    this.clearGrid()
    if (this.showGrid) this.drawGrid(this.cOutX, this.cOutY)

    if (this.showOrigin) this.drawOrigin(this.cOutX, this.cOutY)

    this.drawAllComponents(this.logicDisplay!.components, 0, 0, true)
    if (this.temporaryComponentType != null) this.drawTemporaryComponent()
    this.flushBatchedPaths();
    this.drawRules()
    this.refreshSelectionTools()
    if (this._debugMode) {
      this._copiableDebugStrings = "";
      this.drawDebugToast();
      const defaultDebugTextSizeMultiplier = 2 * (1 / this.zoom);
      const debugTextX = -((this.displayWidth / 2) - 80);
      const drawDebugLine = (y, text) =>
        this.drawRawFontobeneAtLocation(
          debugTextX,
          y,
          text,
          '#00ff00',
          1.5,
          defaultDebugTextSizeMultiplier,
          100,
          0,
          'left',
          'bottom'
        );

      const topLines = [
        `${fps} FPS (avg since last render time ${((1 / fps) * 1000).toFixed(2)} ms)`,
        `framestat: ${this._dirty ? 'dirty' : 'clean'}`,
        `OMC map: ${this.onModeChange != null ? 'OMC mapped' : 'OMC unmapped'}`,
        `raw cur: x=${this.getCursorXRaw()},y=${this.getCursorYRaw()}`,
        `off: x=${this.offsetX},y=${this.offsetY}`,
        `camout: x=${this.cOutX},y=${this.cOutY}`,
        `hidpi: ${this.enableHighDPI ? 'yes' : 'no'}, dpr: ${window.devicePixelRatio}, width: ${this.displayWidth * window.devicePixelRatio} (vp:${this.displayWidth}), height: ${this.displayHeight * window.devicePixelRatio} (vp:${this.displayHeight})`,
        `comp len: ${this.logicDisplay?.components.length}`,
        `quadtree obj: ${this._quadtree}`,
        `is QuadT dirty: ${this._isQuadtreeDirty}`,
        `bulk import: ${this._bulkImportActive ? 'yes' : 'no'}`,
        `entering hitbox: ${this._isEnteringHitbox ? 'yes' : 'no'}`
      ];

      if (this._enableTopDebugStrings) {
        topLines.forEach((text, i) => {
          drawDebugLine(-(this.displayHeight / 2 - (40 + i * 20)), text);
          this._copiableDebugStrings += `${text}\n`;
        });
      }

      // Some warnings
      const warningLines = [
        `CompassCAD NEXT engine debug mode [copy debug info]  [copy image of canvas]  [${this._enableTopDebugStrings ? 'hide' : 'show'} top]`,
        `to turn off, exit development mode.`,
        `to test w/o debugs, enter Simulate Production Mode.`,
      ];

      warningLines.forEach((text, i) => {
        drawDebugLine(this.displayHeight / 2 - (100 - i * 20), text);
      });
    }
    if (this.recordingMode) {
      this.drawUserCursor(
        (this.getCursorXRaw() + this.camX) * this.zoom,
        (this.getCursorYRaw() + this.camY) * this.zoom
      )
    }
    if (this._drawHitBoxBoundaries) {
      // Hitboxes were normalized to centered canvas coordinates in appendDebugHitboxes.
      this.context!.strokeStyle = '#ff0000';
      for (const { start, end } of this._debugHitboxes.values()) {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        // Because the drawing context has already been translated to the canvas center
        // (see clearGrid() -> translate(this.displayWidth/2, this.displayHeight/2)),
        // we can draw using centered coordinates directly.
        this.context?.strokeRect(x, y, w, h);
      }
    }
    //this.fontobeneTest();
    // Useful event handlers for later on ;)
    if (this.onZoomUpdate) {
      this.onZoomUpdate()
    }
  }
}
export const InitializeInstance = (renderer: GraphicsRenderer) => {
  renderer.start()
  let touchStartX = 0
  let touchStartY = 0
  let initialPinchDistance = 0
  let isPinching = false

  // --- Smooth, intensity-based zoom ---------------------------------------
  // Regular mouse wheels report deltaY in coarse "line" units (often ±100 per
  // notch), while trackpads report much finer pixel-based deltas and, on
  // pinch gestures, browsers synthesize wheel events with ctrlKey = true.
  // We use an exponential response (rather than a fixed step) so zoom speed
  // scales naturally with how hard/fast the person scrolls or pinches.
  const WHEEL_ZOOM_SENSITIVITY = 0.0015 // regular wheel / two-finger scroll-to-zoom
  const TRACKPAD_PINCH_SENSITIVITY = 0.01 // real pinch gesture (ctrlKey wheel or touch pinch)
  const MAX_WHEEL_DELTA = 100 // clamp so momentum-scroll spikes can't cause huge jumps

  // Coalesce rapid wheel events into a single zoom update per animation
  // frame. This keeps pinch/scroll zoom buttery smooth instead of thrashing
  // the renderer with dozens of updates per second.
  let pendingZoomFactor: number | null = null
  let zoomRAF: number | null = null

  const queueZoom = (factor: number) => {
    pendingZoomFactor = pendingZoomFactor === null ? factor : pendingZoomFactor * factor
    if (zoomRAF === null) {
      zoomRAF = requestAnimationFrame(() => {
        if (pendingZoomFactor !== null) {
          renderer.setZoom(pendingZoomFactor)
          pendingZoomFactor = null
        }
        zoomRAF = null
      })
    }
  }
  const getTouchPos = (e: TouchEvent) => {
    const touch = e.touches[0]
    return {
      x: touch.clientX,
      y: touch.clientY
    }
  }
  const getPinchDistance = (e: TouchEvent) => {
    const touch1 = e.touches[0]
    const touch2 = e.touches[1]
    return Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
  }
  renderer.displayRef?.addEventListener(
    'touchstart',
    (e: any) => {
      e.preventDefault()

      // Store initial touch position
      const pos = getTouchPos(e)
      touchStartX = pos.x
      touchStartY = pos.y

      // Handle pinch start
      if (e.touches.length === 2) {
        isPinching = true
        initialPinchDistance = getPinchDistance(e)
        return
      }

      // Simulate mouse position for single touch
      renderer.mouse!.cursorXGlobal = pos.x
      renderer.mouse!.cursorYGlobal = pos.y

      // For navigation and move modes, start the action immediately
      if (renderer.mode === renderer.modes.Navigate) {
        renderer.performAction(e, renderer.mouseAction.Down)
      }
    },
    { passive: false }
  )
  renderer.displayRef?.addEventListener(
    'touchmove',
    (e: any) => {
      e.preventDefault()

      // Handle pinch zoom
      if (e.touches.length === 2 && isPinching) {
        const currentDistance = getPinchDistance(e)

        // Ignore degenerate distances (fingers momentarily overlapping/jittering)
        if (initialPinchDistance > 0 && currentDistance > 0) {
          // Continuous scale ratio between this move and the last one, so
          // zoom tracks finger movement 1:1 instead of jumping in fixed
          // steps once an arbitrary threshold is crossed.
          const scaleRatio = currentDistance / initialPinchDistance
          queueZoom(scaleRatio)
        }

        initialPinchDistance = currentDistance
        return
      }

      // Handle single touch movement
      const pos = getTouchPos(e)
      renderer.mouse!.cursorXGlobal = pos.x
      renderer.mouse!.cursorYGlobal = pos.y

      // Always update cursor position for all modes
      renderer.performAction(e, renderer.mouseAction.Move)
    },
    { passive: false }
  )

  renderer.displayRef?.addEventListener(
    'touchend',
    (e: any) => {
      e.preventDefault()

      // Reset pinch state
      if (isPinching) {
        isPinching = false
        return
      }

      // Handle touch end
      const pos = e.changedTouches[0]
      renderer.mouse!.cursorXGlobal = pos.clientX
      renderer.mouse!.cursorYGlobal = pos.clientY

      // For navigation mode, just end the action
      if (renderer.mode === renderer.modes.Navigate) {
        renderer.performAction(e, renderer.mouseAction.Up)
        return
      }

      // For Delete mode, trigger mouse down to perform deletion
      if (renderer.mode === renderer.modes.Delete) {
        renderer.performAction(e, renderer.mouseAction.Down)
        return
      }

      // For Move mode and all drawing tools, trigger mouse down on tap
      if (
        [
          renderer.modes.Move,
          renderer.modes.AddPoint,
          renderer.modes.AddLine,
          renderer.modes.AddCircle,
          renderer.modes.AddArc,
          renderer.modes.AddRectangle,
          renderer.modes.AddMeasure,
          renderer.modes.AddLabel
        ].includes(renderer.mode)
      ) {
        renderer.performAction(e, renderer.mouseAction.Down)
      }

      // Always perform mouse up to clean states
      renderer.performAction(e, renderer.mouseAction.Up)
    },
    { passive: false }
  )
  renderer.displayRef!.onkeyup = (e: KeyboardEvent) => {
    renderer.cleanLog('hook: onkeyup');
    renderer.keyboard?.onKeyUp(e)
  }
  renderer.displayRef!.onkeydown = (e: KeyboardEvent) => {
    renderer.cleanLog('hook: onkeydown');
    renderer.keyboard?.onKeyDown(e)
  }
  renderer.displayRef!.addEventListener('mousemove', (e: any) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return

    if (!renderer.didCursorActuallyMove(e)) return // <-- swallow synthetic/no-op moves

    renderer.mouse?.onMouseMove(e)
    if (!renderer.gridPointer) renderer.gridPointer = true
    renderer.performAction(e, renderer.mouseAction.Move)
  })

  renderer.displayRef!.addEventListener('mouseout', () => {
    renderer.gridPointer = false
  })

  renderer.displayRef!.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.which == 2) {
      renderer.camMoving = true;
      renderer.markDirty('Mouse moved during drag');
      renderer.xCNaught = renderer.getCursorXRaw()
      renderer.yCNaught = renderer.getCursorYRaw()
    } else {
      renderer.mouse?.onMouseDown(e)
      renderer.performAction(e, renderer.mouseAction.Down)
    }
  })

  renderer.displayRef!.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.which == 2) {
      renderer.camMoving = false;
      renderer.markDirty('Mouse released during drag');
      renderer.camX += renderer.getCursorXRaw() - renderer.xCNaught
      renderer.camY += renderer.getCursorYRaw() - renderer.yCNaught
      renderer.updateCamera()
    } else {
      renderer.mouse?.onMouseUp(e)
      renderer.performAction(e, renderer.mouseAction.Up)
    }
  })

  renderer.displayRef!.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      e.preventDefault()

      // Trackpads pinch-to-zoom are synthesized by the browser as wheel
      // events with ctrlKey = true (this is a de facto standard across
      // Chrome, Firefox, Safari and Edge) — treat those with their own,
      // more sensitive curve since the physical gesture is much smaller.
      const isTrackpadPinch = e.ctrlKey
      const sensitivity = isTrackpadPinch ? TRACKPAD_PINCH_SENSITIVITY : WHEEL_ZOOM_SENSITIVITY

      const clampedDelta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, e.deltaY))

      // Exponential response: each unit of delta multiplies the zoom by a
      // constant ratio, so a light flick zooms a little and a hard, fast
      // gesture zooms a lot — instead of the old fixed in/out step.
      const zoomFactor = Math.exp(-clampedDelta * sensitivity)

      queueZoom(zoomFactor)
    },
    { passive: false }
  )

  renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.DEL, () => {
    renderer.cleanLog('del pressed, deleting');
    renderer.forcefullyRemoveSelectedComponentOnActiveIndex();
  }, { ctrl: false })
  renderer.keyboard?.addKeyEvent(true, Types.default.KeyCodes.R, () => {
    renderer.rotateSelected();
  }, { ctrl: false })

  let animationFrameId: number | null
  let isWindowFocused = true
  let lastDrawTime = 0
  const TARGET_FPS = 60
  const FRAME_TIME = 1000 / TARGET_FPS
  const FPS_UPDATE_INTERVAL = 500

  // Use passive event listeners for better performance
  window.addEventListener(
    'focus',
    () => {
      if (!isWindowFocused) {
        isWindowFocused = true
        lastDrawTime = performance.now()
        if (!animationFrameId) {
          repeatInstance()
        }
      }
    },
    { passive: true }
  )

  window.addEventListener(
    'blur',
    () => {
      isWindowFocused = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
    },
    { passive: true }
  )

  function repeatInstance(timestamp: number = 0) {
    if (!isWindowFocused) return

    // Throttle to target FPS
    const deltaTime = timestamp - lastDrawTime
    if (deltaTime >= FRAME_TIME) {
      frameCount++
      lastDrawTime = timestamp - (deltaTime % FRAME_TIME)

      // Update FPS counter every 500ms instead of every second
      if (timestamp - lastTime >= FPS_UPDATE_INTERVAL) {
        fps = Math.round((frameCount * 1000) / (timestamp - lastTime))
        frameCount = 0
        lastTime = timestamp
      }

      // Use try-catch for robustness
      try {
        renderer.update()
      } catch (error) {
        console.error('Render error:', error)
      }
    }

    animationFrameId = requestAnimationFrame(repeatInstance)
  }

  // Initial call with high-resolution timestamp
  repeatInstance(performance.now())
}
