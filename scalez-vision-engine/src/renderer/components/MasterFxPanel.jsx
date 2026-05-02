import AudioMeter from './AudioMeter'

const FX_KEYS = [
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01 },
  { key: 'strobe', label: 'Strobe', min: 0, max: 1, step: 0.01 },
  { key: 'shake', label: 'Shake', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0.5, max: 2, step: 0.01 },
]

const AUDIO_LINK_KEYS = [
  { key: 'glow', label: 'Glow' },
  { key: 'strobe', label: 'Strobe' },
  { key: 'shake', label: 'Shake' },
  { key: 'brightness', label: 'Brightness' },
]

export default function MasterFxPanel({
  masterFx,
  blackout,
  onFxChange,
  onToggleBlackout,
  onReset,
  safeMode,
  onSafeModeChange,
  audioPanel,
}) {
  return (
    <section className="bottom-panel panel-glass">
      <div className="bottom-panel__header">
        <div>
          <h2>Master FX</h2>
          <div className="hotkey-hint">Space=Blackout R=Reset 1-9=L1 Shift+1-9=L2 Ctrl+1-9=L3</div>
        </div>
        <div className="bottom-panel__actions">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={safeMode}
              onChange={(event) => onSafeModeChange(event.target.checked)}
            />
            Safe Mode
          </label>
          <button type="button" className="danger-pill" onClick={onToggleBlackout}>
            {blackout ? 'Disable Blackout' : 'Blackout'}
          </button>
          <button type="button" className="pill ghost" onClick={onReset}>
            Reset FX
          </button>
        </div>
      </div>

      <div className="master-fx-grid">
        <div className="fx-section">
          <h3>Visual FX</h3>
          <div className="fx-grid">
            {FX_KEYS.map((fx) => (
              <label key={fx.key} className="fx-control">
                <span>
                  {fx.label}: <strong>{masterFx[fx.key].toFixed(2)}</strong>
                </span>
                <input
                  type="range"
                  min={fx.min}
                  max={fx.max}
                  step={fx.step}
                  value={masterFx[fx.key]}
                  onChange={(event) => onFxChange(fx.key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </div>

        {audioPanel && (
          <div className="audio-section">
            <h3>Audio Analysis</h3>
            <AudioMeter
              bassLevel={audioPanel.bassLevel}
              spectrumLevels={audioPanel.spectrumLevels}
              spectrumBins={audioPanel.spectrumBins}
              isAudioActive={audioPanel.isActive}
              permissionDenied={audioPanel.permissionDenied}
              audioError={audioPanel.audioError}
              sensitivity={audioPanel.sensitivity}
              smoothing={audioPanel.smoothing}
              onStartAudio={audioPanel.onStartAudio}
              onStopAudio={audioPanel.onStopAudio}
              onSensitivityChange={audioPanel.onSensitivityChange}
              onSmoothingChange={audioPanel.onSmoothingChange}
            />

            <div className="audio-link-panel">
              <div className="audio-link-panel__title">EQ</div>
              <div className="audio-link-grid">
                <div className="audio-link-card">
                  <div className="audio-link-card__title">Low Band Gain</div>
                  <label className="audio-setting">
                    <span>
                      Gain: <strong>{audioPanel.eq.low.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={audioPanel.eq.low}
                      onChange={(event) => audioPanel.onEqChange?.('low', Number(event.target.value))}
                    />
                  </label>
                </div>
                <div className="audio-link-card">
                  <div className="audio-link-card__title">Mid Band Gain</div>
                  <label className="audio-setting">
                    <span>
                      Gain: <strong>{audioPanel.eq.mid.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={audioPanel.eq.mid}
                      onChange={(event) => audioPanel.onEqChange?.('mid', Number(event.target.value))}
                    />
                  </label>
                </div>
                <div className="audio-link-card">
                  <div className="audio-link-card__title">High Band Gain</div>
                  <label className="audio-setting">
                    <span>
                      Gain: <strong>{audioPanel.eq.high.toFixed(2)}</strong>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.01"
                      value={audioPanel.eq.high}
                      onChange={(event) => audioPanel.onEqChange?.('high', Number(event.target.value))}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="audio-link-panel">
              <div className="audio-link-panel__title">Audio Reactive Links</div>
              <div className="audio-link-grid">
                {AUDIO_LINK_KEYS.map((fx) => (
                  <div key={fx.key} className="audio-link-card">
                    <div className="audio-link-card__title">{fx.label}</div>
                    <label className="audio-setting">
                      <span>
                        Amount: <strong>{audioPanel.fxLinks[fx.key].amount.toFixed(2)}</strong>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={audioPanel.fxLinks[fx.key].amount}
                        onChange={(event) =>
                          audioPanel.onFxLinkChange?.(fx.key, 'amount', Number(event.target.value))
                        }
                      />
                    </label>
                    <label className="audio-setting">
                      <span>
                        Threshold: <strong>{audioPanel.fxLinks[fx.key].threshold.toFixed(2)}</strong>
                      </span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={audioPanel.fxLinks[fx.key].threshold}
                        onChange={(event) =>
                          audioPanel.onFxLinkChange?.(fx.key, 'threshold', Number(event.target.value))
                        }
                      />
                    </label>
                    <label className="audio-setting">
                      <span>Mode</span>
                      <select
                        value={audioPanel.fxLinks[fx.key].mode}
                        onChange={(event) =>
                          audioPanel.onFxLinkChange?.(fx.key, 'mode', event.target.value)
                        }
                      >
                        <option value="normal">Normal</option>
                        <option value="invert">Invert</option>
                        <option value="pulse">Pulse</option>
                      </select>
                    </label>
                    <label className="audio-setting">
                      <span>Spectrum</span>
                      <select
                        value={audioPanel.fxLinks[fx.key].source || 'low'}
                        onChange={(event) =>
                          audioPanel.onFxLinkChange?.(fx.key, 'source', event.target.value)
                        }
                      >
                        <option value="sub">Sub</option>
                        <option value="low">Low</option>
                        <option value="lowMid">Low Mid</option>
                        <option value="mid">Mid</option>
                        <option value="presence">Presence</option>
                        <option value="high">High</option>
                        <option value="full">Full</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="bottom-panel__note">
        Bass energy can now be linked into glow, strobe, shake, and brightness. Arrow keys scroll clip grids.
      </p>
    </section>
  )
}
