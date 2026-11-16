import { GraphicsRenderer } from '../engine/Engine'
import { Component } from '../engine/Component'
import { LogicDisplay } from '../engine/Logic'
import { getLocaleKey } from '../locales/Locale'
import { convertDxfToCompassCad } from './dxfparse'
import { toast } from '../components/Toast'
import { callGenericPrompt } from '../components/GenericPrompt'
import {
  decodeDocument,
  encodeDocument,
  defaultDocumentProperties,
  type DocumentProperties
} from './DocumentProperties'

let currentFilePath: string | undefined
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
    const ext = extension(filePath)
    const source = window.api.readFile(filePath)
    let components: unknown[]
    let properties: DocumentProperties | null = null
    if (['cnext', 'ccad', 'qrocad', 'qrocad2'].includes(ext)) {
      ;({ components, properties } = decodeDocument(source, ext === 'cnext'))
    } else if (ext === 'dxf') {
      components = convertDxfToCompassCad(source, { scale: 10, flipY: true })
    } else throw new Error(getLocaleKey('documentProperties.unsupported'))
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
  } catch (error) {
    void toast(getLocaleKey('documentProperties.openError') + ' ' + String(error))
  }
}

export const saveFile = async (
  renderer: GraphicsRenderer,
  options?: { forceSaveDialog?: boolean }
): Promise<void> => {
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
            { name: getLocaleKey('editor.sysdialogs.compassFiles'), extensions: ['ccad'] }
          ],
          defaultPath: base + '.cnext'
        })
      )
    }
    if (!targetPath) return
    if (!/\.[^\\/.]+$/.test(targetPath)) targetPath += '.cnext'
    const next = extension(targetPath) === 'cnext'
    if (!next && extension(targetPath) !== 'ccad')
      throw new Error(getLocaleKey('documentProperties.unsupported'))
    if (
      !next &&
      renderer.documentProperties &&
      (await callGenericPrompt(getLocaleKey('documentProperties.legacyWarning'), {
        buttons: 'yesno'
      })) !== 'yes'
    )
      return
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
    if (next || !renderer.documentProperties) currentFilePath = targetPath
    void toast(getLocaleKey('editor.sysdialogs.saved').replace('{path}', () => targetPath!))
  } catch (error) {
    void toast(getLocaleKey('documentProperties.saveError') + ' ' + String(error))
  }
}
