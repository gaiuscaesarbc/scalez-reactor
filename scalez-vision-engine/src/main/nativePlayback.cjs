const net = require('node:net')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

const SOURCE_SELECTION_HOLD_MS = 2200

const NATIVE_ENGINE_VERSION = '2026.05.01-r7'

function clamp01(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.min(1, Math.max(0, numeric))
}

function clamp(value, min, max) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return min
  }
  return Math.min(max, Math.max(min, numeric))
}

function getMpVPathFromWhere() {
  const whereResult = spawnSync('where', ['mpv.exe'], {
    windowsHide: true,
    encoding: 'utf8',
  })
  if (whereResult.status !== 0 || !whereResult.stdout) {
    return ''
  }
  const first = whereResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  return first || ''
}

function getLikelyMpvPaths() {
  const localAppData = process.env.LOCALAPPDATA || ''
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files'
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  return [
    path.join(programFiles, 'mpv', 'mpv.exe'),
    path.join(programFiles, 'MPV Player', 'mpv.exe'),
    path.join(programFilesX86, 'mpv', 'mpv.exe'),
    path.join(programFilesX86, 'MPV Player', 'mpv.exe'),
    path.join(localAppData, 'Programs', 'mpv', 'mpv.exe'),
    path.join(localAppData, 'mpv', 'mpv.exe'),
  ]
}

function resolveMpvPath() {
  const fromWhere = getMpVPathFromWhere()
  if (fromWhere && fs.existsSync(fromWhere)) {
    return fromWhere
  }

  const likely = getLikelyMpvPaths().find((candidate) => fs.existsSync(candidate))
  return likely || ''
}

function getPrimaryActiveLayer(layers) {
  if (!Array.isArray(layers)) {
    return null
  }

  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index]
    if (!layer?.visible) {
      continue
    }

    const activeSlotIndex = typeof layer.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
    const activeSlot = activeSlotIndex >= 0 ? layer.slots?.[activeSlotIndex] : null
    if (!activeSlot?.filePath || activeSlot.status !== 'loaded') {
      continue
    }

    return {
      layerIndex: layer.layerIndex,
      slotIndex: Number.isFinite(activeSlot?.slotIndex) ? activeSlot.slotIndex : activeSlotIndex,
      filePath: activeSlot.filePath,
      motion: layer.videoMotion || {},
    }
  }

  return null
}

function getRenderableLayerTarget(layer) {
  if (!layer?.visible) {
    return null
  }

  const activeSlotIndex = typeof layer?.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
  const activeSlot = activeSlotIndex >= 0 ? layer?.slots?.[activeSlotIndex] : null
  if (!activeSlot?.filePath || activeSlot?.status !== 'loaded') {
    return null
  }

  return {
    layerIndex: layer.layerIndex,
    slotIndex: Number.isFinite(activeSlot?.slotIndex) ? activeSlot.slotIndex : activeSlotIndex,
    filePath: activeSlot.filePath,
    motion: layer.videoMotion || {},
  }
}

function getActiveLayerSnapshot(layers) {
  const snapshot = new Map()
  if (!Array.isArray(layers)) {
    return snapshot
  }

  layers.forEach((layer) => {
    const activeSlotIndex = typeof layer?.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
    const activeSlot = activeSlotIndex >= 0 ? layer?.slots?.[activeSlotIndex] : null
    const isRenderable = Boolean(layer?.visible) && activeSlot?.status === 'loaded' && Boolean(activeSlot?.filePath)
    snapshot.set(layer?.layerIndex, isRenderable ? `${activeSlotIndex}|${activeSlot.filePath}` : '')
  })

  return snapshot
}

function summarizeRenderableLayers(layers) {
  if (!Array.isArray(layers)) {
    return []
  }

  const summary = []
  layers.forEach((layer) => {
    const activeSlotIndex = typeof layer?.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
    const activeSlot = activeSlotIndex >= 0 ? layer?.slots?.[activeSlotIndex] : null
    if (Boolean(layer?.visible) && activeSlot?.status === 'loaded' && Boolean(activeSlot?.filePath)) {
      summary.push({
        layerIndex: layer.layerIndex,
        slotIndex: activeSlotIndex,
        filePath: activeSlot.filePath,
      })
    }
  })

  return summary
}

