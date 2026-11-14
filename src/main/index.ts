import { ExtensionDecisions } from './ExtensionDecisions'
import { CompassMcpServer } from './CompassMcpServer'
import { readMcpSettings } from '../shared/Mcp'
import { ExtensionService } from './ExtensionService'
import { randomUUID } from 'node:crypto'
import { SettingsStore } from './SettingsStore'
import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import path from 'path';
import * as fs from 'fs'; // <- Prone to breaking ig

autoUpdater.logger = log;
(autoUpdater.logger as typeof log).transports.file.level = 'info';
if (!app.isPackaged) {
  autoUpdater.forceDevUpdateConfig = true;
  autoUpdater.updateConfigPath = path.join(app.getAppPath(), 'dev-app-update.yml');
}

// WIP: adding user consent to download updates
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Declare mainWindow as a global variable
let mainWindow: BrowserWindow | null = null;

const send = (channel: string, ...args: any[]) => {
  mainWindow?.webContents.send(channel, ...args);
}

const updatePreviewDurationMs = Math.max(
  1_000,
  Number.parseInt(process.env.UPDATE_MODAL_PREVIEW_DURATION_MS ?? '200000', 10) || 20_000
)
let updatePreviewTimer: NodeJS.Timeout | undefined

function previewSlowUpdateDownload(): void {
  if (!is.dev) {
    throw new Error('The update download preview is only available in development.')
  }

  if (updatePreviewTimer) return

  const startedAt = Date.now()
  const tick = (): void => {
    const percent = Math.min(100, ((Date.now() - startedAt) / updatePreviewDurationMs) * 100)
    send('update:progress', { percent })

    if (percent === 100) {
      updatePreviewTimer = undefined
      send('update:downloaded', { version: app.getVersion() })
      return
    }

    updatePreviewTimer = setTimeout(tick, 250)
  }

  tick()
}

