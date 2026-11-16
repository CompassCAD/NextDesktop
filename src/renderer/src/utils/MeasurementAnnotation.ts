import { formatMeasurement, type MeasurementUnit } from './SettingsOptions'
export type StrokeGlyphs = Array<{ commands: Array<{ command: string; x: number; y: number }> }>
/** Shared physical dimension annotation layout for the canvas and vector exporter. */
export function measurementAnnotation(length: number, unit: MeasurementUnit, precision: number,
  paperScale: number, glyphs: (text: string) => StrokeGlyphs | null): {
    text: string; textScale: number; textX: number; textY: number; lines: number[][]
  } {
  const text = formatMeasurement(length, unit, precision)
  const commands = glyphs(text)?.flatMap(g => g.commands) ?? []
  const xs = commands.map(c => c.x), ys = commands.map(c => c.y)
  const minX = Math.min(0, ...xs), maxX = Math.max(1, ...xs)
  const textScale = 0.0035 * paperScale / Math.max(1, Math.max(0, ...ys) - Math.min(0, ...ys))
  const width = (maxX - minX) * textScale
  const gap = width + 0.004 * paperScale
  const arrow = Math.min(0.003 * paperScale, length / 4)
  const short = length < gap + arrow * 2
  const half = length / 2
  const lines = short ? [[-half, 0, half, 0]] : [[-half, 0, -gap / 2, 0], [gap / 2, 0, half, 0]]
  lines.push([-half + arrow, -arrow / 4, -half, 0], [-half, 0, -half + arrow, arrow / 4],
    [half - arrow, -arrow / 4, half, 0], [half, 0, half - arrow, arrow / 4])
  return { text, textScale, textX: -width / 2 - minX * textScale,
    textY: short ? -0.002 * paperScale : 0.0015 * paperScale, lines }
}
