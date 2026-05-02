const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const { Readable } = require('node:stream')
const { app, BrowserWindow, ipcMain, protocol, session, dialog, screen } = require('electron')
const { NativePlaybackEngine } = require('./nativePlayback.cjs')

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
let windowStatePath = null
let windowStateCache = null
const reverseCacheJobs = new Map()
let nativePlaybackEngine = null
let lastNativePlaybackSignature = ''
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

function getWindowStatePath() {
  if (!windowStatePath) {
    windowStatePath = path.join(app.getPath('userData'), 'window-state.json')
  }
  return windowStatePath
}

function getDefaultWindowState() {
  return {
    control: {
      bounds: {
        width: 1600,
        height: 980,
      },
      isFullScreen: false,
    },
    output: {
      bounds: {
        width: 1920,
        height: 1080,
      },
      isFullScreen: false,
    },
  }
}

function readWindowState() {
  if (windowStateCache) {
    return windowStateCache
  }

  const fallback = getDefaultWindowState()
  try {
    const raw = fs.readFileSync(getWindowStatePath(), 'utf8')
    const parsed = JSON.parse(raw)
    windowStateCache = {
      control: {
        ...fallback.control,
        ...(parsed?.control || {}),
        bounds: {
          ...fallback.control.bounds,
          ...(parsed?.control?.bounds || {}),
        },
      },
      output: {
        ...fallback.output,
        ...(parsed?.output || {}),
        bounds: {
          ...fallback.output.bounds,
          ...(parsed?.output?.bounds || {}),
        },
      },
    }
  } catch {
    windowStateCache = fallback
  }

  return windowStateCache
}

function writeWindowState() {
  try {
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(windowStateCache || getDefaultWindowState(), null, 2), 'utf8')
  } catch {
    // Ignore state persistence failures.
  }
}

function sanitizeBounds(input, fallback) {
  const width = Number.isFinite(input?.width) ? Math.round(input.width) : fallback.width
  const height = Number.isFinite(input?.height) ? Math.round(input.height) : fallback.height
  const x = Number.isFinite(input?.x) ? Math.round(input.x) : undefined
  const y = Number.isFinite(input?.y) ? Math.round(input.y) : undefined
  return { width, height, x, y }
}

function clampBoundsToDisplay(bounds, minWidth, minHeight) {
  const fallbackCenter = { x: 100, y: 100 }
  const refPoint = Number.isFinite(bounds.x) && Number.isFinite(bounds.y)
    ? {
        x: bounds.x + Math.max(1, Math.floor(bounds.width / 2)),
        y: bounds.y + Math.max(1, Math.floor(bounds.height / 2)),
      }
    : fallbackCenter
  const targetDisplay = screen.getDisplayNearestPoint(refPoint)
  const workArea = targetDisplay?.workArea || { x: 0, y: 0, width: 1920, height: 1080 }

  const width = Math.max(minWidth, Math.min(bounds.width, workArea.width))
  const height = Math.max(minHeight, Math.min(bounds.height, workArea.height))

  const fallbackX = workArea.x + Math.max(0, Math.floor((workArea.width - width) / 2))
  const fallbackY = workArea.y + Math.max(0, Math.floor((workArea.height - height) / 2))
  const rawX = Number.isFinite(bounds.x) ? bounds.x : fallbackX
  const rawY = Number.isFinite(bounds.y) ? bounds.y : fallbackY

  const x = Math.min(Math.max(rawX, workArea.x), workArea.x + workArea.width - width)
  const y = Math.min(Math.max(rawY, workArea.y), workArea.y + workArea.height - height)

  return { x, y, width, height }
}

function getRestoredWindowBounds(windowKey, defaults, minWidth, minHeight) {
  const savedState = readWindowState()?.[windowKey]?.bounds || {}
  const sanitized = sanitizeBounds(savedState, defaults)
  return clampBoundsToDisplay(sanitized, minWidth, minHeight)
}

