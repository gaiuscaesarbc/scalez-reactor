const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow, ipcMain, protocol, net, session } = require('electron')
const { dialog } = require('electron')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'scalez-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

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
          name: 'Preferred (MP4 H.264, WebM VP8/VP9)',
          extensions: ['mp4', 'webm'],
        },
        {
          name: 'Other Containers (Codec Support Varies)',
          extensions: ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    const extension = path.extname(filePath).replace('.', '').toLowerCase()
    const likelyUnsupported = ['mov', 'avi', 'mkv'].includes(extension)
    return {
      filePath,
      clipName: path.basename(filePath),
      extension,
      likelyUnsupported,
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

function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== 'string') {
    return false
  }
  if (origin.startsWith('http://localhost:5173') || origin.startsWith('http://127.0.0.1:5173')) {
    return true
  }
  if (origin.startsWith('file://')) {
    return true
  }
  if (isDev && origin.startsWith(devServerUrl)) {
    return true
  }
  return false
}

function getOriginFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return ''
  }
  if (rawUrl.startsWith('file://')) {
    return 'file://'
  }
  try {
    return new URL(rawUrl).origin
  } catch {
    return ''
  }
}

function isMicPermission(permission) {
  return permission === 'media' || permission === 'microphone' || permission === 'audioCapture'
}

function registerPermissionHandlers() {
  const defaultSession = session.defaultSession
  if (!defaultSession) {
    return
  }

  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingOrigin = details?.requestingOrigin || getOriginFromUrl(webContents?.getURL?.())
    const allow = isMicPermission(permission) && isAllowedOrigin(requestingOrigin)
    if (isDev && isMicPermission(permission)) {
      console.log(`[perm:req] permission=${permission} origin=${requestingOrigin || 'n/a'} allow=${allow}`)
    }
    if (allow) {
      callback(true)
      return
    }
    callback(false)
  })

  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = requestingOrigin || getOriginFromUrl(webContents?.getURL?.())
    const allow = isMicPermission(permission) && isAllowedOrigin(origin)
    if (isDev && isMicPermission(permission)) {
      console.log(`[perm:chk] permission=${permission} origin=${origin || 'n/a'} allow=${allow}`)
    }
    return allow
  })
}

function registerMediaProtocol() {
  protocol.handle('scalez-media', (request) => {
    const url = new URL(request.url)
    const encodedFilePath = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname
    const filePath = decodeURIComponent(encodedFilePath)

    if (!filePath || !fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })
}

app.whenReady().then(() => {
  registerMediaProtocol()
  registerPermissionHandlers()
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
