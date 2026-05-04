/**
 * Energy Debug Badge (PART 7): Optional visual debug info
 * Shows current energy state, intensity, and spectral metrics
 */
export function EnergyDebugBadge({ energyState, energyIntensity, energyMetrics = {}, enabled = false }) {
  if (!enabled) return null

  const stateColors = {
    calm: '#6f83ac',
    build: '#71d0ff',
    drop: '#ff9f40',
    peak: '#ff466d',
  }

  const color = stateColors[energyState] || '#9db2de'
  const { rel = 0, shortAvg = 0, sectionScore = 0, flux01 = 0, brightness = 0, bassRel = 0 } = energyMetrics

  const bar = (val, max = 1) => {
    const pct = Math.round(Math.min(1, val / max) * 100)
    return (
      <span style={{ display: 'inline-block', width: 40, height: 4, background: '#1a2240', borderRadius: 2, verticalAlign: 'middle', overflow: 'hidden' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </span>
    )
  }

  const row = (label, val, max, fmt) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
      <span style={{ opacity: 0.6, minWidth: 52 }}>{label}</span>
      {bar(val, max)}
      <span style={{ minWidth: 32, textAlign: 'right' }}>{fmt(val)}</span>
    </div>
  )

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        padding: '7px 10px',
        background: 'rgba(8, 14, 34, 0.92)',
        border: `1px solid ${color}`,
        borderRadius: '5px',
        fontFamily: 'monospace',
        fontSize: '0.7rem',
        color,
        zIndex: 9999,
        pointerEvents: 'none',
        lineHeight: '1.6',
        minWidth: 160,
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: '0.07em', marginBottom: 3 }}>
        {energyState.toUpperCase()} &nbsp;
        <span style={{ fontWeight: 400, opacity: 0.8 }}>{Math.round(energyIntensity * 100)}%</span>
      </div>
      {row('rel',     rel,        2,   (v) => v.toFixed(2))}
      {row('short',   shortAvg,   1,   (v) => v.toFixed(3))}
      {row('score',   sectionScore, 1, (v) => v.toFixed(3))}
      {row('flux',    flux01,     1,   (v) => v.toFixed(2))}
      {row('bright',  brightness, 1,   (v) => v.toFixed(2))}
      {row('bassRel', bassRel,    2,   (v) => v.toFixed(2))}
    </div>
  )
}
