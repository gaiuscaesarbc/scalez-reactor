import { memo } from 'react'

export default memo(function AudioMeter({
  bassLevel,
  spectrumLevels,
  spectrumBins,
  isAudioActive,
  permissionDenied,
  audioError,
  sensitivity,
  smoothing,
  noiseFloor,
  preGain,
  audioDevices = [],
  selectedDeviceId = null,
  onDeviceChange,
  onStartAudio,
  onStopAudio,
  onSensitivityChange,
  onSmoothingChange,
  onNoiseFloorChange,
  onPreGainChange,
  showControls = true,
  showSettings = true,
  showSpectrumBins = true,
}) {
  const hasControlHandlers = Boolean(onStartAudio) && Boolean(onStopAudio)
  const canShowControls = showControls && hasControlHandlers

  return (
    <div className="audio-meter-panel">

      {/* Device + start/stop row */}
      {canShowControls && (
        <div className="audio-controls">
          {audioDevices.length > 0 && (
            <label className="audio-setting">
              <span>Input Device</span>
              <select
                value={selectedDeviceId ?? ''}
                onChange={(e) => onDeviceChange?.(e.target.value || null)}
                disabled={isAudioActive}
              >
                <option value="">Default</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}
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

      {/* Always-visible input tuning controls */}
      {showSettings && canShowControls && (
        <div className="audio-settings">
          {preGain !== undefined && (
            <label className="audio-setting">
              <span>Pre-Gain <strong>{preGain.toFixed(1)}×</strong></span>
              <input
                type="range" min="0.5" max="4.0" step="0.1"
                value={preGain}
                onChange={(e) => onPreGainChange?.(Number(e.target.value))}
              />
            </label>
          )}
          {noiseFloor !== undefined && (
            <label className="audio-setting">
              <span>Noise Floor <strong>{noiseFloor.toFixed(3)}</strong></span>
              <input
                type="range" min="0" max="0.12" step="0.005"
                value={noiseFloor}
                onChange={(e) => onNoiseFloorChange?.(Number(e.target.value))}
              />
            </label>
          )}
          {sensitivity !== undefined && (
            <label className="audio-setting">
              <span>Sensitivity <strong>{sensitivity.toFixed(2)}</strong></span>
              <input
                type="range" min="0.3" max="2.0" step="0.05"
                value={sensitivity}
                onChange={(e) => onSensitivityChange?.(Number(e.target.value))}
              />
            </label>
          )}
          {smoothing !== undefined && (
            <label className="audio-setting">
              <span>Smoothing <strong>{smoothing.toFixed(2)}</strong></span>
              <input
                type="range" min="0.1" max="0.95" step="0.01"
                value={smoothing}
                onChange={(e) => onSmoothingChange?.(Number(e.target.value))}
              />
            </label>
          )}
        </div>
      )}

      {/* Bass level meter */}
      <div className="audio-meter">
        <div className="audio-meter__label">BASS LEVEL</div>
        <div className="audio-meter__track">
          <div className="audio-meter__fill" style={{ width: `${Math.round(bassLevel * 100)}%` }} />
        </div>
        <div className="audio-meter__value">{bassLevel.toFixed(2)}</div>
      </div>

      {/* Per-band meters */}
      <div className="audio-spectrum-grid">
        {[
          { key: 'sub', label: 'SUB' },
          { key: 'low', label: 'LOW' },
          { key: 'lowMid', label: 'LOW MID' },
          { key: 'mid', label: 'MID' },
          { key: 'presence', label: 'PRESENCE' },
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

      {/* Full spectrum visualizer */}
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
    </div>
  )
})
