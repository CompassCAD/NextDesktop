import { DEFAULT_IMAGE_SCALE } from '../utils/Units'
import { measurementAnnotation } from '../utils/MeasurementAnnotation'
import { Arc, Component, Label, Line, Picture, Point, Polygon, Shape, componentTypes as T } from './Component'
import { DocumentProperties, paperDimensions, worldPaperDimensions } from '../utils/DocumentProperties'
import { documentTitleBlockLayout, type TitleBlockCell } from '../utils/DocumentFrame'

type Command = { command: string; x: number; y: number }
type Glyphs = (text: string) => Array<{ commands: Command[] }> | null
type TranslationKey = `documentProperties.${TitleBlockCell['field'] | 'custom'}`
export interface ExportPage { svg: string; widthMm: number; heightMm: number; outsidePaper: boolean }
const ns = 'http://www.w3.org/2000/svg'
function node(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const element = document.createElementNS(ns, tag)
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value))
  return element
}
// The editor's white ink becomes black on white paper. Other colours are retained.
const ink = (color: string): string => /^(#fff(?:fff)?|#eee(?:eee)?|#e9e9e9|white)$/i.test(color) ? '#000000' : color

/** Render-only derivative of Engine: no canvas, input, viewport, selection or undo state. */
export class ExportRenderer {
  private padding = 0.001
  constructor(private glyphs: Glyphs, private translate: (key: TranslationKey) => string = key => key) {}

  private text(text: string, x: number, y: number, sx: number, sy = sx): SVGElement {
    const commands = this.glyphs(text)?.flatMap(g => g.commands) ?? []
    return node('path', { d: commands.filter(c => c.command !== 'PU').map(c =>
      `${c.command === 'PD' ? 'M' : 'L'}${x + c.x * sx} ${y - c.y * sy}`).join(' '), fill: 'none' })
  }

  private cellText(text: string, x: number, y: number, width: number, height: number): SVGElement {
    const value = text.replace(/\s+/g, ' ').trim().slice(0, 240)
    const commands = this.glyphs(value)?.flatMap(g => g.commands) ?? []
    if (!commands.length) return node('g')
    const minX = Math.min(...commands.map(c => c.x)), maxX = Math.max(...commands.map(c => c.x))
    const minY = Math.min(...commands.map(c => c.y)), maxY = Math.max(...commands.map(c => c.y))
    const scale = Math.min(width / Math.max(maxX - minX, 1), height / Math.max(maxY - minY, 1))
    const result = this.text(value, x - minX * scale, y + maxY * scale, scale)
    result.setAttribute('stroke-width', String(height * 0.055))
    return result
  }

  private async component(c: Component, p: DocumentProperties): Promise<SVGElement> {
    const g = node('g', { fill: 'none', stroke: ink(c.color), 'stroke-width': c.radius,
      opacity: Math.max(0, Math.min(100, c.opacity)) / 100 })
    if (!c.active || c.type === T.boundBox) return g
    this.padding = Math.max(this.padding, c.radius * 2)
    const rotate = (x: number, y: number): void => { g.setAttribute('transform', `rotate(${c.rotation || 0} ${x} ${y})`) }
    const line = (x1: number, y1: number, x2: number, y2: number): void => { g.append(node('line', { x1, y1, x2, y2 })) }
    switch (c.type) {
      case T.point: {
        const a = c as Point
        g.append(node('circle', { cx: a.x, cy: a.y, r: 0.0005, 'stroke-width': 0.00025 }))
        this.padding = Math.max(this.padding, 0.000625)
        break
      }
      case T.line: case T.rectangle: case T.circle: case T.measure: {
        const a = c as Line, dx = a.x2 - a.x1, dy = a.y2 - a.y1
        rotate(c.type === T.circle ? a.x1 : (a.x1 + a.x2) / 2, c.type === T.circle ? a.y1 : (a.y1 + a.y2) / 2)
        if (c.type === T.circle) g.append(node('circle', { cx: a.x1, cy: a.y1, r: Math.hypot(dx, dy) }))
        else if (c.type === T.rectangle) g.append(node('rect', { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), width: Math.abs(dx), height: Math.abs(dy) }))
        else if (c.type === T.line) line(a.x1, a.y1, a.x2, a.y2)
        else {
          const length = Math.hypot(dx, dy), angle = Math.atan2(dy, dx)
          const layout = measurementAnnotation(length, p.measurementUnit, p.measurementPrecision,
            p.scaleDenominator / p.scaleNumerator, this.glyphs)
          const annotation = node('g', { transform: `translate(${(a.x1 + a.x2) / 2} ${(a.y1 + a.y2) / 2}) rotate(${angle * 180 / Math.PI})` })
          for (const [x1, y1, x2, y2] of layout.lines) annotation.append(node('line', { x1, y1, x2, y2 }))
          annotation.append(this.text(layout.text, layout.textX, layout.textY, layout.textScale))
          g.append(annotation)
        }
        break
      }
      case T.arc: {
        const a = c as Arc, r = Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
        const start = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), end = Math.atan2(a.y3 - a.y1, a.x3 - a.x1)
        const sweep = ((end - start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
        rotate(a.x1, a.y1)
        g.append(node('path', { d: `M${a.x2} ${a.y2} A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${a.x1 + r * Math.cos(end)} ${a.y1 + r * Math.sin(end)}` }))
        break
      }
      case T.label: {
        const a = c as Label
        rotate(a.x, a.y)
        let text = '', count = 0, row = 0
        const flush = (): void => {
          g.append(this.text(text, a.x + (a.textOffsetX ?? 0), a.y + row++ * (a.textLineSpacing ?? a.fontSize * 1.5), a.fontSize / 10 * 0.75, a.fontSize / 10))
          text = ''; count = 0
        }
        for (const word of a.text.split(' ')) {
          text += (text ? ' ' : '') + word; count += word.length + 1
          if (count > 24) flush()
        }
        if (text.trim()) flush()
        g.setAttribute('stroke-width', String(c.radius / 2))
        break
      }
      case T.polygon: {
        const a = c as Polygon
        if (!a.vectors.length) break
        rotate(a.vectors.reduce((n, v) => n + v.x, 0) / a.vectors.length, a.vectors.reduce((n, v) => n + v.y, 0) / a.vectors.length)
        g.append(node('polygon', { points: a.vectors.map(v => `${v.x},${v.y}`).join(' '), fill: ink(a.color), stroke: a.enableStroke ? ink(a.strokeColor) : 'none' }))
        break
      }
      case T.shape: {
        const a = c as Shape
        g.setAttribute('transform', `translate(${a.x} ${a.y}) rotate(${a.rotation || 0})`)
        for (const child of a.components) g.append(await this.component(child, p))
        break
      }
      case T.picture: {
        const a = c as Picture, img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = a.pictureSource
        await img.decode() // Fail the export rather than silently omit unavailable pictures.
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Cannot embed picture')
        ctx.drawImage(img, 0, 0)
        rotate(a.x, a.y)
        g.append(node('image', { x: a.x, y: a.y, width: img.naturalWidth * (a.imageScale ?? DEFAULT_IMAGE_SCALE), height: img.naturalHeight * (a.imageScale ?? DEFAULT_IMAGE_SCALE), href: canvas.toDataURL('image/png') }))
        break
      }
    }
    return g
  }

  async render(components: Component[], p: DocumentProperties): Promise<ExportPage> {
    this.padding = 0.001
    const svg = node('svg', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) as SVGSVGElement
    const content = node('g') as SVGGElement
    for (const c of components) content.append(await this.component(c, p))
    svg.append(content)
    // Measure the same metre-space paths used for output before adding the paper frame.
    svg.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden'
    document.body.append(svg)
    let bounds: DOMRect
    try { bounds = content.getBBox() } finally { svg.remove(); svg.removeAttribute('style') }
    let outsidePaper = false
    let x: number, y: number, width: number, height: number, widthMm: number, heightMm: number
    if (p.canvas === 'paper') {
      const paper = worldPaperDimensions(p), physical = paperDimensions(p)
      width = paper.width; height = paper.height; x = -width / 2; y = -height / 2
      widthMm = physical.width; heightMm = physical.height
      outsidePaper = components.some(c => c.active && c.type !== T.boundBox) && (
        bounds.x - this.padding < x || bounds.y - this.padding < y ||
        bounds.x + bounds.width + this.padding > x + width || bounds.y + bounds.height + this.padding > y + height)
      if (p.showTitleBlock) {
        const frame = node('g', { fill: 'none', stroke: '#000000', 'stroke-width': 0.00025 * p.scaleDenominator / p.scaleNumerator })
        frame.append(node('rect', { x: x + paper.margin, y: y + paper.margin, width: width - paper.margin * 2, height: height - paper.margin * 2 }))
        for (const cell of documentTitleBlockLayout(p).cells) {
          frame.append(node('rect', { x: cell.x, y: cell.y, width: cell.width, height: cell.height }))
          const pad = Math.min(cell.height * 0.1, cell.width * 0.04)
          frame.append(this.cellText(this.translate(`documentProperties.${cell.field}`), cell.x + pad, cell.y + pad, cell.width - 2 * pad, cell.height * 0.23))
          const value = cell.field === 'paper' && p.paper === 'custom' ? this.translate('documentProperties.custom') : cell.value
          frame.append(this.cellText(value, cell.x + pad, cell.y + cell.height * 0.44, cell.width - 2 * pad, cell.height * 0.4))
        }
        content.append(frame)
      }
    } else {
      // SVG's bounds include nested transforms and actual stroke-font paths.
      svg.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden'
      document.body.append(svg)
      try {
        const b = content.getBBox()
        x = b.x - this.padding; y = b.y - this.padding
        width = Math.max(0.001, b.width + this.padding * 2); height = Math.max(0.001, b.height + this.padding * 2)
      } finally { svg.remove(); svg.removeAttribute('style') }
      widthMm = width * 1000 * p.scaleNumerator / p.scaleDenominator; heightMm = height * 1000 * p.scaleNumerator / p.scaleDenominator
    }
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
    svg.setAttribute('width', `${widthMm}mm`); svg.setAttribute('height', `${heightMm}mm`)
    svg.setAttribute('overflow', 'hidden')
    svg.insertBefore(node('rect', { x, y, width, height, fill: 'white' }), content)
    return { svg: new XMLSerializer().serializeToString(svg), widthMm, heightMm, outsidePaper }
  }
}
