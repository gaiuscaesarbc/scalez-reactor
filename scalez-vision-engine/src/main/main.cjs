const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, ipcMain } = require('electron')
const { dialog } = require('electron')

const isDev = !app.isPackaged
const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'

let controlWindow = null
let outputWindow = null
let sharedOutputState = {
  layers: [],
  masterFx: {
    glow: 0.25,
    strobe: 0,
    shake: 0,
    brightness: 1,
  },
  blackout: false,
  audio: {
    bassLevel: 0.2,
  },
  updatedAt: Date.now(),
}

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
      webSecurity: !isDev,
      allowRunningInsecureContent: isDev,
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
      webSecurity: !isDev,
      allowRunningInsecureContent: isDev,
    },
  })

  loadRendererWindow(outputWindow, 'output')

  outputWindow.webContents.on('did-finish-load', () => {
    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('output:state-update', sharedOutputState)
    }
  })

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

  ipcMain.handle('clips:pick-video', async () => {
    const windowRef = BrowserWindow.getFocusedWindow() || controlWindow
    const result = await dialog.showOpenDialog(windowRef, {
      title: 'Load Video Clip',
      properties: ['openFile'],
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    return {
      filePath,
      clipName: path.basename(filePath),
    }
  })

  ipcMain.handle('clips:path-exists', (_event, targetPath) => {
    if (!targetPath || typeof targetPath !== 'string') {
      return false
    }
    return fs.existsSync(targetPath)
  })

  ipcMain.on('output:state-publish', (_event, nextState) => {
    if (!nextState || typeof nextState !== 'object') {
      return
    }

    sharedOutputState = {
      ...sharedOutputState,
      ...nextState,
      updatedAt: Date.now(),
    }

    if (outputWindow && !outputWindow.isDestroyed()) {
      outputWindow.webContents.send('output:state-update', sharedOutputState)
    }
  })

  ipcMain.handle('output:state-get', () => sharedOutputState)
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
