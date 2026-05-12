import { memo, useEffect, useState } from 'react'
import AudioMeter from './AudioMeter'
import BandPicker from './BandPicker'
import EnergyDashboard from './EnergyDashboard'
import CompactPreview from './CompactPreview'
import LiveFxMeters from './LiveFxMeters'

const FX_KEYS = [
  { key: 'strobe', label: 'Strobe', min: 0, max: 1, step: 0.01 },
  { key: 'shake', label: 'Shake', min: 0, max: 1, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: 0.5, max: 2, step: 0.01 },
]

const AUDIO_LINK_KEYS = [
  { key: 'strobe', label: 'Strobe' },
  { key: 'shake', label: 'Shake' },
  { key: 'brightness', label: 'Brightness' },
]

export default memo(function MasterFxPanel({
  masterFx,
  blackout,
  onFxChange,
  onToggleBlackout,
  onReset,
  safeMode,
  onSafeModeChange,
  // Performance & Energy System props (PART 6)
  performanceModeEnabled = false,
  onPerformanceModeChange,
  energyState = 'calm',
  energyIntensity = 0,
  energyMetrics = { rel: 1, shortAvg: 0, longAvg: 0, sectionScore: 0 },
  energySystemEnabled = true,
  onEnergySystemChange,
  energyManualOverrideEnabled = false,
  onEnergyManualOverrideChange,
  manualEnergyState = 'calm',
  onManualEnergyStateChange,
  manualEnergyIntensity = 0.35,
  onManualEnergyIntensityChange,
  dropSystemEnabled = false,
  onDropSystemChange,
  dropThresholdLevel = 'medium',
  onDropThresholdLevelChange,
  lastDropIntensity = 0,
  dropCount = 0,
  recentDropEvent = null,
  dropArmed = false,
  energyStrobeCount = 0,
  dropStrobeCount = 0,
  clipVariationEnabled = false,
  onClipVariationChange,
  autoEvolutionEnabled = false,
  onAutoEvolutionChange,
  autoEvolutionInterval = 60,
  onAutoEvolutionIntervalChange,
  audioPanel,
  layers = [],
  smoothedEnergyFx = {},
  smoothedDropFx = {},
  workspace = 'fx',
}) {
  const [showRecentDrop, setShowRecentDrop] = useState(false)
  const showVisualSection = workspace === 'fx' || workspace === 'debug'
  const showAudioSection = workspace === 'fx' || workspace === 'audio' || workspace === 'debug'
  const showSystemActions = workspace !== 'audio'
  const panelTitle = workspace === 'audio' ? 'Audio Workspace' : 'Master FX'

  useEffect(() => {
    if (!recentDropEvent?.timestamp) {
      return undefined
    }
    setShowRecentDrop(true)
    const timer = setTimeout(() => setShowRecentDrop(false), 4500)
    return () => clearTimeout(timer)
  }, [recentDropEvent?.timestamp])

  return (
    <section className="bottom-panel panel-glass">
      <div className="bottom-panel__header">
        <div>
          <h2>{panelTitle}</h2>
          <div className="hotkey-hint">Space=Blackout R=Reset 1-9=L1 Shift+1-9=L2 Ctrl+1-9=L3</div>
        </div>
        <div className="bottom-panel__actions">
          {showSystemActions && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={safeMode}
                onChange={(event) => onSafeModeChange(event.target.checked)}
              />
              Safe Mode
            </label>
          )}
          {showSystemActions && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={performanceModeEnabled}
                onChange={(event) => onPerformanceModeChange?.(event.target.checked)}
              />
              Perf Mode
            </label>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={energySystemEnabled}
              onChange={(event) => onEnergySystemChange?.(event.target.checked)}
            />
            Energy
          </label>
          {energySystemEnabled && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={energyManualOverrideEnabled}
                onChange={(event) => onEnergyManualOverrideChange?.(event.target.checked)}
              />
              Energy Manual
            </label>
          )}
          {energySystemEnabled && energyManualOverrideEnabled && (
            <label className="control-line compact">
              <span>State:</span>
              <select
                value={manualEnergyState}
                onChange={(event) => onManualEnergyStateChange?.(event.target.value)}
              >
                <option value="calm">Calm</option>
                <option value="build">Build</option>
                <option value="drop">Drop</option>
                <option value="peak">Peak</option>
              </select>
            </label>
          )}
          {energySystemEnabled && energyManualOverrideEnabled && (
            <label className="control-line compact energy-manual-intensity">
              <span>Energy:</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={manualEnergyIntensity}
                onChange={(event) => onManualEnergyIntensityChange?.(Number(event.target.value))}
              />
            </label>
          )}
          {energySystemEnabled && (
            <div className="energy-badge" title={`Energy State: ${energyState} (${Math.round(energyIntensity * 100)}%)`}>
              {energyState.toUpperCase()}
            </div>
          )}
          {energySystemEnabled && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={dropSystemEnabled}
                onChange={(event) => onDropSystemChange?.(event.target.checked)}
              />
              Drop
            </label>
          )}
          {energySystemEnabled && dropSystemEnabled && (
            <label className="control-line compact">
              <span>Drop:</span>
              <select
                value={dropThresholdLevel}
                onChange={(event) => onDropThresholdLevelChange?.(event.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          )}
          {energySystemEnabled && dropSystemEnabled && (
            <div className={`drop-badge${dropArmed ? ' is-armed' : ''}`} title={`Drops this session: ${dropCount}`}>
              {dropArmed ? 'ARMED' : `Drops ${dropCount}`}
            </div>
          )}
          {energySystemEnabled && dropSystemEnabled && showRecentDrop && recentDropEvent && (
            <div className="drop-badge drop-badge--recent" title={`Previous state: ${recentDropEvent.previousEnergyState}`}>
              Last Drop: {lastDropIntensity.toFixed(2)}
            </div>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={clipVariationEnabled}
              onChange={(event) => onClipVariationChange?.(event.target.checked)}
            />
            Variation
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoEvolutionEnabled}
              onChange={(event) => onAutoEvolutionChange?.(event.target.checked)}
            />
            Auto Evolve
          </label>
          {autoEvolutionEnabled && (
            <label className="control-line compact">
              <span>Interval:</span>
              <select
                value={autoEvolutionInterval}
                onChange={(event) => onAutoEvolutionIntervalChange?.(Number(event.target.value))}
              >
                <option value={15}>15s</option>
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={120}>2m</option>
              </select>
            </label>
          )}
          {showSystemActions && (
            <button type="button" className="danger-pill" onClick={onToggleBlackout}>
              {blackout ? 'Disable Blackout' : 'Blackout'}
            </button>
          )}
          {showSystemActions && (
            <button type="button" className="pill ghost" onClick={onReset}>
              Reset FX
            </button>
          )}
        </div>
      </div>

      <div className="master-fx-grid">
        {showVisualSection && (
        <div className="fx-section">
          <h3>Visual FX</h3>
          <CompactPreview
            layers={layers}
            masterFx={masterFx}
            smoothedEnergyFx={smoothedEnergyFx}
            smoothedDropFx={smoothedDropFx}
            energySystemEnabled={energySystemEnabled}
            energyState={energyState}
            blackout={blackout}
            liveVideoEnabled={false}
          />
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

          {energySystemEnabled && (
            <EnergyDashboard
              energyState={energyState}
              energyIntensity={energyIntensity}
              energyMetrics={energyMetrics}
              spectrumLevels={audioPanel?.spectrumLevels || []}
              dropArmed={dropArmed}
            />
          )}
          <LiveFxMeters
            masterFx={masterFx}
            smoothedEnergyFx={smoothedEnergyFx}
            smoothedDropFx={smoothedDropFx}
            energySystemEnabled={energySystemEnabled}
            energyStrobeCount={energyStrobeCount}
            dropStrobeCount={dropStrobeCount}
          />
        </div>
        )}

        {audioPanel && showAudioSection && (
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
              noiseFloor={audioPanel.noiseFloor}
              preGain={audioPanel.preGain}
              audioDevices={audioPanel.audioDevices}
              selectedDeviceId={audioPanel.selectedDeviceId}
              onDeviceChange={audioPanel.onDeviceChange}
              onStartAudio={audioPanel.onStartAudio}
              onStopAudio={audioPanel.onStopAudio}
              onSensitivityChange={audioPanel.onSensitivityChange}
              onSmoothingChange={audioPanel.onSmoothingChange}
              onNoiseFloorChange={audioPanel.onNoiseFloorChange}
              onPreGainChange={audioPanel.onPreGainChange}
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
                    <BandPicker
                      value={audioPanel.fxLinks[fx.key].source || 'low'}
                      onChange={(band) => audioPanel.onFxLinkChange?.(fx.key, 'source', band)}
                      spectrumRef={audioPanel.spectrumRef}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="bottom-panel__note">
        {workspace === 'audio'
          ? 'Tune routing, EQ, and reactive links without cluttering the performance deck.'
          : 'Bass energy can be linked into strobe, shake, and brightness. Arrow keys scroll clip grids.'}
      </p>
    </section>
  )
})
