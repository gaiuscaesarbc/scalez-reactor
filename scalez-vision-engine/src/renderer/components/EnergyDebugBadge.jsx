/**
 * Energy Debug Badge (PART 7): Optional visual debug info
 * Shows current energy state and intensity
 * Small, non-intrusive overlay
 */
export function EnergyDebugBadge({ energyState, energyIntensity, enabled = false }) {
  if (!enabled) return null

  const stateColors = {
    calm: '#6f83ac',
    build: '#71d0ff',
    drop: '#ff9f40',
    peak: '#ff466d',
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        padding: '6px 10px',
        background: 'rgba(8, 14, 34, 0.9)',
        border: `1px solid ${stateColors[energyState] || '#9db2de'}`,
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: stateColors[energyState] || '#9db2de',
        zIndex: 9999,
        pointerEvents: 'none',
        lineHeight: '1.3',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: '0.05em' }}>
        {energyState.toUpperCase()}
      </div>
      <div>
        {Math.round(energyIntensity * 100)}%
      </div>
    </div>
  )
}
