import { useEffect, useMemo, useRef, useState } from 'react'
import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'

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
  if (source === 'mid') return spectrumLevels.mid ?? fallbackBass
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

function tryResumeVideo(video) {
  if (!video || !video.paused) {
    return
  }
  const playPromise = video.play?.()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {
      // Ignore play races while source/seek is being updated.
    })
  }
}

const BOUNCE_FORWARD_RETRY_LIMIT = 3
const BOUNCE_REVERSE_COOLDOWN_MS = 30000
const BOUNCE_FORWARD_RETRY_RESET_MS = 15000

function isMediaDebugEnabled() {
  if (!import.meta.env.DEV) {
    return false
  }
  try {
    return window.localStorage?.getItem('scalez-debug-media') === '1'
  } catch {
    return false
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

export default function OutputPreview({
  layers,
  fps,
  bassLevel,
  spectrumLevels,
  spectrumBins,
  masterFx,
  blackout,
  showOverlays,
  markSlotFailed,
  enablePreload = true,
}) {
  const videoRefsRef = useRef({})
  const preloadedRefsRef = useRef({})
  const srcLogRef = useRef({})
  const canPlayLogRef = useRef({})
  const [, setBounceRenderVersion] = useState(0)
  const playAttemptRef = useRef({})
  const playRejectLogRef = useRef({})
  const successfulCanPlayRef = useRef({})
  const bounceCanPlaySeekRef = useRef({})

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
  const activeClipKeyRef = useRef({})
  const bouncePhaseRef = useRef({})
  const reverseClipPathRef = useRef({})
  const reverseClipRequestRef = useRef({})
  const reverseClipRebuildAttemptsRef = useRef({})
  const forwardRecoverAttemptsRef = useRef({})
  const forwardRecoverLastAtRef = useRef({})
  const reverseCooldownUntilRef = useRef({})
  const lastBounceEnabledRef = useRef({})
  const latestLayersRef = useRef(layers)
  const latestBassRef = useRef(bassLevel)
  const latestSpectrumRef = useRef(spectrumLevels)
  const [syncStatus, setSyncStatus] = useState('synced')
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

  // Monitor sync status
  useEffect(() => {
    setSyncStatus('synced')
  }, [layers])

  useEffect(() => {
    latestLayersRef.current = layers
    latestBassRef.current = bassLevel
    latestSpectrumRef.current = spectrumLevels
  }, [layers, bassLevel, spectrumLevels])

  // Apply per-layer timeline range and audio-reactive playback motion.
  useEffect(() => {
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
      const bounceEnabled = Boolean(motion.bounceEnabled)
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
        Object.keys(bounceCanPlaySeekRef.current).forEach((key) => {
          if (key.startsWith(`${layer.layerIndex}-`)) {
            delete bounceCanPlaySeekRef.current[key]
          }
        })
        video.currentTime = segmentStart
      }

      if (video.currentTime < segmentStart || video.currentTime > segmentEnd) {
        video.currentTime = segmentStart
      }

      const speedLevel = getSpectrumSourceLevel(spectrumLevels, motion.speedSource || 'low', bassLevel)
      const speedBoost = getReactiveAmount(
        speedLevel,
        motion.speedThreshold ?? 0.12,
        motion.speedMode || 'normal',
        motion.speedAmount ?? 0,
      )
      if (bounceEnabled) {
        const bounceSpeed = Math.max(0.05, Math.min(4, (motion.bounceSpeed ?? 1) + speedBoost))
        video.playbackRate = bounceSpeed
        tryResumeVideo(video)
        return
      }

      const basePlayback = motion.baseSpeed ?? 1
      const playbackRate = Math.max(0.05, Math.min(4, basePlayback + speedBoost))

      video.playbackRate = playbackRate

      const timelineLevel = getSpectrumSourceLevel(spectrumLevels, motion.timelineSource || 'low', bassLevel)
      const timelineDrive = getReactiveAmount(
        timelineLevel,
        motion.timelineThreshold ?? 0.2,
        motion.timelineMode || 'pulse',
        motion.timelineAmount ?? 0,
      )

      if (timelineDrive > 0) {
        const prevProgress = timelineProgressRef.current[layer.layerIndex] ?? 0
        const mode = motion.timelineMode || 'pulse'
        let nextProgress = prevProgress

        if (mode === 'pulse') {
          const wasTriggered = Boolean(lastTimelineTriggerRef.current[layer.layerIndex])
          const isTriggered = timelineDrive > 0
          if (isTriggered && !wasTriggered) {
            nextProgress = (prevProgress + timelineDrive * 0.18) % 1
          }
          lastTimelineTriggerRef.current[layer.layerIndex] = isTriggered
        } else {
          nextProgress = (prevProgress + timelineDrive * 0.035) % 1
          lastTimelineTriggerRef.current[layer.layerIndex] = timelineDrive > 0
        }

        timelineProgressRef.current[layer.layerIndex] = nextProgress
        video.currentTime = segmentStart + nextProgress * segmentLength
      } else {
        lastTimelineTriggerRef.current[layer.layerIndex] = false
      }

      tryResumeVideo(video)
    })
  }, [layers, bassLevel, spectrumLevels])

  useEffect(() => {
    // Safety net: after any layer/motion change, keep active preview videos playing.
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
    if (!enablePreload) {
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
        // Preload: active slot and ±2 slots around it
        for (let i = Math.max(0, activeSlot - 2); i <= Math.min(layer.slots.length - 1, activeSlot + 2); i++) {
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
      tryResumeVideo(video)
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

  const handleVideoTimeUpdate = (layerIndex, slotIndex, filePath, motion, event) => {
    const video = event.currentTarget
    const segment = getSegmentBounds(video, motion || {})
    if (!segment) {
      return
    }

    const bounceEnabled = Boolean(motion?.bounceEnabled)
    const timelineDriven = (motion?.timelineAmount ?? 0) > 0
    if (bounceEnabled) {
      const bouncePhase = bouncePhaseRef.current[layerIndex] || 'forward'
      const reversePath = reverseClipPathRef.current[getBounceClipKey(filePath)]
      const reverseSegment = getBounceSegmentBounds(video, motion || {}, 'reverse')

      if (bouncePhase === 'forward' && video.currentTime < segment.start) {
        video.currentTime = segment.start
      }
      if (bouncePhase === 'reverse' && reverseSegment && video.currentTime < reverseSegment.start) {
        video.currentTime = reverseSegment.start
      }

      if (bouncePhase === 'forward' && video.currentTime >= segment.end) {
        if (!reversePath) {
          video.currentTime = segment.start
          tryResumeVideo(video)
          return
        }
        bouncePhaseRef.current[layerIndex] = 'reverse'
        refreshBounceRender()
      } else if (bouncePhase === 'reverse' && reverseSegment && video.currentTime >= reverseSegment.end) {
        bouncePhaseRef.current[layerIndex] = 'forward'
        refreshBounceRender()
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

  const handleVideoEnded = (layerIndex, slotIndex, filePath, motion, event) => {
    const video = event.currentTarget
    const segment = getSegmentBounds(video, motion || {})
    if (!segment) {
      return
    }

    const bounceEnabled = Boolean(motion?.bounceEnabled)
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

  const activeCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )

  const glowStrength = Math.min(1, masterFx.glow + bassLevel * 0.1)
  const strobeOpacity = blackout ? 0 : Math.min(0.52, Math.pow(masterFx.strobe, 1.35) * 0.58)
  const strobeActive = strobeOpacity > 0.01

  return (
    <section className="output-preview-wrap">
      <div
        className={`output-preview ${masterFx.shake > 0.08 ? 'fx-shake' : ''}`}
        role="img"
        aria-label="Live output preview"
        style={{
          filter: `brightness(${masterFx.brightness})`,
          '--shake-px': `${(masterFx.shake * 5.5).toFixed(2)}px`,
          '--glow-px': `${(8 + glowStrength * 30).toFixed(2)}px`,
          '--glow-alpha': (0.1 + glowStrength * 0.2).toFixed(3),
        }}
      >
        <div className="preview-backdrop" />

        {layers.map((layer) => {
          const active =
            typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null
          const canRenderVideo =
            layer.visible &&
            active &&
            active.status === 'loaded' &&
            Boolean(active.filePath) &&
            !videoErrors[getVideoErrorKey(layer.layerIndex, active.slotIndex, active.filePath)]

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

          const bounceEnabled = Boolean(layer.videoMotion?.bounceEnabled)
          const bouncePhase = bouncePhaseRef.current[layer.layerIndex] || 'forward'
          const reversePath = reverseClipPathRef.current[getBounceClipKey(active.filePath)]
          const bounceReady = bounceEnabled && Boolean(reversePath)
          const effectivePath = bounceEnabled && bouncePhase === 'reverse' && reversePath
            ? reversePath
            : active.filePath
          const videoKey = `video-${layer.label}-${effectivePath}`
          const src = toFileUrl(effectivePath)
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
                opacity: layer.opacity,
                mixBlendMode: blendModeToCss(layer.blendMode),
                transform: `scale(${layer.videoMotion?.scale ?? 1})`,
                transformOrigin: 'center center',
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

        <div className="fx-glow-layer" />
        <div
          className={`fx-strobe-layer ${strobeActive ? 'is-on' : ''}`}
          style={{ opacity: strobeOpacity }}
        />
        <div className={`fx-blackout-layer ${blackout ? 'is-on' : ''}`} />

        {showOverlays ? (
          <div className="preview-overlays">
            <div className="overlay-row">
              <div className="overlay-chip">FPS {fps}</div>
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
    </section>
  )
}
