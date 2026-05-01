const net = require('node:net')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')

function clamp01(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.min(1, Math.max(0, numeric))
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
      slotIndex: activeSlot.slotIndex,
      filePath: activeSlot.filePath,
      motion: layer.videoMotion || {},
    }
  }

  return null
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
  constructor({ ensureReverseCache, isDev = false }) {
    this.ensureReverseCache = ensureReverseCache
    this.isDev = isDev

    this.enabled = false
    this.mpvPath = resolveMpvPath()
    this.available = Boolean(this.mpvPath)
    this.lastError = this.available ? '' : 'mpv.exe not found. Install mpv and restart SCALEZ.'

    this.pipePath = ''
    this.mpvProcess = null
    this.socket = null
    this.buffer = ''

    this.pending = new Map()
    this.requestId = 1

    this.currentState = null
    this.currentFilePath = ''
    this.currentSourcePath = ''
    this.currentDuration = 0
    this.currentPhase = 'forward'
    this.reversePathByFile = new Map()
    this.switchInFlight = false
    this.lastSwitchAt = 0

    this.tickTimer = null
  }

  getStatus() {
    return {
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
    this.switchInFlight = false

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

  sendCommand(command, timeoutMs = 2000) {
    if (!this.socket) {
      return Promise.reject(new Error('mpv socket not connected.'))
    }

    const requestId = this.requestId
    this.requestId += 1

    const payload = JSON.stringify({
      command,
      request_id: requestId,
    })

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

  async loadSource(filePath, startTime, speed) {
    if (!filePath) {
      return
    }

    const start = Number.isFinite(startTime) ? Math.max(0, startTime) : 0
    const speedValue = Number.isFinite(speed) ? Math.max(0.05, Math.min(4, speed)) : 1

    this.switchInFlight = true
    this.lastSwitchAt = Date.now()

    await this.sendCommand(['loadfile', filePath, 'replace', `start=${start.toFixed(3)}`], 4000)
    await this.sendCommand(['set_property', 'pause', false])
    await this.sendCommand(['set_property', 'speed', speedValue])

    this.currentSourcePath = filePath
    this.currentDuration = 0

    setTimeout(() => {
      this.switchInFlight = false
    }, 120)
  }

  async applyOutputState(nextState) {
    this.currentState = nextState || null
    if (!this.enabled) {
      return
    }
    if (!this.mpvProcess) {
      await this.start()
    }

    const primary = getPrimaryActiveLayer(nextState?.layers)
    if (!primary) {
      try {
        await this.sendCommand(['set_property', 'pause', true])
      } catch {
        // Ignore pause failures if process is restarting.
      }
      this.currentFilePath = ''
      return
    }

    const motion = primary.motion || {}
    const target = {
      layerIndex: primary.layerIndex,
      slotIndex: primary.slotIndex,
      filePath: primary.filePath,
      inPoint: clamp01(motion.inPoint ?? 0),
      outPoint: clamp01(motion.outPoint ?? 1),
      bounceEnabled: Boolean(motion.bounceEnabled),
      bounceSpeed: Number.isFinite(motion.bounceSpeed) ? motion.bounceSpeed : 1,
      baseSpeed: Number.isFinite(motion.baseSpeed) ? motion.baseSpeed : 1,
      reversePath: this.reversePathByFile.get(primary.filePath) || '',
    }

    this.target = target

    const sourceChanged = this.currentFilePath !== target.filePath
    if (sourceChanged) {
      this.currentFilePath = target.filePath
      this.currentPhase = 'forward'
      this.currentDuration = 0
      await this.loadSource(target.filePath, 0, target.bounceEnabled ? target.bounceSpeed : target.baseSpeed)
      if (target.bounceEnabled) {
        this.prepareReverseForTarget(target).catch((error) => {
          this.lastError = error?.message || 'Failed to prepare reverse cache.'
        })
      }
      return
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
    if (target.reversePath) {
      return
    }

    const reversePath = await this.ensureReverseCache(target.filePath)
    this.reversePathByFile.set(target.filePath, reversePath)
    if (!this.target || this.target.filePath !== target.filePath) {
      return
    }

    this.target = {
      ...this.target,
      reversePath,
    }
  }

  startTicking() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
    }

    this.tickTimer = setInterval(() => {
      this.tick().catch((error) => {
        this.lastError = error?.message || 'Native playback tick failure.'
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

  async tick() {
    if (!this.enabled || !this.socket || !this.target || !this.currentFilePath) {
      return
    }

    if (this.switchInFlight && Date.now() - this.lastSwitchAt < 240) {
      return
    }

    const duration = Number(await this.getProperty('duration', 0))
    const timePos = Number(await this.getProperty('time-pos', 0))
    const paused = Boolean(await this.getProperty('pause', false))
    if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(timePos)) {
      return
    }

    if (paused) {
      await this.sendCommand(['set_property', 'pause', false])
    }

    this.currentDuration = duration

    const segment = getSegmentInfo(duration, this.target)
    if (!segment) {
      return
    }

    const epsilon = 0.03

    if (!this.target.bounceEnabled) {
      if (timePos >= segment.end - epsilon || timePos < segment.start - epsilon) {
        await this.sendCommand(['set_property', 'time-pos', segment.start])
        await this.sendCommand(['set_property', 'pause', false])
      }
      return
    }

    const reversePath = this.target.reversePath || ''
    if (!reversePath) {
      if (timePos >= segment.end - epsilon) {
        await this.sendCommand(['set_property', 'time-pos', segment.start])
        await this.sendCommand(['set_property', 'pause', false])
      }
      return
    }

    if (this.currentPhase === 'forward') {
      if (timePos >= segment.end - epsilon) {
        this.currentPhase = 'reverse'
        const reverseStart = Math.max(0, duration - segment.end)
        await this.loadSource(reversePath, reverseStart, this.target.bounceSpeed)
      }
      return
    }

    const reverseEnd = Math.min(duration, duration - segment.start)
    if (timePos >= reverseEnd - epsilon) {
      this.currentPhase = 'forward'
      await this.loadSource(this.target.filePath, segment.start, this.target.bounceSpeed)
    }
  }
}

module.exports = {
  NativePlaybackEngine,
}
