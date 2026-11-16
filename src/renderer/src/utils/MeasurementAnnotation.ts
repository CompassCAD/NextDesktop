import { formatMeasurement, type MeasurementUnit } from './SettingsOptions'
export type StrokeGlyphs = Array<{ commands: Array<{ command: string; x: number; y: number }> }>
/**
 * Shared editor/export dimension layout in world centimetres. Preserve the infinite
 * canvas's glyph scale and arrow size; neither paper scale nor display units size geometry.
 */
export function measurementAnnotation(length: number, unit: MeasurementUnit, precision: number,
  glyphs: (text: string) => StrokeGlyphs | null): {
    text: string; textScale: number; textX: number; textY: number; lines: number[][]
  } {
  const text = formatMeasurement(length, unit, precision)
  const commands = glyphs(text)?.flatMap(g => g.commands) ?? []
  const xs = commands.map(c => c.x), ys = commands.map(c => c.y)
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs)
  const textScale = 2
  const width = (maxX - minX) * textScale
  const gap = width + 20
  const arrow = Math.min(25, length / 4)
  const short = length < gap + arrow * 2
  const half = length / 2
  const lines = short ? [[-half, 0, half, 0]] : [[-half, 0, -gap / 2, 0], [gap / 2, 0, half, 0]]
  lines.push([-half + arrow, -arrow / 5, -half, 0], [-half, 0, -half + arrow, arrow / 5],
    [half - arrow, -arrow / 5, half, 0], [half, 0, half - arrow, arrow / 5])
  return { text, textScale, textX: -width / 2 - minX * textScale,
    textY: short ? Math.min(0, ...ys) * textScale - 15
      : (Math.max(0, ...ys) + Math.min(0, ...ys)) * textScale / 2, lines }
}
