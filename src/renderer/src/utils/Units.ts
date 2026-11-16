/** All model coordinates and physical lengths are metres. Camera zoom is pixels/metre. */
export const METRES_PER_MM = 0.001
export const METRES_PER_POINT = 0.0254 / 72
export const DEFAULT_FONT_HEIGHT = 12 * METRES_PER_POINT
export const DEFAULT_STROKE_WIDTH = 0.00025
export const DEFAULT_IMAGE_SCALE = 0.0254 / 96
export const PIXELS_PER_METRE = 3000

/** Convert a detached component tree at a file boundary; never mutate live geometry. */
export function convertGeometryUnits(components: unknown[], factor: number, legacyImport = false): unknown[] {
  const visit = (input: unknown): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid component')
    const c = structuredClone(input) as Record<string, unknown>
    for (const key of ['x', 'y', 'x1', 'y1', 'x2', 'y2', 'x3', 'y3', 'radius', 'fontSize', 'textOffsetX', 'textLineSpacing']) {
      if (typeof c[key] === 'number') c[key] = c[key] * factor
    }
    if (Array.isArray(c.vectors)) c.vectors = c.vectors.map(visit)
    if (Array.isArray(c.components)) c.components = c.components.map(visit)
    if (c.type === 9) c.imageScale = (typeof c.imageScale === 'number' ? c.imageScale : legacyImport ? 1 : DEFAULT_IMAGE_SCALE) * factor
    if (legacyImport) {
      c.radius ??= (c.type === 1 || c.type === 7 || c.type === 9 ? 3 : 2) * factor
      if (c.type === 7) {
        c.fontSize ??= 18 * factor
        c.textOffsetX = -5 * factor
        c.textLineSpacing = 30 * factor + Number(c.fontSize) / 2
      }
    }
    return c
  }
  return components.map(visit)
}
