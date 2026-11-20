import { GraphicsRenderer } from '../engine/Engine'
import { Component } from '../engine/Component'
import { LogicDisplay } from '../engine/Logic'
import { getLocaleKey } from '../locales/Locale'
import { convertDxfToCompassCad, parseDxf } from './dxfparse'
import { promptDxfImportOptions } from '../components/submodals/DxfImportModal'
import { toast } from '../components/Toast'
import { callGenericPrompt } from '../components/GenericPrompt'
import {
  decodeDocument,
  encodeDocument,
  defaultDocumentProperties,
  type DocumentProperties
} from './DocumentProperties'

let currentFilePath: string | undefined
const emptyDrawing = '[null,[]]'
const savedDrawings = new WeakMap<GraphicsRenderer, string>()
const snapshot = (renderer: GraphicsRenderer): string =>
  JSON.stringify([renderer.documentProperties, renderer.logicDisplay?.components ?? []])
let confirmingDeparture = false

export async function confirmDrawingDeparture(renderer: GraphicsRenderer): Promise<boolean> {
  if (confirmingDeparture) return false
  if (snapshot(renderer) === (savedDrawings.get(renderer) ?? emptyDrawing)) return true

  confirmingDeparture = true
  try {
    const choice = await callGenericPrompt(getLocaleKey('unsavedChanges.heading'), {
      body: getLocaleKey('unsavedChanges.body'),
      buttons: [
        { label: getLocaleKey('common.cancel'), value: 'cancel', role: 'cancel' },
        { label: getLocaleKey('unsavedChanges.discard'), value: 'discard' },
        { label: getLocaleKey('unsavedChanges.save'), value: 'save', role: 'confirm' }
      ]
    })
    if (choice === 'save') return await saveFile(renderer, { preserveProperties: true })
    return choice === 'discard'
  } finally {
    confirmingDeparture = false
  }
}

const extension = (path: string): string => path.split('.').pop()!.toLowerCase()
export const getDialogPath = (file: string | string[] | undefined): string | undefined =>
  Array.isArray(file) ? file[0] : file || undefined

export const createNewFile = (
  renderer: GraphicsRenderer,
  properties = defaultDocumentProperties()
): void => {
  renderer.setDocumentProperties(properties)
  renderer.logicDisplay!.components = []
  renderer.cleanUpBeforeImport()
  renderer.undoStack = ['[]']
  renderer.redoStack = []
  renderer.postDoAfterComponentImport()
  renderer.camX = renderer.camY = 0
  // A new sheet is a reference in the existing world-space viewport.
  renderer.onZoomUpdate?.()
  currentFilePath = undefined
  savedDrawings.delete(renderer)
  window.dispatchEvent(new Event('drawing-replaced'))
}

export function replaceDrawing(renderer: GraphicsRenderer, components: unknown[], properties: DocumentProperties | null, filePath?: string): void {
  // Construct everything before replacing the active design, including history.
  const staged = new LogicDisplay()
  staged.importJSON(components as Component[], staged.components)
  renderer.logicDisplay!.components = staged.components
  renderer.cleanUpBeforeImport()
  renderer.setDocumentProperties(properties)
  renderer.undoStack = [renderer.logicDisplay!.exportJSON()]
  renderer.redoStack = []
  renderer.postDoAfterComponentImport()
  renderer.fitDocumentPaper()
  currentFilePath = filePath
  if (filePath) savedDrawings.set(renderer, snapshot(renderer))
  else savedDrawings.delete(renderer)
  window.dispatchEvent(new Event('drawing-replaced'))
}

