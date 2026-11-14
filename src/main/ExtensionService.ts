import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'

export const permissions = [
  'web.request',
  'server.listen',
  'filesystem.read',
  'filesystem.write'
] as const
export interface ExtensionInfo {
  id: string
  name: string
  permissions: string[]
  error?: string
}
interface Session {
  id: string
  permissions: string[]
  controllers: Set<AbortController>
  servers: Map<string, Server>
}
const limit = 1024 * 1024

export function parseManifest(id: string, source: string): ExtensionInfo {
  const header = source
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.startsWith('-- @compasscad '))
  if (!header) return { id, name: id, permissions: [] }
  const value = JSON.parse(header.slice('-- @compasscad '.length))
  if (
    !value ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !Array.isArray(value.permissions) ||
    !value.permissions.every((p: unknown) => typeof p === 'string')
  ) {
    throw new Error('Invalid extension manifest: name and permissions are required.')
  }
  const requested = [...new Set<string>(value.permissions)]
  const unknown = requested.filter((p) => !(permissions as readonly string[]).includes(p))
  return {
    id,
    name: value.name,
    permissions: requested,
    ...(unknown.length ? { error: `Unsupported permissions: ${unknown.join(', ')}` } : {})
  }
}

export class ExtensionService {
  private sessions = new Map<string, Session>()
  private generation = 0
  constructor(
    private directory: string,
    private disabled: () => string[]
  ) {}

  private async read(id: string): Promise<{ info: ExtensionInfo; source: string; hash: string }> {
    if (typeof id !== 'string' || path.basename(id) !== id || !id.toLowerCase().endsWith('.lua'))
      throw new Error('Invalid extension ID.')
    const file = path.join(this.directory, id)
    if ((await fs.lstat(file)).isSymbolicLink())
      throw new Error('Extension symlinks are not supported.')
    const source = await fs.readFile(file, 'utf8')
    return {
      info: parseManifest(id, source),
      source,
      hash: createHash('sha256').update(source).digest('hex')
    }
  }

  async list(): Promise<ExtensionInfo[]> {
    await fs.mkdir(this.directory, { recursive: true })
    const ids = (await fs.readdir(this.directory))
      .filter((id) => id.toLowerCase().endsWith('.lua'))
      .sort()
    return Promise.all(
      ids.map(async (id) => {
        try {
          return (await this.read(id)).info
        } catch (error) {
          return { id, name: id, permissions: [], error: String(error) }
        }
      })
    )
  }

  async activate(
    id: string,
    consent: (info: ExtensionInfo) => Promise<boolean>
  ): Promise<{ token: string; source: string } | null> {
    const generation = this.generation
    if (this.disabled().includes(id)) return null
    const entry = await this.read(id)
    if (entry.info.error) throw new Error(entry.info.error)
    if (entry.info.permissions.length && !(await consent(entry.info))) return null
    // Never authorize code that changed while the consent dialog was open.
    if (
      generation !== this.generation ||
      this.disabled().includes(id) ||
      (await this.read(id)).hash !== entry.hash
    )
      throw new Error('Extension changed or was disabled during activation. Try again.')
    if (generation !== this.generation) throw new Error('Extension activation was cancelled.')
    this.deactivate(id)
    const token = randomUUID()
    this.sessions.set(token, {
      id,
      permissions: entry.info.permissions,
      controllers: new Set(),
      servers: new Map()
    })
    return { token, source: entry.source }
  }

  deactivate(id: string): void {
    for (const [token, session] of this.sessions)
      if (session.id === id) {
        this.sessions.delete(token)
        session.controllers.forEach((controller) => controller.abort())
        session.servers.forEach((server) => {
          server.close()
          server.closeAllConnections()
        })
      }
  }
  reconcile(): void {
    this.disabled().forEach((id) => this.deactivate(id))
  }
  dispose(): void {
    this.generation++
    ;[...this.sessions.values()].forEach((session) => this.deactivate(session.id))
  }

