import artwork from '../assets/branding/logo-wordmark.svg?raw'

// Both renderers use the outlines from the same bundled artwork.
const svg = new DOMParser().parseFromString(artwork, 'image/svg+xml')
export const wordmarkPaths = Array.from(svg.querySelectorAll('path'), path => path.getAttribute('d')!)
const canvasPaths = wordmarkPaths.map(d => new Path2D(d))
const [, , width, height] = svg.documentElement.getAttribute('viewBox')!.split(' ').map(Number)

export function wordmarkTransform(box: { x: number; y: number; width: number; height: number }) {
  const scale = Math.min(box.width / width, box.height / height)
  return { x: box.x + (box.width - width * scale) / 2, y: box.y + (box.height - height * scale) / 2, scale }
}

export function drawFrameWordmark(ctx: CanvasRenderingContext2D, box: Parameters<typeof wordmarkTransform>[0]): void {
  const { x, y, scale } = wordmarkTransform(box)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.fillStyle = '#ffffff'
  for (const path of canvasPaths) ctx.fill(path)
  ctx.restore()
}
