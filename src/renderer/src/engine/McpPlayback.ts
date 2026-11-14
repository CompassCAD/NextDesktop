import { captureMcpCanvas } from './McpScreenshot'
import { isMcpEditTool, toolSchemas, type AgentCursor, type McpRequest } from '../../../shared/Mcp'
import type { GraphicsRenderer } from './Engine'
import { createMcpExecutor } from './McpDesign'

type Position = { x: number; y: number }
export function componentCursorPath(component: unknown): Position[] {
  const c = component as Record<string, unknown>
  if (Array.isArray(c.points ?? c.vectors)) return (c.points ?? c.vectors) as Position[]
  if (typeof c.x === 'number' && typeof c.y === 'number') return [{ x: c.x, y: c.y }]
  if (typeof c.x1 === 'number' && typeof c.y1 === 'number') {
    const start = { x: c.x1, y: c.y1 }
    const end = { x: c.x2 as number, y: c.y2 as number }
    if (c.kind === 'rectangle' || c.type === 4)
      return [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }, start]
    return [start, end]
  }
  return [{ x: 0, y: 0 }]
}

/** A single queue prevents two agents from interleaving animated edits. */
export function createMcpPlayback(
  renderer: GraphicsRenderer,
  authorize: (request: McpRequest) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
): { execute: (request: McpRequest) => Promise<unknown>; dispose: () => void } {
  const execute = createMcpExecutor(renderer)
  let queue = Promise.resolve<unknown>(undefined)
  let disposed = false
  const redraw = (): void => {
    renderer.markDirty('MCP playback')
    // The normal engine loop pauses on window blur (e.g. while chatting in Claude).
    renderer.update()
  }
  const run = async (request: McpRequest): Promise<unknown> => {
    let completed = 0
    let expected = JSON.stringify(renderer.logicDisplay?.components)
    const check = (): void => {
      if (disposed) throw new Error('MCP playback stopped.')
      if (Date.now() > request.deadline) throw new Error('MCP playback expired.')
      authorize(request)
      if (!renderer.mcpAgents.some((agent) => agent.id === request.agent.id))
        throw new Error('Agent disconnected.')
      if (isMcpEditTool(request.tool)) {
        if (renderer.readonly || renderer.isEditing)
          throw new Error('Finish the active drawing gesture before continuing.')
        if (JSON.stringify(renderer.logicDisplay?.components) !== expected)
          throw new Error('Design changed during playback. Read it again before retrying.')
      }
    }
    const move = async (points: Position[], color?: string): Promise<void> => {
      const agent = renderer.mcpAgents.find((agent) => agent.id === request.agent.id)!
      const path = [{ x: agent.x, y: agent.y }, ...points]
      // Fixed total duration per component, including polygons with many vertices.
      for (let frame = 1; frame <= 20; frame++) {
        await wait(16)
        check()
        const progress = (frame / 20) * (path.length - 1)
        const segment = Math.min(Math.floor(progress), path.length - 2)
        const fraction = progress - segment
        const current = renderer.mcpAgents.find((agent) => agent.id === request.agent.id)!
        current.x = path[segment].x + (path[segment + 1].x - path[segment].x) * fraction
        current.y = path[segment].y + (path[segment + 1].y - path[segment].y) * fraction
        if (color) current.color = color
        redraw()
      }
    }
    try {
      check()
      const args = toolSchemas[request.tool].parse(request.args)
      if (request.tool === 'get_design') return execute(request)
      if (request.tool === 'get_canvas_screenshot')
        return captureMcpCanvas(
          renderer,
          toolSchemas.get_canvas_screenshot.parse(args).maxDimension
        )
      const read = (): { revision: string } =>
        execute({ ...request, tool: 'get_design', args: {} }) as { revision: string }
      if ('revision' in args && args.revision !== read().revision)
        throw new Error('Design changed. Call get_design again before editing.')
      let result: unknown
      if (request.tool === 'set_cursor') {
        const target = toolSchemas.set_cursor.parse(args)
        await move([target], target.color)
        result = { moved: true }
      } else {
        const steps: Array<{ tool: McpRequest['tool']; args: unknown; path: Position[] }> = []
        if (request.tool === 'add_components') {
          const { components } = toolSchemas.add_components.parse(args)
          if ((renderer.logicDisplay?.components.length ?? 0) + components.length > 50_000)
            throw new Error('Design component limit reached.')
          for (const component of components)
            steps.push({
              tool: 'add_components',
              args: { components: [component] },
              path: componentCursorPath(component)
            })
        } else if (request.tool === 'replace_component') {
          const replacement = toolSchemas.replace_component.parse(args)
          if (!renderer.logicDisplay?.components[replacement.index])
            throw new Error('Unknown component index.')
          steps.push({
            tool: request.tool,
            args: replacement,
            path: componentCursorPath(replacement.component)
          })
        } else {
          const { indexes } = toolSchemas.delete_components.parse(args)
          if (indexes.some((index) => !renderer.logicDisplay?.components[index]))
            throw new Error('Unknown component index.')
          for (const index of [...new Set(indexes)].sort((a, b) => b - a))
            steps.push({
              tool: 'delete_components',
              args: { indexes: [index] },
              path: componentCursorPath(renderer.logicDisplay!.components[index])
            })
        }
        for (const step of steps) {
          await move(step.path)
          check()
          result = execute({
            ...request,
            tool: step.tool,
            args: { ...(step.args as object), revision: read().revision }
          })
          completed++
          expected = JSON.stringify(renderer.logicDisplay?.components)
          redraw()
          await wait(100)
          check()
        }
      }
      const cursor = renderer.mcpAgents.find(
        (agent) => agent.id === request.agent.id
      ) as AgentCursor
      return {
        ...(result as object),
        completed,
        cursor: { x: cursor.x, y: cursor.y, color: cursor.color }
      }
    } catch (error) {
      throw new Error(
        `${String(error)} Completed ${completed} edit(s); these remain undoable. Read the design before retrying.`
      )
    }
  }
  return {
    execute(request) {
      const pending = queue.then(() => run(request))
      queue = pending.catch(() => {})
      return pending
    },
    dispose() {
      disposed = true
    }
  }
}
