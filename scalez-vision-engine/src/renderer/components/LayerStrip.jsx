import { useRef, useEffect } from 'react'
import { BLEND_MODES } from '../utils/blendModes'
import ClipSlot from './ClipSlot'

export default function LayerStrip({
  layer,
  isFocused,
  cueMode,
  cuedSlotIndex,
  midiFlashSlots,
  onToggleVisible,
  onOpacityChange,
  onBlendModeChange,
  onClear,
  onTrigger,
  onLoad,
  onFocusToggle,
  onLaunchCue,
  onScrollRef,
}) {
  const scrollContainerRef = useRef(null)
  const activeClip =
    typeof layer.activeSlotIndex === 'number' ? layer.slots[layer.activeSlotIndex] : null
  const cuedClip =
    typeof cuedSlotIndex === 'number' ? layer.slots[cuedSlotIndex] : null

  // Register scroll ref with parent so hotkeys can scroll all layers
  useEffect(() => {
    if (onScrollRef) {
      onScrollRef(layer.layerIndex, scrollContainerRef.current)
    }
  }, [layer.layerIndex, onScrollRef])

  return (
    <section
      className={`layer-strip${isFocused ? ' layer-strip--focused' : ''}`}
      data-layer={layer.label}
    >
      <div className="layer-controls">
        <div className="layer-controls__title-row">
          <div className="layer-controls__title">{layer.label}</div>
          <button
            type="button"
            className={`layer-controls__focus-btn${isFocused ? ' is-focused' : ''}`}
            onClick={() => onFocusToggle && onFocusToggle(layer.layerIndex)}
            title={isFocused ? 'Unfocus this layer' : 'Focus this layer for MIDI knobs'}
          >
            {isFocused ? '★' : '☆'}
          </button>
        </div>

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

        {cueMode && (
          <div className="cue-section">
            <div className="cue-section__label">
              Cued: {cuedClip ? cuedClip.clipName || `Slot ${cuedSlotIndex + 1}` : 'None'}
            </div>
            <button
              type="button"
              className={`cue-launch-btn${cuedClip ? ' is-ready' : ''}`}
              onClick={() => onLaunchCue && onLaunchCue(layer.layerIndex)}
              disabled={!cuedClip}
              title="Launch cued clip now"
            >
              ▶ Launch
            </button>
          </div>
        )}
      </div>

      <div
        className="clip-grid-scroll"
        ref={scrollContainerRef}
        data-scroll-layer={layer.layerIndex}
      >
        <div className="clip-grid" role="list" aria-label={`${layer.label} clip slots`}>
          {layer.slots.map((slot) => (
            <ClipSlot
              key={`${layer.layerIndex}-${slot.slotIndex}`}
              layerIndex={layer.layerIndex}
              slot={slot}
              isActive={layer.activeSlotIndex === slot.slotIndex}
              isMidiFlash={midiFlashSlots?.has(`${layer.layerIndex}-${slot.slotIndex}`) ?? false}
              isCued={cueMode && cuedSlotIndex === slot.slotIndex}
              cueMode={cueMode}
              onTrigger={onTrigger}
              onLoad={onLoad}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
