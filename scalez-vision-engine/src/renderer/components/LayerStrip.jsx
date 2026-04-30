import { useRef, useEffect, useState } from 'react'
import { BLEND_MODES } from '../utils/blendModes'
import ClipSlot from './ClipSlot'


export default function LayerStrip({
  layer,
  isFocused,
  cueMode,
  cuedSlotIndex,
  midiFlashSlots,
  audioLink,
  videoMotion,
  onToggleVisible,
  onOpacityChange,
  onBlendModeChange,
  onClear,
  onTrigger,
  onLoad,
  onFocusToggle,
  onLaunchCue,
  onScrollRef,
  onAudioLinkChange,
  onVideoMotionChange,
  onRebuildReverseCache,
}) {
  const scrollContainerRef = useRef(null)
  const [showAudioLink, setShowAudioLink] = useState(false)
  const [showVideoMotion, setShowVideoMotion] = useState(false)
  const [isRebuildingReverse, setIsRebuildingReverse] = useState(false)
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

        <div className="audio-reactivity-block">
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setShowAudioLink((v) => !v)}
            title={showAudioLink ? 'Collapse section' : 'Expand section'}
          >
            <span className="audio-reactivity-block__title">Audio Opacity Link</span>
            <span className="collapse-toggle__icon">{showAudioLink ? '▾' : '▸'}</span>
          </button>

          {showAudioLink && (
            <>
              <label className="control-line">
                <span>Amount: {audioLink.amount.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioLink.amount}
                  onChange={(event) =>
                    onAudioLinkChange?.(layer.layerIndex, 'amount', Number(event.target.value))
                  }
                />
              </label>
              <label className="control-line">
                <span>Threshold: {audioLink.threshold.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioLink.threshold}
                  onChange={(event) =>
                    onAudioLinkChange?.(layer.layerIndex, 'threshold', Number(event.target.value))
                  }
                />
              </label>
              <label className="control-line">
                <span>Mode</span>
                <select
                  value={audioLink.mode}
                  onChange={(event) => onAudioLinkChange?.(layer.layerIndex, 'mode', event.target.value)}
                >
                  <option value="normal">Normal</option>
                  <option value="invert">Invert</option>
                  <option value="pulse">Pulse</option>
                </select>
              </label>
              <label className="control-line">
                <span>Spectrum</span>
                <select
                  value={audioLink.source || 'low'}
                  onChange={(event) => onAudioLinkChange?.(layer.layerIndex, 'source', event.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="mid">Mid</option>
                  <option value="high">High</option>
                  <option value="full">Full</option>
                </select>
              </label>
            </>
          )}
        </div>

        <div className="video-motion-block">
          <button
            type="button"
            className="collapse-toggle"
            onClick={() => setShowVideoMotion((v) => !v)}
            title={showVideoMotion ? 'Collapse section' : 'Expand section'}
          >
            <span className="video-motion-block__title">Video Motion</span>
            <span className="collapse-toggle__icon">{showVideoMotion ? '▾' : '▸'}</span>
          </button>

          {showVideoMotion && (
            <>
              <label className="control-line">
                <span>In Point: {Math.round(videoMotion.inPoint * 100)}%</span>
                <input
                  type="range"
                  min="0"
                  max="0.99"
                  step="0.01"
                  value={videoMotion.inPoint}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'inPoint', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Out Point: {Math.round(videoMotion.outPoint * 100)}%</span>
                <input
                  type="range"
                  min="0.01"
                  max="1"
                  step="0.01"
                  value={videoMotion.outPoint}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'outPoint', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Base Speed: {videoMotion.baseSpeed.toFixed(2)}x</span>
                <input
                  type="range"
                  min="0.1"
                  max="4"
                  step="0.05"
                  value={videoMotion.baseSpeed}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'baseSpeed', Number(event.target.value))
                  }
                />
              </label>

              <label className="toggle-line">
                <span>Bounce (Fwd/Rev)</span>
                <input
                  type="checkbox"
                  checked={Boolean(videoMotion.bounceEnabled)}
                  onChange={(event) =>
                    onVideoMotionChange?.(
                      layer.layerIndex,
                      'bounceEnabled',
                      event.target.checked,
                    )
                  }
                />
              </label>

              <label className="control-line">
                <span>Bounce Speed: {(videoMotion.bounceSpeed ?? 1).toFixed(2)}x</span>
                <input
                  type="range"
                  min="0.1"
                  max="4"
                  step="0.05"
                  value={videoMotion.bounceSpeed ?? 1}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'bounceSpeed', Number(event.target.value))
                  }
                />
              </label>

              <button
                type="button"
                className="bounce-rebuild-btn"
                disabled={!activeClip?.filePath || isRebuildingReverse}
                onClick={async () => {
                  if (!activeClip?.filePath || !onRebuildReverseCache) {
                    return
                  }
                  setIsRebuildingReverse(true)
                  try {
                    await onRebuildReverseCache(layer.layerIndex)
                  } finally {
                    setIsRebuildingReverse(false)
                  }
                }}
                title={activeClip?.filePath ? 'Force rebuild reverse cache for active clip' : 'Load and trigger a clip first'}
              >
                {isRebuildingReverse ? 'Rebuilding Bounce…' : 'Rebuild Bounce'}
              </button>

              <label className="control-line">
                <span>Audio Speed Amount: {videoMotion.speedAmount.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.05"
                  value={videoMotion.speedAmount}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'speedAmount', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Speed Threshold: {videoMotion.speedThreshold.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={videoMotion.speedThreshold}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'speedThreshold', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Speed Mode</span>
                <select
                  value={videoMotion.speedMode}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'speedMode', event.target.value)
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="invert">Invert</option>
                  <option value="pulse">Pulse</option>
                </select>
              </label>

              <label className="control-line">
                <span>Speed Spectrum</span>
                <select
                  value={videoMotion.speedSource || 'low'}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'speedSource', event.target.value)
                  }
                >
                  <option value="low">Low</option>
                  <option value="mid">Mid</option>
                  <option value="high">High</option>
                  <option value="full">Full</option>
                </select>
              </label>

              <label className="control-line">
                <span>Timeline Drive: {videoMotion.timelineAmount.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={videoMotion.timelineAmount}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'timelineAmount', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Timeline Threshold: {videoMotion.timelineThreshold.toFixed(2)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={videoMotion.timelineThreshold}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'timelineThreshold', Number(event.target.value))
                  }
                />
              </label>

              <label className="control-line">
                <span>Timeline Mode</span>
                <select
                  value={videoMotion.timelineMode}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'timelineMode', event.target.value)
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="invert">Invert</option>
                  <option value="pulse">Pulse</option>
                </select>
              </label>

              <label className="control-line">
                <span>Timeline Spectrum</span>
                <select
                  value={videoMotion.timelineSource || 'low'}
                  onChange={(event) =>
                    onVideoMotionChange?.(layer.layerIndex, 'timelineSource', event.target.value)
                  }
                >
                  <option value="low">Low</option>
                  <option value="mid">Mid</option>
                  <option value="high">High</option>
                  <option value="full">Full</option>
                </select>
              </label>
            </>
          )}
        </div>

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