function persistWindowState(windowKey, nextPartial) {
  const current = readWindowState()
  current[windowKey] = {
    ...(current[windowKey] || {}),
    ...nextPartial,
    bounds: {
      ...((current[windowKey] || {}).bounds || {}),
      ...(nextPartial.bounds || {}),
    },
  }
  windowStateCache = current
  writeWindowState()
}

function bindWindowStatePersistence(windowRef, windowKey, options = {}) {
  const supportsFullscreen = Boolean(options.supportsFullscreen)
  let saveTimer = null

  const saveNow = () => {
    if (!windowRef || windowRef.isDestroyed()) {
      return
    }

    const bounds = windowRef.isFullScreen() ? windowRef.getNormalBounds() : windowRef.getBounds()
    persistWindowState(windowKey, {
      bounds,
      isFullScreen: supportsFullscreen ? windowRef.isFullScreen() : false,
    })
  }

  const saveSoon = () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      saveNow()
    }, 150)
  }

  windowRef.on('move', saveSoon)
  windowRef.on('resize', saveSoon)
  windowRef.on('close', saveNow)

  if (supportsFullscreen) {
    windowRef.on('enter-full-screen', saveSoon)
    windowRef.on('leave-full-screen', saveSoon)
  }
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
  if (!filePath || !fs.existsSync(filePath)) {
    return Promise.reject(new Error('Source clip does not exist.'))
  }

  const ffmpegPath = getFfmpegExecutablePath()
  if (!ffmpegPath) {
    return Promise.reject(new Error('FFmpeg is not available on this machine.'))
  }

  const fileStats = fs.statSync(filePath)
  const cacheKey = crypto
    .createHash('sha1')
    .update(`${filePath}:${fileStats.size}:${fileStats.mtimeMs}`)
    .digest('hex')
  const outputPath = path.join(getReverseCacheDir(), `${cacheKey}.mp4`)
  const forceRebuild = Boolean(options.forceRebuild)
  const jobKey = `${cacheKey}:${forceRebuild ? 'rebuild' : 'ensure'}`

  if (reverseCacheJobs.has(jobKey)) {
    return reverseCacheJobs.get(jobKey)
  }

  const job = new Promise((resolve, reject) => {
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
  }).finally(() => {
    reverseCacheJobs.delete(jobKey)
  })

  reverseCacheJobs.set(jobKey, job)
  return job
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

function getNativePlaybackEngine() {
  if (!nativePlaybackEngine) {
    nativePlaybackEngine = new NativePlaybackEngine({
      ensureReverseCache,
      isDev,
      onDiagnostic: (payload) => {
        if (controlWindow && !controlWindow.isDestroyed()) {
          controlWindow.webContents.send('native-playback:diagnostic', payload)
        }
        if (isDev) {
          const message = payload?.type || 'unknown'
          console.warn(`[native:diagnostic] ${message}`)
        }
      },
    })
  }
  return nativePlaybackEngine
}

function buildNativePlaybackSignature(state) {
  const layers = Array.isArray(state?.layers) ? state.layers : []
  const masterFx = state?.masterFx || {}
  const blackout = state?.blackout ? 1 : 0
  const fxSignature = [
    Number(masterFx?.brightness ?? 1).toFixed(3),
    Number(masterFx?.strobe ?? 0).toFixed(3),
    Number(masterFx?.shake ?? 0).toFixed(3),
    blackout,
  ].join(':')
  return layers
    .map((layer) => {
      const activeSlotIndex = typeof layer?.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
      const activeSlot = activeSlotIndex >= 0 ? layer?.slots?.[activeSlotIndex] : null
      const motion = layer?.videoMotion || {}
      return [
        layer?.layerIndex ?? -1,
        layer?.visible ? 1 : 0,
        activeSlotIndex,
        activeSlot?.slotIndex ?? -1,
        activeSlot?.filePath || '',
        Number(motion.inPoint ?? 0).toFixed(3),
        Number(motion.outPoint ?? 1).toFixed(3),
        motion.bounceEnabled ? 1 : 0,
        Number(motion.bounceSpeed ?? 1).toFixed(3),
        Number(motion.baseSpeed ?? 1).toFixed(3),
        Number(motion.scale ?? 1).toFixed(3),
      ].join(':')
    })
    .join('|') + `|fx:${fxSignature}`
}

