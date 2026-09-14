import { GraphicsRenderer } from '../engine/Engine'
import { Component } from '../engine/Component'
import { getLocaleKey } from '../locales/Locale'
import { convertDxfToCompassCad } from './dxfparse'

let currentFilePath: string | undefined

const getDialogPath = (file: string | string[] | undefined): string | undefined => {
  if (!file) return undefined
  if (Array.isArray(file)) return file[0]
  return file
}

export const openFileAndParse = async (renderer: GraphicsRenderer): Promise<void> => {
  const file = await window.api.showOpenFileDialog({
    title: getLocaleKey('editor.sysdialogs.openFile'),
    filters: [
      // { name: 'CompassCAD NEXT Files', extensions: ['cnext'] }, <- Still haven't planned on .cnext (could be an SQLite file ig)
      { name: 'CompassCAD Files', extensions: ['ccad'] },
      { name: 'QroCAD Files', extensions: ['qrocad', 'qrocad2'] },
      { name: 'AutoCAD DXF', extensions: ['dxf'] }
    ]
  })
  const filePath = getDialogPath(file)
  if (filePath != undefined) {
    console.log(filePath)
    const fileContent = window.api.readFile(filePath)
    try {
      let parsedData: unknown
      if (
        filePath.includes('ccad') ||
        filePath.includes('qrocad') ||
        filePath.includes('qrocad2')
      ) {
        parsedData = JSON.parse(fileContent)
      } else if (filePath.includes('dxf')) {
        parsedData = convertDxfToCompassCad(fileContent, {
          scale: 10,
          flipY: true
        })
      } else {
        return
      }
      renderer!.logicDisplay!.components = []
      renderer?.cleanUpBeforeImport()
      renderer!.logicDisplay?.importJSON(
        parsedData as Component[],
        renderer!.logicDisplay.components
      )
      renderer?.postDoAfterComponentImport()
      currentFilePath = filePath
    } catch (e) {
      console.error('[windowbar] failed to open file: ', e)
    }
  }
}

export const saveFile = async (
  renderer: GraphicsRenderer,
  options?: { forceSaveDialog?: boolean }
): Promise<void> => {
  let targetPath = options?.forceSaveDialog ? undefined : currentFilePath

  if (!targetPath) {
    const file = await window.api.showSaveFileDialog({
      title: getLocaleKey('editor.sysdialogs.saveFile'),
      filters: [{ name: 'CompassCAD Files', extensions: ['ccad'] }],
      defaultPath: currentFilePath ?? 'My Design.ccad'
    })
    targetPath = getDialogPath(file)
  }

  if (targetPath != undefined) {
    console.log('Saving file to: ', targetPath)
    const fileContent = renderer!.logicDisplay!.exportJSON()
    window.api.writeFile(targetPath, fileContent)
    currentFilePath = targetPath
  }
}
