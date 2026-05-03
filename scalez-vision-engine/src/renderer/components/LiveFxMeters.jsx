import { memo, useEffect, useRef, useState } from 'react'

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

const METERS = [
  { key: 'glow',       label: 'GLOW',   color: '#4ab4ff', max: 1.5 },
  { key: 'brightness', label: 'BRIGHT', color: '#ffe066', max: 1.5 },
  { key: 'shake',      label: 'SHAKE',  color: '#ff6666', max: 1.0 },
  { key: 'strobe',     label: 'STROBE', color: '#dd66ff', max: 1.0 },
]

function StackedBar({ label, color, manual, energy, drop, max }) {
  const totalFill = clamp((manual + energy + drop) / max) * 100
  const totalVal = clamp(manual + energy + drop, 0, max)

  // Gradient stops as percentages within the filled region.
  const manualShare = totalFill > 0 ? clamp(manual / max) * 100 : 0
  const energyEnd = manualShare + clamp(energy / max) * 100
  const dropEnd = energyEnd + clamp(drop / max) * 100

  // Build gradient: white -> blue -> purple, then transparent for unfilled.
  const gradient = totalFill > 0.1
    ? `linear-gradient(to right,
        rgba(255,255,255,0.55) 0%,
        rgba(255,255,255,0.55) ${manualShare.toFixed(1)}%,
        rgba(74,180,255,1) ${manualShare.toFixed(1)}%,
        rgba(74,180,255,1) ${energyEnd.toFixed(1)}%,
        rgba(221,102,255,1) ${energyEnd.toFixed(1)}%,
        rgba(221,102,255,1) ${dropEnd.toFixed(1)}%,
        transparent ${dropEnd.toFixed(1)}%
      )`
    : 'transparent'

  return (
    <div className="lfx-meter">
      <div className="lfx-meter__header">
        <span className="lfx-meter__label">{label}</span>
        <span className="lfx-meter__value" style={{ color }}>{totalVal.toFixed(2)}</span>
      </div>
      <div className="lfx-meter__track">
        <div
          className="lfx-meter__fill"
          style={{
            width: `${totalFill.toFixed(1)}%`,
            background: gradient,
          }}
        />
        {totalFill >= 99 && <span className="lfx-meter__clip">CLIP</span>}
      </div>
    </div>
  )
}

export default memo(function LiveFxMeters({
  masterFx = {},
  smoothedEnergyFx = {},
  smoothedDropFx = {},
  energySystemEnabled = false,
  energyStrobeCount = 0,
  dropStrobeCount = 0,
}) {
  const [energyStrobePulse, setEnergyStrobePulse] = useState(0)
  const [dropStrobePulse, setDropStrobePulse] = useState(0)

  const lastEnergyStrobeCountRef = useRef(energyStrobeCount)
  const lastDropStrobeCountRef = useRef(dropStrobeCount)
  const energyPulseTimeoutRef = useRef(null)
  const dropPulseTimeoutRef = useRef(null)

  useEffect(() => {
    const energyTriggered = energyStrobeCount > lastEnergyStrobeCountRef.current
    lastEnergyStrobeCountRef.current = energyStrobeCount

    if (!energySystemEnabled) {
      setEnergyStrobePulse(0)
      return
    }

    if (!energyTriggered) {
      return
    }

    setEnergyStrobePulse(0.9)
    if (energyPulseTimeoutRef.current) {
      clearTimeout(energyPulseTimeoutRef.current)
    }
    energyPulseTimeoutRef.current = setTimeout(() => {
      setEnergyStrobePulse(0)
      energyPulseTimeoutRef.current = null
    }, 180)
  }, [energyStrobeCount, energySystemEnabled])

  useEffect(() => {
    const dropTriggered = dropStrobeCount > lastDropStrobeCountRef.current
    lastDropStrobeCountRef.current = dropStrobeCount

    if (!dropTriggered) {
      return
    }

    setDropStrobePulse(0.75)
    if (dropPulseTimeoutRef.current) {
      clearTimeout(dropPulseTimeoutRef.current)
    }
    dropPulseTimeoutRef.current = setTimeout(() => {
      setDropStrobePulse(0)
      dropPulseTimeoutRef.current = null
    }, 140)
  }, [dropStrobeCount])

  useEffect(() => () => {
    if (energyPulseTimeoutRef.current) {
      clearTimeout(energyPulseTimeoutRef.current)
    }
    if (dropPulseTimeoutRef.current) {
      clearTimeout(dropPulseTimeoutRef.current)
    }
  }, [])

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
        let energyBoost = 0
        let dropBoost = 0

        if (key === 'strobe') {
          energyBoost = energyStrobePulse
          dropBoost = dropStrobePulse
        } else if (energySystemEnabled) {
          if (key === 'glow') {
            energyBoost = smoothedEnergyFx?.glowBoost ?? 0
            dropBoost = smoothedDropFx?.glowBoost ?? 0
          } else if (key === 'shake') {
            energyBoost = smoothedEnergyFx?.shakeIntensity ?? 0
            dropBoost = smoothedDropFx?.shakeIntensity ?? 0
          } else if (key === 'brightness') {
            energyBoost = smoothedEnergyFx?.brightnessBoost ?? 0
            dropBoost = smoothedDropFx?.brightnessBoost ?? 0
          }
        }

        return (
          <StackedBar
            key={key}
            label={label}
            color={color}
            manual={manual}
            energy={energyBoost}
            drop={dropBoost}
            max={max}
          />
        )
      })}
    </div>
  )
})
