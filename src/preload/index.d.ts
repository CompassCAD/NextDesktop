import { ElectronAPI } from '@electron-toolkit/preload'
import { OpenDialogSyncOptions } from 'electron'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      readFile: (filePath: string) => string,
      writeFile: (filePath: string, data: string) => void,
      showOpenFileDialog: (options?: OpenDialogSyncOptions) => Promise<string[] | undefined>,
      forwardLog: (args: any) => void
    },
    process: NodeJS.Process,
  }
}
