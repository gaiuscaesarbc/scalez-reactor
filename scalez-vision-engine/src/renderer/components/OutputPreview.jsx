import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'

function toFileUrl(filePath) {
  if (!filePath) {
    return ''
  }
  const normalized = filePath.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`
  }
  return `file://${normalized}`
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
}) {
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
            layer.visible && active && active.status === 'loaded' && Boolean(active.filePath)

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

          return (
            <video
              key={`${layer.label}-${active.filePath}`}
              className="preview-layer-video"
              src={toFileUrl(active.filePath)}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              style={{
                opacity: layer.opacity,
                mixBlendMode: blendModeToCss(layer.blendMode),
              }}
            />
          )
        })}

        <div className="fx-glow-layer" />
        <div className="fx-strobe-layer" style={{ opacity: strobeOpacity }} />
        <div className={`fx-blackout-layer ${blackout ? 'is-on' : ''}`} />

        {showOverlays ? (
          <div className="preview-overlays">
            <div className="overlay-row">
              <div className="overlay-chip">FPS {fps}</div>
              <div className="overlay-chip">Active Layers {activeCount}</div>
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
