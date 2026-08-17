import { ElectronAPI } from '@electron-toolkit/preload'
import { OpenDialogSyncOptions } from 'electron'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readFile: (filePath: string) => string,
      writeFile: (filePath: string, data: string | Uint8Array | Buffer) => void,
      showOpenFileDialog: (options?: OpenDialogSyncOptions) => Promise<string[] | undefined>,
      forwardLog: (source: any, args: any) => void,
      getAppVersion: () => string
    },
    process: NodeJS.Process,
    updater: {
      check: () => Promise<any>;
      download: () => Promise<void>;
      previewDownload: () => Promise<void>;
      install: () => Promise<void>;
      onChecking: (cb: () => void) => void;
      onAvailable: (cb: (e: any, info: any) => void) => void;
      onNotAvailable: (cb: (e: any, info: any) => void) => void;
      onError: (cb: (e: any, msg: string) => void) => void;
      onProgress: (cb: (e: any, progress: any) => void) => void;
      onDownloaded: (cb: (e: any, info: any) => void) => void;
    }
  }
}
