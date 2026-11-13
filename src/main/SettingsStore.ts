import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/** Commit to disk before publishing a new in-memory state. */
export class SettingsStore {
  private values: Record<string, string> | undefined
  constructor(readonly filePath: string) {}

  read(): Record<string, string> {
    if (!this.values) {
      if (!existsSync(this.filePath)) return {}
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf8'))
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        Object.values(parsed).some((value) => typeof value !== 'string')
      ) {
        throw new Error('Invalid .compasscfg: expected a JSON object containing string values.')
      }
      this.values = Object.assign(Object.create(null), parsed)
    }
    return { ...this.values }
  }

  update(operation: string, entries: Record<string, string> = {}): Record<string, string> {
    const next =
      operation === 'clear' ? Object.create(null) : Object.assign(Object.create(null), this.read())
    if (operation === 'set') {
      for (const [key, value] of Object.entries(entries)) {
        if (typeof value !== 'string') throw new Error('Settings values must be strings.')
        next[key] = value
      }
    } else if (operation === 'remove') {
      for (const key of Object.keys(entries)) delete next[key]
    } else if (operation !== 'clear') throw new Error('Unknown settings operation.')
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporary = this.filePath + '.tmp'
    writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8')
    renameSync(temporary, this.filePath)
    this.values = next
    return this.read()
  }
}