function getSegmentInfo(duration, motion) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return null
  }

  const inPoint = clamp01(motion?.inPoint ?? 0)
  const outPoint = clamp01(motion?.outPoint ?? 1)
  const start = duration * Math.min(inPoint, Math.max(0, outPoint - 0.01))
  const end = duration * Math.max(outPoint, inPoint + 0.01)
  return {
    start,
    end,
  }
}

class NativePlaybackEngine {
  constructor({ ensureReverseCache, isDev = false, onDiagnostic = null }) {
    this.ensureReverseCache = ensureReverseCache
    this.isDev = isDev
    this.onDiagnostic = typeof onDiagnostic === 'function' ? onDiagnostic : null

    this.enabled = false
    this.mpvPath = resolveMpvPath()
    this.available = Boolean(this.mpvPath)
    this.lastError = this.available ? '' : 'mpv.exe not found. Install mpv and restart SCALEZ.'

    this.outputWindowBounds = null

    this.pipePath = ''
    this.mpvProcess = null
    this.socket = null
    this.buffer = ''

    this.pending = new Map()
    this.requestId = 1
    this.lastCommandLabel = ''

    this.currentState = null
    this.currentFilePath = ''
    this.currentSourcePath = ''
    this.currentDuration = 0
    this.currentPhase = 'forward'
    this.reversePathByFile = new Map()
    this.reverseEnsureInFlight = new Map()
    this.reverseRetryAt = new Map()
    this.diagnosticThrottleAt = new Map()
    this.selectedLayerIndex = null
    this.lastActiveLayerSnapshot = new Map()
    this.lastRenderableAt = 0
    this.switchInFlight = false
    this.lastSwitchAt = 0
    this.boundaryStallAt = 0
    this.boundaryStallPhase = ''
    this.boundaryStallPos = Number.NaN
    this.lastAppliedBrightness = Number.NaN
    this.lastAppliedZoom = Number.NaN
    this.lastAppliedPanX = 0
    this.lastAppliedPanY = 0

    // FX timers
    this.strobeTimer = null
    this.strobePhase = false
    this.shakeTimer = null
    this.currentFx = { strobe: 0, shake: 0, brightness: 1, blackout: false, scale: 1 }

    this.tickTimer = null
  }