  async call(
    token: string,
    operation: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    const session = this.sessions.get(token)
    if (!session || this.disabled().includes(session.id))
      throw new Error('Extension is not active.')
    const required = {
      'web.request': 'web.request',
      'server.start': 'server.listen',
      'server.stop': 'server.listen',
      'filesystem.read': 'filesystem.read',
      'filesystem.list': 'filesystem.read',
      'filesystem.write': 'filesystem.write',
      'filesystem.mkdir': 'filesystem.write',
      'filesystem.remove': 'filesystem.write'
    }[operation]
    if (!required || !session.permissions.includes(required))
      throw new Error(`Permission denied: ${operation}`)
    const string = (key: string): string => {
      if (typeof args[key] !== 'string') throw new Error(`Expected string: ${key}`)
      return args[key] as string
    }
    if (operation.startsWith('filesystem.')) {
      const file = string('path')
      if (!path.isAbsolute(file)) throw new Error('Filesystem paths must be absolute.')
      switch (operation) {
        case 'filesystem.read': {
          const handle = await fs.open(file, 'r')
          try {
            const buffer = Buffer.alloc(limit + 1)
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
            if (bytesRead > limit) throw new Error('File exceeds 1 MiB.')
            return buffer.subarray(0, bytesRead).toString('utf8')
          } finally {
            await handle.close()
          }
        }
        case 'filesystem.list':
          return fs.readdir(file)
        case 'filesystem.write': {
          const data = string('data')
          if (Buffer.byteLength(data) > limit) throw new Error('File exceeds 1 MiB.')
          await fs.writeFile(file, data, 'utf8')
          return true
        }
        case 'filesystem.mkdir':
          await fs.mkdir(file, { recursive: true })
          return true
        case 'filesystem.remove':
          await fs.unlink(file)
          return true
      }
    }
    if (operation === 'web.request') {
      const url = new URL(string('url'))
      if (!['http:', 'https:'].includes(url.protocol))
        throw new Error('Only HTTP(S) URLs are supported.')
      const controller = new AbortController()
      session.controllers.add(controller)
      const timer = setTimeout(() => controller.abort(), 15000)
      try {
        const body = args.body === undefined ? undefined : string('body')
        if (body && Buffer.byteLength(body) > limit) throw new Error('Request exceeds 1 MiB.')
        const headers = args.headers as Record<string, string> | undefined
        if (
          headers &&
          (typeof headers !== 'object' ||
            !Object.values(headers).every((v) => typeof v === 'string'))
        )
          throw new Error('Invalid headers.')
        const response = await fetch(url, {
          method: args.method === undefined ? 'GET' : string('method'),
          headers,
          body,
          signal: controller.signal,
          redirect: 'error'
        })
        const chunks: Uint8Array[] = []
        let size = 0
        if (response.body)
          for await (const chunk of response.body) {
            size += chunk.length
            if (size > limit) {
              controller.abort()
              throw new Error('Response exceeds 1 MiB.')
            }
            chunks.push(chunk)
          }
        return {
          status: response.status,
          body: Buffer.concat(chunks).toString('utf8'),
          headers: Object.fromEntries(response.headers)
        }
      } finally {
        clearTimeout(timer)
        session.controllers.delete(controller)
      }
    }
    if (operation === 'server.stop') {
      const id = string('id')
      const server = session.servers.get(id)
      if (!server) throw new Error('Unknown server.')
      server.close()
      server.closeAllConnections()
      session.servers.delete(id)
      return true
    }
    if (session.servers.size >= 4) throw new Error('Maximum four servers per extension.')
    const port = args.port ?? 0
    if (!Number.isInteger(port) || Number(port) < 0 || Number(port) > 65535)
      throw new Error('Invalid port.')
    const body = string('body')
    if (Buffer.byteLength(body) > limit) throw new Error('Server response exceeds 1 MiB.')
    const server = createServer((_request, response) => {
      response.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      })
      response.end(body)
    })
    server.requestTimeout = 10000
    const id = randomUUID()
    session.servers.set(id, server)
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(Number(port), '127.0.0.1', resolve)
      })
      if (!this.sessions.has(token)) {
        server.close()
        server.closeAllConnections()
        throw new Error('Extension was deactivated.')
      }
      const address = server.address()
      return {
        id,
        url: `http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`
      }
    } catch (error) {
      session.servers.delete(id)
      throw error
    }
  }
}
