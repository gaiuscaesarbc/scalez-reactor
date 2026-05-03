import { memo, useEffect, useRef } from 'react'

const STATE_COLORS = {
  calm:  '#4da6e6',
  build: '#ffb366',
  drop:  '#dd66ff',
  peak:  '#ff6666',
}

const HISTORY_LENGTH = 120 // ~5 seconds at 24fps

export default memo(function EnergyDashboard({
  energyState = 'calm',
  energyMetrics = { rel: 1, shortAvg: 0, longAvg: 0, sectionScore: 0 },
  dropArmed = false,
}) {
  const canvasRef = useRef(null)
  const historyRef = useRef([]) // { rel, state } per frame

  const color = STATE_COLORS[energyState] || STATE_COLORS.calm
  const { rel = 1, shortAvg = 0, longAvg = 0 } = energyMetrics

  // rel > 1 = louder than this song's baseline, < 1 = quieter
  // Map rel to a 0-1 bar: center at 1.0, cap at ~1.5
  const relBar = Math.min(1, Math.max(0, (rel - 0.7) / 0.8))
  const relPercent = Math.round(relBar * 100)
  const isAboveBaseline = rel >= 1.02

  // Push to rolling history
  useEffect(() => {
    historyRef.current.push({ rel, state: energyState })
    if (historyRef.current.length > HISTORY_LENGTH) {
      historyRef.current.shift()
    }
  }, [rel, energyState])

  // Draw history waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const history = historyRef.current
    if (history.length < 2) return

    const barW = width / HISTORY_LENGTH

    // Draw baseline guide at rel=1.0 position
    const baselineY = height * (1 - (1 - 0.7) / 0.8) // where rel=1.0 sits
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(0, baselineY)
    ctx.lineTo(width, baselineY)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw history bars
    history.forEach((entry, i) => {
      const barH = Math.min(1, Math.max(0, (entry.rel - 0.7) / 0.8)) * height
      const x = i * barW
      const stateColor = STATE_COLORS[entry.state] || STATE_COLORS.calm
      ctx.fillStyle = stateColor + '99' // 60% opacity
      ctx.fillRect(x, height - barH, barW - 1, barH)
    })

    // Bright line on top of current bar
    const lastEntry = history[history.length - 1]
    if (lastEntry) {
      const currentBarH = Math.min(1, Math.max(0, (lastEntry.rel - 0.7) / 0.8)) * height
      ctx.fillStyle = STATE_COLORS[lastEntry.state] || STATE_COLORS.calm
      ctx.fillRect((history.length - 1) * barW, height - currentBarH, barW - 1, 2)
    }
  })

  return (
    <div className="energy-dashboard">
      {/* State + relative energy */}
      <div className="energy-state-card" style={{ borderLeftColor: color }}>
        <div className="energy-state-label" style={{ color }}>{energyState.toUpperCase()}</div>

        <div className="energy-rel-row">
          <span className="energy-rel-label">vs baseline</span>
          <span className="energy-rel-value" style={{ color: isAboveBaseline ? color : 'var(--text-soft)' }}>
            {rel.toFixed(2)}×
          </span>
        </div>

        <div className="energy-intensity-bar">
          <div
            className="energy-baseline-tick"
            style={{ left: `${Math.round(((1 - 0.7) / 0.8) * 100)}%` }}
          />
          <div
            className="energy-intensity-fill"
            style={{ width: `${relPercent}%`, backgroundColor: color }}
          />
        </div>

        <div className="energy-levels-row">
          <span title="Current moment level">Now: {shortAvg.toFixed(3)}</span>
          <span title="Song baseline">Base: {longAvg.toFixed(3)}</span>
        </div>

        {dropArmed && <div className="drop-armed-indicator">DROP ARMED</div>}
      </div>

      {/* Rolling history waveform */}
      <canvas
        ref={canvasRef}
        className="energy-history-canvas"
        width={300}
        height={64}
      />
    </div>
  )
})
