/**
 * DxfToCompassCad.ts
 *
 * Converts a parsed DXF drawing into the plain-JSON component tree that
 * CompassCAD's `LogicDisplay.importJSON()` expects. The output of
 * `convertDxfToCompassCad()` can be handed straight to importJSON:
 *
 *   const design = convertDxfToCompassCad(dxfFileText)
 *   renderer.logicDisplay.components = []
 *   renderer.logicDisplay.importJSON(design, renderer.logicDisplay.components)
 *
 * Supported DXF entities: CIRCLE, LINE, ARC, LWPOLYLINE, and old-style
 * POLYLINE/VERTEX/SEQEND (bulges included, tessellated into straight
 * segments), and TEXT. Anything else (INSERT, MTEXT, SPLINE, DIMENSION,
 * HATCH, ...) is skipped and reported through `onWarning` rather than
 * silently dropped — block inserts in particular are common in DXF exports
 * and are NOT expanded by this converter.
 *
 * Geometry mapping notes (reverse-engineered from CompassCAD's renderer):
 *   - Circle    stores (x1,y1) = center, (x2,y2) = a point ON the
 *               circumference; the geometric radius is derived from the
 *               distance between them. `radius` on the component itself is
 *               the *stroke width*, not the circle's radius.
 *   - Rectangle stores two opposite, axis-aligned corners. Its `rotation`
 *               field isn't used here — the renderer doesn't apply
 *               Rectangle.rotation anywhere yet, so there's no verified
 *               pivot/sign convention to target, and guessing one risks
 *               placing shapes wrong once that rendering support lands.
 *               Non-axis-aligned 4-vertex closed polylines still become a
 *               Polygon instead (whose vertices already encode any angle).
 *   - Arc       stores (x1,y1) = center, (x2,y2) = a point defining the
 *               radius and start angle, (x3,y3) = a point defining the end
 *               angle (only its angle from the center matters).
 *   - Label     DXF TEXT rotation (group 50) maps to Label.rotation,
 *               pivoting around the text's anchor point — this one *is*
 *               wired up, matching the renderer's own
 *               `translate(x,y); rotate(rotation)` pattern for text.
 *   - Every other component gets `rotation: 0` explicitly, both because
 *               that's the schema's default and because their orientation
 *               is already fully encoded in their point coordinates.
 */

import { componentTypes } from '../../engine/Component'
import { DxfDocument, DxfEntity, getField, getFieldNum, parseDxf } from './DxfParser'
import { aciToHex } from './ACadColors'

// ---------------------------------------------------------------------------
// Output shapes (plain JSON — these mirror Component.ts's fields exactly so
// they can be fed straight into LogicDisplay.importJSON()).
// ---------------------------------------------------------------------------

interface Vec2 {
  x: number
  y: number
}

export interface CompassPointJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  x: number
  y: number
}

export interface CompassLineLikeJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  color: string
  radius: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CompassArcJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  color: string
  radius: number
  x1: number
  y1: number
  x2: number
  y2: number
  x3: number
  y3: number
}

export interface CompassLabelJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  x: number
  y: number
  text: string
  fontSize: number
}

export interface CompassShapeJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  x: number
  y: number
  components: CompassComponentJSON[]
}

export interface CompassPolygonJSON {
  active: true
  type: number
  name: string
  opacity: number
  rotation: number
  vectors: Vec2[]
  color: string
  strokeColor: string
  enableStroke: boolean
}

