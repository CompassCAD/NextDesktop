/**
 * RandomDesignGenerator.ts
 * ------------------------------------------------------------------------
 * Generates a randomized "design" (array of Component instances) for
 * stress-testing the CompassCAD rendering/interaction engine.
 *
 * Deterministic: the same `seed` + `count` always produces the exact same
 * design, so you can reproduce a crash/perf regression by re-running with
 * the same seed.
 *
 * Usage:
 *   import { generateRandomDesign, generateRandomDesignJSON } from './RandomDesignGenerator'
 *
 *   const components = generateRandomDesign(0.4213, 500)
 *   renderer.logicDisplay!.components = components
 *
 *   // or, if you want to go through the engine's own import path
 *   // (it expects a JSON string of a Component[] array, same shape the
 *   // undo/redo stack and importJSON() already use):
 *   const json = generateRandomDesignJSON(0.4213, 500)
 *   renderer.logicDisplay?.importJSON(JSON.parse(json), renderer.logicDisplay.components)
 * ------------------------------------------------------------------------
 */

import {
  componentTypes,
  Component,
  Point,
  Line,
  Circle,
  Rectangle,
  Measure,
  Label,
  Arc,
  Shape,
  Picture,
  Polygon,
  BoundBox
} from '../engine/Component'

// ---------------------------------------------------------------------------
// Seeded PRNG
// ---------------------------------------------------------------------------
// The seed is a float in [0, 1) (decimals allowed), which we expand into a
// 32-bit integer state for a mulberry32 generator. mulberry32 is small,
// fast, and has decent statistical quality for this kind of non-cryptographic
// randomized-content use case.

type RNG = () => number

function mulberry32(state: number): RNG {
  let a = state >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normalizes any numeric seed into the [0, 1) range mulberry32 expects. */
function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  // Wrap into [0, 1) - allows negative or >1 seeds to still work predictably.
  const wrapped = seed - Math.floor(seed)
  return wrapped
}

function createRng(seed: number): RNG {
  const normalized = normalizeSeed(seed)
  // Spread the fractional seed across a full 32-bit space.
  const intSeed = Math.floor(normalized * 4294967296) >>> 0
  return mulberry32(intSeed)
}

// ---------------------------------------------------------------------------
// RNG helpers
// ---------------------------------------------------------------------------

function randFloat(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min)
}

function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(randFloat(rng, min, max + 1))
}

function randBool(rng: RNG, probabilityTrue = 0.5): boolean {
  return rng() < probabilityTrue
}

function pick<T>(rng: RNG, arr: T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)]
}

function randColor(rng: RNG): string {
  const hex = Math.floor(rng() * 0xffffff)
    .toString(16)
    .padStart(6, '0')
  return `#${hex}`
}

function randOpacity(rng: RNG): number {
  return randInt(rng, 10, 100)
}

const SAMPLE_WORDS = [
  'Alpha', 'Beam', 'Chassis', 'Duct', 'Elbow', 'Flange', 'Gasket', 'Hinge',
  'Inlet', 'Joint', 'Keel', 'Lever', 'Mount', 'Node', 'Outlet', 'Pivot',
  'Quadrant', 'Rail', 'Strut', 'Truss', 'Union', 'Valve', 'Weld', 'Yoke'
]

function randLabelText(rng: RNG): string {
  const words = randInt(rng, 1, 3)
  const parts: string[] = []
  for (let i = 0; i < words; i++) parts.push(pick(rng, SAMPLE_WORDS))
  if (randBool(rng, 0.4)) parts.push(String(randInt(rng, 0, 999)))
  return parts.join(' ')
}

// Placeholder "picture" sources - the engine's Picture component only stores
// a source string/URL, it doesn't matter that these aren't real assets for
// stress-testing structural/rendering-loop behavior. Swap these for real
// asset paths if you need to test actual image decoding/caching too.
const SAMPLE_PICTURE_SOURCES = [
  'https://placehold.co/64x64/png',
  'https://placehold.co/128x128/png',
  'https://placehold.co/32x32/png'
]

// ---------------------------------------------------------------------------
// Bounds / config
// ---------------------------------------------------------------------------

export interface DesignBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface RandomDesignOptions {
  /** World-space bounds new components are scattered within. */
  bounds?: DesignBounds
  /** Restrict generation to a subset of component type names (see componentTypes keys). Defaults to all. */
  includeTypes?: (keyof typeof componentTypes)[]
  /** Min/max radius (stroke width / point size) used across components. */
  radiusRange?: [number, number]
  /** Max nesting depth for Shape components (each level costs part of the total `count` budget). */
  maxShapeDepth?: number
  /** Min/max children a generated Shape gets. */
  shapeChildRange?: [number, number]
  /** Min/max vertices a generated Polygon gets. */
  polygonVertexRange?: [number, number]
}

const DEFAULT_BOUNDS: DesignBounds = { minX: -500, maxX: 500, minY: -500, maxY: 500 }

const ALL_TYPE_NAMES = Object.keys(componentTypes) as (keyof typeof componentTypes)[]

