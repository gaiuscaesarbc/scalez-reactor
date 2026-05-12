import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'
import { GeneratedClipRenderer } from '../generatedClips/GeneratedClipRenderer'
import OutputPresetPanel from './OutputPresetPanel'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(value) {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

function getReactiveAmount(level, threshold, mode, amount) {
  const normalizedThreshold = clamp01(threshold)
  const normalizedAmount = clamp01(amount)
  const effectiveRange = Math.max(0.0001, 1 - normalizedThreshold)

  if (mode === 'pulse') {
    const width = 0.1
    const gateStart = clamp01(normalizedThreshold - width * 0.5)
    const gateEnd = clamp01(normalizedThreshold + width * 0.5)
    const gateRange = Math.max(0.0001, gateEnd - gateStart)
    const gateValue = smoothstep01((clamp01(level) - gateStart) / gateRange)
    return gateValue * normalizedAmount
  }

  const sourceLevel = mode === 'invert' ? 1 - clamp01(level) : clamp01(level)
  const gatedLevel = Math.max(0, sourceLevel - normalizedThreshold)
  const normalizedLevel = gatedLevel / effectiveRange
  return smoothstep01(normalizedLevel) * normalizedAmount
}

function getSpectrumSourceLevel(spectrumLevels, source, fallbackBass) {
  if (!spectrumLevels) {
    return fallbackBass
  }
  if (source === 'sub') return spectrumLevels.sub ?? spectrumLevels.low ?? fallbackBass
  if (source === 'mid') return spectrumLevels.mid ?? fallbackBass
  if (source === 'lowMid') return spectrumLevels.lowMid ?? spectrumLevels.mid ?? fallbackBass
  if (source === 'presence') return spectrumLevels.presence ?? spectrumLevels.high ?? fallbackBass
  if (source === 'high') return spectrumLevels.high ?? fallbackBass
  if (source === 'full') return spectrumLevels.full ?? fallbackBass
  return spectrumLevels.low ?? fallbackBass
}

function toFileUrl(filePath) {
  if (!filePath) {
    return ''
  }
  if (window.scalezApi?.toMediaUrl) {
    return window.scalezApi.toMediaUrl(filePath)
  }
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`)
  }
  return encodeURI(`file://${normalized}`)
}

function getMediaErrorDetails(mediaError) {
  if (!mediaError) {
    return { code: 0, reason: 'Unknown video error' }
  }
  const map = {
    1: 'MEDIA_ERR_ABORTED',
    2: 'MEDIA_ERR_NETWORK',
    3: 'MEDIA_ERR_DECODE',
    4: 'MEDIA_ERR_SRC_NOT_SUPPORTED',
  }
  return {
    code: mediaError.code || 0,
    reason: map[mediaError.code] || mediaError.message || 'Unknown video error',
  }
}

function classifyVideoFailure({ code, reason, playError, filePath }) {
  if (code === 4 || code === 3 || playError?.name === 'NotSupportedError') {
    return {
      type: 'unsupported',
      message: `Unsupported format/codec. Prefer MP4 (H.264) or WebM (VP8/VP9). (${reason})`,
    }
  }
  if (!filePath) {
    return {
      type: 'failed',
      message: 'Missing file path for this slot.',
    }
  }
  if (code === 2) {
    return {
      type: 'failed',
      message: `File path/network issue while loading media. (${reason})`,
    }
  }
  return {
    type: 'failed',
    message: `Playback failed. ${reason}`,
  }
}

function LayerPreviewBadge({ layer }) {
  const active =
    typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null

  return (
    <div className="overlay-chip">
      {layer.label}: {active ? active.clipName || `Slot ${active.slotIndex + 1}` : 'Idle'}
    </div>
  )
}

function seekVideoEfficient(video, timeSeconds) {
  const target = Math.max(0, timeSeconds)
  // For bounce playback we prefer precise seeks over keyframe-only fastSeek,
  // which can look like a freeze on long-GOP media.
  video.currentTime = target
}

function getVideoErrorKey(layerIndex, slotIndex, filePath) {
  return `${layerIndex}-${slotIndex}-${filePath || 'no-file'}`
}

function getSegmentBounds(video, motion) {
  if (!video || Number.isNaN(video.duration) || !Number.isFinite(video.duration) || video.duration <= 0) {
    return null
  }

  const inPoint = clamp01(motion?.inPoint ?? 0)
  const outPoint = clamp01(motion?.outPoint ?? 1)
  const start = video.duration * Math.min(inPoint, Math.max(0, outPoint - 0.01))
  const end = video.duration * Math.max(outPoint, inPoint + 0.01)

  return {
    start,
    end,
    length: Math.max(0.05, end - start),
  }
}

function getBounceClipKey(filePath) {
  return filePath || '__empty__'
}

const resumeAttemptAtRef = new WeakMap()

function tryResumeVideo(video, minIntervalMs = 500) {
  if (!video || !video.paused) {
    return  // PHASE 2: Early return if not paused (avoid reflexive play calls)
  }
  const now = performance.now()
  const lastAttemptAt = resumeAttemptAtRef.get(video) || 0
  if (now - lastAttemptAt < minIntervalMs) {
    return
  }
  resumeAttemptAtRef.set(video, now)
  const playPromise = video.play?.()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore play races while source/seek is being updated.
    })
  }
}

const MIN_SUPPORTED_PLAYBACK_RATE = 0.0625
const MAX_SUPPORTED_PLAYBACK_RATE = 16

function setSafePlaybackRate(video, rate) {
  if (!video || !Number.isFinite(rate)) {
    return
  }

  const safeRate = Math.max(MIN_SUPPORTED_PLAYBACK_RATE, Math.min(MAX_SUPPORTED_PLAYBACK_RATE, rate))
  // PHASE 2: Increase threshold to avoid micro-adjustments (was 0.015)
  if (Number.isFinite(video.playbackRate) && Math.abs(video.playbackRate - safeRate) < 0.025) {
    return  // Skip write if change is insignificant
  }
  try {
    video.playbackRate = safeRate
  } catch {
    // Some codecs reject extreme values; fallback to minimum supported speed.
    video.playbackRate = MIN_SUPPORTED_PLAYBACK_RATE
  }
}

function blendModeToCanvasOperation(mode) {
  if (mode === 'add') {
    return 'lighter'
  }
  if (mode === 'screen') {
    return 'screen'
  }
  return 'source-over'
}

const BOUNCE_FORWARD_RETRY_LIMIT = 3
const BOUNCE_REVERSE_COOLDOWN_MS = 30000
const BOUNCE_FORWARD_RETRY_RESET_MS = 15000
const BOUNCE_BROWSER_EPSILON_SECONDS = 0.09
const BOUNCE_SWITCH_COOLDOWN_MS = 120
const ASPECT_PANEL_HIDE_DELAY_MS = 2800
const BOUNCE_WATCHDOG_RESUME_COOLDOWN_MS = 350

// ============================================================
// PHASE 1 WATCHDOG TUNING: Reduce decoder churn
// Goal: Tolerate longer stalls with fewer interventions
// instead of aggressive ~1.5s recovery cycle
// ============================================================
const STALL_WATCHDOG_INTERVAL_MS = 500 // was 250: check less frequently
const STALL_DETECT_MS = 2000
const STALL_DETECT_MULTILAYER_MS = 2500 // was 1400: tolerate longer stalls
const STALL_RECOVERY_COOLDOWN_MS = 7000
const STALL_RECOVERY_COOLDOWN_MULTILAYER_MS = 2000 // was 800: space out recovery attempts further
const STALL_MAX_NUDGE_ATTEMPTS = 1
const STALL_HARD_RESET_COOLDOWN_MS = 20000
const STALL_PROGRESS_GRACE_MS = 1800
const STALL_SUCCESS_RESET_MS = 12000
const STALL_FAIL_AFTER_ATTEMPTS = 4
const STALL_MULTILAYER_MICRO_SEEK_MS = 3000 // was 1400: allow longer before seeking
const STALL_MULTILAYER_MAX_SEEK_BURST = 2
const STALL_MULTILAYER_SEEK_COOLDOWN_MS = 9000
const STALL_PAUSE_PLAY_COOLDOWN_MS = 900
const STALL_SINGLE_LAYER_PAUSE_PLAY_ATTEMPTS = 2
const STALL_SINGLE_LAYER_LOW_RATE_SKIP = 0.08
const pausePlayAttemptAtRef = new WeakMap()

function tryPausePlayNudge(video, minIntervalMs = STALL_PAUSE_PLAY_COOLDOWN_MS) {
  if (!video) {
    return false
  }
  const now = performance.now()
  const lastAttemptAt = pausePlayAttemptAtRef.get(video) || 0
  if (now - lastAttemptAt < minIntervalMs) {
    return false
  }
  pausePlayAttemptAtRef.set(video, now)

  try {
    if (!video.paused) {
      video.pause()
    }
  } catch {
    // ignore pause races
  }

  const playPromise = video.play?.()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore play races while source/seek is being updated.
    })
  }
  return true
}

function isMediaDebugEnabled() {
  if (!import.meta.env.DEV) {
    return false
  }
  try {
    const value = window.localStorage?.getItem('scalez-debug-media')
    if (value == null) {
      return true
    }
    return value !== '0'
  } catch {
    return true
  }
}

function isBenignSourceResetError(event) {
  const video = event?.currentTarget
  if (!video || video.error?.code !== 4) {
    return false
  }

  const hasNoSource = !video.currentSrc && !video.getAttribute('src')
  const networkEmpty =
    typeof HTMLMediaElement !== 'undefined'
      ? video.networkState === HTMLMediaElement.NETWORK_EMPTY
      : video.networkState === 0

  return hasNoSource && networkEmpty
}

const MEDIA_DEBUG = isMediaDebugEnabled()

