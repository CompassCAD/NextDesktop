import { contextBridge, ipcRenderer, OpenDialogSyncOptions } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'node:original-fs';
import { writeFile } from 'fs';

// Custom APIs for renderer
const api = {
  readFile: (filePath: string) => fs.readFileSync(filePath, 'utf-8'),
  writeFile: (filePath: string, data: string | Uint8Array | Buffer) => fs.writeFileSync(filePath, data, 'utf-8'),
  showOpenFileDialog: (options: OpenDialogSyncOptions) =>
    ipcRenderer.invoke('dialog:showOpenFileDialog', options),
  forwardLog: (source: any, args: any) => ipcRenderer.send('renderer-log', source, args),
  getAppVersion: () => ipcRenderer.invoke('req-version')
}

const updater = {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),

  onChecking: (cb: () => void) => ipcRenderer.on('update:checking', cb),
  onAvailable: (cb: (e: any, info: any) => void) => ipcRenderer.on('update:available', cb),
  onNotAvailable: (cb: (e: any, info: any) => void) => ipcRenderer.on('update:not-available', cb),
  onError: (cb: (e: any, msg: string) => void) => ipcRenderer.on('update:error', cb),
  onProgress: (cb: (e: any, progress: any) => void) => ipcRenderer.on('update:progress', cb),
  onDownloaded: (cb: (e: any, info: any) => void) => ipcRenderer.on('update:downloaded', cb),
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('updater', updater)
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
  // @ts-ignore
  window.updater = updater
}
