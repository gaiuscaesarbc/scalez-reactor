import { useState } from 'react'

const LAYER_COUNT = 3
const SLOT_COUNT = 50

export default function MidiPanel({ midiState, onMapCommand }) {
  const {
    midiAvailable,
    hasPermission,
    midiInputs,
    selectedInput,
    isLearning,
    learnMode,
    mappings,
    requestPermission,
    selectInput,
    startLearn,
    stopLearn,
    setMapping,
    clearMapping,
    clearAllMappings,
  } = midiState

  const [showPanel, setShowPanel] = useState(false)
  const [learningLabel, setLearningLabel] = useState('')
  // For direct slot mapping
  const [slotLearnLayer, setSlotLearnLayer] = useState(0)
  const [slotLearnSlot, setSlotLearnSlot] = useState(0)

  // General (non-slot) actions
  const learnActions = [
    { id: 'blackout', label: 'Blackout Toggle', type: 'button' },
    { id: 'reset', label: 'Reset FX', type: 'button' },
    { id: 'safe-mode', label: 'Safe Mode Toggle', type: 'button' },
    { id: 'energy-manual-override', label: 'Energy Manual Override Toggle', type: 'button' },
    { id: 'energy-manual-state-next', label: 'Energy Manual State Next', type: 'button' },
    { id: 'launch-cue', label: 'Launch Cue (focused layer)', type: 'button' },
    { id: 'tap-tempo', label: 'Tap Tempo', type: 'button' },
    { id: 'layer-1-bounce-toggle', label: 'Layer 1 Bounce Toggle', type: 'button' },
    { id: 'layer-2-bounce-toggle', label: 'Layer 2 Bounce Toggle', type: 'button' },
    { id: 'layer-3-bounce-toggle', label: 'Layer 3 Bounce Toggle', type: 'button' },
    { id: 'focused-layer-bounce-toggle', label: 'Focused Layer Bounce Toggle', type: 'button' },
    { id: 'layer-1-clear', label: 'Clear Layer 1', type: 'button' },
    { id: 'layer-2-clear', label: 'Clear Layer 2', type: 'button' },
    { id: 'layer-3-clear', label: 'Clear Layer 3', type: 'button' },
    { id: 'focused-layer-clear', label: 'Clear Focused Layer', type: 'button' },
    { id: 'strobe', label: 'Strobe', type: 'knob' },
    { id: 'shake', label: 'Shake', type: 'knob' },
    { id: 'brightness', label: 'Brightness', type: 'knob' },
    { id: 'energy-manual-intensity', label: 'Energy Manual Intensity', type: 'knob' },
    { id: 'layer-1-opacity', label: 'Layer 1 Opacity', type: 'knob' },
    { id: 'layer-2-opacity', label: 'Layer 2 Opacity', type: 'knob' },
    { id: 'layer-3-opacity', label: 'Layer 3 Opacity', type: 'knob' },
    { id: 'focused-layer-opacity', label: 'Focused Layer Opacity', type: 'knob' },
  ]

  const handleLearnClick = async (action) => {
    setLearningLabel(action.label)

    try {
      const result = await startLearn(action.type, action.id)
      if (result && result.midiKey) {
        setMapping(result.midiKey, {
          type: action.type,
          action: action.id,
          label: action.label,
        })
        if (onMapCommand) onMapCommand(action.id, result.midiKey)
      }
      stopLearn()
      setLearningLabel('')
    } catch (err) {
      console.error('[MidiPanel] Learn failed:', err)
      stopLearn()
      setLearningLabel('')
    }
  }

  const handleSlotLearnClick = async () => {
    const actionId = `clip-slot`
    const label = `L${slotLearnLayer + 1} Slot ${slotLearnSlot + 1}`
    setLearningLabel(label)

    try {
      const result = await startLearn('button', actionId)
      if (result && result.midiKey) {
        setMapping(result.midiKey, {
          type: 'button',
          action: 'clip-slot',
          label,
          layerIndex: slotLearnLayer,
          slotIndex: slotLearnSlot,
        })
      }
      stopLearn()
      setLearningLabel('')
    } catch (err) {
      console.error('[MidiPanel] Slot learn failed:', err)
      stopLearn()
      setLearningLabel('')
    }
  }

  const getMappingDisplayText = (midiKey) => {
    const parts = midiKey.split('_')
    if (parts[0] === 'note') return `Note ${parts[1]}`
    if (parts[0] === 'cc') return `CC ${parts[1]}`
    return midiKey
  }

  // Slot mappings (action === 'clip-slot')
  const slotMappings = Object.entries(mappings).filter(([, m]) => m.action === 'clip-slot')
  // General mappings (everything else)
  const generalMappings = Object.entries(mappings).filter(([, m]) => m.action !== 'clip-slot')

  if (!midiAvailable) {
    return (
      <div className="midi-panel">
        <button className="midi-btn midi-btn--unavailable" disabled>
          🎛️ MIDI N/A
        </button>
      </div>
    )
  }

  return (
    <div className="midi-panel">
      <button
        className="midi-btn"
        onClick={() => setShowPanel(!showPanel)}
        title={
          hasPermission
            ? selectedInput
              ? `MIDI: ${midiInputs.find((i) => i.id === selectedInput)?.name}`
              : 'MIDI: No device selected'
            : 'MIDI: Permission required'
        }
      >
        🎛️ MIDI{selectedInput ? ' ●' : ''}
      </button>

      {showPanel && (
        <div className="midi-panel__content">
          <div className="midi-panel__header">
            <h3>MIDI Controller</h3>
            <button className="midi-panel__close" onClick={() => setShowPanel(false)}>✕</button>
          </div>

          {/* Permission */}
          {!hasPermission && (
            <div className="midi-section">
              <button className="midi-btn midi-btn--primary" onClick={requestPermission}>
                🔓 Request MIDI Access
              </button>
              <p className="midi-note">Grant permission to use MIDI devices</p>
            </div>
          )}

          {hasPermission && (
            <>
              {/* Device Selection */}
              <div className="midi-section">
                <label className="midi-label">Device</label>
                {midiInputs.length === 0 ? (
                  <p className="midi-note">No MIDI devices connected</p>
                ) : (
                  <select
                    className="midi-select"
                    value={selectedInput || ''}
                    onChange={(e) => selectInput(e.target.value)}
                  >
                    <option value="">Select input...</option>
                    {midiInputs.map((input) => (
                      <option key={input.id} value={input.id}>
                        {input.name}{input.manufacturer ? ` (${input.manufacturer})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedInput && (
                  <p className="midi-status midi-status--active">✓ Listening</p>
                )}
              </div>

              {selectedInput && (
                <>
                  {/* Learn status banner */}
                  {isLearning && (
                    <div className="midi-learn-banner">
                      🎵 Waiting... press a button/knob for: <strong>{learningLabel}</strong>
                      <button className="midi-btn midi-btn--small" onClick={stopLearn} style={{marginLeft:8}}>
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* ── Direct Slot Mappings ── */}
                  <div className="midi-section">
                    <label className="midi-label">Direct Slot Mapping</label>
                    <p className="midi-note">
                      Pick a layer and slot, then press Learn to map a MIDI button directly to that slot.
                    </p>
                    <div className="midi-slot-picker">
                      <label className="midi-slot-picker__label">Layer</label>
                      <select
                        className="midi-select midi-select--sm"
                        value={slotLearnLayer}
                        onChange={(e) => setSlotLearnLayer(Number(e.target.value))}
                        disabled={isLearning}
                      >
                        {Array.from({ length: LAYER_COUNT }, (_, i) => (
                          <option key={i} value={i}>L{i + 1}</option>
                        ))}
                      </select>
                      <label className="midi-slot-picker__label">Slot</label>
                      <select
                        className="midi-select midi-select--sm"
                        value={slotLearnSlot}
                        onChange={(e) => setSlotLearnSlot(Number(e.target.value))}
                        disabled={isLearning}
                      >
                        {Array.from({ length: SLOT_COUNT }, (_, i) => (
                          <option key={i} value={i}>{i + 1}</option>
                        ))}
                      </select>
                      <button
                        className={`midi-btn midi-btn--small${isLearning ? ' midi-btn--learning' : ''}`}
                        onClick={handleSlotLearnClick}
                        disabled={isLearning}
                      >
                        {isLearning ? '...' : 'Learn'}
                      </button>
                    </div>

                    {/* Existing slot mappings list */}
                    {slotMappings.length > 0 && (
                      <div className="midi-slot-list">
                        {slotMappings.map(([midiKey, m]) => (
                          <div key={midiKey} className="midi-slot-list__item">
                            <span className="midi-key-badge">{getMappingDisplayText(midiKey)}</span>
                            <span className="midi-slot-list__label">
                              → L{m.layerIndex + 1} Slot {m.slotIndex + 1}
                            </span>
                            <button
                              className="midi-btn midi-btn--mini midi-btn--delete"
                              onClick={() => clearMapping(midiKey)}
                              title="Remove mapping"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── General Action Mappings ── */}
                  <div className="midi-section">
                    <label className="midi-label">Controls & FX</label>
                    <div className="midi-learn-grid">
                      {learnActions.map((action) => {
                        const mappedKey = Object.entries(mappings)
                          .find(([, m]) => m.action === action.id)?.[0]
                        const isMapped = Boolean(mappedKey)

                        return (
                          <div key={action.id} className="midi-learn-item">
                            <div className="midi-learn-label">{action.label}</div>
                            <button
                              className={[
                                'midi-btn midi-btn--small',
                                isLearning ? 'midi-btn--learning' : '',
                                isMapped ? 'midi-btn--mapped' : '',
                              ].filter(Boolean).join(' ')}
                              onClick={() => handleLearnClick(action)}
                              disabled={isLearning}
                              title={isMapped ? `Mapped to ${getMappingDisplayText(mappedKey)}` : 'Click to learn'}
                            >
                              {isMapped ? getMappingDisplayText(mappedKey) : 'Learn'}
                            </button>
                            {isMapped && (
                              <button
                                className="midi-btn midi-btn--mini midi-btn--delete"
                                onClick={() => clearMapping(mappedKey)}
                                title="Clear mapping"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Clear all */}
                  {Object.keys(mappings).length > 0 && (
                    <div className="midi-section">
                      <button className="midi-btn midi-btn--danger" onClick={clearAllMappings}>
                        🗑️ Clear All Mappings ({Object.keys(mappings).length})
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="midi-section midi-section--footer">
            <p className="midi-note">💡 Mappings save with your show file</p>
          </div>
        </div>
      )}
    </div>
  )
}


