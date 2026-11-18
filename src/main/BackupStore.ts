import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const filename = /^backup-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}\.nextbackup$/

export class BackupStore {
  constructor(readonly directory: string) {}

  private get marker(): string { return path.join(this.directory, '.compasscad-recovery') }

  write(source: string): string {
    if (typeof source !== 'string') throw new Error('Invalid backup')
    fs.mkdirSync(this.directory, { recursive: true })
    const temp = path.join(this.directory, randomUUID() + '.tmp')
    try {
      fs.writeFileSync(temp, source, { flag: 'wx' })
      const date = new Date()
      for (;;) {
        const parts = [date.getDate(), date.getMonth() + 1, date.getFullYear(), date.getHours(), date.getMinutes(), date.getSeconds()]
        const name = 'backup-' + parts.map(n => String(n).padStart(2, '0')).join('-') + '.nextbackup'
        try {
          fs.linkSync(temp, path.join(this.directory, name))
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          date.setSeconds(date.getSeconds() + 1)
          continue
        }
        fs.unlinkSync(temp)
        fs.writeFileSync(temp, name, { flag: 'wx' })
        fs.renameSync(temp, this.marker)
        return name
      }
    } finally {
      fs.rmSync(temp, { force: true })
    }
  }

  pending(): string | undefined {
    try { return fs.readFileSync(this.marker, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return undefined
  }

  dismiss(name: string): void {
    if (name === this.pending()) fs.unlinkSync(this.marker)
  }

  read(name: string): string {
    if (typeof name !== 'string' || !filename.test(name)) throw new Error('Invalid backup name')
    return fs.readFileSync(path.join(this.directory, name), 'utf8')
  }
}