// ---------------------------------------------------------------------------
// Per-type factories
// ---------------------------------------------------------------------------

function randPointCoord(rng: RNG, b: DesignBounds): [number, number] {
  return [randFloat(rng, b.minX, b.maxX), randFloat(rng, b.minY, b.maxY)]
}

function makePoint(rng: RNG, b: DesignBounds): Point {
  const [x, y] = randPointCoord(rng, b)
  return new Point(x, y, randOpacity(rng), `Point_${randInt(rng, 0, 99999)}`)
}

function makeLine(rng: RNG, b: DesignBounds, radiusRange: [number, number]): Line {
  const [x1, y1] = randPointCoord(rng, b)
  const [x2, y2] = randPointCoord(rng, b)
  return new Line(
    x1, y1, x2, y2,
    randFloat(rng, radiusRange[0], radiusRange[1]),
    randColor(rng),
    randOpacity(rng),
    `Line_${randInt(rng, 0, 99999)}`
  )
}

function makeCircle(rng: RNG, b: DesignBounds, radiusRange: [number, number]): Circle {
  const [x1, y1] = randPointCoord(rng, b)
  const r = randFloat(rng, 5, Math.max(6, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 4))
  return new Circle(
    x1, y1, x1 + r, y1,
    randFloat(rng, radiusRange[0], radiusRange[1]),
    randColor(rng),
    randOpacity(rng),
    `Circle_${randInt(rng, 0, 99999)}`
  )
}

function makeRectangle(rng: RNG, b: DesignBounds, radiusRange: [number, number]): Rectangle {
  const [x1, y1] = randPointCoord(rng, b)
  const [x2, y2] = randPointCoord(rng, b)
  return new Rectangle(
    x1, y1, x2, y2,
    randFloat(rng, radiusRange[0], radiusRange[1]),
    randColor(rng),
    randOpacity(rng),
    `Rectangle_${randInt(rng, 0, 99999)}`
  )
}

function makeMeasure(rng: RNG, b: DesignBounds, radiusRange: [number, number]): Measure {
  const [x1, y1] = randPointCoord(rng, b)
  const [x2, y2] = randPointCoord(rng, b)
  return new Measure(
    x1, y1, x2, y2,
    randFloat(rng, radiusRange[0], radiusRange[1]),
    randOpacity(rng),
    `Measure_${randInt(rng, 0, 99999)}`
  )
}

function makeLabel(rng: RNG, b: DesignBounds): Label {
  const [x, y] = randPointCoord(rng, b)
  return new Label(
    x, y,
    randLabelText(rng),
    randInt(rng, 8, 36),
    randOpacity(rng),
    `Label_${randInt(rng, 0, 99999)}`
  )
}

function makeArc(rng: RNG, b: DesignBounds, radiusRange: [number, number]): Arc {
  const [x1, y1] = randPointCoord(rng, b)
  const [x2, y2] = randPointCoord(rng, b)
  const [x3, y3] = randPointCoord(rng, b)
  return new Arc(
    x1, y1, x2, y2, x3, y3,
    randFloat(rng, radiusRange[0], radiusRange[1]),
    randColor(rng),
    randOpacity(rng),
    `Arc_${randInt(rng, 0, 99999)}`
  )
}

function makePicture(rng: RNG, b: DesignBounds): Picture {
  const [x, y] = randPointCoord(rng, b)
  return new Picture(
    x, y,
    pick(rng, SAMPLE_PICTURE_SOURCES),
    randOpacity(rng),
    `Picture_${randInt(rng, 0, 99999)}`
  )
}

function makePolygon(rng: RNG, b: DesignBounds, vertexRange: [number, number]): Polygon {
  const vertCount = randInt(rng, vertexRange[0], vertexRange[1])
  const [cx, cy] = randPointCoord(rng, b)
  const radius = randFloat(rng, 10, Math.max(15, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 5))
  const vectors: { x: number; y: number }[] = []
  // Scatter vertices roughly around a circle (with jitter) so polygons are
  // non-degenerate rather than pure noise, which stresses fill/stroke code
  // without immediately producing self-intersecting garbage every time.
  for (let i = 0; i < vertCount; i++) {
    const angle = (i / vertCount) * Math.PI * 2
    const jitter = randFloat(rng, 0.6, 1.4)
    vectors.push({
      x: cx + Math.cos(angle) * radius * jitter,
      y: cy + Math.sin(angle) * radius * jitter
    })
  }
  return new Polygon(
    vectors,
    randColor(rng),
    randColor(rng),
    randOpacity(rng),
    randBool(rng, 0.7),
    `Polygon_${randInt(rng, 0, 99999)}`
  )
}

