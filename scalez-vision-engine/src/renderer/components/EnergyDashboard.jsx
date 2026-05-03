import { memo } from 'react'

const STATE_COLORS = {
  calm: { bg: '#1a4d6d', text: '#4da6e6', label: 'CALM' },
  build: { bg: '#664d1a', text: '#ffb366', label: 'BUILD' },
  drop: { bg: '#4d1a6d', text: '#dd66ff', label: 'DROP' },
  peak: { bg: '#6d1a1a', text: '#ff6666', label: 'PEAK' },
}

export default memo(function EnergyDashboard({
  energyState = 'calm',
  energyIntensity = 0,
  spectrumLevels = [],
  dropArmed = false,
}) {
  const stateConfig = STATE_COLORS[energyState] || STATE_COLORS.calm
  const intensityPercent = Math.round(energyIntensity * 100)
  
  // Downsample spectrum for visual display (show ~16 bars max)
  const displayBars = spectrumLevels.length > 0 
    ? spectrumLevels.slice(0, Math.max(16, Math.floor(spectrumLevels.length / 4)))
    : []

  return (
    <div className="energy-dashboard">
      <div className="energy-state-card" style={{ borderLeftColor: stateConfig.text }}>
        <div className="energy-state-label">{stateConfig.label}</div>
        <div className="energy-intensity-bar">
          <div
            className="energy-intensity-fill"
            style={{
              width: `${intensityPercent}%`,
              backgroundColor: stateConfig.text,
            }}
          />
        </div>
        <div className="energy-intensity-text">{intensityPercent}%</div>
        {dropArmed && <div className="drop-armed-indicator">DROP ARMED</div>}
      </div>

      {displayBars.length > 0 && (
        <div className="energy-spectrum-display">
          {displayBars.map((level, i) => (
            <div
              key={i}
              className="spectrum-bar"
              style={{
                height: `${Math.max(2, level * 100)}%`,
                backgroundColor: stateConfig.text,
                opacity: 0.3 + level * 0.7,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
})