export type CompassComponentJSON =
  | CompassPointJSON
  | CompassLineLikeJSON
  | CompassArcJSON
  | CompassLabelJSON
  | CompassShapeJSON
  | CompassPolygonJSON

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface DxfToCompassCadOptions {
  /**
   * Multiplies every DXF coordinate (and TEXT height) before it lands in a
   * CompassCAD component. CompassCAD's default view treats 1 unit as ~1cm
   * of real-world distance (see GraphicsRenderer's unitConversionFactor), so
   * if your DXF is in millimeters you may want scale ~0.1. Default: 1
   * (import DXF units 1:1 as CompassCAD units).
   */
  scale?: number
  /**
   * DXF's Y axis points up; canvas/screen space conventionally points down.
   * Set true to negate Y so the drawing isn't mirrored vertically. Default: false.
   */
  flipY?: boolean
  /**
   * Wrap each DXF layer's entities into a named top-level Shape, mirroring
   * the DXF's layer structure. Off by default: a Shape's children can only
   * be selected/edited as a group (or by drilling in), so flattening keeps
   * every imported entity individually selectable and editable right away.
   * Set true if you'd rather have layer grouping than per-entity editing.
   */
  groupByLayer?: boolean
  /** Only import entities on these layers (case-insensitive). Default: all layers. */
  includeLayers?: string[]
  /** Skip entities on these layers (case-insensitive). Applied after includeLayers. */
  excludeLayers?: string[]
  /** Stroke width used for generated Line/Rectangle/Circle/Arc components. Default: 2. */
  strokeRadius?: number
  /** Outline color used for generated Polygon components. Default: '#000000'. */
  polygonStrokeColor?: string
  /**
   * Render closed polylines as filled `Polygon`s instead of an unfilled
   * chain of `Line`s. Off by default — see the note above `convertPolyline`
   * for why closed != filled in most mechanical/EDA DXF exports (board
   * outlines, courtyards, silkscreen boxes are all closed but not filled).
   */
  fillClosedPolylines?: boolean
  /** How many straight segments approximate each bulged (arc) polyline edge. Default: 12. */
  bulgeSegments?: number
  /** Tolerance (in DXF units, pre-scale) for detecting axis-aligned rectangles. Default: 1e-4. */
  rectangleEpsilon?: number
  /**
   * Extra multiplier applied on top of `scale` just for TEXT height ->
   * Label.fontSize. DXF text height and CompassCAD's fontSize aren't
   * necessarily the same "unit" visually (fontSize is a canvas font-size in
   * px, independent of zoom/scale the way geometry coordinates are), so
   * this is separated out for easy tuning without touching geometry scale.
   * Default: 1 (fontSize = round(height * scale)).
   */
  textScale?: number
  /** Called for every entity/feature this converter can't represent, instead of throwing. */
  onWarning?: (message: string, entity?: DxfEntity) => void
}

interface ResolvedOptions {
  scale: number
  flipY: boolean
  groupByLayer: boolean
  includeLayers: Set<string> | null
  excludeLayers: Set<string>
  strokeRadius: number
  polygonStrokeColor: string
  fillClosedPolylines: boolean
  bulgeSegments: number
  rectangleEpsilon: number
  textScale: number
  onWarning: (message: string, entity?: DxfEntity) => void
}

function resolveOptions(opts: DxfToCompassCadOptions): ResolvedOptions {
  return {
    scale: opts.scale ?? 1,
    flipY: opts.flipY ?? false,
    groupByLayer: opts.groupByLayer ?? false,
    includeLayers: opts.includeLayers ? new Set(opts.includeLayers.map((l) => l.toUpperCase())) : null,
    excludeLayers: new Set((opts.excludeLayers ?? []).map((l) => l.toUpperCase())),
    strokeRadius: opts.strokeRadius ?? 2,
    polygonStrokeColor: opts.polygonStrokeColor ?? '#000000',
    fillClosedPolylines: opts.fillClosedPolylines ?? false,
    bulgeSegments: opts.bulgeSegments ?? 12,
    rectangleEpsilon: opts.rectangleEpsilon ?? 1e-4,
    textScale: opts.textScale ?? 1,
    onWarning: opts.onWarning ?? (() => { })
  }
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

interface DxfVertex extends Vec2 {
  /** Bulge of the segment starting AT this vertex (0 = straight line to the next vertex). */
  bulge: number
}

/** Converts a bulge value into the arc's signed included angle (radians). */
function bulgeToIncludedAngle(bulge: number): number {
  return 4 * Math.atan(bulge)
}

/**
 * Tessellates one bulged polyline segment into intermediate points (NOT
 * including the start or end vertex, which the caller already has).
 */
function tessellateBulgeSegment(p1: Vec2, p2: Vec2, bulge: number, segments: number): Vec2[] {
  if (Math.abs(bulge) < 1e-9 || segments < 2) return []

  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return []

  const included = bulgeToIncludedAngle(bulge)
  const halfChord = chord / 2
  const sagitta = halfChord * bulge // signed distance from chord midpoint to arc apex
  // The center sits on the OPPOSITE side of the chord from the apex — i.e.
  // offset by (radius - sagitta) in the direction away from the apex, which
  // works out to the negative of the naive (sagitta²-halfChord²)/(2·sagitta)
  // expression. Missing that sign flip still produces a valid circle
  // through p1 and p2 (so most of the math looks right), but sweeping from
  // p1 by the bulge's own `included` angle lands nowhere near p2 — the
  // interior points shoot off in the wrong direction before the final
  // (always-correct) endpoint snaps back, which is exactly the "spike" /
  // self-crossing node artifact this was producing on real corners.
  const t = -((sagitta * sagitta - halfChord * halfChord) / (2 * sagitta))
  const radius = Math.hypot(halfChord, t)

  const mx = (p1.x + p2.x) / 2
  const my = (p1.y + p2.y) / 2
  // Unit vector along the chord, rotated 90 deg CCW, gives the perpendicular
  // direction the sagitta/center offset is measured along.
  const px = -dy / chord
  const py = dx / chord

  const cx = mx + px * t
  const cy = my + py * t

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx)

  const points: Vec2[] = []
  for (let k = 1; k < segments; k++) {
    const a = startAngle + (included * k) / segments
    points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) })
  }
  return points
}

