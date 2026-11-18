import { type DocumentProperties, worldPaperDimensions } from './DocumentProperties'

export interface TitleBlockCell {
  field: 'name' | 'author' | 'project' | 'description' | 'revision' | 'paper' | 'scale'
  value: string
  x: number
  y: number
  width: number
  height: number
}

/** Paper-millimetre layout converted to centimetre geometry, independent of viewport zoom. */
export function documentTitleBlockLayout(p: DocumentProperties): {
  x: number
  y: number
  width: number
  height: number
  cells: TitleBlockCell[]
  wordmark: { x: number; y: number; width: number; height: number }
} {
  const paper = worldPaperDimensions(p)
  const mm = p.scaleDenominator / p.scaleNumerator / 10
  const size =
    Math.min(
      1,
      (paper.width - 2 * paper.margin) / (180 * mm),
      ((paper.height - 2 * paper.margin) * 0.3) / (42 * mm)
    ) * mm
  const width = 180 * size
  const height = 42 * size
  const x = -paper.width / 2 + paper.margin
  const y = paper.height / 2 - paper.margin - height
  const cell = (
    field: TitleBlockCell['field'],
    value: string,
    left: number,
    top: number,
    w: number,
    h: number
  ): TitleBlockCell => ({
    field,
    value,
    x: x + left * size,
    y: y + top * size,
    width: w * size,
    height: h * size
  })
  return {
    x,
    y,
    width,
    height,
    wordmark: { x: x + 2 * size, y: y + 33 * size, width: 56 * size, height: 8 * size },
    cells: [
      cell('name', p.name, 0, 0, 180, 12),
      cell('author', p.author, 0, 12, 90, 10),
      cell('project', p.project, 90, 12, 90, 10),
      cell('description', p.description, 0, 22, 180, 10),
      cell('revision', p.revision, 60, 32, 30, 10),
      cell('paper', p.paper, 90, 32, 30, 10),
      cell('scale', `${p.scaleNumerator}:${p.scaleDenominator}`, 120, 32, 60, 10)
    ]
  }
}
