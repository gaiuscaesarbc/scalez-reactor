import { useEffect, useRef, useState } from 'react'
import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function getReactiveAmount(level, threshold, mode, amount) {
  const normalizedThreshold = clamp01(threshold)
  const normalizedAmount = clamp01(amount)
  const effectiveRange = Math.max(0.0001, 1 - normalizedThreshold)

  if (mode === 'pulse') {
    return level >= normalizedThreshold ? normalizedAmount : 0
  }

  const sourceLevel = mode === 'invert' ? 1 - clamp01(level) : clamp01(level)
  const gatedLevel = Math.max(0, sourceLevel - normalizedThreshold)
  return (gatedLevel / effectiveRange) * normalizedAmount
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
  if (code === 4 || playError?.name === 'NotSupportedError') {
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

export default function OutputPreview({
  layers,
  fps,
  bassLevel,
  spectrumLevels,
  masterFx,
  blackout,
  showOverlays,
  markSlotFailed,
  enablePreload = true,
}) {
  const videoRefsRef = useRef({})
  const preloadedRefsRef = useRef({})
  const srcLogRef = useRef({})
  const timelineProgressRef = useRef({})
  const lastTimelineTriggerRef = useRef({})
  const activeClipKeyRef = useRef({})
  const [syncStatus, setSyncStatus] = useState('synced')
  const [videoErrors, setVideoErrors] = useState({})

  // Monitor sync status
  useEffect(() => {
    setSyncStatus('synced')
  }, [layers])

  // Apply per-layer timeline range and audio-reactive playback motion.
  useEffect(() => {
    layers.forEach((layer) => {
      const video = videoRefsRef.current[layer.layerIndex]
      if (!video || Number.isNaN(video.duration) || !Number.isFinite(video.duration) || video.duration <= 0) {
        return
      }

      const motion = layer.videoMotion || {}
      const inPoint = clamp01(motion.inPoint ?? 0)
      const outPoint = clamp01(motion.outPoint ?? 1)
      const segmentStart = video.duration * Math.min(inPoint, Math.max(0, outPoint - 0.01))
      const segmentEnd = video.duration * Math.max(outPoint, inPoint + 0.01)
      const segmentLength = Math.max(0.05, segmentEnd - segmentStart)

      const activeSlot = typeof layer.activeSlotIndex === 'number' ? layer.activeSlotIndex : -1
      const activeSlotObj = activeSlot >= 0 ? layer.slots?.[activeSlot] : null
      const clipKey = activeSlotObj?.filePath || `${layer.layerIndex}-none`

      if (activeClipKeyRef.current[layer.layerIndex] !== clipKey) {
        activeClipKeyRef.current[layer.layerIndex] = clipKey
        timelineProgressRef.current[layer.layerIndex] = 0
        lastTimelineTriggerRef.current[layer.layerIndex] = false
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
      const playbackRate = Math.max(0.05, Math.min(4, (motion.baseSpeed ?? 1) + speedBoost))
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
    })
  }, [layers, bassLevel, spectrumLevels])

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
          if (import.meta.env.DEV && !srcLogRef.current[`preload-${key}-${src}`]) {
            srcLogRef.current[`preload-${key}-${src}`] = true
            console.info(`[video:src] preload layer=${layerIndex + 1} slot=${slotIndex + 1} src=${src}`)
          }
          preloadedRefsRef.current[key] = video
        }
      }
    })
  }, [layers, enablePreload])

  // Handle video errors
  const handleVideoError = (layerIndex, slotIndex, filePath, errorEvent) => {
    const key = `${layerIndex}-${slotIndex}`
    const mediaError = errorEvent?.currentTarget?.error || errorEvent?.target?.error || null
    const { code, reason } = getMediaErrorDetails(mediaError)
    const classification = classifyVideoFailure({ code, reason, filePath })

    if (import.meta.env.DEV) {
      console.error(
        `[video:error] layer=${layerIndex + 1} slot=${slotIndex + 1} code=${code || 'n/a'} reason=${reason} path=${filePath || 'n/a'}`,
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

  const handleVideoCanPlay = (layerIndex, slotIndex, filePath, event) => {
    if (import.meta.env.DEV) {
      console.info(`[video:canplay] layer=${layerIndex + 1} slot=${slotIndex + 1} path=${filePath}`)
    }

    const playPromise = event.currentTarget?.play?.()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((playError) => {
        const classification = classifyVideoFailure({
          code: 4,
          reason: playError?.message || 'play() rejected',
          playError,
          filePath,
        })
        if (import.meta.env.DEV) {
          console.warn(
            `[video:play-reject] layer=${layerIndex + 1} slot=${slotIndex + 1} name=${playError?.name || 'Error'} message=${playError?.message || 'n/a'}`,
          )
        }
        setVideoErrors((prev) => ({ ...prev, [`${layerIndex}-${slotIndex}`]: true }))
        if (markSlotFailed) {
          markSlotFailed(layerIndex, slotIndex, classification.message, classification.type)
        }
      })
    }
  }

  const activeCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )

  const glowStrength = masterFx.glow + bassLevel * 0.2
  const strobeOpacity = blackout ? 0 : Math.min(0.8, masterFx.strobe * 0.85)
  const strobeActive = strobeOpacity > 0.01

  return (
    <section className="output-preview-wrap">
      <div
        className={`output-preview ${masterFx.shake > 0 ? 'fx-shake' : ''}`}
        role="img"
        aria-label="Live output preview"
        style={{
          filter: `brightness(${masterFx.brightness})`,
          '--shake-px': `${(masterFx.shake * 12).toFixed(2)}px`,
          '--glow-px': `${(12 + glowStrength * 60).toFixed(2)}px`,
          '--glow-alpha': (0.14 + glowStrength * 0.4).toFixed(3),
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
            !videoErrors[`${layer.layerIndex}-${active.slotIndex}`]

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

          const videoKey = `video-${layer.label}-${active.filePath}`
          const src = toFileUrl(active.filePath)
          if (import.meta.env.DEV && !srcLogRef.current[videoKey]) {
            srcLogRef.current[videoKey] = true
            console.info(
              `[video:src] active layer=${layer.layerIndex + 1} slot=${active.slotIndex + 1} path=${active.filePath} src=${src}`,
            )
          }
          return (
            <video
              key={videoKey}
              ref={(el) => {
                if (el) videoRefsRef.current[layer.layerIndex] = el
              }}
              className="preview-layer-video"
              src={src}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onCanPlay={(event) =>
                handleVideoCanPlay(layer.layerIndex, active.slotIndex, active.filePath, event)
              }
              onError={(event) =>
                handleVideoError(layer.layerIndex, active.slotIndex, active.filePath, event)
              }
              style={{
                opacity: layer.opacity,
                mixBlendMode: blendModeToCss(layer.blendMode),
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
              <AudioMeter bassLevel={bassLevel} />
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
