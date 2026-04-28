const path = require('node:path')
const { app, BrowserWindow, ipcMain } = require('electron')

const isDev = !app.isPackaged
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let controlWindow = null
let outputWindow = null

function getPreloadPath() {
  return path.join(__dirname, 'preload.cjs')
}

function loadRendererWindow(windowRef, mode) {
  if (isDev) {
    windowRef.loadURL(`${devServerUrl}?window=${mode}`)
    windowRef.webContents.openDevTools({ mode: 'detach' })
    return
  }

  windowRef.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'), {
    query: { window: mode },
  })
}

function createControlWindow() {
  controlWindow = new BrowserWindow({
    title: 'SCALEZ Vision Engine - Control',
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 780,
    backgroundColor: '#050914',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadRendererWindow(controlWindow, 'control')

  controlWindow.on('closed', () => {
    controlWindow = null
    if (!outputWindow) {
      app.quit()
    }
  })
}

function createOutputWindow() {
  outputWindow = new BrowserWindow({
    title: 'SCALEZ Vision Engine - Output',
    width: 1920,
    height: 1080,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadRendererWindow(outputWindow, 'output')

  outputWindow.on('closed', () => {
    outputWindow = null
  })
}

function registerIpcHandlers() {
  ipcMain.handle('output:toggle-fullscreen', () => {
    if (!outputWindow) {
      return false
    }

    const nextState = !outputWindow.isFullScreen()
    outputWindow.setFullScreen(nextState)
    return nextState
  })

  ipcMain.handle('output:set-fullscreen', (_event, shouldFullscreen) => {
    if (!outputWindow) {
      return false
    }

    outputWindow.setFullScreen(Boolean(shouldFullscreen))
    return outputWindow.isFullScreen()
  })

  ipcMain.handle('app:get-platform', () => process.platform)
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createControlWindow()
  createOutputWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
      createOutputWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
