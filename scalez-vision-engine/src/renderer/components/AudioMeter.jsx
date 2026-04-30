export default function AudioMeter({
  bassLevel,
  spectrumLevels,
  spectrumBins,
  isAudioActive,
  permissionDenied,
  audioError,
  sensitivity,
  smoothing,
  onStartAudio,
  onStopAudio,
  onSensitivityChange,
  onSmoothingChange,
  showControls = true,
  showSettings = true,
  showSpectrumBins = true,
}) {
  const hasControlHandlers = Boolean(onStartAudio) && Boolean(onStopAudio)
  const canShowControls = showControls && hasControlHandlers
  const canShowSettings = showSettings && canShowControls

  return (
    <div className="audio-meter-panel">
      <div className="audio-meter">
        <div className="audio-meter__label">BASS LEVEL</div>
        <div className="audio-meter__track">
          <div className="audio-meter__fill" style={{ width: `${Math.round(bassLevel * 100)}%` }} />
        </div>
        <div className="audio-meter__value">{bassLevel.toFixed(2)}</div>
      </div>

      {canShowControls && (
        <div className="audio-controls">
          {audioError && (
            <div className="audio-error">
              {audioError}
              {permissionDenied ? ' (Check microphone privacy permissions.)' : ''}
            </div>
          )}
          <button
            type="button"
            className={`audio-btn ${isAudioActive ? 'is-active' : ''}`}
            onClick={isAudioActive ? onStopAudio : onStartAudio}
          >
            {isAudioActive ? 'Stop' : 'Start'} Input
          </button>
        </div>
      )}

      <div className="audio-spectrum-grid">
        {[
          { key: 'low', label: 'LOW' },
          { key: 'mid', label: 'MID' },
          { key: 'high', label: 'HIGH' },
          { key: 'full', label: 'FULL' },
        ].map((band) => {
          const value = spectrumLevels?.[band.key] ?? 0
          return (
            <div key={band.key} className="audio-spectrum-item">
              <div className="audio-meter__label">{band.label}</div>
              <div className="audio-meter__track">
                <div className="audio-meter__fill" style={{ width: `${Math.round(value * 100)}%` }} />
              </div>
              <div className="audio-meter__value">{value.toFixed(2)}</div>
            </div>
          )
        })}
      </div>

      {showSpectrumBins ? (
        <div className="audio-spectrum-full">
          <div className="audio-meter__label">FULL SPECTRUM</div>
          <div className="audio-spectrum-full__bars" role="img" aria-label="Live audio frequency spectrum">
            {(spectrumBins || []).map((value, index) => {
              const height = Math.max(4, Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100))
              return (
                <div
                  key={`bin-${index}`}
                  className="audio-spectrum-full__bar"
                  style={{ height: `${height}%` }}
                />
              )
            })}
          </div>
        </div>
      ) : null}

      {canShowSettings && isAudioActive && sensitivity !== undefined && smoothing !== undefined ? (
        <div className="audio-settings">
          <label className="audio-setting">
            <span>Sensitivity</span>
            <input
              type="range"
              min="0.3"
              max="1.5"
              step="0.05"
              value={sensitivity}
              onChange={(e) => onSensitivityChange?.(Number(e.target.value))}
            />
          </label>
          <label className="audio-setting">
            <span>Smoothing</span>
            <input
              type="range"
              min="0.2"
              max="0.9"
              step="0.01"
              value={smoothing}
              onChange={(e) => onSmoothingChange?.(Number(e.target.value))}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
