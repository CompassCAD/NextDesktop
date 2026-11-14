import type { LuaPluginHost } from './LuaBridge'
import type { LoadError } from './types'
import { settingsStorage } from '../utils/SettingsStorage'

export function extensionBlacklist(): string[] {
  const value = JSON.parse(settingsStorage.getItem('extensionBlacklist') || '[]')
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string'))
    throw new Error('Invalid extension blacklist.')
  return value
}
let queue: Promise<unknown> = Promise.resolve()
const attempted = new Set<string>()
const failures = new Map<string, LoadError>()
const revisions = new Map<string, string>()
export function loadAllExtensions(host: LuaPluginHost): Promise<LoadError[]> {
  const next = queue.then(async () => {
    const extensions = await window.api.listExtensions()
    const disabled = extensionBlacklist()
    const savedRevisions = JSON.parse(settingsStorage.getItem('extensionPermissionRevisions') || '{}')
    for (const entry of extensions) {
      const revision = savedRevisions[entry.id] || ''
      if (revisions.has(entry.id) && revisions.get(entry.id) !== revision) {
        host.removeExtension(entry.id)
        await window.api.deactivateExtension(entry.id)
        attempted.delete(entry.id)
        failures.delete(entry.id)
      }
      revisions.set(entry.id, revision)
    }
    for (const id of host.extensionIds()) {
      if (disabled.includes(id) || !extensions.some((entry) => entry.id === id)) {
        host.removeExtension(id)
        await window.api.deactivateExtension(id)
      }
    }
    disabled.forEach((id) => {
      attempted.delete(id)
      failures.delete(id)
    })
    for (const entry of extensions) {
      if (disabled.includes(entry.id) || host.hasExtension(entry.id) || attempted.has(entry.id))
        continue
      attempted.add(entry.id)
      try {
        if (entry.error) throw new Error(entry.error)
        const activation = await window.api.activateExtension(entry.id)
        if (activation) {
          if (extensionBlacklist().includes(entry.id)) {
            await window.api.deactivateExtension(entry.id)
            continue
          }
          host.addExtension(entry.id, activation.source, activation.token)
        }
      } catch (error) {
        host.removeExtension(entry.id)
        await window.api.deactivateExtension(entry.id)
        failures.set(entry.id, { path: entry.id, error: String(error) })
      }
    }
    return [...failures.values()]
  })
  queue = next.catch(() => undefined)
  return next
}