autoUpdater.on('checking-for-update', () => send('update:checking'));
autoUpdater.on('update-available', (info) => send('update:available', info));
autoUpdater.on('update-not-available', (info) => send('update:not-available', info));
autoUpdater.on('error', (err) => send('update:error', err.message));
autoUpdater.on('download-progress', (progress) => send('update:progress', progress));
autoUpdater.on('update-downloaded', (info) => send('update:downloaded', info));

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 600,
    minHeight: 400,
    minWidth: 720,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    icon: icon,
    // ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      backgroundThrottling: false
    }
  })

  mainWindow.webContents.on('did-start-loading', () => { extensionService.dispose(); disconnectMcpRenderer() })
  mainWindow.on('closed', () => { extensionService.dispose(); disconnectMcpRenderer() })
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('isMaximized', true);
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('isMaximized', false)
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('dev.zeankun.compasscad')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow();
  mainWindow?.webContents.send('isMaximized', mainWindow?.isMaximized());

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  });

  if (!fs.existsSync(path.join(app.getPath('userData'), 'extensions'))) {
    fs.mkdirSync(path.join(app.getPath('userData'), 'extensions'))
  }

  autoUpdater.checkForUpdatesAndNotify().catch(() => {
    console.log('[updater] offline or no updates available, skipping');
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.on('minimize', () => mainWindow?.minimize())
ipcMain.on('maximize', () => {
  mainWindow?.isMaximized() ? mainWindow?.unmaximize() : mainWindow?.maximize()
  mainWindow?.webContents.send('isMaximized', mainWindow?.isMaximized());
})
ipcMain.on('fullscreen', () => {
  mainWindow?.setFullScreen(!mainWindow.isFullScreen());
})
ipcMain.on('close', () => mainWindow?.close())
ipcMain.handle('dialog:showOpenFileDialog', (_event, options) => {
  return dialog.showOpenDialogSync(options)
})
ipcMain.handle('dialog:showSaveFileDialog', (_event, options) => {
  return dialog.showSaveDialogSync(options)
})
ipcMain.handle('extensions:fetch', () => {
  console.log(`I am looking at ${path.join(app.getPath('userData'), 'extensions')}`)
  return path.join(app.getPath('userData'), 'extensions')
})
ipcMain.handle('app:openExternal', (_event, url) => {
  console.log(`Opening external URL: ${url}`)
  shell.openExternal(url)
})
ipcMain.on('app:getAppPath', (event) => {
  event.returnValue = app.getPath('userData')
})
ipcMain.on('renderer-log', (_event, source, args) => {
  console.log(`[${source}]`, ...args);
});
ipcMain.handle('req-version', () => app.getVersion());
ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:preview-download', () => previewSlowUpdateDownload());
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

const settingsStore = new SettingsStore(path.join(app.getPath('appData'), 'compasscad', '.compasscfg'))
ipcMain.on('settings:storage', (event, operation: string, entries?: Record<string, string>) => {
  try {
    if (event.sender !== mainWindow?.webContents) throw new Error('Unknown settings sender.')
    if (operation !== 'read') {
      const hasBlacklist = entries && Object.prototype.hasOwnProperty.call(entries, 'extensionBlacklist')
      const nextBlacklist = operation === 'clear' || (operation === 'remove' && hasBlacklist)
        ? '[]' : operation === 'set' && hasBlacklist
          ? entries!.extensionBlacklist : settingsStore.read().extensionBlacklist || '[]'
      const blacklist = JSON.parse(nextBlacklist)
      if (!Array.isArray(blacklist) || !blacklist.every((id) => typeof id === 'string')) throw new Error('Invalid extension blacklist.')
    }
    if (operation !== 'read') {
      const draft = operation === 'clear' ? {} : { ...settingsStore.read() }
      if (operation === 'set') Object.assign(draft, entries)
      if (operation === 'remove') for (const key of Object.keys(entries ?? {})) delete draft[key]
      readMcpSettings(draft)
    }
    const values = operation === 'read' ? settingsStore.read() : settingsStore.update(operation, entries)
    if (operation !== 'read') void mcpServer.configure(values)
    if (operation !== 'read') extensionService.reconcile()
    event.returnValue = { values }
  } catch (error) {
    event.returnValue = { error: error instanceof Error ? error.message : String(error) }
  }
})

const extensionService = new ExtensionService(path.join(app.getPath('userData'), 'extensions'), () => {
  const value = JSON.parse(settingsStore.read().extensionBlacklist || '[]')
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) throw new Error('Invalid extension blacklist.')
  return value
}, new ExtensionDecisions(settingsStore))
function checkExtensionSender(event: Electron.IpcMainInvokeEvent): void {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown extension sender.')
}
ipcMain.handle('extensions:list', (event) => { checkExtensionSender(event); return extensionService.list() })
const permissionRequests = new Map<string, (approved: boolean) => void>()
ipcMain.handle('extensions:permission-response', (event, requestId: string, approved: boolean) => {
  checkExtensionSender(event)
  permissionRequests.get(requestId)?.(approved === true)
})
ipcMain.handle('extensions:activate', async (event, id: string) => {
  checkExtensionSender(event)
  return extensionService.activate(id, (info) => new Promise<boolean>((resolve) => {
    const requestId = randomUUID()
    const sender = event.sender
    const cancel = (): void => finish(false)
    const finish = (approved: boolean): void => {
      permissionRequests.delete(requestId)
      sender.removeListener('destroyed', cancel)
      sender.removeListener('did-start-loading', cancel)
      resolve(approved)
    }
    permissionRequests.set(requestId, finish)
    sender.once('destroyed', cancel)
    sender.once('did-start-loading', cancel)
    sender.send('extensions:permission-request', { requestId, ...info })
  }))
})
ipcMain.handle('extensions:deactivate', (event, id: string) => { checkExtensionSender(event); extensionService.deactivate(id) })
ipcMain.handle('extensions:call', (event, token: string, operation: string, args: Record<string, unknown>) => {
  checkExtensionSender(event)
  return extensionService.call(token, operation, args)
})
app.on('before-quit', () => extensionService.dispose())

let mcpRendererReady = false
const mcpPending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>()
const mcpServer = new CompassMcpServer(request => new Promise((resolve, reject) => {
  if (!mcpRendererReady || !mainWindow || mainWindow.isDestroyed()) return reject(new Error('The drawing renderer is not ready.'))
  if (mcpPending.size >= 64) return reject(new Error('Too many pending drawing requests.'))
  const timer = setTimeout(() => { mcpPending.delete(request.id); reject(new Error('Renderer timed out. Read the design before retrying.')) }, 46_000)
  mcpPending.set(request.id, { resolve, reject, timer })
  mainWindow.webContents.send('mcp:request', request)
}), agents => { if (mcpRendererReady) send('mcp:agents', agents) })
function disconnectMcpRenderer(): void {
  mcpRendererReady = false
  for (const request of mcpPending.values()) { clearTimeout(request.timer); request.reject(new Error('Drawing renderer disconnected.')) }
  mcpPending.clear()
}
ipcMain.handle('mcp:status', event => { checkExtensionSender(event); return mcpServer.status() })
ipcMain.handle('mcp:apply', event => { checkExtensionSender(event); return mcpServer.configure(settingsStore.read()) })
ipcMain.handle('mcp:ready', async (event, ready: boolean) => {
  checkExtensionSender(event)
  if (!ready) { disconnectMcpRenderer(); return }
  mcpRendererReady = true
  await mcpServer.configure(settingsStore.read())
  send('mcp:agents', mcpServer.status().agents)
})
ipcMain.on('mcp:reply', (event, id: string, reply: { result?: unknown; error?: string }) => {
  if (event.sender !== mainWindow?.webContents || event.senderFrame !== event.sender.mainFrame) return
  const request = mcpPending.get(id)
  if (!request) return
  clearTimeout(request.timer)
  mcpPending.delete(id)
  if (reply.error) request.reject(new Error(reply.error))
  else request.resolve(reply.result)
})
app.on('before-quit', () => { disconnectMcpRenderer(); void mcpServer.stop() })