function createControlWindow() {
  const bounds = getRestoredWindowBounds(
    'control',
    { width: 1600, height: 980 },
    1200,
    780,
  )

  controlWindow = new BrowserWindow({
    title: 'SCALEZ Vision Engine - Control',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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

  bindWindowStatePersistence(controlWindow, 'control')
  loadRendererWindow(controlWindow, 'control')

  controlWindow.on('closed', () => {
    controlWindow = null
    if (!outputWindow) {
      app.quit()
    }
  })
}

function createOutputWindow() {
  const bounds = getRestoredWindowBounds(
    'output',
    { width: 1920, height: 1080 },
    800,
    600,
  )
  const savedOutputState = readWindowState()?.output || {}

  outputWindow = new BrowserWindow({
    title: 'SCALEZ Vision Engine - Output',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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

  bindWindowStatePersistence(outputWindow, 'output', { supportsFullscreen: true })
  loadRendererWindow(outputWindow, 'output')

  if (savedOutputState.isFullScreen) {
    outputWindow.once('ready-to-show', () => {
      if (outputWindow && !outputWindow.isDestroyed()) {
        outputWindow.setFullScreen(true)
      }
    })
  }

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
      win.webContents.openDevTools({ mode: 'undocked', activate: true })
      win.webContents.executeJavaScript(
        "console.info('[devtools:opened]', { windowId: window.location.search || 'control', at: Date.now() })",
      ).catch(() => {
        // Ignore logging failures if renderer is navigating.
      })
    }
  })

  ipcMain.handle('app:open-control-devtools', () => {
    if (!controlWindow || controlWindow.isDestroyed()) {
      return false
    }
    controlWindow.webContents.openDevTools({ mode: 'undocked', activate: true })
    controlWindow.webContents.executeJavaScript(
      "console.info('[devtools:opened:control]', { at: Date.now() })",
    ).catch(() => {
      // Ignore logging failures during navigation.
    })
    return true
  })

  ipcMain.handle('app:open-output-devtools', () => {
    if (!outputWindow || outputWindow.isDestroyed()) {
      return false
    }
    outputWindow.webContents.openDevTools({ mode: 'undocked', activate: true })
    outputWindow.webContents.executeJavaScript(
      "console.info('[devtools:opened:output]', { at: Date.now() })",
    ).catch(() => {
      // Ignore logging failures during navigation.
    })
    return true
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

    const nativeEngine = getNativePlaybackEngine()
    if (nativeEngine.getStatus().enabled) {
      const nextSignature = buildNativePlaybackSignature(sharedOutputState)
      if (nextSignature !== lastNativePlaybackSignature) {
        lastNativePlaybackSignature = nextSignature
        nativeEngine.applyOutputState(sharedOutputState).catch((error) => {
          if (isDev) {
            console.warn(`[native:apply-state] ${error?.message || 'failed'}`)
          }
        })
      }
    }
  })

  ipcMain.handle('output:state-get', () => sharedOutputState)

  ipcMain.handle('native-playback:get-status', () => {
    return getNativePlaybackEngine().getStatus()
  })

  ipcMain.handle('native-playback:set-enabled', async (_event, enabled) => {
    return getNativePlaybackEngine().setEnabled(enabled)
  })
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

function isAllowedWebContentsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false
  }
  if (rawUrl.startsWith('http://localhost:5173') || rawUrl.startsWith('http://127.0.0.1:5173')) {
    return true
  }
  if (rawUrl.startsWith('file://')) {
    return true
  }
  if (isDev && rawUrl.startsWith(devServerUrl)) {
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

function resolveRequestingOrigin(webContents, requestingOrigin) {
  if (requestingOrigin && typeof requestingOrigin === 'string') {
    return requestingOrigin
  }
  return getOriginFromUrl(webContents?.getURL?.())
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
    const requestingOrigin = resolveRequestingOrigin(webContents, details?.requestingOrigin)
    const allowFromOrigin = isAllowedOrigin(requestingOrigin)
    const allowFromWebContents = isAllowedWebContentsUrl(webContents?.getURL?.())
    const allowMic = isMicPermission(permission) && (allowFromOrigin || allowFromWebContents)
    const allowMidi = isMidiPermission(permission) && (allowFromOrigin || allowFromWebContents)
    const allow = allowMic || allowMidi
    if (isDev && (isMicPermission(permission) || isMidiPermission(permission)) && !allow) {
      console.log(`[perm:req] permission=${permission} origin=${requestingOrigin || 'n/a'} allow=${allow}`)
    }
    callback(allow)
  })

  defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = resolveRequestingOrigin(webContents, requestingOrigin)
    const allowFromOrigin = isAllowedOrigin(origin)
    const allowFromWebContents = isAllowedWebContentsUrl(webContents?.getURL?.())
    const allowMic = isMicPermission(permission) && (allowFromOrigin || allowFromWebContents)
    const allowMidi = isMidiPermission(permission) && (allowFromOrigin || allowFromWebContents)
    const allow = allowMic || allowMidi
    if (isDev && (isMicPermission(permission) || isMidiPermission(permission)) && !allow) {
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

    let fileStat
    try {
      fileStat = fs.statSync(filePath)
    } catch {
      return new Response('Not Found', { status: 404 })
    }

    const fileSize = Number(fileStat.size) || 0
    const ext = path.extname(filePath).toLowerCase()
    const mimeByExt = {
      '.mp4': 'video/mp4',
      '.m4v': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.avi': 'video/x-msvideo',
      '.ogv': 'video/ogg',
      '.ogg': 'video/ogg',
    }
    const contentType = mimeByExt[ext] || 'application/octet-stream'

    const rangeHeader = request.headers.get('Range')
    if (!rangeHeader) {
      const stream = Readable.toWeb(fs.createReadStream(filePath))
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
        },
      })
    }

    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim())
    if (!match) {
      return new Response('Requested Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      })
    }

    let start
    let end
    const startToken = match[1]
    const endToken = match[2]

    if (startToken === '' && endToken === '') {
      return new Response('Requested Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      })
    }

    if (startToken === '') {
      const suffixLength = Number.parseInt(endToken, 10)
      if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
        return new Response('Requested Range Not Satisfiable', {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        })
      }
      start = Math.max(0, fileSize - suffixLength)
      end = Math.max(0, fileSize - 1)
    } else {
      start = Number.parseInt(startToken, 10)
      end = endToken === '' ? fileSize - 1 : Number.parseInt(endToken, 10)
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
      return new Response('Requested Range Not Satisfiable', {
        status: 416,
        headers: {
          'Content-Range': `bytes */${fileSize}`,
        },
      })
    }

    end = Math.min(end, fileSize - 1)
    const chunkSize = end - start + 1
    const stream = Readable.toWeb(fs.createReadStream(filePath, { start, end }))
    return new Response(stream, {
      status: 206,
      headers: {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': String(chunkSize),
      },
    })
  })
}

app.whenReady().then(() => {
  registerMediaProtocol()
  registerPermissionHandlers()
  registerIpcHandlers()
  getNativePlaybackEngine()
  createControlWindow()
  createOutputWindow()

  // Tell the native engine where the output window is so mpv can be positioned underneath it.
  if (outputWindow && !outputWindow.isDestroyed()) {
    const engine = getNativePlaybackEngine()
    engine.setOutputWindowBounds(outputWindow.getBounds())
    outputWindow.on('move', () => {
      if (outputWindow && !outputWindow.isDestroyed()) {
        engine.setOutputWindowBounds(outputWindow.getBounds())
      }
    })
    outputWindow.on('resize', () => {
      if (outputWindow && !outputWindow.isDestroyed()) {
        engine.setOutputWindowBounds(outputWindow.getBounds())
      }
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
      createOutputWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (nativePlaybackEngine) {
    nativePlaybackEngine.stop()
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (nativePlaybackEngine) {
    nativePlaybackEngine.stop()
  }
})
