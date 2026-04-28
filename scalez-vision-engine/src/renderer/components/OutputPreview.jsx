import { useEffect, useRef, useState } from 'react'
import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'

function toFileUrl(filePath) {
  if (!filePath) {
    return ''
  }
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`)
  }
  return encodeURI(`file://${normalized}`)
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
  masterFx,
  blackout,
  showOverlays,
  markSlotFailed,
}) {
  const videoRefsRef = useRef({})
  const preloadedRefsRef = useRef({})
  const [syncStatus, setSyncStatus] = useState('synced')
  const [videoErrors, setVideoErrors] = useState({})

  // Monitor sync status
  useEffect(() => {
    setSyncStatus('synced')
  }, [layers])

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
          video.src = toFileUrl(slot.filePath)
          video.preload = 'auto'
          video.muted = true
          preloadedRefsRef.current[key] = video
        }
      }
    })
  }, [layers])

  // Handle video errors
  const handleVideoError = (layerIndex, slotIndex, error) => {
    const key = `${layerIndex}-${slotIndex}`
    setVideoErrors((prev) => ({ ...prev, [key]: true }))
    const errorMsg = error?.target?.error?.message || 'Failed to load video'
    if (markSlotFailed) {
      markSlotFailed(layerIndex, slotIndex, errorMsg)
    }
  }

  const activeCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )

  const glowStrength = masterFx.glow + bassLevel * 0.2
  const strobeOpacity = blackout ? 0 : Math.min(0.8, masterFx.strobe * 0.85)

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
          return (
            <video
              key={videoKey}
              ref={(el) => {
                if (el) videoRefsRef.current[layer.layerIndex] = el
              }}
              className="preview-layer-video"
              src={toFileUrl(active.filePath)}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onError={(err) => handleVideoError(layer.layerIndex, active.slotIndex, err)}
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
        <div className="fx-strobe-layer" style={{ opacity: strobeOpacity }} />
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
