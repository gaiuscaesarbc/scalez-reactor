import { memo } from 'react'

export default memo(function PerformanceHUD({
  bpm,
  energyState,
  energyIntensity,
  blackout,
  fps,
  bassLevel,
  activeLayerCount,
}) {
  const energyColor = {
    calm: '#4ab4ff',
    build: '#ffd966',
    drop: '#ff8c42',
    peak: '#ff466d',
  }[energyState] || '#4ab4ff'

  return (
    <div className="performance-hud">
      <div className="performance-hud__section performance-hud__tempo">
        <div className="performance-hud__label">BPM</div>
        <div className="performance-hud__value">{bpm ?? '—'}</div>
      </div>

      <div className="performance-hud__section performance-hud__energy">
        <div className="performance-hud__label">Energy</div>
        <div
          className="performance-hud__value"
          style={{ color: energyColor }}
        >
          {energyState.toUpperCase()}
        </div>
        <div
          className="performance-hud__energy-bar"
          style={{
            width: `${Math.max(0, Math.min(100, energyIntensity * 100))}%`,
            background: `linear-gradient(90deg, ${energyColor}, ${energyColor}dd)`,
          }}
        />
      </div>

      <div className="performance-hud__section performance-hud__audio">
        <div className="performance-hud__label">Bass</div>
        <div className="performance-hud__meter">
          <div
            className="performance-hud__meter-fill"
            style={{
              width: `${Math.max(0, Math.min(100, bassLevel * 100))}%`,
            }}
          />
        </div>
      </div>

      <div className="performance-hud__section performance-hud__status">
        <div className="performance-hud__label">Layers</div>
        <div className="performance-hud__value">{activeLayerCount}</div>
      </div>

      <div className="performance-hud__section performance-hud__blackout">
        {blackout && <div className="performance-hud__blackout-indicator">⊘ BLACKOUT</div>}
      </div>

      <div className="performance-hud__section performance-hud__fps">
        <div className="performance-hud__label">FPS</div>
        <div className="performance-hud__value" style={{fontSize:'0.75rem'}}>{fps}</div>
      </div>
    </div>
  )
})
