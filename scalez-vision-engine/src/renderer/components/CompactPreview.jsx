import { memo, useRef, useEffect, useState } from 'react'
import { blendModeToCss } from '../utils/blendModes'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function toFileUrl(filePath) {
  if (!filePath) return ''
  if (window.scalezApi?.toMediaUrl) return window.scalezApi.toMediaUrl(filePath)
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) return encodeURI(`file:///${normalized}`)
  return encodeURI(`file://${normalized}`)
}

function LayerVideo({ layer }) {
  const videoRef = useRef(null)
  const active =
    typeof layer.activeSlotIndex === 'number' && layer.slots?.[layer.activeSlotIndex]
      ? layer.slots[layer.activeSlotIndex]
      : null
  const filePath = active?.status === 'loaded' ? active.filePath : null
  const src = filePath ? toFileUrl(filePath) : ''

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!src) {
      video.pause()
      video.removeAttribute('src')
      video.load()
      return
    }
    if (video.getAttribute('src') !== src) {
      video.src = src
      video.load()
    }
    video.play().catch(() => {})
  }, [src])

  return (
    <div
      className="compact-preview__layer"
      style={{ opacity: layer.opacity ?? 1, mixBlendMode: blendModeToCss(layer.blendMode || 'normal') }}
    >
      {src ? (
        <video
          ref={videoRef}
          className="compact-preview__video"
          muted
          loop
          playsInline
          autoPlay
        />
      ) : (
        <div className="compact-preview__layer-empty">
          <span className="compact-preview__layer-label">{layer.label}</span>
          <span>—</span>
        </div>
      )}
      <div className="compact-preview__layer-tag">{layer.label}</div>
    </div>
  )
}

export default memo(function CompactPreview({
  layers = [],
  masterFx = {},
  smoothedEnergyFx = {},
  smoothedDropFx = {},
  energySystemEnabled = false,
  energyState = 'calm',
  blackout = false,
}) {
  const previewRef = useRef(null)
  const [strobeFlash, setStrobeFlash] = useState(0)

  useEffect(() => {
    if (!masterFx?.strobe || blackout) return
    const strobeLevel = Math.max(0, Math.min(0.52, Math.pow(masterFx.strobe, 1.35) * 0.58))
    if (strobeLevel > 0.02) {
      setStrobeFlash(strobeLevel)
      const timer = setTimeout(() => setStrobeFlash(0), 150)
      return () => clearTimeout(timer)
    }
  }, [masterFx?.strobe, blackout])

  useEffect(() => {
    const previewEl = previewRef.current
    if (!previewEl) return
    const energyShakeBoost = energySystemEnabled ? (smoothedEnergyFx?.shakeIntensity ?? 0) : 0
    const dropShakeBoost = smoothedDropFx?.shakeIntensity ?? 0
    const shakeAmount = Math.max(0, Math.min(1.0, (masterFx?.shake ?? 0) + energyShakeBoost + dropShakeBoost))

    if (shakeAmount <= 0.08) {
      previewEl.style.setProperty('--shake-x', '0px')
      previewEl.style.setProperty('--shake-y', '0px')
      return
    }

    let frameId = null
    const amplitude = shakeAmount * 3.5
    const tick = (timestamp) => {
      const t = timestamp / 1000
      const offsetX = (Math.sin(t * 38) + Math.sin(t * 61 + 0.8) * 0.45) * amplitude * 0.72
      const offsetY = (Math.cos(t * 33 + 0.4) + Math.sin(t * 57 + 1.7) * 0.4) * amplitude * 0.68
      previewEl.style.setProperty('--shake-x', `${offsetX.toFixed(1)}px`)
      previewEl.style.setProperty('--shake-y', `${offsetY.toFixed(1)}px`)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      previewEl.style.setProperty('--shake-x', '0px')
      previewEl.style.setProperty('--shake-y', '0px')
    }
  }, [masterFx?.shake, smoothedEnergyFx?.shakeIntensity, smoothedDropFx?.shakeIntensity, energySystemEnabled])

  const finalGlow = clamp01(
    (masterFx?.glow ?? 0) +
      (energySystemEnabled ? (smoothedEnergyFx?.glowBoost ?? 0) : 0) +
      (smoothedDropFx?.glowBoost ?? 0),
  )
  const finalBrightness = Math.max(
    0.1,
    (masterFx?.brightness ?? 1) +
      (energySystemEnabled ? (smoothedEnergyFx?.brightnessBoost ?? 0) : 0) +
      (smoothedDropFx?.brightnessBoost ?? 0),
  )
  const glowFilter = finalGlow > 0
    ? `brightness(${finalBrightness}) drop-shadow(0 0 ${Math.pow(finalGlow, 0.8) * 12}px rgba(100,200,255,${finalGlow * 0.6}))`
    : `brightness(${finalBrightness})`

  return (
    <div
      ref={previewRef}
      className="compact-preview"
      style={{ '--shake-x': '0px', '--shake-y': '0px', filter: glowFilter }}
    >
      {blackout ? (
        <div className="compact-preview__blackout">BLACKOUT</div>
      ) : (
        <>
          <div className="compact-preview__layers">
            {layers.map((layer, idx) => (
              <LayerVideo key={idx} layer={layer} />
            ))}
          </div>

          {strobeFlash > 0 && (
            <div className="compact-preview__strobe" style={{ opacity: strobeFlash }} />
          )}

          {energySystemEnabled && (
            <div className="compact-preview__energy-badge">{energyState.toUpperCase()}</div>
          )}
        </>
      )}
    </div>
  )
})