export const openFileAndParse = async (renderer: GraphicsRenderer): Promise<void> => {
  try {
    const file = await window.api.showOpenFileDialog({
      title: getLocaleKey('editor.sysdialogs.openFile'),
      filters: [
        { name: getLocaleKey('documentProperties.nextFiles'), extensions: ['cnext'] },
        { name: getLocaleKey('editor.sysdialogs.compassFiles'), extensions: ['ccad'] },
        { name: getLocaleKey('editor.sysdialogs.qrocadFiles'), extensions: ['qrocad', 'qrocad2'] },
        { name: 'AutoCAD DXF', extensions: ['dxf'] }
      ]
    })
    const filePath = getDialogPath(file)
    if (!filePath) return
    if (!(await confirmDrawingDeparture(renderer))) return
    const ext = extension(filePath)
    const source = window.api.readFile(filePath)
    let components: unknown[]
    let properties: DocumentProperties | null = null
    if (['cnext', 'ccad', 'qrocad', 'qrocad2'].includes(ext)) {
      ;({ components, properties } = decodeDocument(source, ext === 'cnext'))
    } else if (ext === 'dxf') {
      const doc = parseDxf(source)
      const fileName = filePath.replace(/^.*[\\/]/, '')
      const options = await promptDxfImportOptions(doc, fileName)
      if (!options) return
      components = convertDxfToCompassCad(source, options)
    } else throw new Error(getLocaleKey('documentProperties.unsupported'))
    replaceDrawing(renderer, components, properties, filePath)
    window.dispatchEvent(new Event('drawing-opened'))
  } catch (error) {
    void toast(getLocaleKey('documentProperties.openError') + ' ' + String(error))
  }
}

export const saveFile = async (
  renderer: GraphicsRenderer,
  options?: { forceSaveDialog?: boolean; preserveProperties?: boolean }
): Promise<boolean> => {
  try {
    // Properties always require Next format; imported formats are never overwritten.
    let targetPath = options?.forceSaveDialog ? undefined : currentFilePath
    if (
      targetPath &&
      extension(targetPath) !== 'cnext' &&
      (renderer.documentProperties || extension(targetPath) !== 'ccad')
    )
      targetPath = undefined
    if (!targetPath) {
      const base =
        currentFilePath?.replace(/\.[^.\\/]+$/, '') ||
        (
          renderer.documentProperties?.name || getLocaleKey('editor.sysdialogs.defaultName')
        ).replace(/[<>:"/\\|?*]/g, '_')
      targetPath = getDialogPath(
        await window.api.showSaveFileDialog({
          title: getLocaleKey('editor.sysdialogs.saveFile'),
          filters: [
            { name: getLocaleKey('documentProperties.nextFiles'), extensions: ['cnext'] },
            ...(options?.preserveProperties && renderer.documentProperties
              ? []
              : [{ name: getLocaleKey('editor.sysdialogs.compassFiles'), extensions: ['ccad'] }])
          ],
          defaultPath: base + '.cnext'
        })
      )
    }
    if (!targetPath) return false
    if (!/\.[^\\/.]+$/.test(targetPath)) targetPath += '.cnext'
    const next = extension(targetPath) === 'cnext'
    if (!next && extension(targetPath) !== 'ccad')
      throw new Error(getLocaleKey('documentProperties.unsupported'))
    if (!next && renderer.documentProperties) {
      if (options?.preserveProperties)
        throw new Error(getLocaleKey('unsavedChanges.nextRequired'))
      const answer = await callGenericPrompt(getLocaleKey('documentProperties.legacyWarningHeading'), {
        body: getLocaleKey('documentProperties.legacyWarning'),
        buttons: 'yesno'
      })
      if (answer !== 'yes') return false
    }
    const properties = renderer.documentProperties || {
      ...defaultDocumentProperties(),
      measurementUnit: renderer.unitMeasure as DocumentProperties['measurementUnit'],
      measurementPrecision: renderer.measurementPrecision
    }
    window.api.writeFile(
      targetPath,
      encodeDocument(renderer.logicDisplay!.components, properties, next)
    )
    if (next && !renderer.documentProperties) renderer.setDocumentProperties(properties)
    // A legacy export does not redirect subsequent saves away from the Next document.
    const saved = next || !renderer.documentProperties
    if (saved) {
      currentFilePath = targetPath
      savedDrawings.set(renderer, snapshot(renderer))
      window.dispatchEvent(new Event('drawing-saved'))
    }
    void toast(getLocaleKey('editor.sysdialogs.saved').replace('{path}', () => targetPath!))
    return saved
  } catch (error) {
    void toast(getLocaleKey('documentProperties.saveError') + ' ' + String(error))
    return false
  }
}
