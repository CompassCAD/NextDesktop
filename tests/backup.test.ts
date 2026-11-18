import { expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BackupStore } from '../src/main/BackupStore'

test('backups survive restart, same-second writes and stale acknowledgements', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'compass-backups-'))
  try {
    const store = new BackupStore(directory)
    expect(store.pending()).toBeUndefined()
    const first = store.write('[]')
    const second = store.write('[{"active":true,"type":1}]')
    const reopened = new BackupStore(directory)
    expect(first).toMatch(/^backup-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}-\d{2}\.nextbackup$/)
    expect(first).not.toBe(second)
    expect(reopened.read(first)).toBe('[]')
    reopened.dismiss(first)
    expect(reopened.pending()).toBe(second)
    reopened.dismiss(second)
    expect(reopened.pending()).toBeUndefined()
    expect(reopened.read(second)).toContain('"active"')
    expect(() => reopened.read('../other')).toThrow()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
