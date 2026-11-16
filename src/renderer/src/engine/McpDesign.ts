import { toolSchemas, type McpRequest } from '../../../shared/Mcp'
import type { GraphicsRenderer } from './Engine'
import {
  Arc,
  Circle,
  Component,
  Label,
  Line,
  Measure,
  Point,
  Polygon,
  Rectangle
} from './Component'
import { primitiveSchema } from '../../../shared/Mcp'
import type { z } from 'zod/v3'

export function makeMcpComponent(value: z.infer<typeof primitiveSchema>): Component {
  let component: Component
  switch (value.kind) {
    case 'point':
      component = new Point(value.x, value.y)
      break
    case 'label':
      component = new Label(value.x, value.y, value.text, value.fontSize)
      break
    case 'polygon':
      component = new Polygon(value.points, value.color, value.color)
      break
    case 'arc':
      component = new Arc(value.x1, value.y1, value.x2, value.y2, value.x3, value.y3)
      break
    default: {
      const Constructor = { line: Line, circle: Circle, rectangle: Rectangle, measure: Measure }[
        value.kind
      ]
      component = new Constructor(value.x1, value.y1, value.x2, value.y2)
    }
  }
  component.color = value.color
  component.radius = value.width
  if (value.name) component.name = value.name
  return component
}
// A revision follows all edits, undo/redo and file replacement, including changes outside MCP.
export function createMcpExecutor(renderer: GraphicsRenderer): (request: McpRequest) => unknown {
  let lastDesign = ''
  let revision = crypto.randomUUID()
  const currentRevision = (): string => {
    const design = JSON.stringify(renderer.logicDisplay?.components)
    if (design !== lastDesign) {
      lastDesign = design
      revision = crypto.randomUUID()
    }
    return revision
  }
  return (request) => {
    if (Date.now() > request.deadline) throw new Error('Request expired; no changes applied.')
    const logic = renderer.logicDisplay
    if (!logic) throw new Error('Open a design first.')
    const args = toolSchemas[request.tool].parse(request.args)
    if (request.tool === 'get_design')
      return { units: 'cm', revision: currentRevision(), components: logic.components }
    if (request.tool === 'set_cursor') return { moved: true }
    if (renderer.readonly || renderer.isEditing)
      throw new Error(
        'The canvas is read-only or a drawing gesture is active. Finish the gesture and retry.'
      )
    if ('revision' in args && args.revision !== currentRevision())
      throw new Error('Design changed. Call get_design again before editing.')
    let next = [...logic.components]
    if (request.tool === 'add_components') {
      const args = toolSchemas.add_components.parse(request.args)
      if (next.length + args.components.length > 50_000)
        throw new Error('Design component limit reached.')
      next.push(...args.components.map(makeMcpComponent))
    } else if (request.tool === 'replace_component') {
      const args = toolSchemas.replace_component.parse(request.args)
      if (!next[args.index]) throw new Error('Unknown component index.')
      next[args.index] = makeMcpComponent(args.component)
    } else if (request.tool === 'delete_components') {
      const args = toolSchemas.delete_components.parse(request.args)
      if (args.indexes.some((i) => !next[i])) throw new Error('Unknown component index.')
      const indexes = new Set(args.indexes)
      next = next.filter((_, i) => !indexes.has(i))
    } else throw new Error('Unknown operation.')
    renderer.setSelection([])
    logic.components = next
    renderer.saveState()
    return { revision: currentRevision(), count: next.length }
  }
}
