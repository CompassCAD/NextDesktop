import { contextBridge, ipcRenderer, OpenDialogSyncOptions } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import fs from 'node:original-fs';
import path from 'path'

// Custom APIs for renderer
const api = {
  onExtensionPermissionRequest: (callback: (request: { requestId: string; id: string; name: string; permissions: string[] }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: Parameters<typeof callback>[0]): void => callback(request)
    ipcRenderer.on('extensions:permission-request', listener)
    return () => { ipcRenderer.removeListener('extensions:permission-request', listener) }
  },
  respondExtensionPermission: (requestId: string, approved: boolean) => ipcRenderer.invoke('extensions:permission-response', requestId, approved),
  listExtensions: () => ipcRenderer.invoke('extensions:list'),
  activateExtension: (id: string) => ipcRenderer.invoke('extensions:activate', id),
  deactivateExtension: (id: string) => ipcRenderer.invoke('extensions:deactivate', id),
  extensionCall: (token: string, operation: string, args: Record<string, unknown>) => ipcRenderer.invoke('extensions:call', token, operation, args),
  settingsStorage: (operation: string, entries?: Record<string, string>) =>
    ipcRenderer.sendSync('settings:storage', operation, entries),
  readFile: (filePath: string, encoding?: BufferEncoding) => fs.readFileSync(filePath, encoding || 'utf-8'),
  writeFile: (filePath: string, data: string | Uint8Array | Buffer) => fs.writeFileSync(filePath, data, 'utf-8'),
  showOpenFileDialog: (options: OpenDialogSyncOptions) =>
    ipcRenderer.invoke('dialog:showOpenFileDialog', options),
  showSaveFileDialog: (options: OpenDialogSyncOptions) =>
    ipcRenderer.invoke('dialog:showSaveFileDialog', options),
  forwardLog: (source: any, args: any) => ipcRenderer.send('renderer-log', source, args),
  getAppVersion: () => ipcRenderer.invoke('req-version'),
  getExtensionLists: async () => {
    const extensionDir: string = await ipcRenderer.invoke('extensions:fetch')

    if (!fs.existsSync(extensionDir)) return []

    return fs
      .readdirSync(extensionDir)
      .filter((name) => name.toLowerCase().endsWith('.lua'))
      .map((name) => path.join(extensionDir, name))
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  joinPathToRelativeAppPath: (destination: string) => path.join(ipcRenderer.sendSync('app:getAppPath'), destination)
}

function subscribeUpdate(channel: string, callback: (...args: any[]) => void): () => void {
  ipcRenderer.on(channel, callback)
  return () => { ipcRenderer.removeListener(channel, callback) }
}
const updater = {
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  previewDownload: () => ipcRenderer.invoke('update:preview-download'),
  install: () => ipcRenderer.invoke('update:install'),

  onChecking: (cb: () => void) => subscribeUpdate('update:checking', cb),
  onAvailable: (cb: (e: any, info: any) => void) => subscribeUpdate('update:available', cb),
  onNotAvailable: (cb: (e: any, info: any) => void) => subscribeUpdate('update:not-available', cb),
  onError: (cb: (e: any, msg: string) => void) => subscribeUpdate('update:error', cb),
  onProgress: (cb: (e: any, progress: any) => void) => subscribeUpdate('update:progress', cb),
  onDownloaded: (cb: (e: any, info: any) => void) => subscribeUpdate('update:downloaded', cb),
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
