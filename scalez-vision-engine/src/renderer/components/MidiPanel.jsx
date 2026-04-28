import { useState, useEffect } from 'react'

export default function MidiPanel({ midiState, onMapCommand, layers = 3 }) {
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

  const learnActions = [
    { id: 'blackout', label: 'Blackout Toggle', type: 'button' },
    { id: 'reset', label: 'Reset FX', type: 'button' },
    { id: 'safe-mode', label: 'Safe Mode Toggle', type: 'button' },
    { id: 'layer-1-slots', label: 'Layer 1 Slot (0-9)', type: 'button' },
    { id: 'layer-2-slots', label: 'Layer 2 Slot (0-9)', type: 'button' },
    { id: 'layer-3-slots', label: 'Layer 3 Slot (0-9)', type: 'button' },
    { id: 'glow', label: 'Glow (Knob/Slider)', type: 'knob' },
    { id: 'strobe', label: 'Strobe (Knob/Slider)', type: 'knob' },
    { id: 'shake', label: 'Shake (Knob/Slider)', type: 'knob' },
    { id: 'brightness', label: 'Brightness (Knob/Slider)', type: 'knob' },
    { id: 'layer-1-opacity', label: 'Layer 1 Opacity', type: 'knob' },
    { id: 'layer-2-opacity', label: 'Layer 2 Opacity', type: 'knob' },
    { id: 'layer-3-opacity', label: 'Layer 3 Opacity', type: 'knob' },
  ]

  const handleLearnClick = async (action) => {
    setLearningLabel(action.label)
    stopLearn() // Reset any previous learn state

    try {
      const result = await midiState.startLearn(action.type, action.id)

      if (result && result.midiKey) {
        setMapping(result.midiKey, {
          type: action.type,
          action: action.id,
          label: action.label,
        })

        // Call parent callback
        if (onMapCommand) {
          onMapCommand(action.id, result.midiKey)
        }
      }

      stopLearn()
      setLearningLabel('')
    } catch (err) {
      console.error('Learn failed:', err)
      stopLearn()
      setLearningLabel('')
    }
  }

  const getMappingDisplayText = (midiKey) => {
    const parts = midiKey.split('_')
    if (parts[0] === 'note') {
      return `Note ${parts[1]}`
    } else if (parts[0] === 'cc') {
      return `CC ${parts[1]}`
    }
    return midiKey
  }

  const getMappingActions = () => {
    const grouped = {}
    Object.entries(mappings).forEach(([midiKey, mapping]) => {
      const action = mapping.action || 'unknown'
      if (!grouped[action]) {
        grouped[action] = []
      }
      grouped[action].push({ midiKey, mapping })
    })
    return grouped
  }

  if (!midiAvailable) {
    return (
      <div className="midi-panel">
        <button className="midi-btn midi-btn--unavailable" disabled>
          🎛️ MIDI Not Supported
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
        🎛️ MIDI
      </button>

      {showPanel && (
        <div className="midi-panel__content">
          <div className="midi-panel__header">
            <h3>MIDI Controller</h3>
            <button
              className="midi-panel__close"
              onClick={() => setShowPanel(false)}
            >
              ✕
            </button>
          </div>

          {/* Permission Section */}
          {!hasPermission && (
            <div className="midi-section">
              <button
                className="midi-btn midi-btn--primary"
                onClick={requestPermission}
              >
                🔓 Request MIDI Access
              </button>
              <p className="midi-note">Grant permission to use MIDI devices</p>
            </div>
          )}

          {hasPermission && (
            <>
              {/* Device Selection */}
              <div className="midi-section">
                <label className="midi-label">Connected Devices:</label>
                {midiInputs.length === 0 ? (
                  <p className="midi-note">No MIDI devices connected</p>
                ) : (
                  <select
                    className="midi-select"
                    value={selectedInput || ''}
                    onChange={(e) => selectInput(e.target.value)}
                  >
                    <option value="">Select a MIDI input...</option>
                    {midiInputs.map((input) => (
                      <option key={input.id} value={input.id}>
                        {input.name}
                        {input.manufacturer ? ` (${input.manufacturer})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                {selectedInput && (
                  <p className="midi-status midi-status--active">
                    ✓ Device selected and listening
                  </p>
                )}
              </div>

              {/* Learn Mode Section */}
              {selectedInput && (
                <div className="midi-section">
                  <label className="midi-label">Map Controls:</label>
                  <p className="midi-note">
                    {isLearning
                      ? `Listening... Press button/knob for: ${learningLabel}`
                      : 'Click "Learn" next to an action, then press a MIDI button or move a knob'}
                  </p>

                  <div className="midi-learn-grid">
                    {learnActions.map((action) => {
                      const isMapped = Object.values(mappings).some(
                        (m) => m.action === action.id
                      )
                      const mappedKey = Object.entries(mappings)
                        .find(([, m]) => m.action === action.id)?.[0]

                      return (
                        <div key={action.id} className="midi-learn-item">
                          <div className="midi-learn-label">{action.label}</div>
                          <button
                            className={`midi-btn midi-btn--small ${
                              isLearning && learnMode === action.type
                                ? 'midi-btn--learning'
                                : ''
                            } ${isMapped ? 'midi-btn--mapped' : ''}`}
                            onClick={() => handleLearnClick(action)}
                            disabled={isLearning && learnMode !== action.type}
                            title={
                              isMapped
                                ? `Mapped to ${getMappingDisplayText(mappedKey)}`
                                : 'Click to learn'
                            }
                          >
                            {isMapped ? getMappingDisplayText(mappedKey) : 'Learn'}
                          </button>
                          {isMapped && (
                            <button
                              className="midi-btn midi-btn--mini midi-btn--delete"
                              onClick={() => clearMapping(mappedKey)}
                              title="Clear this mapping"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Mappings Summary */}
                  {Object.keys(mappings).length > 0 && (
                    <div className="midi-mappings">
                      <label className="midi-label">Active Mappings:</label>
                      {Object.entries(getMappingActions()).map(
                        ([action, items]) => (
                          <div key={action} className="midi-mapping-group">
                            <div className="midi-mapping-action">
                              {items[0].mapping.label}
                            </div>
                            <div className="midi-mapping-keys">
                              {items.map(({ midiKey }) => (
                                <span
                                  key={midiKey}
                                  className="midi-key-badge"
                                >
                                  {getMappingDisplayText(midiKey)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )
                      )}

                      <button
                        className="midi-btn midi-btn--danger"
                        onClick={clearAllMappings}
                      >
                        🗑️ Clear All Mappings
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="midi-section midi-section--footer">
            <p className="midi-note">
              💡 Mappings are saved with your show file
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