  setOutputWindowBounds(bounds) {
    if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
      return
    }
    this.outputWindowBounds = bounds
  }

  getStatus() {
    return {
      version: NATIVE_ENGINE_VERSION,
      enabled: this.enabled,
      available: this.available,
      running: Boolean(this.mpvProcess),
      mpvPath: this.mpvPath,
      lastError: this.lastError,
    }
  }

  async setEnabled(nextEnabled) {
    const shouldEnable = Boolean(nextEnabled)
    if (!shouldEnable) {
      this.enabled = false
      this.stop()
      return this.getStatus()
    }

    if (!this.available) {
      this.enabled = false
      return this.getStatus()
    }

    this.enabled = true
    await this.start()
    if (this.currentState) {
      await this.applyOutputState(this.currentState)
    }
    return this.getStatus()
  }

  async start() {
    if (this.mpvProcess) {
      return
    }

    this.pipePath = `\\\\.\\pipe\\scalez-mpv-${process.pid}-${crypto.randomBytes(6).toString('hex')}`
    const args = [
      '--idle=yes',
      '--force-window=yes',
      '--keep-open=yes',
      '--mute=yes',
      '--osd-level=0',
      '--terminal=no',
      `--input-ipc-server=${this.pipePath}`,
    ]

    // Position mpv to sit under the transparent Electron overlay window.
    if (this.outputWindowBounds) {
      const { x, y, width, height } = this.outputWindowBounds
      args.push(`--geometry=${Math.round(width)}x${Math.round(height)}+${Math.round(x)}+${Math.round(y)}`)
      args.push('--no-border')
    }

    this.mpvProcess = spawn(this.mpvPath, args, {
      windowsHide: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    this.mpvProcess.on('error', (error) => {
      this.lastError = error?.message || 'Failed to start mpv process.'
      this.stop()
    })

    this.mpvProcess.on('close', () => {
      this.stop()
    })

    if (this.mpvProcess.stderr) {
      this.mpvProcess.stderr.on('data', (chunk) => {
        if (this.isDev) {
          const text = String(chunk || '').trim()
          if (text) {
            console.log(`[native:mpv] ${text}`)
          }
        }
      })
    }

    await this.connectSocket()
    this.startTicking()
  }

  stop() {
    this.stopTicking()

    this.currentFilePath = ''
    this.currentSourcePath = ''
    this.currentDuration = 0
    this.currentPhase = 'forward'
    this.reversePathByFile.clear()
    this.reverseEnsureInFlight.clear()
    this.reverseRetryAt.clear()
    this.diagnosticThrottleAt.clear()
    this.selectedLayerIndex = null
    this.lastActiveLayerSnapshot.clear()
    this.lastRenderableAt = 0
    this.switchInFlight = false
    this.boundaryStallAt = 0
    this.boundaryStallPhase = ''
    this.boundaryStallPos = Number.NaN
    this.lastAppliedBrightness = Number.NaN
    this.lastAppliedZoom = Number.NaN
    this.lastAppliedPanX = 0
    this.lastAppliedPanY = 0

    this.stopStrobeTimer()
    this.stopShakeTimer()
    this.currentFx = { strobe: 0, shake: 0, brightness: 1, blackout: false, scale: 1 }

    if (this.socket) {
      try {
        this.socket.destroy()
      } catch {
        // Ignore socket close errors.
      }
      this.socket = null
    }

    if (this.mpvProcess) {
      try {
        this.mpvProcess.kill()
      } catch {
        // Ignore process kill errors.
      }
      this.mpvProcess = null
    }

    this.pending.forEach(({ reject }) => reject(new Error('mpv connection closed.')))
    this.pending.clear()
    this.buffer = ''
  }

  async connectSocket() {
    const maxAttempts = 60
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await this.openSocket()
        return
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    }
    throw new Error('Failed to connect to mpv IPC pipe.')
  }

  openSocket() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.pipePath)

      let settled = false
      const onError = (error) => {
        if (!settled) {
          settled = true
          reject(error)
        }
      }

      socket.once('error', onError)
      socket.once('connect', () => {
        socket.removeListener('error', onError)
        settled = true
        this.socket = socket
        this.attachSocketHandlers(socket)
        resolve()
      })
    })
  }

  attachSocketHandlers(socket) {
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8')
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() || ''

      lines.forEach((line) => {
        const text = line.trim()
        if (!text) {
          return
        }

        let parsed
        try {
          parsed = JSON.parse(text)
        } catch {
          return
        }

        const requestId = parsed.request_id
        if (requestId && this.pending.has(requestId)) {
          const { resolve, reject, timer } = this.pending.get(requestId)
          clearTimeout(timer)
          this.pending.delete(requestId)
          if (parsed.error && parsed.error !== 'success') {
            reject(new Error(parsed.error))
            return
          }
          resolve(parsed.data)
        }
      })
    })

    socket.on('error', (error) => {
      this.lastError = error?.message || 'mpv IPC socket error.'
      this.stop()
    })

    socket.on('close', () => {
      this.stop()
    })
  }

  async ensureSocketReady() {
    const hasLiveSocket = this.socket && !this.socket.destroyed && this.socket.writable
    if (hasLiveSocket) {
      return
    }

    if (!this.enabled) {
      throw new Error('mpv socket not connected.')
    }

    if (!this.mpvProcess) {
      await this.start()
      return
    }

    this.reportDiagnostic('socket-reconnect-attempt', {
      filePath: this.currentFilePath || this.target?.filePath || '',
      phase: this.currentPhase,
    }, 120)
    await this.connectSocket()
  }

  async sendCommand(command, timeoutMs = 2000) {
    await this.ensureSocketReady()

    if (!this.socket || this.socket.destroyed || !this.socket.writable) {
      throw new Error('mpv socket not connected.')
    }

    const requestId = this.requestId
    this.requestId += 1

    const payload = JSON.stringify({
      command,
      request_id: requestId,
    })
    this.lastCommandLabel = JSON.stringify(command)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error('mpv command timed out.'))
      }, timeoutMs)

      this.pending.set(requestId, { resolve, reject, timer })
      this.socket.write(`${payload}\n`, 'utf8', (error) => {
        if (error) {
          clearTimeout(timer)
          this.pending.delete(requestId)
          reject(error)
        }
      })
    })
  }

  async seekAndPlay(timeSeconds) {
    const target = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0
    // Conservative path: some mpv builds reject 'seek ... absolute+exact'.
    await this.sendCommand(['set_property', 'time-pos', target], 2000)
    await this.sendCommand(['set_property', 'pause', false], 1200)
  }

  async loadSource(filePath, startTime, speed) {
    if (!filePath) {
      return
    }

    const start = Number.isFinite(startTime) ? Math.max(0, startTime) : 0
    const speedValue = Number.isFinite(speed) ? Math.max(0.05, Math.min(4, speed)) : 1

    this.switchInFlight = true
    this.lastSwitchAt = Date.now()
    this.reportDiagnostic('load-source', {
      requestedPath: filePath,
      start,
      speed: speedValue,
      phase: this.currentPhase,
    }, 300)

    try {
      // Some mpv builds reject non-numeric 4th loadfile argument.
      // Use replace-only, then set time-pos explicitly.
      await this.sendCommand(['loadfile', filePath, 'replace'], 4000)
      if (start > 0) {
        await this.sendCommand(['set_property', 'time-pos', start], 2200)
      }
      await this.sendCommand(['set_property', 'pause', false])
      await this.sendCommand(['set_property', 'speed', speedValue])

      this.currentSourcePath = filePath
      this.currentDuration = 0
    } finally {
      setTimeout(() => {
        this.switchInFlight = false
      }, 120)
    }
  }

  stopStrobeTimer() {
    if (this.strobeTimer) {
      clearInterval(this.strobeTimer)
      this.strobeTimer = null
    }
  }

  stopShakeTimer() {
    if (this.shakeTimer) {
      clearInterval(this.shakeTimer)
      this.shakeTimer = null
    }
  }

  startStrobeTimer(strobeAmount) {
    this.stopStrobeTimer()
    if (strobeAmount <= 0.01) {
      return
    }
    // Map strobe 0..1 → interval 240ms..30ms (faster = more intense)
    const intervalMs = Math.round(240 - strobeAmount * 210)
    this.strobePhase = false
    this.strobeTimer = setInterval(() => {
      this.strobePhase = !this.strobePhase
      if (!this.socket || this.socket.destroyed) {
        return
      }
      const fx = this.currentFx
      const baseBrightness = fx.blackout ? 0 : (fx.brightness ?? 1)
      const mpvBrightness = this.strobePhase
        ? -100
        : clamp((baseBrightness - 1) * 100, -100, 100)
      this.sendCommand(['set_property', 'brightness', mpvBrightness], 800).catch(() => {})
    }, intervalMs)
  }

  startShakeTimer(shakeAmount) {
    this.stopShakeTimer()
    if (shakeAmount <= 0.01) {
      // Reset pan to zero
      if (this.socket && !this.socket.destroyed) {
        this.sendCommand(['set_property', 'video-pan-x', 0], 800).catch(() => {})
        this.sendCommand(['set_property', 'video-pan-y', 0], 800).catch(() => {})
        this.lastAppliedPanX = 0
        this.lastAppliedPanY = 0
      }
      return
    }
    // Map shake 0..1 → max offset 0..0.05 in mpv pan units, interval 40..16ms
    const maxOffset = shakeAmount * 0.05
    const intervalMs = Math.round(40 - shakeAmount * 24)
    this.shakeTimer = setInterval(() => {
      if (!this.socket || this.socket.destroyed) {
        return
      }
      const panX = (Math.random() * 2 - 1) * maxOffset
      const panY = (Math.random() * 2 - 1) * maxOffset
      this.sendCommand(['set_property', 'video-pan-x', panX], 800).catch(() => {})
      this.sendCommand(['set_property', 'video-pan-y', panY], 800).catch(() => {})
      this.lastAppliedPanX = panX
      this.lastAppliedPanY = panY
    }, intervalMs)
  }

  async applyNativeVisualState({ brightnessFactor = 1, scale = 1, blackout = false, unsupportedFx = null }) {
    const clampedBrightnessFactor = clamp(blackout ? 0 : brightnessFactor, 0, 2)
    const mpvBrightness = clamp((clampedBrightnessFactor - 1) * 100, -100, 100)

    const clampedScale = clamp(scale, 0.25, 4)
    const zoom = clamp(Math.log2(clampedScale), -2, 2)

    const brightnessChanged =
      !Number.isFinite(this.lastAppliedBrightness) || Math.abs(this.lastAppliedBrightness - mpvBrightness) >= 0.5
    const zoomChanged = !Number.isFinite(this.lastAppliedZoom) || Math.abs(this.lastAppliedZoom - zoom) >= 0.01

    if (brightnessChanged) {
      await this.sendCommand(['set_property', 'brightness', mpvBrightness], 1500)
      this.lastAppliedBrightness = mpvBrightness
    }

    if (zoomChanged) {
      await this.sendCommand(['set_property', 'video-zoom', zoom], 1500)
      this.lastAppliedZoom = zoom
    }

    // Strobe and shake are handled by independent timers.
    const strobeAmount = Number.isFinite(unsupportedFx?.strobe) ? clamp(unsupportedFx.strobe, 0, 1) : 0
    const shakeAmount = Number.isFinite(unsupportedFx?.shake) ? clamp(unsupportedFx.shake, 0, 1) : 0
    const prevFx = this.currentFx
    this.currentFx = { strobe: strobeAmount, shake: shakeAmount, brightness: clampedBrightnessFactor, blackout: Boolean(blackout), scale: clampedScale }

    if (Math.abs((prevFx.strobe || 0) - strobeAmount) > 0.005) {
      this.startStrobeTimer(strobeAmount)
    }
    if (Math.abs((prevFx.shake || 0) - shakeAmount) > 0.005) {
      this.startShakeTimer(shakeAmount)
    }

    if (brightnessChanged || zoomChanged) {
      this.reportDiagnostic('native-fx-applied', {
        brightnessFactor: clampedBrightnessFactor,
        mpvBrightness,
        scale: clampedScale,
        videoZoom: zoom,
        blackout: Boolean(blackout),
        strobe: strobeAmount,
        shake: shakeAmount,
      }, 220)
    }
  }

  async applyOutputState(nextState) {
    this.currentState = nextState || null
    if (!this.enabled) {
      return
    }
    if (!this.mpvProcess) {
      await this.start()
    }

    const layers = Array.isArray(nextState?.layers) ? nextState.layers : []
    const activeSnapshot = getActiveLayerSnapshot(layers)
    this.lastActiveLayerSnapshot = activeSnapshot

    // Deterministic source selection: always use top-most renderable layer.
    const primary = getPrimaryActiveLayer(layers)
    if (primary) {
      this.selectedLayerIndex = primary.layerIndex
      this.lastRenderableAt = Date.now()
    } else {
      this.selectedLayerIndex = null
    }

    if (!primary) {
      const holdElapsedMs = Date.now() - (this.lastRenderableAt || 0)
      const holdingCurrentSource = Boolean(this.currentFilePath) && holdElapsedMs < SOURCE_SELECTION_HOLD_MS

      this.reportDiagnostic('source-selection-none', {
        selectedLayerIndex: this.selectedLayerIndex,
        holdElapsedMs,
        holdMs: SOURCE_SELECTION_HOLD_MS,
        holdingCurrentSource,
        renderableLayers: summarizeRenderableLayers(layers),
      }, 220)

      if (holdingCurrentSource) {
        return
      }

      try {
        await this.sendCommand(['set_property', 'pause', true])
      } catch {
        // Ignore pause failures if process is restarting.
      }
      this.currentFilePath = ''
      return
    }

    const motion = primary.motion || {}
    const masterFx = nextState?.masterFx || {}
    const brightnessFactor = Number.isFinite(masterFx?.brightness) ? masterFx.brightness : 1
    const blackout = Boolean(nextState?.blackout)
    const unsupportedFx = {
      glow: Number.isFinite(masterFx?.glow) ? masterFx.glow : 0,
      strobe: Number.isFinite(masterFx?.strobe) ? masterFx.strobe : 0,
      shake: Number.isFinite(masterFx?.shake) ? masterFx.shake : 0,
    }
    const target = {
      layerIndex: primary.layerIndex,
      slotIndex: primary.slotIndex,
      filePath: primary.filePath,
      inPoint: clamp01(motion.inPoint ?? 0),
      outPoint: clamp01(motion.outPoint ?? 1),
      bounceEnabled: Boolean(motion.bounceEnabled),
      bounceSpeed: Number.isFinite(motion.bounceSpeed) ? motion.bounceSpeed : 1,
      baseSpeed: Number.isFinite(motion.baseSpeed) ? motion.baseSpeed : 1,
      scale: Number.isFinite(motion.scale) ? motion.scale : 1,
      brightnessFactor,
      blackout,
      unsupportedFx,
      reversePath: this.reversePathByFile.get(primary.filePath) || '',
    }

    this.target = target

    this.reportDiagnostic('source-selection', {
      selectedLayerIndex: this.selectedLayerIndex,
      chosenLayerIndex: target.layerIndex,
      chosenSlotIndex: target.slotIndex,
      requestedPath: target.filePath,
      previousPath: this.currentFilePath || '',
      renderableLayers: summarizeRenderableLayers(layers),
    }, 150)

    const sourceChanged = this.currentFilePath !== target.filePath
    if (sourceChanged) {
      this.currentPhase = 'forward'
      this.currentDuration = 0
      try {
        await this.loadSource(target.filePath, 0, target.bounceEnabled ? target.bounceSpeed : target.baseSpeed)
        this.currentFilePath = target.filePath
        try {
          await this.applyNativeVisualState({
            brightnessFactor: target.brightnessFactor,
            scale: target.scale,
            blackout: target.blackout,
            unsupportedFx: target.unsupportedFx,
          })
        } catch {
          // Visual sync failures should not interrupt source switching.
        }
        this.reportDiagnostic('load-source-ok', {
          selectedLayerIndex: this.selectedLayerIndex,
          chosenLayerIndex: target.layerIndex,
          chosenSlotIndex: target.slotIndex,
          requestedPath: target.filePath,
          previousPath: this.currentSourcePath || '',
        }, 80)
      } catch (error) {
        this.currentFilePath = ''
        this.currentSourcePath = ''
        this.lastError = error?.message || 'Native source load failed.'
        this.reportDiagnostic('load-source-error', {
          requestedPath: target.filePath,
          lastError: this.lastError,
          selectedLayerIndex: this.selectedLayerIndex,
          chosenLayerIndex: target.layerIndex,
          chosenSlotIndex: target.slotIndex,
        }, 200)
        return
      }
      if (target.bounceEnabled) {
        this.prepareReverseForTarget(target).catch((error) => {
          this.lastError = error?.message || 'Failed to prepare reverse cache.'
        })
      }
      return
    }

    try {
      await this.applyNativeVisualState({
        brightnessFactor: target.brightnessFactor,
        scale: target.scale,
        blackout: target.blackout,
        unsupportedFx: target.unsupportedFx,
      })
    } catch {
      // Visual sync failures should not interrupt source switching.
    }

    if (target.bounceEnabled) {
      this.prepareReverseForTarget(target).catch((error) => {
        this.lastError = error?.message || 'Failed to prepare reverse cache.'
      })
      try {
        await this.sendCommand(['set_property', 'speed', Math.max(0.05, Math.min(4, target.bounceSpeed))])
      } catch {
        // Ignore speed sync errors during transitions.
      }
    } else {
      this.currentPhase = 'forward'
      try {
        await this.sendCommand(['set_property', 'speed', Math.max(0.05, Math.min(4, target.baseSpeed))])
      } catch {
        // Ignore speed sync errors during transitions.
      }
    }
  }

  async prepareReverseForTarget(target) {
    if (!target?.bounceEnabled || !target.filePath) {
      return
    }

    const filePath = target.filePath
    const cachedReverse = this.reversePathByFile.get(filePath)
    if (cachedReverse) {
      if (this.target && this.target.filePath === filePath) {
        this.target = {
          ...this.target,
          reversePath: cachedReverse,
        }
      }
      return
    }

    const retryAt = this.reverseRetryAt.get(filePath) || 0
    if (Date.now() < retryAt) {
      return
    }

    if (this.reverseEnsureInFlight.has(filePath)) {
      return this.reverseEnsureInFlight.get(filePath)
    }

    const ensureJob = this.ensureReverseCache(filePath)
      .then((reversePath) => {
        this.reversePathByFile.set(filePath, reversePath)
        this.reverseRetryAt.delete(filePath)
        if (this.target && this.target.filePath === filePath) {
          this.target = {
            ...this.target,
            reversePath,
          }
        }
      })
      .catch((error) => {
        this.lastError = error?.message || 'Failed to prepare reverse cache.'
        this.reverseRetryAt.set(filePath, Date.now() + 5000)
      })
      .finally(() => {
        this.reverseEnsureInFlight.delete(filePath)
      })

    this.reverseEnsureInFlight.set(filePath, ensureJob)
    return ensureJob
  }

  startTicking() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
    }

    this.tickTimer = setInterval(() => {
      this.tick().catch((error) => {
        this.lastError = error?.message || 'Native playback tick failure.'
        this.reportDiagnostic('tick-error', {
          lastError: this.lastError,
          lastCommand: this.lastCommandLabel || '',
          filePath: this.target?.filePath || '',
          reversePath: this.target?.reversePath || '',
        }, 800)
      })
    }, 45)
  }

  stopTicking() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  async getProperty(name, fallback = 0) {
    try {
      const value = await this.sendCommand(['get_property', name], 1200)
      return value == null ? fallback : value
    } catch {
      return fallback
    }
  }

  reportDiagnostic(type, details = {}, throttleMs = 3000) {
    if (!this.onDiagnostic) {
      return
    }

    const clipKey = details?.filePath || this.target?.filePath || 'none'
    const key = `${type}:${clipKey}`
    const nextAllowedAt = this.diagnosticThrottleAt.get(key) || 0
    const now = Date.now()
    if (now < nextAllowedAt) {
      return
    }
    this.diagnosticThrottleAt.set(key, now + throttleMs)

    try {
      this.onDiagnostic({
        source: 'native-playback',
        version: NATIVE_ENGINE_VERSION,
        type,
        at: now,
        phase: this.currentPhase,
        filePath: this.target?.filePath || '',
        reversePath: this.target?.reversePath || '',
        ...details,
      })
    } catch {
      // Ignore diagnostic callback failures.
    }
  }

  async tick() {
    if (!this.enabled || !this.socket || !this.target || !this.currentFilePath) {
      return
    }

    if (this.switchInFlight && Date.now() - this.lastSwitchAt < 240) {
      return
    }

    const duration = Number(await this.getProperty('duration', 0))
    let timePos = Number(await this.getProperty('time-pos', Number.NaN))
    const paused = Boolean(await this.getProperty('pause', false))
    const eofReached = Boolean(await this.getProperty('eof-reached', false))
    if (!Number.isFinite(duration) || duration <= 0) {
      return
    }

    // mpv can report null time-pos when it hits EOF with keep-open enabled.
    // Treat this as being at the segment boundary so we can force loop/bounce recovery.
    if (!Number.isFinite(timePos)) {
      if (eofReached) {
        timePos = duration
      } else {
        return
      }
    }

    if (paused) {
      if (this.target?.bounceEnabled) {
        this.reportDiagnostic('paused-during-bounce', {
          timePos,
          duration,
          segmentStart: this.target?.inPoint ?? 0,
          segmentEnd: this.target?.outPoint ?? 1,
        })
      }
      await this.sendCommand(['set_property', 'pause', false])
    }

    this.currentDuration = duration

    const segment = getSegmentInfo(duration, this.target)
    if (!segment) {
      return
    }

    // Switch a bit earlier to avoid EOF auto-pause spikes at segment boundaries.
    const epsilon = 0.09

    if (!this.target.bounceEnabled) {
      if (eofReached || timePos >= segment.end - epsilon || timePos < segment.start - epsilon) {
        if (eofReached) {
          this.reportDiagnostic('freeze-at-boundary-recovered', {
            timePos,
            duration,
            segmentStart: segment.start,
            segmentEnd: segment.end,
            mode: 'loop',
          })
        }
        await this.seekAndPlay(segment.start)
      }
      return
    }

    const reversePath = this.target.reversePath || ''
    if (!reversePath) {
      this.prepareReverseForTarget(this.target).catch((error) => {
        this.lastError = error?.message || 'Failed to prepare reverse cache.'
      })
      if (eofReached || timePos >= segment.end - epsilon) {
        this.reportDiagnostic('bounce-miss-no-reverse', {
          timePos,
          duration,
          segmentStart: segment.start,
          segmentEnd: segment.end,
          retryAt: this.reverseRetryAt.get(this.target.filePath) || 0,
          lastError: this.lastError || '',
        })
        await this.seekAndPlay(segment.start)
      }
      return
    }

    if (this.currentPhase === 'forward') {
      if (eofReached || timePos >= segment.end - epsilon) {
        if (eofReached) {
          this.reportDiagnostic('freeze-at-boundary-recovered', {
            timePos,
            duration,
            segmentStart: segment.start,
            segmentEnd: segment.end,
            mode: 'bounce-forward',
          })
        }
        this.currentPhase = 'reverse'
        const reverseStart = Math.max(0, duration - segment.end)
        this.reportDiagnostic('phase-switch', {
          nextPhase: 'reverse',
          timePos,
          duration,
          reverseStart,
        }, 300)
        await this.loadSource(reversePath, reverseStart, this.target.bounceSpeed)
      }
      return
    }

    const reverseStart = Math.max(0, duration - segment.end)
    const reverseEnd = Math.min(duration, duration - segment.start)

    // If playback parks on the boundary frame and does not advance,
    // force a phase switch after a short stall window.
    const activeBoundary = this.currentPhase === 'forward' ? segment.end : reverseEnd
    const nearBoundary = timePos >= activeBoundary - epsilon
    if (nearBoundary && reversePath) {
      const now = Date.now()
      const samePhase = this.boundaryStallPhase === this.currentPhase
      const samePos = Number.isFinite(this.boundaryStallPos) && Math.abs(this.boundaryStallPos - timePos) < 0.008

      if (!this.boundaryStallAt || !samePhase || !samePos) {
        this.boundaryStallAt = now
        this.boundaryStallPhase = this.currentPhase
        this.boundaryStallPos = timePos
      } else if (now - this.boundaryStallAt >= 260) {
        const forcedFromPhase = this.currentPhase
        this.reportDiagnostic('boundary-stall-forced-switch', {
          timePos,
          duration,
          phase: forcedFromPhase,
          segmentStart: segment.start,
          segmentEnd: segment.end,
          reverseEnd,
        }, 250)

        this.boundaryStallAt = 0
        this.boundaryStallPhase = ''
        this.boundaryStallPos = Number.NaN

        if (forcedFromPhase === 'forward') {
          this.currentPhase = 'reverse'
          const reverseStart = Math.max(0, duration - segment.end)
          await this.loadSource(reversePath, reverseStart, this.target.bounceSpeed)
        } else {
          this.currentPhase = 'forward'
          await this.loadSource(this.target.filePath, segment.start, this.target.bounceSpeed)
        }
        return
      }
    } else {
      this.boundaryStallAt = 0
      this.boundaryStallPhase = ''
      this.boundaryStallPos = Number.NaN
    }

    if (eofReached || timePos >= reverseEnd - epsilon) {
      if (eofReached) {
        this.reportDiagnostic('freeze-at-boundary-recovered', {
          timePos,
          duration,
          segmentStart: reverseStart,
          segmentEnd: reverseEnd,
          mode: 'bounce-reverse',
        })
      }
      this.currentPhase = 'forward'
      this.reportDiagnostic('phase-switch', {
        nextPhase: 'forward',
        timePos,
        duration,
        forwardStart: segment.start,
      }, 300)
      await this.loadSource(this.target.filePath, segment.start, this.target.bounceSpeed)
    }
  }
}

module.exports = {
  NativePlaybackEngine,
}