function OutputPreview({
  layers,
  fps,
  bassLevel,
  spectrumLevels,
  spectrumBins,
  bpm = 140,
  masterFx,
  blackout,
  showOverlays,
  markSlotFailed,
  enablePreload = true,
  energyState = 'calm',
  energyIntensity = 0,
  smoothedEnergyFx = {},
  energyFxMapping = {},
  energyStrobeCount = 0,
  energySystemEnabled = false,
  smoothedDropFx = {},
  dropStrobeCount = 0,
  generatedQualityMode = 'safe',
  generatedMaxFps = 45,
  performanceOutputMode = false,
}) {
  const previewWrapRef = useRef(null)
  const previewRef = useRef(null)
  const videoRefsRef = useRef({})
  const preloadedRefsRef = useRef({})
  const srcLogRef = useRef({})
  const canPlayLogRef = useRef({})
  const [bounceRenderVersion, setBounceRenderVersion] = useState(0)
  const [strobeFlash, setStrobeFlash] = useState({ key: 0, opacity: 0 })
  const [perfStats, setPerfStats] = useState({ cpuPercent: 0, gpuPercent: 0 })
  const [videoRemountVersion, setVideoRemountVersion] = useState({})
  const [activePreset, setActivePreset] = useState('16-9')
  const [isAspectPanelVisible, setIsAspectPanelVisible] = useState(true)
  const [isPreviewPointerInside, setIsPreviewPointerInside] = useState(false)
  const playAttemptRef = useRef({})
  const playRejectLogRef = useRef({})
  const successfulCanPlayRef = useRef({})
  const bounceCanPlaySeekRef = useRef({})
  const manualStrobeTimeoutRef = useRef(null)
  const energyStrobeTimeoutRef = useRef(null)
  const dropStrobeTimeoutRef = useRef(null)
  const lastStrobeLevelRef = useRef(0)
  const aspectPanelHideTimerRef = useRef(null)
  const isOutputWindowRef = useRef(false)
  const outputTelemetryRef = useRef({
    totalStallDetections: 0,
    totalSoftRecoveries: 0,
    lastRecoveryAt: 0,
    lastStallAt: 0,
    health: 'Healthy',
    lastPublishedAt: 0,
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    isOutputWindowRef.current = params.get('window') === 'output'
  }, [])

  const publishOutputTelemetry = useCallback((force = false) => {
    if (!isOutputWindowRef.current) {
      return
    }

    const now = Date.now()
    const telemetry = outputTelemetryRef.current
    const recentlyRecovered = now - (telemetry.lastRecoveryAt || 0) <= 9000
    const recentlyStalled = now - (telemetry.lastStallAt || 0) <= 20000
    const health = recentlyRecovered
      ? 'Recovering'
      : recentlyStalled
        ? 'Warning'
        : 'Healthy'

    const shouldPublish = force || now - telemetry.lastPublishedAt >= 1000 || health !== telemetry.health
    if (!shouldPublish) {
      return
    }

    telemetry.health = health
    telemetry.lastPublishedAt = now

    window.scalezApi?.publishOutputTelemetry?.({
      totalStallDetections: telemetry.totalStallDetections,
      totalSoftRecoveries: telemetry.totalSoftRecoveries,
      lastRecoveryAt: telemetry.lastRecoveryAt,
      health: telemetry.health,
    })
  }, [])

  const clearAspectPanelHideTimer = useCallback(() => {
    if (aspectPanelHideTimerRef.current) {
      clearTimeout(aspectPanelHideTimerRef.current)
      aspectPanelHideTimerRef.current = null
    }
  }, [])

  const revealAspectPanel = useCallback(() => {
    setIsAspectPanelVisible(true)
  }, [])

  const scheduleAspectPanelHide = useCallback(() => {
    clearAspectPanelHideTimer()
    if (isPreviewPointerInside) {
      return
    }
    aspectPanelHideTimerRef.current = setTimeout(() => {
      setIsAspectPanelVisible(false)
      aspectPanelHideTimerRef.current = null
    }, ASPECT_PANEL_HIDE_DELAY_MS)
  }, [clearAspectPanelHideTimer, isPreviewPointerInside])

  const refreshBounceRender = () => {
    setBounceRenderVersion((version) => version + 1)
  }

  function getBounceSegmentBounds(video, motion, phase) {
    const segment = getSegmentBounds(video, motion)
    if (!segment) {
      return null
    }

    if (phase !== 'reverse') {
      return segment
    }

    return {
      start: Math.max(0, video.duration - segment.end),
      end: Math.min(video.duration, video.duration - segment.start),
      length: segment.length,
    }
  }
  const videoErrorLogRef = useRef({})
  const timelineProgressRef = useRef({})
  const lastTimelineTriggerRef = useRef({})
  const timelineDynamicsRef = useRef({})
  const timelineLinkDynamicsRef = useRef({})
  const lastTimelineApplyAtRef = useRef({})
  const stallWatchRef = useRef({})
  const stallRecoveryStatsRef = useRef({})
  const stallSeekGuardRef = useRef({})
  const activeClipKeyRef = useRef({})
  const bouncePhaseRef = useRef({})
  const reverseClipPathRef = useRef({})
  const reverseClipRequestRef = useRef({})
  const reverseClipRebuildAttemptsRef = useRef({})
  const forwardRecoverAttemptsRef = useRef({})
  const forwardRecoverLastAtRef = useRef({})
  const lastBounceSwitchAtRef = useRef({})
  const reverseCooldownUntilRef = useRef({})
    const lastBounceResumeAtRef = useRef({})
  const lastBounceEnabledRef = useRef({})
  const latestLayersRef = useRef(layers)
  const latestBassRef = useRef(bassLevel)
  const latestSpectrumRef = useRef(spectrumLevels)
  const bpmRef = useRef(bpm)
  const shakeAmountRef = useRef(0)
  const lastShakeFrameAtRef = useRef(0)
  const lastShakeOffsetRef = useRef({})
    const latestActiveCountRef = useRef(0)
  const syncStatus = 'synced'
  const [videoErrors, setVideoErrors] = useState({})
  const bounceClipRequestKey = useMemo(
    () => layers
      .map((layer) => {
        const active = typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
        const filePath = active?.filePath || ''
        const enabled = Boolean(layer.videoMotion?.bounceEnabled)
        return `${layer.layerIndex}:${enabled ? 1 : 0}:${filePath}`
      })
      .join('|'),
    [layers],
  )

  useEffect(() => {
    let disposed = false

    const refreshPerformanceStats = async () => {
      try {
        const stats = await window.scalezApi?.getPerformanceStats?.()
        if (!disposed && stats && typeof stats === 'object') {
          setPerfStats({
            cpuPercent: Number.isFinite(stats.cpuPercent) ? stats.cpuPercent : 0,
            gpuPercent: Number.isFinite(stats.gpuPercent) ? stats.gpuPercent : 0,
          })
        }
      } catch {
        if (!disposed) {
          setPerfStats((current) => current)
        }
      }
    }

    refreshPerformanceStats()
    const timer = setInterval(refreshPerformanceStats, 1000)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    latestLayersRef.current = layers
    latestBassRef.current = bassLevel
    latestSpectrumRef.current = spectrumLevels
    bpmRef.current = bpm
  }, [layers, bassLevel, spectrumLevels, bpm])

  useEffect(() => {
    if (isPreviewPointerInside) {
      clearAspectPanelHideTimer()
      return
    }
    if (!isAspectPanelVisible) {
      return
    }
    scheduleAspectPanelHide()
  }, [
    clearAspectPanelHideTimer,
    isAspectPanelVisible,
    isPreviewPointerInside,
    scheduleAspectPanelHide,
  ])

  useEffect(() => () => {
    clearAspectPanelHideTimer()
  }, [clearAspectPanelHideTimer])

  useEffect(() => {
    const nextLevel = blackout ? 0 : Math.min(0.52, Math.pow(masterFx.strobe, 1.35) * 0.58)
    const prevLevel = lastStrobeLevelRef.current
    const activationThreshold = 0.02
    const crossedUp = nextLevel > activationThreshold && prevLevel <= activationThreshold

    if (manualStrobeTimeoutRef.current) {
      clearTimeout(manualStrobeTimeoutRef.current)
      manualStrobeTimeoutRef.current = null
    }

    if (crossedUp) {
      setStrobeFlash((current) => ({
        key: current.key + 1,
        opacity: nextLevel,
      }))
      manualStrobeTimeoutRef.current = setTimeout(() => {
        setStrobeFlash((current) => ({ ...current, opacity: 0 }))
        manualStrobeTimeoutRef.current = null
      }, 180)
    } else if (nextLevel <= activationThreshold) {
      setStrobeFlash((current) => (current.opacity > 0 ? { ...current, opacity: 0 } : current))
    }

    lastStrobeLevelRef.current = nextLevel

    return () => {
      if (manualStrobeTimeoutRef.current) {
        clearTimeout(manualStrobeTimeoutRef.current)
        manualStrobeTimeoutRef.current = null
      }
    }
  }, [masterFx.strobe, blackout])

  useEffect(() => {
    if (!energySystemEnabled || blackout || energyStrobeCount === 0) {
      return
    }

    setStrobeFlash((current) => ({
      key: current.key + 1,
      opacity: 0.9,
    }))

    if (energyStrobeTimeoutRef.current) {
      clearTimeout(energyStrobeTimeoutRef.current)
    }

    energyStrobeTimeoutRef.current = setTimeout(() => {
      setStrobeFlash((current) => ({ ...current, opacity: 0 }))
      energyStrobeTimeoutRef.current = null
    }, 180)

    return () => {
      if (energyStrobeTimeoutRef.current) {
        clearTimeout(energyStrobeTimeoutRef.current)
        energyStrobeTimeoutRef.current = null
      }
    }
  }, [energyStrobeCount, blackout, energySystemEnabled])

  useEffect(() => {
    if (blackout || dropStrobeCount === 0) {
      return
    }

    setStrobeFlash((current) => ({
      key: current.key + 1,
      opacity: 0.75,
    }))

    if (dropStrobeTimeoutRef.current) {
      clearTimeout(dropStrobeTimeoutRef.current)
    }

    dropStrobeTimeoutRef.current = setTimeout(() => {
      setStrobeFlash((current) => ({ ...current, opacity: 0 }))
      dropStrobeTimeoutRef.current = null
    }, 140)

    return () => {
      if (dropStrobeTimeoutRef.current) {
        clearTimeout(dropStrobeTimeoutRef.current)
        dropStrobeTimeoutRef.current = null
      }
    }
  }, [dropStrobeCount, blackout])

  useEffect(() => {
    const energyShakeBoost = energySystemEnabled ? (smoothedEnergyFx?.shakeIntensity ?? 0) : 0
    const dropShakeBoost = smoothedDropFx?.shakeIntensity ?? 0
    const manualShake = Math.max(0, Math.min(1.0, Number(masterFx?.shake ?? 0)))
    const activeLayers = latestActiveCountRef.current

    // Hard safety: with multi-layer energy playback, disable reactive shake contribution
    // and disable shake entirely to prevent renderer stalls.
    if (energySystemEnabled && activeLayers >= 2) {
      shakeAmountRef.current = 0
      return
    }

    shakeAmountRef.current = Math.max(0, Math.min(1.0, manualShake + energyShakeBoost + dropShakeBoost))
  }, [masterFx?.shake, smoothedEnergyFx?.shakeIntensity, smoothedDropFx?.shakeIntensity, energySystemEnabled, layers])

  useEffect(() => {
    const previewEl = previewWrapRef.current || previewRef.current
    if (!previewEl) {
      return undefined
    }

    let frameId = null
    let idleTimerId = null
    const scheduleNextTick = (delayMs = 0) => {
      if (delayMs > 0) {
        if (idleTimerId !== null) {
          clearTimeout(idleTimerId)
        }
        idleTimerId = setTimeout(() => {
          idleTimerId = null
          frameId = requestAnimationFrame(tick)
        }, delayMs)
        return
      }
      frameId = requestAnimationFrame(tick)
    }

    const tick = (timestamp) => {
      const activeLayers = latestActiveCountRef.current
      const minFrameIntervalMs = activeLayers >= 3 ? 50 : activeLayers >= 2 ? 33 : 16
      if (timestamp - lastShakeFrameAtRef.current < minFrameIntervalMs) {
        scheduleNextTick()
        return
      }
      lastShakeFrameAtRef.current = timestamp

      let shakeAmount = shakeAmountRef.current
      if (activeLayers >= 3) {
        shakeAmount = Math.min(shakeAmount, 0.2)
      } else if (activeLayers >= 2) {
        shakeAmount = Math.min(shakeAmount, 0.3)
      }

      if (shakeAmount <= 0.08) {
        const layerOffsets = lastShakeOffsetRef.current
        Object.entries(layerOffsets).forEach(([layerIndex, prev]) => {
          if (prev?.active) {
            previewEl.style.setProperty(`--shake-x-${layerIndex}`, '0px')
            previewEl.style.setProperty(`--shake-y-${layerIndex}`, '0px')
            layerOffsets[layerIndex] = { x: 0, y: 0, active: false }
          }
        })
        // Idle at low rate until shake becomes active again.
        scheduleNextTick(120)
        return
      }

      const currentLayers = latestLayersRef.current || []
      const targetLayerIndices = currentLayers
        .filter((layer) => {
          if (!layer.visible || typeof layer.activeSlotIndex !== 'number') {
            return false
          }
          return Boolean(layer.videoMotion?.shakeEnabled ?? true)
        })
        .map((layer) => layer.layerIndex)

      if (targetLayerIndices.length === 0) {
        const layerOffsets = lastShakeOffsetRef.current
        Object.entries(layerOffsets).forEach(([layerIndex, prev]) => {
          if (prev?.active) {
            previewEl.style.setProperty(`--shake-x-${layerIndex}`, '0px')
            previewEl.style.setProperty(`--shake-y-${layerIndex}`, '0px')
            layerOffsets[layerIndex] = { x: 0, y: 0, active: false }
          }
        })
        scheduleNextTick(120)
        return
      }

      const amplitude = shakeAmount * 5.5
      const t = timestamp / 1000
      const layerOffsets = lastShakeOffsetRef.current
      const targetSet = new Set(targetLayerIndices)

      Object.entries(layerOffsets).forEach(([layerIndex, prev]) => {
        if (prev?.active && !targetSet.has(Number(layerIndex))) {
          previewEl.style.setProperty(`--shake-x-${layerIndex}`, '0px')
          previewEl.style.setProperty(`--shake-y-${layerIndex}`, '0px')
          layerOffsets[layerIndex] = { x: 0, y: 0, active: false }
        }
      })

      targetLayerIndices.forEach((layerIndex) => {
        const phase = layerIndex * 0.71
        const offsetX = (Math.sin(t * 38 + phase) + Math.sin(t * 61 + 0.8 + phase * 0.6) * 0.45) * amplitude * 0.72
        const offsetY = (Math.cos(t * 33 + 0.4 + phase * 0.9) + Math.sin(t * 57 + 1.7 + phase) * 0.4) * amplitude * 0.68
        const prev = layerOffsets[layerIndex] || { x: 0, y: 0, active: false }
        if (Math.abs(offsetX - prev.x) >= 0.15 || Math.abs(offsetY - prev.y) >= 0.15 || !prev.active) {
          previewEl.style.setProperty(`--shake-x-${layerIndex}`, `${offsetX.toFixed(2)}px`)
          previewEl.style.setProperty(`--shake-y-${layerIndex}`, `${offsetY.toFixed(2)}px`)
          layerOffsets[layerIndex] = { x: offsetX, y: offsetY, active: true }
        }
      })

      scheduleNextTick()
    }

    scheduleNextTick(120)
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      if (idleTimerId !== null) {
        clearTimeout(idleTimerId)
      }
      const layerOffsets = lastShakeOffsetRef.current
      Object.keys(layerOffsets).forEach((layerIndex) => {
        previewEl.style.setProperty(`--shake-x-${layerIndex}`, '0px')
        previewEl.style.setProperty(`--shake-y-${layerIndex}`, '0px')
      })
      lastShakeOffsetRef.current = {}
    }
  }, [])

  // Apply per-layer timeline range and audio-reactive playback motion.
  // Runs on a 50ms interval reading from refs so React audio-frame prop changes
  // (bassLevel / spectrumLevels) no longer trigger this as a React effect — preventing
  // the 20fps decoder-interference that caused multi-layer clip stalls.
  useEffect(() => {
    const tick = () => {
    const layers = latestLayersRef.current || []
    const bassLevel = latestBassRef.current
    const spectrumLevels = latestSpectrumRef.current
    const bpm = bpmRef.current
    const now = performance.now()
    const activeLayerCount = layers.reduce(
      (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
      0,
    )
    const multiLayerSafety = activeLayerCount >= 2
    layers.forEach((layer) => {
      const video = videoRefsRef.current[layer.layerIndex]
      if (!video || Number.isNaN(video.duration) || !Number.isFinite(video.duration) || video.duration <= 0) {
        return
      }

      const motion = layer.videoMotion || {}
      const segment = getSegmentBounds(video, motion)
      if (!segment) {
        return
      }
      const { start: segmentStart, end: segmentEnd, length: segmentLength } = segment

      const activeSlot = typeof layer.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
      const activeSlotObj = activeSlot >= 0 ? layer.slots?.[activeSlot] : null
      const clipKey = activeSlotObj?.filePath || `${layer.layerIndex}-none`
      const bounceEnabled = !multiLayerSafety && Boolean(motion.bounceEnabled)
      const prevBounceEnabled = Boolean(lastBounceEnabledRef.current[layer.layerIndex])
      if (prevBounceEnabled !== bounceEnabled) {
        // Reset phase tracking, but do not force a rewind on toggle.
        bouncePhaseRef.current[layer.layerIndex] = 'forward'
        lastBounceEnabledRef.current[layer.layerIndex] = bounceEnabled
        Object.keys(bounceCanPlaySeekRef.current).forEach((key) => {
          if (key.startsWith(`${layer.layerIndex}-`)) {
            delete bounceCanPlaySeekRef.current[key]
          }
        })
        tryResumeVideo(video)
      }

      if (activeClipKeyRef.current[layer.layerIndex] !== clipKey) {
        activeClipKeyRef.current[layer.layerIndex] = clipKey
        timelineProgressRef.current[layer.layerIndex] = 0
        lastTimelineTriggerRef.current[layer.layerIndex] = false
        bouncePhaseRef.current[layer.layerIndex] = 'forward'
        lastBounceEnabledRef.current[layer.layerIndex] = bounceEnabled
        lastTimelineApplyAtRef.current[layer.layerIndex] = 0
        Object.keys(stallRecoveryStatsRef.current).forEach((key) => {
          if (key.startsWith(`${layer.layerIndex}-`)) {
            delete stallRecoveryStatsRef.current[key]
          }
        })
        Object.keys(stallSeekGuardRef.current).forEach((key) => {
          if (key.startsWith(`${layer.layerIndex}-`)) {
            delete stallSeekGuardRef.current[key]
          }
        })
        Object.keys(bounceCanPlaySeekRef.current).forEach((key) => {
          if (key.startsWith(`${layer.layerIndex}-`)) {
            delete bounceCanPlaySeekRef.current[key]
          }
        })
        video.currentTime = segmentStart
      }

      const lastAppliedAt = lastTimelineApplyAtRef.current[layer.layerIndex] || 0
      const minApplyIntervalMs = multiLayerSafety ? 120 : 34
      if (now - lastAppliedAt < minApplyIntervalMs) {
        return
      }
      lastTimelineApplyAtRef.current[layer.layerIndex] = now

      if (multiLayerSafety) {
        // Ultra-safe multi-layer mode: leave the decoder completely alone.
        // Any unnecessary API call (playbackRate set, play()) on a hardware-decoded
        // stream under GPU pressure can cause the decoder to stall. Only resume
        // if the video has genuinely paused (e.g. after OS preemption).
        lastTimelineTriggerRef.current[layer.layerIndex] = false
        // Normalize to 1x if this layer entered multi-layer mode after running a
        // reactive timeline speed in single-layer mode.
        if (Number.isFinite(video.playbackRate) && Math.abs(video.playbackRate - 1) > 0.05) {
          setSafePlaybackRate(video, 1)
        }
        if (video.paused) {
          tryResumeVideo(video)
        }
        return
      }

      if (bounceEnabled) {
        // In reverse phase the reverse clip plays in a mirrored time range.
        // Use phase-aware bounds so we never seek the reverse clip to a
        // forward-range position, which would blank the video on in/out adjustments.
        const bouncePhase = bouncePhaseRef.current[layer.layerIndex] || 'forward'
        const bounceBounds = getBounceSegmentBounds(video, motion, bouncePhase) || segment
        if (video.currentTime < bounceBounds.start || video.currentTime > bounceBounds.end) {
          video.currentTime = bounceBounds.start
          tryResumeVideo(video)
        }
      } else if (video.currentTime < segmentStart || video.currentTime > segmentEnd) {
        video.currentTime = segmentStart
      }

      const bpmValue = Number.isFinite(bpm) ? bpm : 140
      const tempoScale = Math.max(0.25, Math.min(2.5, bpmValue / 140))

      const speedLevel = getSpectrumSourceLevel(spectrumLevels, motion.speedSource || 'low', bassLevel)
      const speedBoost = getReactiveAmount(
        speedLevel,
        motion.speedThreshold ?? 0.12,
        motion.speedMode || 'normal',
        motion.speedAmount ?? 0,
      )

      // Tempo-sync playback: 140 BPM is the 1.0x baseline.
      // Set the app BPM to your music's BPM via tap tempo or manual input
      // and all clips will scale proportionally.
      // Baseline playback rate. Timeline speed controls below are allowed to override
      // this in both normal and bounce modes.
      const baselinePlaybackRate = bounceEnabled
        ? Math.max(0.05, Math.min(4, (motion.bounceSpeed ?? 1) * tempoScale + speedBoost))
        : Math.max(0.05, Math.min(4, (motion.baseSpeed ?? 1) * tempoScale + speedBoost))

      setSafePlaybackRate(video, baselinePlaybackRate)

      const timelineLevel = getSpectrumSourceLevel(spectrumLevels, motion.timelineSource || 'low', bassLevel)
      const timelineAmount = clamp01(motion.timelineAmount ?? 0)
      const timelineLinkAmount = clamp01(motion.timelineLinkAmount ?? 0)
      const timelineLinkSource = motion.timelineLinkSource || motion.timelineSource || 'low'
      const timelineLinkMode = motion.timelineLinkMode || 'normal'
      const timelineLinkThreshold = clamp01(motion.timelineLinkThreshold ?? 0.12)
      const timelineLinkLevel = getSpectrumSourceLevel(spectrumLevels, timelineLinkSource, bassLevel)

      if (timelineLinkAmount > 0) {
        let linkSourceLevel = clamp01(timelineLinkLevel)
        if (timelineLinkMode === 'invert') {
          linkSourceLevel = 1 - linkSourceLevel
        }

        const linkDyn =
          timelineLinkDynamicsRef.current[layer.layerIndex] || { min: linkSourceLevel, max: linkSourceLevel }
        const linkNextMin = Math.min(linkSourceLevel, linkDyn.min + 0.0018)
        const linkNextMax = Math.max(linkSourceLevel, linkDyn.max - 0.0018)
        timelineLinkDynamicsRef.current[layer.layerIndex] = { min: linkNextMin, max: linkNextMax }

        const linkRange = Math.max(0.06, linkNextMax - linkNextMin)
        const linkNormalizedBand = clamp01((linkSourceLevel - linkNextMin) / linkRange)
        const linkNormalizedLevel = Math.max(0, linkNormalizedBand - timelineLinkThreshold) / Math.max(0.0001, 1 - timelineLinkThreshold)
        const linkedTimelineSpeed = clamp01(smoothstep01(linkNormalizedLevel) * timelineLinkAmount)

        if (linkedTimelineSpeed <= 0.0001) {
          // Keep media clock moving at a very low speed to avoid pause/play thrash
          // under layered reactive timelines.
          setSafePlaybackRate(video, MIN_SUPPORTED_PLAYBACK_RATE)
          lastTimelineTriggerRef.current[layer.layerIndex] = false
          tryResumeVideo(video)
          return
        }

        setSafePlaybackRate(video, linkedTimelineSpeed)
        lastTimelineTriggerRef.current[layer.layerIndex] = true
        tryResumeVideo(video)
        return
      }

      if (timelineAmount > 0) {
        // Timeline drive in speed mode: 0 level pauses, max level = 1.0x playback.
        // Use a continuous map so this always responds, including when Timeline Mode is pulse.
        const timelineMode = motion.timelineMode || 'normal'
        const threshold = clamp01(motion.timelineThreshold ?? 0.2)
        let sourceLevel = clamp01(timelineLevel)
        if (timelineMode === 'invert') {
          sourceLevel = 1 - sourceLevel
        }

        // Adaptive normalization keeps drive responsive even when a band sits near high values.
        const dyn = timelineDynamicsRef.current[layer.layerIndex] || { min: sourceLevel, max: sourceLevel }
        const nextMin = Math.min(sourceLevel, dyn.min + 0.0018)
        const nextMax = Math.max(sourceLevel, dyn.max - 0.0018)
        timelineDynamicsRef.current[layer.layerIndex] = { min: nextMin, max: nextMax }

        const dynamicRange = Math.max(0.06, nextMax - nextMin)
        const normalizedBand = clamp01((sourceLevel - nextMin) / dynamicRange)
        const normalizedLevel = Math.max(0, normalizedBand - threshold) / Math.max(0.0001, 1 - threshold)
        const drivenSpeed = clamp01(smoothstep01(normalizedLevel) * timelineAmount)
        if (drivenSpeed <= 0.0001) {
          // Keep media clock moving at a very low speed to avoid pause/play thrash
          // under layered reactive timelines.
          setSafePlaybackRate(video, MIN_SUPPORTED_PLAYBACK_RATE)
          lastTimelineTriggerRef.current[layer.layerIndex] = false
          tryResumeVideo(video)
          return
        }

        setSafePlaybackRate(video, drivenSpeed)
        lastTimelineTriggerRef.current[layer.layerIndex] = true
        tryResumeVideo(video)
        return
      }

      tryResumeVideo(video)
    })
    } // end tick
    const intervalId = setInterval(tick, 100)  // PHASE 2: Increased from 50ms to 100ms
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    // Safety net: after layer/motion change, keep active preview videos playing.
    // Disable in multi-layer mode to avoid play() churn under decoder pressure.
    const activeLayerCount = layers.reduce(
      (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
      0,
    )
    if (activeLayerCount >= 2) {
      return
    }

    layers.forEach((layer) => {
      const active = typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
      if (!active?.filePath || active.status !== 'loaded') {
        return
      }
      const video = videoRefsRef.current[layer.layerIndex]
      if (!video) {
        return
      }
      tryResumeVideo(video)
    })
  }, [layers])

  useEffect(() => {
    async function ensureReverseClips() {
      const currentLayers = latestLayersRef.current || []
      if (latestActiveCountRef.current >= 2) {
        return
      }

      for (const layer of currentLayers) {
        const active =
          typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
        const filePath = active?.filePath
        const bounceEnabled = Boolean(layer.videoMotion?.bounceEnabled)
        if (!bounceEnabled || !filePath) {
          continue
        }

        const requestKey = getBounceClipKey(filePath)
        const reverseCooldownUntil = reverseCooldownUntilRef.current[requestKey] || 0
        if (Date.now() < reverseCooldownUntil) {
          continue
        }

        const cachedReversePath = reverseClipPathRef.current[requestKey]
        if (cachedReversePath) {
          const exists = await window.scalezApi?.pathExists?.(cachedReversePath)
          if (exists === false) {
            // Reverse cache file went missing (deleted/moved). Drop stale path and rebuild.
            delete reverseClipPathRef.current[requestKey]
            delete reverseClipRebuildAttemptsRef.current[requestKey]
            refreshBounceRender()
          } else {
            continue
          }
        }

        if (reverseClipPathRef.current[requestKey] || reverseClipRequestRef.current[requestKey]) {
          continue
        }

        reverseClipRequestRef.current[requestKey] = true
        try {
          const reversedPath = await window.scalezApi?.ensureReverseCache?.(filePath)
          if (reversedPath) {
            reverseClipPathRef.current[requestKey] = reversedPath
            refreshBounceRender()
          }
        } catch (error) {
          if (MEDIA_DEBUG) {
            console.warn(`[bounce:reverse-cache] failed file=${filePath} message=${error?.message || 'n/a'}`)
          }
        } finally {
          delete reverseClipRequestRef.current[requestKey]
        }
      }
    }

    void ensureReverseClips()
  }, [bounceClipRequestKey])

  // Cleanup unused video elements (long-session safety)
  useEffect(() => {
    return () => {
      Object.values(videoRefsRef.current).forEach((video) => {
        if (video) {
          video.pause()
          video.src = ''
        }
      })
      Object.values(preloadedRefsRef.current).forEach((video) => {
        if (video) {
          video.pause()
          video.src = ''
        }
      })
    }
  }, [])

  // Preload clips near active slots (nearby range)
  useEffect(() => {
    const activeLayerCount = layers.reduce(
      (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
      0,
    )

    // Multi-layer playback is decoder-heavy already. Avoid hidden preloads in this state,
    // which can starve active streams and look like a freeze when another layer engages.
    const shouldPreload = enablePreload && activeLayerCount <= 1

    if (!shouldPreload) {
      Object.values(preloadedRefsRef.current).forEach((video) => {
        if (video) {
          video.pause()
          video.src = ''
        }
      })
      preloadedRefsRef.current = {}
      return
    }

    const toPreload = new Set()

    layers.forEach((layer) => {
      const activeSlot = typeof layer.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
      if (activeSlot >= 0) {
        // Preload: active slot and ±1 slot around it to reduce decode pressure.
        for (let i = Math.max(0, activeSlot - 1); i <= Math.min(layer.slots.length - 1, activeSlot + 1); i++) {
          const slot = layer.slots[i]
          if (slot.filePath && slot.status === 'loaded') {
            toPreload.add(`${layer.layerIndex}-${i}`)
          }
        }
      }
    })

    // Cleanup preloads not in target set
    Object.entries(preloadedRefsRef.current).forEach(([key, video]) => {
      if (!toPreload.has(key) && video) {
        video.pause()
        video.src = ''
        delete preloadedRefsRef.current[key]
      }
    })

    // Create preload elements
    toPreload.forEach((key) => {
      if (!preloadedRefsRef.current[key]) {
        const [layerIndex, slotIndex] = key.split('-').map(Number)
        const slot = layers[layerIndex]?.slots[slotIndex]
        if (slot?.filePath) {
          const video = document.createElement('video')
          const src = toFileUrl(slot.filePath)
          video.src = src
          video.preload = 'auto'
          video.muted = true
          if (MEDIA_DEBUG && !srcLogRef.current[`preload-${key}-${src}`]) {
            srcLogRef.current[`preload-${key}-${src}`] = true
            console.info(`[video:src] preload layer=${layerIndex + 1} slot=${slotIndex + 1} src=${src}`)
          }
          preloadedRefsRef.current[key] = video
        }
      }
    })
  }, [layers, enablePreload])

  // Handle video errors
  const handleVideoError = (layerIndex, slotIndex, filePath, sourcePath, errorEvent) => {
    // Ignore errors from stale/unmounted elements (e.g. bounce source-swap teardown).
    // When React replaces the video element due to a key change, the old element can
    // fire MEDIA_ERR_SRC_NOT_SUPPORTED as its src is cleared — that is not a real failure.
    const activeEl = videoRefsRef.current[layerIndex]
    if (errorEvent?.currentTarget !== activeEl) {
      return
    }

    if (isBenignSourceResetError(errorEvent)) {
      return
    }

    const key = getVideoErrorKey(layerIndex, slotIndex, sourcePath || filePath)
    const mediaError = errorEvent?.currentTarget?.error || errorEvent?.target?.error || null
    const { code, reason } = getMediaErrorDetails(mediaError)
    const classification = classifyVideoFailure({ code, reason, filePath: sourcePath || filePath })
    const activeLayer = latestLayersRef.current?.[layerIndex]
    const activeSlotIndex = typeof activeLayer?.activeSlotIndex === 'number' ? activeLayer.activeSlotIndex : -1
    const activeSlot = activeSlotIndex >= 0 ? activeLayer?.slots?.[activeSlotIndex] : null
    const isSameActiveSlot = activeSlotIndex === slotIndex
    const isSameActiveFile = activeSlot?.filePath === filePath

    // Ignore stale events that no longer match the active slot/file for this layer.
    if (!isSameActiveSlot || !isSameActiveFile) {
      return
    }

    // If the reverse companion clip fails to decode, do not kill the original slot.
    // Fallback to forward-only playback and stop retrying this broken reverse cache.
    if (sourcePath && filePath && sourcePath !== filePath) {
      const requestKey = getBounceClipKey(filePath)
      delete reverseClipPathRef.current[requestKey]
      bouncePhaseRef.current[layerIndex] = 'forward'
      reverseCooldownUntilRef.current[requestKey] = Date.now() + BOUNCE_REVERSE_COOLDOWN_MS

      const rebuildAttempts = reverseClipRebuildAttemptsRef.current[requestKey] || 0
      if (rebuildAttempts < 1 && !reverseClipRequestRef.current[requestKey]) {
        reverseClipRebuildAttemptsRef.current[requestKey] = rebuildAttempts + 1
        reverseClipRequestRef.current[requestKey] = true
        window.scalezApi
          ?.rebuildReverseCache?.(filePath)
          .then((rebuiltPath) => {
            if (rebuiltPath) {
              reverseClipPathRef.current[requestKey] = rebuiltPath
            }
          })
          .catch((error) => {
            if (MEDIA_DEBUG) {
              console.warn(
                `[bounce:reverse-rebuild] failed file=${filePath} message=${error?.message || 'n/a'}`,
              )
            }
          })
          .finally(() => {
            delete reverseClipRequestRef.current[requestKey]
            refreshBounceRender()
          })
      }

      refreshBounceRender()
      if (MEDIA_DEBUG && !videoErrorLogRef.current[`reverse-failed-${key}-${code}-${reason}`]) {
        videoErrorLogRef.current[`reverse-failed-${key}-${code}-${reason}`] = true
        console.warn(
          `[bounce:reverse-failed] layer=${layerIndex + 1} slot=${slotIndex + 1} code=${code || 'n/a'} reason=${reason} src=${sourcePath}`,
        )
      }
      return
    }

    const isStillActiveOriginal = activeSlotIndex === slotIndex && activeSlot?.filePath === filePath
    const bounceEnabled = Boolean(activeLayer?.videoMotion?.bounceEnabled)
    const transientForwardFailure = code === 3 || code === 4
    const forwardRetryKey = `${layerIndex}-${slotIndex}-${filePath || 'no-file'}`
    const originalSourceKey = getVideoErrorKey(layerIndex, slotIndex, filePath)
    const hasPlayedOriginal = Boolean(successfulCanPlayRef.current[originalSourceKey])
    const previousRetryCount = forwardRecoverAttemptsRef.current[forwardRetryKey] || 0
    const lastRetryAt = forwardRecoverLastAtRef.current[forwardRetryKey] || 0
    const retryCount = Date.now() - lastRetryAt > BOUNCE_FORWARD_RETRY_RESET_MS ? 0 : previousRetryCount
    const bounceClipKey = getBounceClipKey(filePath)

    // During bounce source swaps, browsers can occasionally report transient source/decode
    // errors on the forward asset right after a successful canplay. Retry once before
    // failing the slot to avoid false-positive slot kills.
    if (isStillActiveOriginal && bounceEnabled && transientForwardFailure && retryCount < BOUNCE_FORWARD_RETRY_LIMIT) {
      forwardRecoverAttemptsRef.current[forwardRetryKey] = retryCount + 1
      forwardRecoverLastAtRef.current[forwardRetryKey] = Date.now()
      bouncePhaseRef.current[layerIndex] = 'forward'

      const failedEl = errorEvent?.currentTarget
      if (failedEl) {
        failedEl.pause()
        failedEl.removeAttribute('src')
        failedEl.load()
      }

      if (MEDIA_DEBUG) {
        console.warn(
          `[bounce:forward-retry] layer=${layerIndex + 1} slot=${slotIndex + 1} code=${code || 'n/a'} reason=${reason} path=${filePath || 'n/a'}`,
        )
      }

      refreshBounceRender()
      return
    }

    // If the original clip has already proven it can play in this session,
    // treat subsequent bounce-time decode/source errors as transient swap instability.
    // Keep the slot alive in forward-only mode instead of marking it failed.
    if (isStillActiveOriginal && bounceEnabled && transientForwardFailure && hasPlayedOriginal) {
      delete reverseClipPathRef.current[bounceClipKey]
      bouncePhaseRef.current[layerIndex] = 'forward'
      reverseCooldownUntilRef.current[bounceClipKey] = Date.now() + BOUNCE_REVERSE_COOLDOWN_MS
      forwardRecoverAttemptsRef.current[forwardRetryKey] = 0
      forwardRecoverLastAtRef.current[forwardRetryKey] = Date.now()

      const failedEl = errorEvent?.currentTarget
      if (failedEl) {
        failedEl.pause()
        failedEl.removeAttribute('src')
        failedEl.load()
      }

      if (MEDIA_DEBUG) {
        console.warn(
          `[bounce:forward-known-good-recover] layer=${layerIndex + 1} slot=${slotIndex + 1} code=${code || 'n/a'} reason=${reason}`,
        )
      }

      refreshBounceRender()
      return
    }

    // If forward source-swap errors keep happening for this bounce clip, fall back to
    // forward-only playback for a short cooldown instead of killing the slot.
    if (isStillActiveOriginal && bounceEnabled && transientForwardFailure) {
      delete reverseClipPathRef.current[bounceClipKey]
      bouncePhaseRef.current[layerIndex] = 'forward'
      reverseCooldownUntilRef.current[bounceClipKey] = Date.now() + BOUNCE_REVERSE_COOLDOWN_MS
      forwardRecoverLastAtRef.current[forwardRetryKey] = Date.now()

      if (MEDIA_DEBUG) {
        console.warn(
          `[bounce:cooldown] layer=${layerIndex + 1} slot=${slotIndex + 1} reason=forward-errors cooldownMs=${BOUNCE_REVERSE_COOLDOWN_MS}`,
        )
      }

      refreshBounceRender()
      return
    }

    if (MEDIA_DEBUG && !videoErrorLogRef.current[`${key}-${code}-${reason}`]) {
      videoErrorLogRef.current[`${key}-${code}-${reason}`] = true
      console.error(
        `[video:error] layer=${layerIndex + 1} slot=${slotIndex + 1} code=${code || 'n/a'} reason=${reason} path=${sourcePath || filePath || 'n/a'}`,
      )
    }

    const failedEl = errorEvent?.currentTarget
    if (failedEl) {
      failedEl.pause()
      failedEl.removeAttribute('src')
      failedEl.load()
    }

    delete videoRefsRef.current[layerIndex]

    const preloadKey = `${layerIndex}-${slotIndex}`
    const preloadVideo = preloadedRefsRef.current[preloadKey]
    if (preloadVideo) {
      preloadVideo.pause()
      preloadVideo.src = ''
      delete preloadedRefsRef.current[preloadKey]
    }

    setVideoErrors((prev) => ({ ...prev, [key]: true }))
    if (markSlotFailed) {
      markSlotFailed(layerIndex, slotIndex, classification.message, classification.type)
    }
  }

  const handleVideoCanPlay = (layerIndex, slotIndex, filePath, sourcePath, isBounceEnabled, event) => {
    const effectivePath = sourcePath || filePath
    const key = `${layerIndex}-${slotIndex}-${effectivePath}`
    successfulCanPlayRef.current[getVideoErrorKey(layerIndex, slotIndex, effectivePath)] = true
    if (filePath) {
      successfulCanPlayRef.current[getVideoErrorKey(layerIndex, slotIndex, filePath)] = true
    }
    if (MEDIA_DEBUG && !canPlayLogRef.current[key]) {
      canPlayLogRef.current[key] = true
      console.info(`[video:canplay] layer=${layerIndex + 1} slot=${slotIndex + 1} path=${effectivePath}`)
    }

    // Bounce mode intentionally pauses and seeks manually, so forcing play()
    // here can create AbortError races during transitions.
    if (isBounceEnabled) {
      const video = event.currentTarget
      const layer = latestLayersRef.current?.[layerIndex]
      const phase = bouncePhaseRef.current[layerIndex] || 'forward'
      const bounceCanPlayKey = `${layerIndex}-${slotIndex}-${effectivePath}`
      const bounds = getBounceSegmentBounds(video, layer?.videoMotion || {}, phase)
      const shouldSeekOnCanPlay = !bounceCanPlaySeekRef.current[bounceCanPlayKey]
      if (bounds && shouldSeekOnCanPlay) {
        seekVideoEfficient(video, bounds.start)
        bounceCanPlaySeekRef.current[bounceCanPlayKey] = true
      }
      tryResumeVideo(video, 0)
      setVideoErrors((prev) => {
        const next = { ...prev }
        delete next[getVideoErrorKey(layerIndex, slotIndex, effectivePath)]
        delete next[getVideoErrorKey(layerIndex, slotIndex, filePath)]
        return next
      })
      return
    }

    if (playAttemptRef.current[key]) {
      return
    }
    playAttemptRef.current[key] = true

    const playPromise = event.currentTarget?.paused ? event.currentTarget?.play?.() : null
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((playError) => {
        if (playError?.name === 'AbortError') {
          return
        }
        const classification = classifyVideoFailure({
          code: 3,
          reason: playError?.message || 'play() rejected',
          playError,
          filePath: effectivePath,
        })
        if (MEDIA_DEBUG && !playRejectLogRef.current[key]) {
          playRejectLogRef.current[key] = true
          console.warn(
            `[video:play-reject] layer=${layerIndex + 1} slot=${slotIndex + 1} name=${playError?.name || 'Error'} message=${playError?.message || 'n/a'}`,
          )
        }
        setVideoErrors((prev) => ({ ...prev, [getVideoErrorKey(layerIndex, slotIndex, effectivePath)]: true }))
        if (markSlotFailed) {
          markSlotFailed(layerIndex, slotIndex, classification.message, classification.type)
        }
      })
    }
  }

  function maybeAdvanceBouncePhase(layerIndex, filePath, motion, video) {
    if (latestActiveCountRef.current >= 2) {
      return false
    }

    const segment = getSegmentBounds(video, motion || {})
    if (!segment) {
      return false
    }

    const bounceEnabled = Boolean(motion?.bounceEnabled)
    if (!bounceEnabled) {
      return false
    }

    const bouncePhase = bouncePhaseRef.current[layerIndex] || 'forward'
    const reversePath = reverseClipPathRef.current[getBounceClipKey(filePath)]
    const reverseSegment = getBounceSegmentBounds(video, motion || {}, 'reverse')
    const forwardBoundary = Math.max(segment.start, segment.end - BOUNCE_BROWSER_EPSILON_SECONDS)
    const reverseBoundary = reverseSegment
      ? Math.max(reverseSegment.start, reverseSegment.end - BOUNCE_BROWSER_EPSILON_SECONDS)
      : null

    // Guard against invalid or very small segments (could happen during clip transition).
    // Don't seek if the segment is suspiciously tiny.
    if (segment.length < 0.02 || (reverseSegment && reverseSegment.length < 0.02)) {
      return false
    }

    if (bouncePhase === 'forward' && video.currentTime < segment.start) {
      // Only seek if video is actually playing or paused in a normal state.
      // Skip if video is buffering or in an error state.
      if (video.readyState >= 2) {
        video.currentTime = segment.start
      }
    }
    if (bouncePhase === 'reverse' && reverseSegment && video.currentTime < reverseSegment.start) {
      if (video.readyState >= 2) {
        video.currentTime = reverseSegment.start
      }
    }

    const switchKey = `${layerIndex}-${filePath || 'no-file'}`
    const now = performance.now()
    const lastSwitchAt = lastBounceSwitchAtRef.current[switchKey] || 0
    const canSwitch = now - lastSwitchAt >= BOUNCE_SWITCH_COOLDOWN_MS

    if (!canSwitch) {
      return false
    }

    if (bouncePhase === 'forward' && video.currentTime >= forwardBoundary) {
      if (!reversePath) {
        video.currentTime = segment.start
        tryResumeVideo(video)
        return true
      }
      lastBounceSwitchAtRef.current[switchKey] = now
      bouncePhaseRef.current[layerIndex] = 'reverse'
      refreshBounceRender()
      return true
    }

    if (
      bouncePhase === 'reverse'
      && reverseSegment
      && reverseBoundary !== null
      && video.currentTime >= reverseBoundary
    ) {
      lastBounceSwitchAtRef.current[switchKey] = now
      bouncePhaseRef.current[layerIndex] = 'forward'
      refreshBounceRender()
      return true
    }

    return false
  }

  const handleVideoTimeUpdate = (layerIndex, slotIndex, filePath, motion, event) => {
    if (latestActiveCountRef.current >= 2) {
      return
    }

    const video = event.currentTarget
    const segment = getSegmentBounds(video, motion || {})
    if (!segment) {
      return
    }

    const bounceEnabled = latestActiveCountRef.current < 2 && Boolean(motion?.bounceEnabled)
    const timelineDriven = (motion?.timelineAmount ?? 0) > 0
    if (bounceEnabled) {
      if (maybeAdvanceBouncePhase(layerIndex, filePath, motion, video)) {
        return
      }
      return
    }

    if (timelineDriven) {
      return
    }

    if (video.currentTime < segment.start || video.currentTime >= segment.end) {
      video.currentTime = segment.start
      tryResumeVideo(video)
    }
  }

  // Watchdog: keep bounce switching even when media events become sparse or stall.
  useEffect(() => {
    const tick = () => {
      const currentLayers = latestLayersRef.current || []
      if (latestActiveCountRef.current >= 2) {
        return
      }
      const hasAnyBounceLayer = currentLayers.some((layer) => {
        const active = typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
        return Boolean(layer?.videoMotion?.bounceEnabled && active?.filePath && active?.status === 'loaded')
      })

      if (!hasAnyBounceLayer) {
        return
      }

      currentLayers.forEach((layer) => {
        const motion = layer?.videoMotion || {}
        if (!motion?.bounceEnabled) {
          return
        }

        const active =
          typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
        if (!active?.filePath || active.status !== 'loaded') {
          return
        }

        const video = videoRefsRef.current[layer.layerIndex]
        if (!video || Number.isNaN(video.duration) || !Number.isFinite(video.duration) || video.duration <= 0) {
          return
        }

        // Verify video is still mounted in DOM (not stale after remount).
        // Skip frame if video is not in document to avoid seeking stale references.
        if (!document.contains(video)) {
          return
        }

        maybeAdvanceBouncePhase(layer.layerIndex, active.filePath, motion, video)

        // Avoid hammering play() every frame when multiple layers/effects are active.
        const resumeKey = `${layer.layerIndex}-${active.filePath || 'no-file'}`
        const now = performance.now()
        const lastResumeAt = lastBounceResumeAtRef.current[resumeKey] || 0
        if (video.paused && now - lastResumeAt >= BOUNCE_WATCHDOG_RESUME_COOLDOWN_MS) {
          lastBounceResumeAtRef.current[resumeKey] = now
          tryResumeVideo(video)
        }
      })
    }

    const intervalId = setInterval(tick, 100)
    return () => {
      clearInterval(intervalId)
    }
  }, [])

  // Watchdog: recover layers whose decoded frame clock stops advancing.
  useEffect(() => {
    const tick = () => {
      const currentLayers = latestLayersRef.current || []
      const now = performance.now()
      const nextWatch = {}

      currentLayers.forEach((layer) => {
        const active = typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
        if (!active?.filePath || active.status !== 'loaded') {
          return
        }

        const video = videoRefsRef.current[layer.layerIndex]
        if (!video || video.readyState < 2 || !Number.isFinite(video.currentTime)) {
          return
        }

        const watchKey = `${layer.layerIndex}-${active.filePath}`
        const prev = stallWatchRef.current[watchKey] || {
          lastTime: video.currentTime,
          lastAdvanceAt: now,
          lastRecoverAt: 0,
        }

        const currentTime = video.currentTime
        const progressed = Math.abs(currentTime - prev.lastTime) >= 0.002
        const next = {
          ...prev,
          lastTime: currentTime,
          lastAdvanceAt: progressed ? now : prev.lastAdvanceAt,
        }

        if (progressed) {
          const stallStats = stallRecoveryStatsRef.current[watchKey] || {
            nudgeAttempts: 0,
            lastHardResetAt: 0,
            lastRecoverAt: 0,
          }
          const sinceRecover = now - (stallStats.lastRecoverAt || 0)
          const shouldResetAttempts = sinceRecover >= STALL_SUCCESS_RESET_MS
          stallRecoveryStatsRef.current[watchKey] = {
            nudgeAttempts: shouldResetAttempts ? 0 : (stallStats.nudgeAttempts || 0),
            lastHardResetAt: stallStats.lastHardResetAt || 0,
            lastRecoverAt: stallStats.lastRecoverAt || 0,
          }
          if (shouldResetAttempts) {
            delete stallSeekGuardRef.current[watchKey]
          }
          nextWatch[watchKey] = next
          return
        }

        if (video.paused) {
          const lastResumeAt = lastBounceResumeAtRef.current[watchKey] || 0
          if (now - lastResumeAt >= BOUNCE_WATCHDOG_RESUME_COOLDOWN_MS) {
            lastBounceResumeAtRef.current[watchKey] = now
            tryResumeVideo(video)
          }
          nextWatch[watchKey] = next
          return
        }

        const isMultiLayer = (latestActiveCountRef.current || 0) >= 2
        // When timeline logic intentionally drives very low playback rates,
        // currentTime can appear nearly static. Treat this as intentional.
        if (!isMultiLayer && Number.isFinite(video.playbackRate) && video.playbackRate <= STALL_SINGLE_LAYER_LOW_RATE_SKIP) {
          nextWatch[watchKey] = next
          return
        }

        const stalledForMs = now - next.lastAdvanceAt
        const stallThreshold = isMultiLayer ? STALL_DETECT_MULTILAYER_MS : STALL_DETECT_MS
        const recoveryCooldown = isMultiLayer
          ? STALL_RECOVERY_COOLDOWN_MULTILAYER_MS
          : STALL_RECOVERY_COOLDOWN_MS
        const canRecover = now - next.lastRecoverAt >= recoveryCooldown
        if (stalledForMs >= stallThreshold && canRecover) {
          outputTelemetryRef.current.totalStallDetections += 1
          outputTelemetryRef.current.lastStallAt = Date.now()
          publishOutputTelemetry(false)

          // In multi-layer mode avoid hard-reset/remount cascades, but still attempt
          // lightweight local recovery so a frozen layer does not remain frozen forever.
          if (isMultiLayer) {
            const stallStats = stallRecoveryStatsRef.current[watchKey] || {
              nudgeAttempts: 0,
              lastHardResetAt: 0,
              lastRecoverAt: 0,
            }
            const seekGuard = stallSeekGuardRef.current[watchKey] || {
              seekBurstCount: 0,
              cooldownUntil: 0,
            }

            // PHASE 1: Reduce decoder churn by using cheaper recovery first
            // Recovery strategy (escalating):
            // 1. Attempt 1-2: Simple pause/play (cheap, no seek)
            // 2. Attempt 3+: Micro-seek as last resort
            const attemptCount = stallStats.nudgeAttempts || 0
            const seekCooldownActive = now < (seekGuard.cooldownUntil || 0)
            let recoveryAction = 'none'

            // Step 1: Ensure rate is at 1x in multi-layer mode
            if (Number.isFinite(video.playbackRate) && Math.abs(video.playbackRate - 1) > 0.05) {
              setSafePlaybackRate(video, 1)
            }

            // Step 2: Cheap pause/play recovery for early attempts
            if (attemptCount < 2) {
              let nudged = false
              // Try pause/play as primary recovery (no seek involved)
              if (video.paused) {
                tryResumeVideo(video, 0)
                nudged = true
              } else if (stalledForMs >= STALL_MULTILAYER_MICRO_SEEK_MS * 0.5) {
                nudged = tryPausePlayNudge(video)
              }
              if (nudged) {
                recoveryAction = 'pause-play'
              }
            } else {
              // Step 3: Only seek if pause/play hasn't worked after 2 attempts
              if (stalledForMs >= STALL_MULTILAYER_MICRO_SEEK_MS && !seekCooldownActive) {
                const segment = getSegmentBounds(video, layer.videoMotion || {})
                if (segment) {
                  const nudgeTarget = Math.min(segment.end - 0.01, Math.max(segment.start + 0.01, currentTime + 0.016))
                  if (Number.isFinite(nudgeTarget) && Math.abs(nudgeTarget - currentTime) >= 0.004) {
                    seekVideoEfficient(video, nudgeTarget)
                    recoveryAction = 'micro-seek'
                  }
                } else if (Number.isFinite(currentTime)) {
                  const fallbackTarget = Math.max(0, currentTime + 0.016)
                  if (Math.abs(fallbackTarget - currentTime) >= 0.004) {
                    seekVideoEfficient(video, fallbackTarget)
                    recoveryAction = 'micro-seek'
                  }
                }
              } else if (stalledForMs >= STALL_MULTILAYER_MICRO_SEEK_MS * 0.7) {
                const nudged = video.paused ? (tryResumeVideo(video, 0), true) : tryPausePlayNudge(video)
                if (nudged) {
                  recoveryAction = seekCooldownActive ? 'pause-play-cooldown' : 'pause-play'
                }
              }
            }

            if (recoveryAction === 'micro-seek') {
              const nextBurstCount = (seekGuard.seekBurstCount || 0) + 1
              const shouldCooldown = nextBurstCount >= STALL_MULTILAYER_MAX_SEEK_BURST
              stallSeekGuardRef.current[watchKey] = {
                seekBurstCount: shouldCooldown ? 0 : nextBurstCount,
                cooldownUntil: shouldCooldown ? now + STALL_MULTILAYER_SEEK_COOLDOWN_MS : (seekGuard.cooldownUntil || 0),
              }
            } else {
              stallSeekGuardRef.current[watchKey] = {
                seekBurstCount: seekGuard.seekBurstCount || 0,
                cooldownUntil: seekGuard.cooldownUntil || 0,
              }
            }

            const didRecover = recoveryAction !== 'none'
            const nextNudgeAttempts = recoveryAction === 'micro-seek'
              ? 1
              : didRecover
                ? Math.min(2, (stallStats.nudgeAttempts || 0) + 1)
                : (stallStats.nudgeAttempts || 0)

            stallRecoveryStatsRef.current[watchKey] = {
              nudgeAttempts: nextNudgeAttempts,
              lastHardResetAt: stallStats.lastHardResetAt || 0,
              lastRecoverAt: didRecover ? now : (stallStats.lastRecoverAt || 0),
            }
            if (didRecover) {
              next.lastRecoverAt = now
              next.lastAdvanceAt = now
              outputTelemetryRef.current.totalSoftRecoveries += 1
              outputTelemetryRef.current.lastRecoveryAt = Date.now()
              publishOutputTelemetry(true)
            }
            
            if (MEDIA_DEBUG && recoveryAction !== 'none') {
              console.warn(
                `[video:stall-soft-recover-multilayer] layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} stalledMs=${Math.round(stalledForMs)} action=${recoveryAction} attempt=${attemptCount + 1}`,
              )
            }
            nextWatch[watchKey] = next
            return
          }

          const stallStats = stallRecoveryStatsRef.current[watchKey] || {
            nudgeAttempts: 0,
            lastHardResetAt: 0,
            lastRecoverAt: 0,
          }
          const sinceLastRecover = now - (stallStats.lastRecoverAt || 0)
          const recentRecover = sinceLastRecover <= STALL_PROGRESS_GRACE_MS
          const effectiveAttempts = recentRecover
            ? Math.max(stallStats.nudgeAttempts || 0, 1)
            : (stallStats.nudgeAttempts || 0)
          const canHardReset = now - stallStats.lastHardResetAt >= STALL_HARD_RESET_COOLDOWN_MS
          const shouldHardReset = effectiveAttempts >= STALL_MAX_NUDGE_ATTEMPTS && canHardReset

          const shouldFailClip = !canHardReset && effectiveAttempts >= STALL_FAIL_AFTER_ATTEMPTS

          if (shouldFailClip) {
            const failKey = getVideoErrorKey(layer.layerIndex, active.slotIndex, active.filePath)
            setVideoErrors((prev) => ({ ...prev, [failKey]: true }))
            if (markSlotFailed) {
              markSlotFailed(layer.layerIndex, active.slotIndex, 'Playback stalled repeatedly; clip disabled to keep output stable.', 'failed')
            }
            try {
              video.pause()
              video.removeAttribute('src')
              video.load()
            } catch {
              // ignore teardown races
            }

            stallRecoveryStatsRef.current[watchKey] = {
              nudgeAttempts: 0,
              lastHardResetAt: stallStats.lastHardResetAt || 0,
              lastRecoverAt: now,
            }
            next.lastRecoverAt = now
            next.lastAdvanceAt = now

            if (MEDIA_DEBUG) {
              console.warn(
                `[video:stall-fail] layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} stalledMs=${Math.round(stalledForMs)}`,
              )
            }

            nextWatch[watchKey] = next
            return
          }

          if (shouldHardReset) {
            setVideoRemountVersion((prev) => ({
              ...prev,
              [layer.layerIndex]: (prev[layer.layerIndex] || 0) + 1,
            }))

            stallRecoveryStatsRef.current[watchKey] = {
              nudgeAttempts: 0,
              lastHardResetAt: now,
              lastRecoverAt: now,
            }
            next.lastRecoverAt = now
            next.lastAdvanceAt = now

            if (MEDIA_DEBUG) {
              console.warn(
                `[video:stall-hard-reset] layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} stalledMs=${Math.round(stalledForMs)}`,
              )
            }

            nextWatch[watchKey] = next
            return
          }

          // Single-layer mode: prefer cheap pause/play nudges before seek-based recovery
          // to reduce visible jumps and decoder churn.
          if (effectiveAttempts < STALL_SINGLE_LAYER_PAUSE_PLAY_ATTEMPTS) {
            let didNudge = false
            if (video.paused) {
              tryResumeVideo(video, 0)
              didNudge = true
            } else {
              didNudge = tryPausePlayNudge(video)
            }

            if (didNudge) {
              stallRecoveryStatsRef.current[watchKey] = {
                nudgeAttempts: effectiveAttempts + 1,
                lastHardResetAt: stallStats.lastHardResetAt || 0,
                lastRecoverAt: now,
              }
              next.lastRecoverAt = now
              next.lastAdvanceAt = now
              outputTelemetryRef.current.totalSoftRecoveries += 1
              outputTelemetryRef.current.lastRecoveryAt = Date.now()
              publishOutputTelemetry(true)

              if (MEDIA_DEBUG) {
                console.warn(
                  `[video:stall-recover] layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} stalledMs=${Math.round(stalledForMs)} action=pause-play`,
                )
              }

              nextWatch[watchKey] = next
              return
            }
          }

          const segment = getSegmentBounds(video, layer.videoMotion || {})
          if (segment) {
            const nudgeTarget = Math.min(segment.end - 0.02, Math.max(segment.start, currentTime + 0.08))
            if (Number.isFinite(nudgeTarget) && nudgeTarget >= segment.start) {
              seekVideoEfficient(video, nudgeTarget)
            }
          } else {
            seekVideoEfficient(video, Math.max(0, currentTime + 0.08))
          }

          tryResumeVideo(video)
          stallRecoveryStatsRef.current[watchKey] = {
            nudgeAttempts: effectiveAttempts + 1,
            lastHardResetAt: stallStats.lastHardResetAt || 0,
            lastRecoverAt: now,
          }
          next.lastRecoverAt = now
          next.lastAdvanceAt = now
          next.lastTime = video.currentTime
          outputTelemetryRef.current.totalSoftRecoveries += 1
          outputTelemetryRef.current.lastRecoveryAt = Date.now()
          publishOutputTelemetry(true)

          if (MEDIA_DEBUG) {
            console.warn(
              `[video:stall-recover] layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} stalledMs=${Math.round(stalledForMs)} action=seek`,
            )
          }
        }

        nextWatch[watchKey] = next
      })

      stallWatchRef.current = nextWatch
      const nextStats = {}
      Object.keys(nextWatch).forEach((key) => {
        nextStats[key] = stallRecoveryStatsRef.current[key] || {
          nudgeAttempts: 0,
          lastHardResetAt: 0,
          lastRecoverAt: 0,
        }
      })
      stallRecoveryStatsRef.current = nextStats
      publishOutputTelemetry(false)
    }

    const intervalId = setInterval(tick, STALL_WATCHDOG_INTERVAL_MS)
    return () => {
      clearInterval(intervalId)
      stallWatchRef.current = {}
      publishOutputTelemetry(true)
    }
  }, [publishOutputTelemetry])

  const handleVideoEnded = (layerIndex, slotIndex, filePath, motion, event) => {
    const video = event.currentTarget
    const segment = getSegmentBounds(video, motion || {})
    if (!segment) {
      return
    }

    const bounceEnabled = latestActiveCountRef.current < 2 && Boolean(motion?.bounceEnabled)
    if (bounceEnabled) {
      const bouncePhase = bouncePhaseRef.current[layerIndex] || 'forward'
      const reversePath = reverseClipPathRef.current[getBounceClipKey(filePath)]

      if (bouncePhase === 'forward') {
        if (reversePath) {
          bouncePhaseRef.current[layerIndex] = 'reverse'
          refreshBounceRender()
          return
        }
        video.currentTime = segment.start
        tryResumeVideo(video)
        return
      }
      bouncePhaseRef.current[layerIndex] = 'forward'
      refreshBounceRender()
      return
    }

    video.currentTime = segment.start
    tryResumeVideo(video)
  }

  const getRenderableLayer = useCallback((layer) => {
    const active = typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null
    const isGeneratedClip = active?.type === 'generated'
    const canRenderVideo =
      layer.visible &&
      active &&
      active.status === 'loaded' &&
      Boolean(active.filePath || isGeneratedClip) &&
      !videoErrors[getVideoErrorKey(layer.layerIndex, active.slotIndex, active.filePath)]

    if (!canRenderVideo) {
      return {
        canRenderVideo: false,
        isGeneratedClip: false,
        active,
        bounceReady: false,
        effectivePath: active?.filePath || '',
        src: '',
      }
    }

    if (isGeneratedClip) {
      return {
        canRenderVideo: true,
        isGeneratedClip: true,
        active,
        bounceReady: false,
        effectivePath: '',
        src: '',
      }
    }

    const bounceEnabled = latestActiveCountRef.current < 2 && Boolean(layer.videoMotion?.bounceEnabled)
    const bouncePhase = bouncePhaseRef.current[layer.layerIndex] || 'forward'
    const reversePath = reverseClipPathRef.current[getBounceClipKey(active.filePath)]
    const bounceReady = bounceEnabled && Boolean(reversePath)
    const effectivePath = bounceEnabled && bouncePhase === 'reverse' && reversePath
      ? reversePath
      : active.filePath

    return {
      canRenderVideo: true,
      isGeneratedClip: false,
      active,
      bounceReady,
      effectivePath,
      src: toFileUrl(effectivePath),
    }
  }, [videoErrors])

  const activeCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )

  useEffect(() => {
    latestActiveCountRef.current = activeCount
  }, [activeCount])

  // Keep the base video at full brightness.
  const baseLayerOpacity = 1
  const outputOverlayEnabled = Boolean(showOverlays)

  // PART 3: Merge energy FX with manual FX (additive, clamped).
    const energyBrightnessBoost = energySystemEnabled ? (smoothedEnergyFx?.brightnessBoost ?? 0) : 0
    const dropBrightnessBoost = smoothedDropFx?.brightnessBoost ?? 0
    const finalBrightness = Math.max(0.5, Math.min(1.5, masterFx.brightness + energyBrightnessBoost + dropBrightnessBoost))
   

    const strobeActive = strobeFlash.opacity > 0.01

  return (
    <section
      ref={previewWrapRef}
      className={`output-preview-wrap${isAspectPanelVisible ? '' : ' is-aspect-controls-hidden'}`}
      onPointerEnter={outputOverlayEnabled ? () => {
        setIsPreviewPointerInside((current) => (current ? current : true))
        revealAspectPanel()
        clearAspectPanelHideTimer()
      } : undefined}
      onPointerMove={outputOverlayEnabled ? () => {
        if (!isAspectPanelVisible) {
          revealAspectPanel()
        }
      } : undefined}
      onPointerLeave={outputOverlayEnabled ? () => {
        setIsPreviewPointerInside((current) => (current ? false : current))
        scheduleAspectPanelHide()
      } : undefined}
      onPointerDown={outputOverlayEnabled ? () => {
        revealAspectPanel()
      } : undefined}
    >
      <div
  ref={previewRef}
  className="output-preview"
  role="img"
  aria-label="Live output preview"
>
        <div className="preview-backdrop" />

        {layers.map((layer) => {
          const renderInfo = getRenderableLayer(layer)
          const active = renderInfo.active
          const canRenderVideo = renderInfo.canRenderVideo
          const isGeneratedClip = renderInfo.isGeneratedClip

          if (!canRenderVideo) {
            return (
              <div
                key={layer.label}
                className="preview-layer-fallback"
                style={{
                  opacity: layer.visible ? layer.opacity * 0.1 : 0,
                  mixBlendMode: blendModeToCss(layer.blendMode),
                }}
              />
            )
          }

          if (isGeneratedClip) {
            return (
              <GeneratedClipRenderer
                key={`generated-${layer.label}-${active.id}`}
                clip={active}
                isActive={true}
                opacity={layer.opacity * baseLayerOpacity}
                blendMode={blendModeToCss(layer.blendMode)}
                transform={`translate3d(var(--shake-x-${layer.layerIndex}, 0px), var(--shake-y-${layer.layerIndex}, 0px), 0)`}
                spectrumLevels={spectrumLevels}
                qualityMode={generatedQualityMode}
                maxFps={generatedMaxFps}
              />
            )
          }

          const bounceEnabled = Boolean(layer.videoMotion?.bounceEnabled)
          const bounceReady = renderInfo.bounceReady
          const effectivePath = renderInfo.effectivePath
          const remountVersion = videoRemountVersion[layer.layerIndex] || 0
          const videoKey = `video-${layer.label}-${effectivePath}-${remountVersion}`
          const src = renderInfo.src
          if (MEDIA_DEBUG && !srcLogRef.current[videoKey]) {
            srcLogRef.current[videoKey] = true
            console.info(
              `[video:src] active layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} path=${effectivePath} src=${src}`,
            )
          }
          return (
            <video
              key={videoKey}
              ref={(el) => {
                videoRefsRef.current[layer.layerIndex] = el
              }}
              className="preview-layer-video"
              src={src}
              autoPlay
              loop={!bounceReady}
              muted
              playsInline
              preload="auto"
              onCanPlay={(event) =>
                handleVideoCanPlay(
                  layer.layerIndex,
                  active.slotIndex,
                  active.filePath,
                  effectivePath,
                  Boolean(layer.videoMotion?.bounceEnabled),
                  event,
                )
              }
              onTimeUpdate={(event) =>
                handleVideoTimeUpdate(
                  layer.layerIndex,
                  active.slotIndex,
                  active.filePath,
                  layer.videoMotion,
                  event,
                )
              }
              onEnded={(event) =>
                handleVideoEnded(
                  layer.layerIndex,
                  active.slotIndex,
                  active.filePath,
                  layer.videoMotion,
                  event,
                )
              }
              onError={(event) =>
                handleVideoError(layer.layerIndex, active.slotIndex, active.filePath, effectivePath, event)
              }
              style={{
                opacity: layer.opacity * baseLayerOpacity,
                mixBlendMode: blendModeToCss(layer.blendMode),
                transform: `translate3d(var(--shake-x-${layer.layerIndex}, 0px), var(--shake-y-${layer.layerIndex}, 0px), 0) scale(${layer.videoMotion?.scale ?? 1})`,
                transformOrigin: 'center center',
                willChange: 'transform',
              }}
            />
          )
        })}

        {activeCount === 0 && (
          <div className="fallback-screen">
            <div className="fallback-content">
              <h1>SCALEZ REACTOR</h1>
              <p>Ready for output</p>
            </div>
          </div>
        )}

       <div
  className="fx-brightness-layer"
  style={{
    opacity: finalBrightness > 1
      ? Math.min(0.85, (finalBrightness - 1) / 1.0)
      : 0,
    willChange: 'opacity',
  }}
/>
<div
  className="fx-dimmer-layer"
  style={{
    opacity: finalBrightness < 1
      ? Math.min(0.85, 1 - finalBrightness)
      : 0,
    willChange: 'opacity',
  }}
/>
<div
  key={`strobe-${strobeFlash.key}`}
  className={`fx-strobe-layer ${strobeActive ? 'is-flash' : ''}`}
  style={{ opacity: strobeFlash.opacity }}
/>
<div className={`fx-blackout-layer ${blackout ? 'is-on' : ''}`} />

        {showOverlays ? (
          <div className="preview-overlays">
            <div className="overlay-row">
              <div className="overlay-chip">FPS {fps}</div>
              <div className="overlay-chip">CPU {Math.max(0, perfStats.cpuPercent).toFixed(1)}%</div>
              <div className="overlay-chip">GPU {Math.max(0, perfStats.gpuPercent).toFixed(1)}%</div>
              <div className="overlay-chip">Videos {activeCount}</div>
              <div className={`overlay-chip sync-status sync-${syncStatus}`}>{syncStatus}</div>
            </div>
            <div className="overlay-row">
              <AudioMeter
                bassLevel={bassLevel}
                spectrumLevels={spectrumLevels}
                spectrumBins={spectrumBins}
                showControls={false}
                showSettings={false}
                showSpectrumBins={false}
              />
              <div className="overlay-stack">
                {layers
                  .slice()
                  .reverse()
                  .map((layer) => (
                    <LayerPreviewBadge key={layer.label} layer={layer} />
                  ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {showOverlays && (
        <OutputPresetPanel
          activePreset={activePreset}
          onPresetChange={(presetId, ratio) => {
            setActivePreset(presetId, ratio)
            revealAspectPanel()
          }}
        />
      )}
    </section>
  )
}

function areOutputPreviewPropsEqual(prev, next) {
  return (
    prev.layers === next.layers
    && prev.fps === next.fps
    && prev.bassLevel === next.bassLevel
    && prev.spectrumLevels === next.spectrumLevels
    && prev.spectrumBins === next.spectrumBins
    && prev.bpm === next.bpm
    && prev.masterFx === next.masterFx
    && prev.blackout === next.blackout
    && prev.showOverlays === next.showOverlays
    && prev.markSlotFailed === next.markSlotFailed
    && prev.enablePreload === next.enablePreload
    && prev.energyState === next.energyState
    && prev.energyIntensity === next.energyIntensity
    && prev.smoothedEnergyFx === next.smoothedEnergyFx
    && prev.energyFxMapping === next.energyFxMapping
    && prev.energyStrobeCount === next.energyStrobeCount
    && prev.energySystemEnabled === next.energySystemEnabled
    && prev.smoothedDropFx === next.smoothedDropFx
    && prev.dropStrobeCount === next.dropStrobeCount
    && prev.generatedQualityMode === next.generatedQualityMode
    && prev.generatedMaxFps === next.generatedMaxFps
    && prev.performanceOutputMode === next.performanceOutputMode
  )
}

export default memo(OutputPreview, areOutputPreviewPropsEqual)