function makeBoundBox(rng: RNG, b: DesignBounds): BoundBox {
  const [x1, y1] = randPointCoord(rng, b)
  const [x2, y2] = randPointCoord(rng, b)
  return new BoundBox(x1, y1, x2, y2, `BoundBox_${randInt(rng, 0, 99999)}`)
}

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Builds one component of `typeName`, optionally recursing (for Shape) up to
 * `depthRemaining`. Returns the component plus how many "budget units" it
 * consumed (a Shape with children consumes 1 + its children's count).
 */
function buildComponent(
  rng: RNG,
  typeName: keyof typeof componentTypes,
  bounds: DesignBounds,
  radiusRange: [number, number],
  polygonVertexRange: [number, number],
  shapeChildRange: [number, number],
  depthRemaining: number
): { component: Component; consumed: number } {
  switch (typeName) {
    case 'point':
      return { component: makePoint(rng, bounds), consumed: 1 }
    case 'line':
      return { component: makeLine(rng, bounds, radiusRange), consumed: 1 }
    case 'circle':
      return { component: makeCircle(rng, bounds, radiusRange), consumed: 1 }
    case 'rectangle':
      return { component: makeRectangle(rng, bounds, radiusRange), consumed: 1 }
    case 'arc':
      return { component: makeArc(rng, bounds, radiusRange), consumed: 1 }
    case 'measure':
      return { component: makeMeasure(rng, bounds, radiusRange), consumed: 1 }
    case 'label':
      return { component: makeLabel(rng, bounds), consumed: 1 }
    case 'picture':
      return { component: makePicture(rng, bounds), consumed: 1 }
    case 'polygon':
      return { component: makePolygon(rng, bounds, polygonVertexRange), consumed: 1 }
    case 'boundBox':
      return { component: makeBoundBox(rng, bounds), consumed: 1 }
    case 'shape': {
      const [x, y] = randPointCoord(rng, bounds)
      const shape = new Shape(x, y, `Shape_${randInt(rng, 0, 99999)}`)
      let consumed = 1

      if (depthRemaining > 0) {
        const childCount = randInt(rng, shapeChildRange[0], shapeChildRange[1])
        // Children live in shape-local space; give them a tighter bounding
        // box so nested geometry stays roughly coherent under the shape.
        const localSpan = 100
        const childBounds: DesignBounds = {
          minX: -localSpan, maxX: localSpan,
          minY: -localSpan, maxY: localSpan
        }
        // Shapes may contain any leaf type, but not further nested shapes
        // beyond depthRemaining, to keep this bounded and deterministic.
        const childTypePool = ALL_TYPE_NAMES.filter(
          (t) => t !== 'shape' || depthRemaining - 1 > 0
        )
        for (let i = 0; i < childCount; i++) {
          const childType = pick(rng, childTypePool)
          const { component: child, consumed: childConsumed } = buildComponent(
            rng, childType, childBounds, radiusRange, polygonVertexRange,
            shapeChildRange, depthRemaining - 1
          )
          shape.addComponent(child)
          consumed += childConsumed
        }
      }
      return { component: shape, consumed }
    }
    default:
      return { component: makePoint(rng, bounds), consumed: 1 }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a randomized, deterministic array of Components.
 *
 * @param seed  Any number; typically 0-1 (can be a decimal, e.g. 0.7321).
 *              Values outside [0,1) are wrapped, so 1.5 and -0.5 both work.
 * @param count Target number of top-level "budget units" to fill. Shapes with
 *              nested children consume more than 1 unit each, so the final
 *              array length may be less than `count` if shapes are included,
 *              but total generated components (incl. nested) will meet it.
 */
export function generateRandomDesign(
  seed: number,
  count: number,
  options: RandomDesignOptions = {}
): Component[] {
  const rng = createRng(seed)
  const bounds = options.bounds ?? DEFAULT_BOUNDS
  const includeTypes = options.includeTypes ?? ALL_TYPE_NAMES
  const radiusRange = options.radiusRange ?? [1, 6]
  const maxShapeDepth = options.maxShapeDepth ?? 2
  const shapeChildRange = options.shapeChildRange ?? [2, 6]
  const polygonVertexRange = options.polygonVertexRange ?? [3, 10]

  const safeCount = Math.max(0, Math.floor(count))
  const result: Component[] = []
  let budget = safeCount

  // Guard against pathological options (e.g. empty includeTypes).
  const typePool = includeTypes.length > 0 ? includeTypes : ALL_TYPE_NAMES

  while (budget > 0) {
    const typeName = pick(rng, typePool)
    const { component, consumed } = buildComponent(
      rng, typeName, bounds, radiusRange, polygonVertexRange,
      shapeChildRange, maxShapeDepth
    )
    result.push(component)
    budget -= consumed
  }

  return result
}

/**
 * Same as generateRandomDesign, but pre-serialized to JSON — matching the
 * shape the engine already uses internally (e.g. `JSON.stringify(this.logicDisplay?.components)`
 * on the undo stack, and `logicDisplay.importJSON(...)` on load).
 */
export function generateRandomDesignJSON(
  seed: number,
  count: number,
  options?: RandomDesignOptions
): string {
  return JSON.stringify(generateRandomDesign(seed, count, options))
}

/** Convenience: total component count including nested Shape children. */
export function countAllComponents(components: Component[]): number {
  let total = 0
  for (const c of components) {
    total += 1
    if (c instanceof Shape) {
      total += countAllComponents(c.components)
    }
  }
  return total
}
