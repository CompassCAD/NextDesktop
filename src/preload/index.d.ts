import { ElectronAPI } from '@electron-toolkit/preload'
import { OpenDialogSyncOptions, SaveDialogSyncOptions } from 'electron'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onExtensionPermissionRequest: (callback: (request: { requestId: string; id: string; name: string; permissions: string[] }) => void) => () => void,
      respondExtensionPermission: (requestId: string, approved: boolean) => Promise<void>,
      listExtensions: () => Promise<Array<{ id: string; name: string; permissions: string[]; error?: string }>>,
      activateExtension: (id: string) => Promise<{ token: string; source: string } | null>,
      deactivateExtension: (id: string) => Promise<void>,
      extensionCall: (token: string, operation: string, args: Record<string, unknown>) => Promise<unknown>,
      settingsStorage: (operation: string, entries?: Record<string, string>) => { values?: Record<string, string>; error?: string },
      readFile: (filePath: string, encoding?: BufferEncoding) => string,
      writeFile: (filePath: string, data: string | Uint8Array | Buffer) => void,
      showOpenFileDialog: (options?: OpenDialogSyncOptions) => Promise<string[] | undefined>,
      showSaveFileDialog: (options?: SaveDialogSyncOptions) => Promise<string[] | undefined>,
      forwardLog: (source: any, args: any) => void,
      getAppVersion: () => Promise<string>,
      getExtensionLists: () => Promise<string[]>,
      openExternal: (url: string) => void,
      joinPathToRelativeAppPath: (destination: string) => string,
    },
    process: NodeJS.Process,
    updater: {
      check: () => Promise<any>;
      download: () => Promise<void>;
      previewDownload: () => Promise<void>;
      install: () => Promise<void>;
      onChecking: (cb: () => void) => () => void;
      onAvailable: (cb: (e: any, info: any) => void) => () => void;
      onNotAvailable: (cb: (e: any, info: any) => void) => () => void;
      onError: (cb: (e: any, msg: string) => void) => () => void;
      onProgress: (cb: (e: any, progress: any) => void) => () => void;
      onDownloaded: (cb: (e: any, info: any) => void) => () => void;
    }
  }
}
