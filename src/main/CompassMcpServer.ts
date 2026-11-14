import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse
} from 'node:http'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest, type InitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import type { ZodRawShapeCompat } from '@modelcontextprotocol/sdk/server/zod-compat.js'
import {
  readMcpSettings,
  isMcpEditTool,
  canvasScreenshotSchema,
  toolSchemas,
  type AgentCursor,
  type McpRequest,
  type McpStatus,
  type McpTool
} from '../shared/Mcp'

const descriptions: Record<McpTool, string> = {
  get_canvas_screenshot:
    'Capture the current visible drawing canvas as a PNG image to visually inspect and verify your work. Waits for earlier edits, redraws even when unfocused, and includes the grid and agent cursors. Does not fit or pan the camera; offscreen geometry is not shown. maxDimension defaults to 1280 pixels (maximum 1600).',
  get_design:
    'Read the active design, component indexes and revision. Coordinates are centimetres, +x right, +y down. Read again before replacing or deleting.',
  set_cursor:
    'Move your labeled cursor in world centimetres. Optionally choose your session color (#RRGGBB).',
  add_components:
    'Add up to 50 components sequentially with visible cursor movement and one undo step per component. Prefer small batches; wait for completion before the next call. Circle: center (x1,y1), point on circumference (x2,y2). Arc: center, start, end. Width is stroke width. Does not save a file.',
  replace_component:
    'Replace one component as one undo step; requires the revision from get_design.',
  delete_components:
    'Delete up to 50 components step by step, one undo step per component; requires the revision from get_design.'
}
interface Session {
  server: McpServer
  transport: StreamableHTTPServerTransport
  agent: AgentCursor
  touched: number
}
export class CompassMcpServer {
  private http?: HttpServer
  private sessions = new Map<string, Session>()
  private timer?: NodeJS.Timeout
  private config = readMcpSettings({})
  private error?: string
  private queue = Promise.resolve()
  constructor(
    private execute: (request: McpRequest) => Promise<unknown>,
    private presence: (agents: AgentCursor[]) => void
  ) {}
  status(): McpStatus {
    return {
      running: !!this.http?.listening,
      endpoint: `http://127.0.0.1:${this.config.port}/mcp`,
      error: this.error,
      agents: [...this.sessions.values()].map((s) => s.agent)
    }
  }
  configure(values: Record<string, string>): Promise<McpStatus> {
    const next = readMcpSettings(values)
    const work = this.queue.then(async () => {
      if (JSON.stringify(next) === JSON.stringify(this.config) && this.http?.listening) return
      await this.stop()
      this.config = next
      this.error = undefined
      if (!next.enabled) return
      const http = createServer((req, res) => {
        void this.handle(req, res).catch(() => {
          if (!res.headersSent) res.writeHead(500)
          res.end()
        })
      })
      this.http = http
      try {
        await new Promise<void>((resolve, reject) => {
          http.once('error', reject)
          http.listen(next.port, '127.0.0.1', () => {
            http.removeListener('error', reject)
            resolve()
          })
        })
        http.on('error', (error) => {
          this.error = error.message
        })
        this.timer = setInterval(() => {
          for (const [id, session] of this.sessions)
            if (Date.now() - session.touched > 30 * 60_000) void this.remove(id)
        }, 60_000)
        this.timer.unref()
      } catch (error) {
        this.error = String(error)
        await this.stop()
      }
    })
    this.queue = work.catch(() => {})
    return work.then(() => this.status())
  }
  private async remove(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.presence(this.status().agents)
    await session.server.close()
  }
  async stop(): Promise<void> {
    clearInterval(this.timer)
    await Promise.all([...this.sessions.keys()].map((id) => this.remove(id)))
    if (this.http) {
      const http = this.http
      this.http = undefined
      await new Promise<void>((resolve) => {
        http.close(() => resolve())
        http.closeAllConnections()
      })
    }
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const deny = (code: number, message: string): void => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: message }))
    }
    if (req.url !== '/mcp') return deny(404, 'Not found')
    if (
      req.headers.host !== `127.0.0.1:${this.config.port}` &&
      req.headers.host !== `localhost:${this.config.port}`
    )
      return deny(403, 'Invalid host')
    // Native MCP clients do not send Origin. Browser origins are deliberately unsupported.
    if (req.headers.origin) return deny(403, 'Browser origins are not allowed')
    const supplied = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${this.config.token}`)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return deny(401, 'Invalid bearer token')
    if (!['POST', 'GET', 'DELETE'].includes(req.method ?? ''))
      return deny(405, 'Method not allowed')
    let body: unknown
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 1024 * 1024) return deny(413, 'Request exceeds 1 MiB')
        chunks.push(Buffer.from(chunk))
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString())
      } catch {
        return deny(400, 'Invalid JSON')
      }
    }
    const id = req.headers['mcp-session-id']
    let session = typeof id === 'string' ? this.sessions.get(id) : undefined
    if (id && !session) return deny(404, 'Session expired; initialize again')
    if (!session) {
      if (req.method !== 'POST' || !isInitializeRequest(body))
        return deny(400, 'Initialize a session first')
      if (this.sessions.size >= 16) return deny(503, 'Too many sessions')
      const agent: AgentCursor = {
        id: randomUUID(),
        name: (body as InitializeRequest).params.clientInfo.name.slice(0, 80),
        color:
          [
            '#67e8f9',
            '#c084fc',
            '#fbbf24',
            '#4ade80',
            '#fb7185',
            '#60a5fa',
            '#f472b6',
            '#a3e635',
            '#fb923c',
            '#2dd4bf',
            '#818cf8',
            '#e879f9',
            '#facc15',
            '#a8a29e',
            '#fda4af',
            '#ffffff'
          ].find(
            (color) => ![...this.sessions.values()].some((session) => session.agent.color === color)
          ) ?? '#ffffff',
        x: 0,
        y: 0
      }
      const server = new McpServer(
        { name: 'CompassCAD', version: '1.0.0' },
        {
          instructions:
            'Design step by step. Read the design first, choose a cursor color, and explain each next action to the user. Use small batches and await each tool result before continuing. Edits animate in CompassCAD. Call get_canvas_screenshot after drawing to visually verify the result; inspect the returned image before claiming success. On interruption, read the design before retrying because completed steps remain applied and undoable.'
        }
      )
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => agent.id,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          this.sessions.set(id, session!)
          this.presence(this.status().agents)
        }
      })
      session = { server, transport, agent, touched: Date.now() }
      for (const tool of Object.keys(toolSchemas) as McpTool[]) {
        server.registerTool<ZodRawShapeCompat, ZodRawShapeCompat>(
          tool,
          {
            description: descriptions[tool],
            inputSchema: toolSchemas[tool].shape as ZodRawShapeCompat
          },
          async (args) => {
            try {
              const parsed = toolSchemas[tool].parse(args)
              if (isMcpEditTool(tool) && !this.config.allowEdits)
                throw new Error('Design editing is disabled in MCP settings.')
              const result = await this.execute({
                id: randomUUID(),
                tool,
                args: parsed,
                agent: { ...agent },
                deadline: Date.now() + 45_000
              })
              if (tool === 'get_canvas_screenshot') {
                const screenshot = canvasScreenshotSchema.parse(result)
                const { data, mimeType, ...metadata } = screenshot
                return {
                  content: [
                    { type: 'image' as const, data, mimeType },
                    {
                      type: 'text' as const,
                      text: JSON.stringify({
                        ...metadata,
                        scope:
                          'Visible canvas only; offscreen geometry is not shown. Images and fonts still loading may require another screenshot.'
                      })
                    }
                  ]
                }
              }
              if (tool === 'set_cursor') Object.assign(agent, parsed)
              if (result && typeof result === 'object' && 'cursor' in result) {
                const cursor = toolSchemas.set_cursor.safeParse(result.cursor)
                if (cursor.success) Object.assign(agent, cursor.data)
              }
              this.presence(this.status().agents)
              return {
                content: [{ type: 'text' as const, text: JSON.stringify({ result, agent }) }]
              }
            } catch (error) {
              return { isError: true, content: [{ type: 'text' as const, text: String(error) }] }
            }
          }
        )
      }
      await server.connect(transport)
      const onclose = transport.onclose
      transport.onclose = () => {
        onclose?.()
        this.sessions.delete(agent.id)
        this.presence(this.status().agents)
      }
    }
    session.touched = Date.now()
    await session.transport.handleRequest(req, res, body)
  }
}