/** Expands a polyline's vertices (with bulges) into a flat list of straight-segment points. */
function tessellatePolyline(vertices: DxfVertex[], closed: boolean, segments: number): Vec2[] {
  const points: Vec2[] = []
  const n = vertices.length
  for (let i = 0; i < n; i++) {
    points.push({ x: vertices[i].x, y: vertices[i].y })
    const isLastEdge = i === n - 1
    if (isLastEdge && !closed) continue
    const next = vertices[(i + 1) % n]
    if (vertices[i].bulge) {
      points.push(...tessellateBulgeSegment(vertices[i], next, vertices[i].bulge, segments))
    }
  }
  return points
}

/**
 * If the 4 given points (in order, no bulges) form an axis-aligned
 * rectangle, returns its two diagonal corners; otherwise null.
 */
function detectAxisAlignedRectangle(pts: Vec2[], epsilon: number): [Vec2, Vec2] | null {
  if (pts.length !== 4) return null
  const [a, b, c, d] = pts
  const close = (u: number, v: number) => Math.abs(u - v) <= epsilon

  const horizontalThenVertical =
    close(a.y, b.y) && close(b.x, c.x) && close(c.y, d.y) && close(d.x, a.x)
  const verticalThenHorizontal =
    close(a.x, b.x) && close(b.y, c.y) && close(c.x, d.x) && close(d.y, a.y)

  if (horizontalThenVertical || verticalThenHorizontal) {
    return [a, c]
  }
  return null
}

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

function extractVertices(entity: DxfEntity): DxfVertex[] {
  const vertices: DxfVertex[] = []
  let current: DxfVertex | null = null
  for (const f of entity.fields) {
    if (f.code === 10) {
      current = { x: parseFloat(f.value), y: NaN, bulge: 0 }
      vertices.push(current)
    } else if (f.code === 20 && current) {
      current.y = parseFloat(f.value)
    } else if (f.code === 42 && current) {
      current.bulge = parseFloat(f.value)
    }
  }
  return vertices.filter((v) => !Number.isNaN(v.x) && !Number.isNaN(v.y))
}

function isClosed(entity: DxfEntity): boolean {
  const flag = getFieldNum(entity, 70, 0)
  return (flag & 1) === 1
}

// ---------------------------------------------------------------------------
// Converter
// ---------------------------------------------------------------------------

class Converter {
  private opts: ResolvedOptions
  private doc: DxfDocument
  private nextId = 1

  constructor(doc: DxfDocument, opts: ResolvedOptions) {
    this.doc = doc
    this.opts = opts
  }

  private tx(v: number): number {
    return v * this.opts.scale
  }
  private ty(v: number): number {
    const s = v * this.opts.scale
    return this.opts.flipY ? -s : s
  }
  private point(x: number, y: number): Vec2 {
    return { x: this.tx(x), y: this.ty(y) }
  }

  private resolveColor(entity: DxfEntity, layerName: string | undefined): string {
    const ownColor = getField(entity, 62)
    if (ownColor !== undefined) {
      const idx = parseInt(ownColor, 10)
      if (!Number.isNaN(idx) && idx !== 256 && idx !== 0) return aciToHex(idx)
    }
    if (layerName) {
      const layer = this.doc.layers.get(layerName)
      if (layer) return aciToHex(layer.colorIndex)
    }
    return aciToHex(7) // default white, matching AutoCAD's default layer color
  }

  private layerAllowed(layerName: string | undefined): boolean {
    const name = (layerName ?? '').toUpperCase()
    if (this.opts.excludeLayers.has(name)) return false
    if (this.opts.includeLayers && !this.opts.includeLayers.has(name)) return false
    return true
  }

  private name(prefix: string): string {
    return `${prefix} ${this.nextId++}`
  }

