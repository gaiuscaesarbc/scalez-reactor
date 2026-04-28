import { blendModeToCss } from '../utils/blendModes'
import AudioMeter from './AudioMeter'

function LayerPreviewBadge({ layer }) {
  const active =
    typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null

  return (
    <div className="overlay-chip">
      {layer.label}: {active ? active.clipName || `Slot ${active.slotIndex + 1}` : 'Idle'}
    </div>
  )
}

export default function OutputPreview({ layers, fps, bassLevel }) {
  const activeCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )

  return (
    <section className="output-preview-wrap">
      <div className="output-preview" role="img" aria-label="Live output preview">
        <div className="preview-backdrop" />

        {layers.map((layer) => (
          <div
            key={layer.label}
            className="preview-layer-fallback"
            style={{
              opacity: layer.visible ? layer.opacity * 0.18 : 0,
              mixBlendMode: blendModeToCss(layer.blendMode),
            }}
          />
        ))}

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
      </div>
    </section>
  )
}
