import { isComponentList } from '../engine/Logic'
import type { GraphicsRenderer } from '../engine/Engine'
import { getLocaleKey } from '../locales/Locale'
import { toast } from '../components/Toast'
import { decodeDocument } from './DocumentProperties'
import { confirmDrawingDeparture, replaceDrawing } from './FileImporter'

function failure(error: unknown): void {
  void toast(getLocaleKey('workflow.backupError') + ' ' + String(error))
}

export async function openBackup(renderer: GraphicsRenderer, pending?: string): Promise<boolean> {
  try {
    const name = pending ?? await window.api.chooseBackup(getLocaleKey('editor.menu.openBackups'))
    if (!name) return false
    const source = await window.api.readBackup(name)
    const drawing = decodeDocument(source, !source.trimStart().startsWith('['))
    if (!isComponentList(drawing.components)) throw new Error(getLocaleKey('workflow.invalidBackup'))
    if (!(await confirmDrawingDeparture(renderer))) return false
    replaceDrawing(renderer, drawing.components, drawing.properties)
    renderer.setMode(renderer.modes.Select)
    return true
  } catch (error) { failure(error); return false }
}

export function startRecovery(renderer: GraphicsRenderer): () => void {
  // History contains committed geometry, including undo/redo, without drag previews.
  const snapshot = (): string => {
    const geometry = renderer.undoStack.at(-1) ?? '[]'
    return renderer.documentProperties
      ? '{"format":"CompassCAD.Next","version":1,"document":' + JSON.stringify(renderer.documentProperties) + ',"components":' + geometry + '}'
      : geometry
  }
  let previous = snapshot()
  let revision = 0
  let busy = false
  let disposed = false
  let lastName: string | undefined
  const saved = (): void => {
    revision++
    previous = snapshot()
    if (lastName) void window.api.dismissBackup(lastName).catch(failure)
    lastName = undefined
  }
  const tick = async (): Promise<void> => {
    if (busy) return
    const source = snapshot()
    if (source === previous) return
    busy = true
    const version = revision
    try {
      const name = await window.api.writeBackup(source)
      if (version === revision) { previous = source; lastName = name }
      else await window.api.dismissBackup(name)
    } catch (error) { failure(error) }
    finally { busy = false }
  }
  const timer = window.setInterval(() => void tick(), 15000)
  window.addEventListener('drawing-saved', saved)
  window.addEventListener('drawing-opened', saved)
  return () => {
    disposed = true
    clearInterval(timer)
    window.removeEventListener('drawing-saved', saved)
    window.removeEventListener('drawing-opened', saved)
  }
}
