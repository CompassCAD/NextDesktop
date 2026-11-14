import type { GraphicsRenderer } from './Engine'
import { canvasScreenshotSchema } from '../../../shared/Mcp'
import type { z } from 'zod/v3'

/** Capture only the visible drawing viewport, without changing the camera or history. */
export function captureMcpCanvas(
  renderer: GraphicsRenderer,
  maxDimension: number,
  createCanvas: () => HTMLCanvasElement = () => document.createElement('canvas')
): z.infer<typeof canvasScreenshotSchema> {
  const source = renderer.displayRef
  if (!source || !source.width || !source.height || !renderer.logicDisplay)
    throw new Error('The drawing canvas is not ready.')
  renderer.markDirty('MCP screenshot')
  renderer.update()
  const scale = Math.min(1, maxDimension / Math.max(source.width, source.height))
  const output = createCanvas()
  output.width = Math.max(1, Math.round(source.width * scale))
  output.height = Math.max(1, Math.round(source.height * scale))
  const context = output.getContext('2d')
  if (!context) throw new Error('Unable to create screenshot canvas.')
  context.fillStyle = '#1d1d1d'
  context.fillRect(0, 0, output.width, output.height)
  context.drawImage(source, 0, 0, output.width, output.height)
  let url: string
  try {
    url = output.toDataURL('image/png')
  } catch {
    throw new Error(
      'Canvas capture failed. An external image may block canvas export; remove it or use get_design to inspect the geometry.'
    )
  }
  if (!url.startsWith('data:image/png;base64,'))
    throw new Error('Canvas did not produce a PNG screenshot.')
  const halfWidth = renderer.displayWidth / (2 * renderer.zoom)
  const halfHeight = renderer.displayHeight / (2 * renderer.zoom)
  return canvasScreenshotSchema.parse({
    data: url.slice('data:image/png;base64,'.length),
    mimeType: 'image/png',
    width: output.width,
    height: output.height,
    viewport: {
      left: -halfWidth - renderer.cOutX,
      top: -halfHeight - renderer.cOutY,
      right: halfWidth - renderer.cOutX,
      bottom: halfHeight - renderer.cOutY,
      units: 'cm'
    }
  })
}
