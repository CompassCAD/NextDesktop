import type { AgentCursor } from '../../../shared/Mcp'

/** Draw in the engine's centered screen coordinates; cursor size stays fixed while zooming. */
export function drawMcpCursors(
  ctx: CanvasRenderingContext2D,
  agents: AgentCursor[],
  cameraX: number,
  cameraY: number,
  zoom: number
): void {
  ctx.save()
  ctx.font = 'bold 12px "Radio Canada Big", "Murecho", sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  for (const agent of agents) {
    const x = (agent.x + cameraX) * zoom
    const y = (agent.y + cameraY) * zoom
    ctx.fillStyle = agent.color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 4, y + 16)
    ctx.lineTo(x + 8, y + 10)
    ctx.lineTo(x + 15, y + 8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    const label = agent.name
    ctx.fillStyle = agent.color
    ctx.beginPath()
    ctx.roundRect(x + 15, y + 16, ctx.measureText(label).width + 8, 20, 5)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, x + 19, y + 30)
  }
  ctx.restore()
}
