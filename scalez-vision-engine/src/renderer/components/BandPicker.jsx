import { useRef, useEffect, useState } from 'react'

const BANDS = [
  { key: 'sub',      label: 'SUB' },
  { key: 'low',      label: 'L'   },
  { key: 'lowMid',   label: 'LM'  },
  { key: 'mid',      label: 'M'   },
  { key: 'presence', label: 'P'   },
  { key: 'high',     label: 'H'   },
  { key: 'full',     label: 'ALL' },
]

/**
 * BandPicker — collapsible EQ band selector with live spectrum bar visualizer.
 *
 * Props:
 *   value        {string}   — selected band key ('sub'|'low'|'lowMid'|'mid'|'presence'|'high'|'full')
 *   onChange     {fn}       — (bandKey: string) => void
 *   spectrumRef  {React.MutableRefObject} — ref to current spectrumLevels object (updated externally)
 */
export default function BandPicker({ value, onChange, spectrumRef, label = 'EQ Band' }) {
  const [open, setOpen] = useState(false)
  const barEls = useRef([])
  const rafRef = useRef(null)

  const selectedLabel = BANDS.find((b) => b.key === value)?.label ?? value

  // Animate bars via rAF reading directly from spectrumRef — no React re-renders needed
  useEffect(() => {
    if (!open) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      return
    }

    function tick() {
      const levels = spectrumRef?.current ?? {}
      barEls.current.forEach((el, i) => {
        if (!el) return
        const level = levels[BANDS[i].key] ?? 0
        el.style.height = `${Math.max(2, Math.round(level * 100))}%`
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [open, spectrumRef])

  return (
    <div className="band-picker">
      <button
        type="button"
        className="collapse-toggle band-picker__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="audio-reactivity-block__title">{label}: {selectedLabel}</span>
        <span className="collapse-toggle__icon">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="band-picker__panel">
          {/* Live spectrum bars */}
          <div className="band-picker__bars" aria-hidden="true">
            {BANDS.map((band, i) => (
              <div
                key={band.key}
                className={`band-picker__bar-col${value === band.key ? ' band-picker__bar-col--active' : ''}`}
                title={band.key}
              >
                <div className="band-picker__bar-track">
                  <div
                    ref={(el) => { barEls.current[i] = el }}
                    className="band-picker__bar-fill"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Band select buttons */}
          <div className="band-picker__buttons">
            {BANDS.map((band) => (
              <button
                key={band.key}
                type="button"
                className={`band-picker__btn${value === band.key ? ' band-picker__btn--active' : ''}`}
                onClick={() => onChange(band.key)}
              >
                {band.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
