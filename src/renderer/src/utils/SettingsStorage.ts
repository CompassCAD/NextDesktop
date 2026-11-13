/** Synchronous localStorage method-compatible API backed by .compasscfg. */
let values: Record<string, string> | undefined
export const SETTINGS_CHANGED = 'compasscad:settings-changed'
function request(operation: string, entries?: Record<string, string>): Record<string, string> {
  const result = window.api.settingsStorage(operation, entries)
  if (result.error || !result.values) throw new Error(result.error || 'Unable to load settings.')
  values = result.values
  return values
}
function read(): Record<string, string> {
  return values ?? request('read')
}
function update(operation: string, entries?: Record<string, string>): void {
  request(operation, entries)
  window.dispatchEvent(new Event(SETTINGS_CHANGED))
}
export const settingsStorage = {
  get length(): number {
    return Object.keys(read()).length
  },
  key(index: number): string | null {
    return Object.keys(read())[index >>> 0] ?? null
  },
  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(read(), String(key)) ? read()[String(key)] : null
  },
  setItem(key: string, value: string): void {
    update('set', { [String(key)]: String(value) })
  },
  removeItem(key: string): void {
    update('remove', { [String(key)]: '' })
  },
  clear(): void {
    update('clear')
  },
  /** Save a modal draft in one atomic file replacement. */
  setItems(entries: Record<string, string>): void {
    update(
      'set',
      Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, String(value)]))
    )
  }
}

export function migrateSettings(): void {
  if (settingsStorage.getItem('_migratedLocalStorage') === 'true') return
  const entries: Record<string, string> = { _migratedLocalStorage: 'true' }
  for (const key of ['language', 'PUBLICBETA_DoNotShowThatShitEverAgain']) {
    const value = localStorage.getItem(key)
    if (value !== null && settingsStorage.getItem(key) === null) entries[key] = value
  }
  settingsStorage.setItems(entries)
}
