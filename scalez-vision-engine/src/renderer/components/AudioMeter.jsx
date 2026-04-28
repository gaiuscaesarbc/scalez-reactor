export default function AudioMeter({
  bassLevel,
  isAudioActive,
  permissionDenied,
  sensitivity,
  smoothing,
  onStartAudio,
  onStopAudio,
  onSensitivityChange,
  onSmoothingChange,
}) {
  return (
    <div className="audio-meter-panel">
      <div className="audio-meter">
        <div className="audio-meter__label">BASS LEVEL</div>
        <div className="audio-meter__track">
          <div className="audio-meter__fill" style={{ width: `${Math.round(bassLevel * 100)}%` }} />
        </div>
        <div className="audio-meter__value">{bassLevel.toFixed(2)}</div>
      </div>

      <div className="audio-controls">
        {permissionDenied && <div className="audio-error">Permission denied</div>}
        <button
          type="button"
          className={`audio-btn ${isAudioActive ? 'is-active' : ''}`}
          onClick={isAudioActive ? onStopAudio : onStartAudio}
        >
          {isAudioActive ? 'Stop' : 'Start'} Input
        </button>
      </div>

      {isAudioActive && sensitivity !== undefined && smoothing !== undefined ? (
        <div className="audio-settings">
          <label className="audio-setting">
            <span>Sensitivity</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={sensitivity}
              onChange={(e) => onSensitivityChange?.(Number(e.target.value))}
            />
          </label>
          <label className="audio-setting">
            <span>Smoothing</span>
            <input
              type="range"
              min="0.7"
              max="0.95"
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