  private convertCircle(entity: DxfEntity, color: string): CompassLineLikeJSON {
    const cx = getFieldNum(entity, 10)
    const cy = getFieldNum(entity, 20)
    const r = getFieldNum(entity, 40)
    const center = this.point(cx, cy)
    const rim = this.point(cx + r, cy)
    return {
      active: true,
      type: componentTypes.circle,
      name: this.name('Circle'),
      opacity: 100,
      rotation: 0,
      color,
      radius: this.opts.strokeRadius,
      x1: center.x,
      y1: center.y,
      x2: rim.x,
      y2: rim.y
    }
  }

  private convertLineEntity(entity: DxfEntity, color: string): CompassLineLikeJSON {
    const p1 = this.point(getFieldNum(entity, 10), getFieldNum(entity, 20))
    const p2 = this.point(getFieldNum(entity, 11), getFieldNum(entity, 21))
    return {
      active: true,
      type: componentTypes.line,
      name: this.name('Line'),
      opacity: 100,
      rotation: 0,
      color,
      radius: this.opts.strokeRadius,
      x1: p1.x,
      y1: p1.y,
      x2: p2.x,
      y2: p2.y
    }
  }

  private convertArc(entity: DxfEntity, color: string): CompassArcJSON {
    const cx = getFieldNum(entity, 10)
    const cy = getFieldNum(entity, 20)
    const r = getFieldNum(entity, 40)
    const startDeg = getFieldNum(entity, 50)
    const endDeg = getFieldNum(entity, 51)
    const startRad = (startDeg * Math.PI) / 180
    const endRad = (endDeg * Math.PI) / 180

    const center = this.point(cx, cy)
    const start = this.point(cx + r * Math.cos(startRad), cy + r * Math.sin(startRad))
    const end = this.point(cx + r * Math.cos(endRad), cy + r * Math.sin(endRad))

    return {
      active: true,
      type: componentTypes.arc,
      name: this.name('Arc'),
      opacity: 100,
      rotation: 0,
      color,
      radius: this.opts.strokeRadius,
      x1: center.x,
      y1: center.y,
      x2: start.x,
      y2: start.y,
      x3: end.x,
      y3: end.y
    }
  }

  private lineBetween(a: Vec2, b: Vec2, color: string): CompassLineLikeJSON {
    return {
      active: true,
      type: componentTypes.line,
      name: this.name('Line'),
      opacity: 100,
      rotation: 0,
      color,
      radius: this.opts.strokeRadius,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y
    }
  }

  private convertPolyline(entity: DxfEntity, color: string): CompassComponentJSON | CompassComponentJSON[] | null {
    const vertices = extractVertices(entity)
    if (vertices.length < 2) return null
    const closed = isClosed(entity)
    const hasBulge = vertices.some((v) => v.bulge)

    // Simple 2-point open segment -> Line.
    if (vertices.length === 2 && !closed && !hasBulge) {
      const a = this.point(vertices[0].x, vertices[0].y)
      const b = this.point(vertices[1].x, vertices[1].y)
      return this.lineBetween(a, b, color)
    }

    // 4-point closed axis-aligned quad, no bulges -> Rectangle.
    if (vertices.length === 4 && closed && !hasBulge) {
      const rect = detectAxisAlignedRectangle(vertices, this.opts.rectangleEpsilon)
      if (rect) {
        const [c1, c2] = rect
        const p1 = this.point(c1.x, c1.y)
        const p2 = this.point(c2.x, c2.y)
        return {
          active: true,
          type: componentTypes.rectangle,
          name: this.name('Rectangle'),
          opacity: 100,
          rotation: 0,
          color,
          radius: this.opts.strokeRadius,
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y
        }
      }
    }

    // Everything else: tessellate (bulges become straight segments) into a
    // flat point list, then either draw it as a closed/open chain of Lines
    // or, if explicitly requested, fill it as a Polygon.
    //
    // Filling is opt-in rather than automatic-on-closed on purpose. In DXF
    // exports from mechanical/EDA tools, a *closed* polyline almost always
    // means "this is a boundary" (a board outline, a courtyard, a silkscreen
    // outline) — not "fill this region solid". Actual filled regions are
    // drawn with SOLID/HATCH entities, which are separate from LWPOLYLINE.
    // Defaulting closed polylines to Polygon paints a solid color across
    // the whole shape (e.g. the entire board outline), which is virtually
    // never what's wanted. Pass `fillClosedPolylines: true` if your DXF
    // genuinely uses closed polylines as filled regions.
    const flatPoints = tessellatePolyline(vertices, closed, this.opts.bulgeSegments)
    const transformed = flatPoints.map((p) => this.point(p.x, p.y))

    if (closed && this.opts.fillClosedPolylines) {
      return {
        active: true,
        type: componentTypes.polygon,
        name: this.name('Polygon'),
        opacity: 100,
        rotation: 0,
        vectors: transformed,
        color,
        strokeColor: this.opts.polygonStrokeColor,
        enableStroke: true
      }
    }

    const lines: CompassComponentJSON[] = []
    const segmentCount = closed ? transformed.length : transformed.length - 1
    for (let i = 0; i < segmentCount; i++) {
      const a = transformed[i]
      const b = transformed[(i + 1) % transformed.length]
      lines.push(this.lineBetween(a, b, color))
    }
    return lines
  }

