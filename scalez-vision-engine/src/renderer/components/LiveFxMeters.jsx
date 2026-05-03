import { memo } from 'react'

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

const METERS = [
  { key: 'glow',       label: 'GLOW',       color: '#4ab4ff', max: 1.5 },
  { key: 'brightness', label: 'BRIGHT',     color: '#ffe066', max: 1.5 },
  { key: 'shake',      label: 'SHAKE',      color: '#ff6666', max: 1.0 },
  { key: 'strobe',     label: 'STROBE',     color: '#dd66ff', max: 1.0 },
]

function StackedBar({ label, color, manual, energy, drop, max }) {
  const manualPct  = clamp(manual / max) * 100
  const energyPct  = clamp(energy / max) * 100
  const dropPct    = clamp(drop   / max) * 100
  const totalPct   = clamp((manual + energy + drop) / max) * 100
  const totalVal   = clamp(manual + energy + drop, 0, max)

  return (
    <div className="lfx-meter">
      <div className="lfx-meter__header">
        <span className="lfx-meter__label">{label}</span>
        <span className="lfx-meter__value" style={{ color }}>{totalVal.toFixed(2)}</span>
      </div>
      <div className="lfx-meter__track">
        {/* Manual segment */}
        <div
          className="lfx-meter__seg lfx-meter__seg--manual"
          style={{ width: `${manualPct}%` }}
          title={`Manual: ${manual.toFixed(2)}`}
        />
        {/* Energy segment stacked on top */}
        <div
          className="lfx-meter__seg lfx-meter__seg--energy"
          style={{ width: `${energyPct}%`, left: `${manualPct}%` }}
          title={`Energy: ${energy.toFixed(2)}`}
        />
        {/* Drop segment */}
        <div
          className="lfx-meter__seg lfx-meter__seg--drop"
          style={{ width: `${dropPct}%`, left: `${clamp((manual + energy) / max) * 100}%` }}
          title={`Drop: ${drop.toFixed(2)}`}
        />
        {/* Glow on tip when total is high */}
        {totalPct > 5 && (
          <div
            className="lfx-meter__tip"
            style={{ left: `${Math.min(97, totalPct)}%`, boxShadow: `0 0 6px ${color}` }}
          />
        )}
        {/* Clip indicator */}
        {totalPct >= 99 && (
          <div className="lfx-meter__clip">CLIP</div>
        )}
      </div>
    </div>
  )
}

export default memo(function LiveFxMeters({
  masterFx = {},
  smoothedEnergyFx = {},
  smoothedDropFx = {},
  energySystemEnabled = false,
}) {
  const energyEnabled = energySystemEnabled

  return (
    <div className="live-fx-meters">
      <div className="live-fx-meters__title">
        Live Output
        <span className="live-fx-meters__legend">
          <span className="lfx-legend-dot lfx-legend-dot--manual" />Manual
          <span className="lfx-legend-dot lfx-legend-dot--energy" />Energy
          <span className="lfx-legend-dot lfx-legend-dot--drop" />Drop
        </span>
      </div>

      {METERS.map(({ key, label, color, max }) => {
        const manual = masterFx[key] ?? 0
        const energy = energyEnabled
          ? key === 'shake'
            ? (smoothedEnergyFx?.shakeIntensity ?? 0) + (smoothedDropFx?.shakeIntensity ?? 0)
            : key === 'glow'
            ? (smoothedEnergyFx?.glowBoost ?? 0) + (smoothedDropFx?.glowBoost ?? 0)
            : key === 'brightness'
            ? (smoothedEnergyFx?.brightnessBoost ?? 0) + (smoothedDropFx?.brightnessBoost ?? 0)
            : 0
          : 0
        // Strobe is event-based, map the slider value
        const energyFinal = key === 'strobe' ? 0 : energy
        const dropFinal = 0 // already merged into energy above

        return (
          <StackedBar
            key={key}
            label={label}
            color={color}
            manual={manual}
            energy={energyFinal}
            drop={dropFinal}
            max={max}
          />
        )
      })}
    </div>
  )
})
