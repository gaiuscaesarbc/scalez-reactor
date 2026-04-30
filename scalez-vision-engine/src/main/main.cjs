const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
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
const openDevtoolsByDefault = process.env.SCALEZ_OPEN_DEVTOOLS === '1'

let controlWindow = null
let outputWindow = null
let reverseCacheDir = null
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

function getReverseCacheDir() {
  if (!reverseCacheDir) {
    reverseCacheDir = path.join(app.getPath('userData'), 'reverse-cache')
    fs.mkdirSync(reverseCacheDir, { recursive: true })
  }
  return reverseCacheDir
}

function getFfmpegExecutablePath() {
  const localAppData = process.env.LOCALAPPDATA || ''
  const wingetPackagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages')
  if (!fs.existsSync(wingetPackagesDir)) {
    return null
  }

  const packageDir = fs
    .readdirSync(wingetPackagesDir, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith('Gyan.FFmpeg_'))

  if (!packageDir) {
    return null
  }

  const packageRoot = path.join(wingetPackagesDir, packageDir.name)
  const buildDir = fs
    .readdirSync(packageRoot, { withFileTypes: true })
    .find((entry) => entry.isDirectory() && entry.name.startsWith('ffmpeg-'))

  if (!buildDir) {
    return null
  }

  const ffmpegPath = path.join(packageRoot, buildDir.name, 'bin', 'ffmpeg.exe')
  return fs.existsSync(ffmpegPath) ? ffmpegPath : null
}

function ensureReverseCache(filePath, options = {}) {
  return new Promise((resolve, reject) => {
    if (!filePath || !fs.existsSync(filePath)) {
      reject(new Error('Source clip does not exist.'))
      return
    }

    const ffmpegPath = getFfmpegExecutablePath()
    if (!ffmpegPath) {
      reject(new Error('FFmpeg is not available on this machine.'))
      return
    }

    const fileStats = fs.statSync(filePath)
    const cacheKey = crypto
      .createHash('sha1')
      .update(`${filePath}:${fileStats.size}:${fileStats.mtimeMs}`)
      .digest('hex')
    const outputPath = path.join(getReverseCacheDir(), `${cacheKey}.mp4`)
    const forceRebuild = Boolean(options.forceRebuild)

    if (forceRebuild && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath)
      } catch {
        // Ignore stale cache delete failures and continue to rebuild.
      }
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size <= 0) {
      try {
        fs.unlinkSync(outputPath)
      } catch {
        // Ignore stale cache delete failures and continue to rebuild.
      }
    }

    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      resolve(outputPath)
      return
    }

    const tempOutputPath = `${outputPath}.tmp-${Date.now()}-${process.pid}.mp4`

    const ffmpegArgs = [
      '-y',
      '-i',
      filePath,
      '-an',
      '-vf',
      'reverse',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      tempOutputPath,
    ]

    const child = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true })
    let stderr = ''

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      reject(error)
    })

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 0) {
        try {
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath)
          }
          fs.renameSync(tempOutputPath, outputPath)
        } catch (error) {
          reject(error)
          return
        }
        resolve(outputPath)
        return
      }
      if (fs.existsSync(tempOutputPath)) {
        try {
          fs.unlinkSync(tempOutputPath)
        } catch {
          // Ignore temp cleanup errors.
        }
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`))
    })
  })
}

function loadRendererWindow(windowRef, mode) {
  if (isDev) {
    windowRef.loadURL(`${devServerUrl}?window=${mode}`)
    if (openDevtoolsByDefault) {
      windowRef.webContents.openDevTools({ mode: 'detach' })
    }
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
      backgroundThrottling: false,
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

  ipcMain.handle('app:open-devtools', (_event) => {
    const win = BrowserWindow.fromWebContents(_event.sender)
    if (win) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  })

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

  ipcMain.handle('clips:ensure-reverse-cache', async (_event, targetPath) => {
    return ensureReverseCache(targetPath)
  })

  ipcMain.handle('clips:rebuild-reverse-cache', async (_event, targetPath) => {
    return ensureReverseCache(targetPath, { forceRebuild: true })
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

function isMidiPermission(permission) {
  return permission === 'midi' || permission === 'midiSysex'
}

function registerPermissionHandlers() {
  const defaultSession = session.defaultSession
  if (!defaultSession) {
    return
  }

  defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingOrigin = details?.requestingOrigin || getOriginFromUrl(webContents?.getURL?.())
    const allowMic = isMicPermission(permission) && isAllowedOrigin(requestingOrigin)
    const allowMidi = isMidiPermission(permission) && isAllowedOrigin(requestingOrigin)
    const allow = allowMic || allowMidi
    if (isDev && (isMicPermission(permission) || isMidiPermission(permission))) {
      console.log(`[perm:req] permission=${permission} origin=${requestingOrigin || 'n/a'} allow=${allow}`)
    }
    callback(allow)
  })

  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = requestingOrigin || getOriginFromUrl(webContents?.getURL?.())
    const allowMic = isMicPermission(permission) && isAllowedOrigin(origin)
    const allowMidi = isMidiPermission(permission) && isAllowedOrigin(origin)
    const allow = allowMic || allowMidi
    if (isDev && (isMicPermission(permission) || isMidiPermission(permission))) {
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
