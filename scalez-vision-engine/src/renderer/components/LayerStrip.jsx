import { BLEND_MODES } from '../utils/blendModes'
import ClipSlot from './ClipSlot'

export default function LayerStrip({
  layer,
  onToggleVisible,
  onOpacityChange,
  onBlendModeChange,
  onClear,
  onTrigger,
}) {
  const activeClip =
    typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null

  return (
    <section className="layer-strip" data-layer={layer.label}>
      <div className="layer-controls">
        <div className="layer-controls__title">{layer.label}</div>
        <label className="toggle-line">
          <span>Visible</span>
          <input
            type="checkbox"
            checked={layer.visible}
            onChange={(event) => onToggleVisible(layer.layerIndex, event.target.checked)}
          />
        </label>

        <label className="control-line">
          <span>Opacity</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={layer.opacity}
            onChange={(event) => onOpacityChange(layer.layerIndex, Number(event.target.value))}
          />
        </label>

        <label className="control-line">
          <span>Blend</span>
          <select
            value={layer.blendMode}
            onChange={(event) => onBlendModeChange(layer.layerIndex, event.target.value)}
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="clear-btn" onClick={() => onClear(layer.layerIndex)}>
          Clear
        </button>

        <div className="active-clip">
          Active: {activeClip ? activeClip.clipName || `Slot ${activeClip.slotIndex + 1}` : 'None'}
        </div>
      </div>

      <div className="clip-grid-scroll">
        <div className="clip-grid" role="list" aria-label={`${layer.label} clip slots`}>
          {layer.slots.map((slot) => (
            <ClipSlot
              key={`${layer.layerIndex}-${slot.slotIndex}`}
              layerIndex={layer.layerIndex}
              slot={slot}
              isActive={layer.activeSlotIndex === slot.slotIndex}
              onTrigger={onTrigger}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
