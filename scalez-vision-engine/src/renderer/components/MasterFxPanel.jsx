import AudioMeter from './AudioMeter'

const FX_KEYS = [
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01 },
  { key: 'strobe', label: 'Strobe', min: 0, max: 1, step: 0.01 },
  { key: 'shake', label: 'Shake', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0.5, max: 2, step: 0.01 },
]

export default function MasterFxPanel({
  masterFx,
  blackout,
  onFxChange,
  onToggleBlackout,
  onReset,
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
              isAudioActive={audioPanel.isActive}
              permissionDenied={audioPanel.permissionDenied}
              sensitivity={audioPanel.sensitivity}
              smoothing={audioPanel.smoothing}
              onStartAudio={audioPanel.onStartAudio}
              onStopAudio={audioPanel.onStopAudio}
              onSensitivityChange={audioPanel.onSensitivityChange}
              onSmoothingChange={audioPanel.onSmoothingChange}
            />
          </div>
        )}
      </div>

      <p className="bottom-panel__note">
        Bass energy automatically boosts glow and brightness. Arrow keys scroll clip grids.
      </p>
    </section>
  )
}
