import { z } from 'zod/v3'

const coordinate = z.number().finite().min(-1e7).max(1e7)
const position = { x: coordinate, y: coordinate }
const endpoints = { x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate }
const style = {
  name: z.string().max(120).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#ffffff'),
  width: z.number().min(0.1).max(100).default(2)
}
export const primitiveSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), ...position, ...style }),
  z.object({ kind: z.literal('line'), ...endpoints, ...style }),
  z.object({ kind: z.literal('rectangle'), ...endpoints, ...style }),
  z.object({ kind: z.literal('circle'), ...endpoints, ...style }),
  z.object({ kind: z.literal('measure'), ...endpoints, ...style }),
  z.object({ kind: z.literal('arc'), ...endpoints, x3: coordinate, y3: coordinate, ...style }),
  z.object({
    kind: z.literal('label'),
    ...position,
    text: z.string().max(2000),
    fontSize: z.number().min(1).max(256).default(18),
    ...style
  }),
  z.object({
    kind: z.literal('polygon'),
    points: z.array(z.object(position)).min(3).max(1000),
    ...style
  })
])
export const toolSchemas = {
  get_design: z.object({}),
  get_canvas_screenshot: z.object({
    maxDimension: z.number().int().min(256).max(1600).default(1280)
  }),
  set_cursor: z.object({
    ...position,
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
  }),
  add_components: z.object({ components: z.array(primitiveSchema).min(1).max(50) }),
  replace_component: z.object({
    revision: z.string(),
    index: z.number().int().min(0),
    component: primitiveSchema
  }),
  delete_components: z.object({
    revision: z.string(),
    indexes: z.array(z.number().int().min(0)).min(1).max(50)
  })
}
export type McpTool = keyof typeof toolSchemas
export function isMcpEditTool(tool: McpTool): boolean {
  return tool === 'add_components' || tool === 'replace_component' || tool === 'delete_components'
}
export const canvasScreenshotSchema = z.object({
  data: z.string().min(1).max(16_000_000),
  mimeType: z.literal('image/png'),
  width: z.number().int().positive().max(1600),
  height: z.number().int().positive().max(1600),
  viewport: z.object({
    left: z.number().finite(),
    top: z.number().finite(),
    right: z.number().finite(),
    bottom: z.number().finite(),
    units: z.literal('cm')
  })
})
export interface AgentCursor {
  profile?: import('./AgentIdentity').AgentProfile
  id: string
  name: string
  color: string
  x: number
  y: number
}
export interface McpRequest {
  id: string
  tool: McpTool
  args: unknown
  agent: AgentCursor
  deadline: number
}
export interface McpStatus {
  running: boolean
  endpoint: string
  error?: string
  agents: AgentCursor[]
}
export function readMcpSettings(values: Record<string, string>): {
  enabled: boolean
  port: number
  token: string
  allowEdits: boolean
} {
  const port = Number(values.mcpPort ?? '3847')
  const token = values.mcpToken ?? ''
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('MCP port must be an integer between 1024 and 65535.')
  if (
    values.mcpEnabled === 'true' &&
    (token.length < 32 || token.length > 256 || !/^[\x21-\x7e]+$/.test(token))
  )
    throw new Error('MCP requires a 32–256 character ASCII token without spaces.')
  return {
    enabled: values.mcpEnabled === 'true',
    port,
    token,
    allowEdits: values.mcpAllowEdits !== 'false'
  }
}
