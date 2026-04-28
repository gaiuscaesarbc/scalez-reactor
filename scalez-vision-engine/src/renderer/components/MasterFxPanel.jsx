const FX_KEYS = [
  { key: 'glow', label: 'Glow', min: 0, max: 1, step: 0.01 },
  { key: 'strobe', label: 'Strobe', min: 0, max: 1, step: 0.01 },
  { key: 'shake', label: 'Shake', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0.5, max: 2, step: 0.01 },
]

export default function MasterFxPanel({ masterFx, blackout, onFxChange, onToggleBlackout, onReset }) {
  return (
    <section className="bottom-panel panel-glass">
      <div className="bottom-panel__header">
        <h2>Master FX + Audio</h2>
        <div className="bottom-panel__actions">
          <button type="button" className="danger-pill" onClick={onToggleBlackout}>
            {blackout ? 'Disable Blackout' : 'Blackout'}
          </button>
          <button type="button" className="pill ghost" onClick={onReset}>
            Reset FX
          </button>
        </div>
      </div>

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

      <p className="bottom-panel__note">
        Audio analysis remains placeholder in this phase. Bass-reactive behavior will be wired next.
      </p>
    </section>
  )
}
