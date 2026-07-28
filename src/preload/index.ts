import { contextBridge, ipcRenderer, OpenDialogSyncOptions } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'node:original-fs';
import { writeFile } from 'fs';

// Custom APIs for renderer
const api = {
  readFile: (filePath: string) => fs.readFileSync(filePath, 'utf-8'),
  writeFile: (filePath: string, data: string) => fs.writeFileSync(filePath, data, 'utf-8'),
  showOpenFileDialog: (options: OpenDialogSyncOptions) =>
    ipcRenderer.invoke('dialog:showOpenFileDialog', options),
  forwardLog: (args: any) => ipcRenderer.send('renderer-log', args)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('process', process)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore
  window.process = process
}