  private convertText(entity: DxfEntity): CompassLabelJSON {
    const x = getFieldNum(entity, 10)
    const y = getFieldNum(entity, 20)
    const height = getFieldNum(entity, 40, 2.5)
    const text = getField(entity, 1) ?? ''
    const p = this.point(x, y)

    // DXF TEXT rotation (group 50) is already in degrees, measured
    // counterclockwise from the +X axis. CompassCAD's renderer expects
    // Component.rotation in degrees too — every draw call converts it via
    // `rotation * Math.PI / 180` internally (see `rotatePoint()` and
    // `drawLabel()` in Engine.ts) — so this is a straight pass-through, not
    // a radian conversion. (An earlier version of this converter emitted
    // radians here, which the renderer then read as degrees — e.g. a real
    // 90° rotation became "1.571°", i.e. functionally no rotation at all.
    // That's why rotated labels were overlapping instead of turning.)
    //
    // Our `point()` transform reflects Y when `flipY` is set (y -> -y),
    // which is a mirror, not a rotation. Under a Y-axis mirror, an angle
    // measured from the +X axis flips sign (θ -> -θ) — so the rotation we
    // hand to the transformed geometry needs the same sign flip to stay
    // consistent with the mirrored coordinates, or the text would end up
    // rotated the wrong way relative to everything else in the drawing.
    const rotationDeg = getFieldNum(entity, 50, 0)
    const rotation = this.opts.flipY ? -rotationDeg : rotationDeg

    return {
      active: true,
      type: componentTypes.label,
      name: this.name('Label'),
      opacity: 100,
      rotation,
      x: p.x,
      y: p.y,
      text,
      // Text height is a length like any other DXF coordinate, so it gets
      // the same `scale` treatment as geometry — no extra multiplier.
      fontSize: Math.max(1, Math.round(height * this.opts.scale * this.opts.textScale))
    }
  }

  private convertEntity(entity: DxfEntity): CompassComponentJSON | CompassComponentJSON[] | null {
    const layerName = getField(entity, 8)
    if (!this.layerAllowed(layerName)) return null
    const color = this.resolveColor(entity, layerName)

    switch (entity.type) {
      case 'CIRCLE':
        return this.convertCircle(entity, color)
      case 'LINE':
        return this.convertLineEntity(entity, color)
      case 'ARC':
        return this.convertArc(entity, color)
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return this.convertPolyline(entity, color)
      case 'TEXT':
        return this.convertText(entity)
      default:
        this.opts.onWarning(`Skipped unsupported entity type "${entity.type}" (not converted).`, entity)
        return null
    }
  }

  convert(): CompassComponentJSON[] {
    const byLayer = new Map<string, CompassComponentJSON[]>()
    const flat: CompassComponentJSON[] = []

    for (const entity of this.doc.entities) {
      const converted = this.convertEntity(entity)
      if (!converted) continue
      const list = Array.isArray(converted) ? converted : [converted]

      if (this.opts.groupByLayer) {
        const layerName = getField(entity, 8) ?? '0'
        if (!byLayer.has(layerName)) byLayer.set(layerName, [])
        byLayer.get(layerName)!.push(...list)
      } else {
        flat.push(...list)
      }
    }

    if (!this.opts.groupByLayer) return flat

    const shapes: CompassComponentJSON[] = []
    for (const [layerName, components] of byLayer) {
      shapes.push({
        active: true,
        type: componentTypes.shape,
        name: layerName,
        opacity: 100,
        rotation: 0,
        x: 0,
        y: 0,
        components
      })
    }
    return shapes
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts DXF file text directly into a CompassCAD component array, ready
 * for `logicDisplay.importJSON(design, logicDisplay.components)` (clear
 * `components` to `[]` first).
 */
export function convertDxfToCompassCad(dxfText: string, options: DxfToCompassCadOptions = {}): CompassComponentJSON[] {
  const doc = parseDxf(dxfText)
  const resolved = resolveOptions(options)
  return new Converter(doc, resolved).convert()
}

/** Lower-level entry point if you want the structured DXF data without converting it. */
export { parseDxf }
