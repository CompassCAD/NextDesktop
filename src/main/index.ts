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
autoUpdater.forceDevUpdateConfig = !app.isPackaged;

// WIP: adding user consent to download updates
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// Declare mainWindow as a global variable
let mainWindow: BrowserWindow | null = null;

const send = (channel: string, ...args: any[]) => {
  mainWindow?.webContents.send(channel, ...args);
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
      sandbox: false
    }
  })

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
ipcMain.on('renderer-log', (_event, source, args) => {
  console.log(`[${source}]`, ...args);
});
ipcMain.handle('req-version', () => app.getVersion());
ipcMain.handle('update:check', () => autoUpdater.checkForUpdates());
ipcMain.handle('update:download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
