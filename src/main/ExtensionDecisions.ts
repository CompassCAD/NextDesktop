import type { SettingsStore } from './SettingsStore'

/** Decisions are scoped to an extension's exact source and a user-controlled reset revision. */
export class ExtensionDecisions {
  constructor(private store: SettingsStore) {}

  revision(id: string): string {
    return JSON.parse(this.store.read().extensionPermissionRevisions || '{}')[id] || ''
  }

  get(id: string, hash: string, revision: string): boolean | undefined {
    const entry = JSON.parse(this.store.read().extensionPermissionDecisions || '{}')[id]
    if (entry?.hash === hash && entry.revision === revision && typeof entry.approved === 'boolean') {
      return entry.approved
    }
    return undefined
  }

  set(id: string, hash: string, revision: string, approved: boolean): void {
    const decisions = JSON.parse(this.store.read().extensionPermissionDecisions || '{}')
    if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions)) {
      throw new Error('Invalid saved extension permission decisions.')
    }
    this.store.update('set', {
      extensionPermissionDecisions: JSON.stringify({ ...decisions, [id]: { hash, revision, approved } })
    })
  }
}
