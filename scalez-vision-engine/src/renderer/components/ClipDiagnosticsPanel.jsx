import { useEffect, useRef, useState } from 'react'
import { PERF_CLASSIFICATION, ClipPoolDiagnostics } from '../utils/mediaDiagnostics'

/**
 * ClipDiagnosticsPanel
 * 
 * Real-time diagnostics display for multi-layer playback:
 * - Per-clip codec, resolution, bitrate
 * - Stall counts and frame drop rates
 * - Decoder pressure gauge
 * - Performance classification (SAFE/HEAVY/EXTREME)
 */
export default function ClipDiagnosticsPanel({ layers = [], videoRefs = null, isVisible = false }) {
  const [diagnostics, setDiagnostics] = useState([])
  const [pressure, setPressure] = useState({ level: 'SAFE', ratio: 0 })
  const poolRef = useRef(new ClipPoolDiagnostics())

  // Register video elements on mount/change
  useEffect(() => {
    if (!videoRefs) return
    
    const pool = poolRef.current
    layers.forEach((layer, idx) => {
      const video = videoRefs[layer.layerIndex]
      const active = typeof layer.activeSlotIndex === 'number' ? layer.slots?.[layer.activeSlotIndex] : null
      const filePath = active?.filePath || 'no-clip'
      
      if (video) {
        pool.register(video, filePath)
      }
    })
  }, [layers, videoRefs])

  // Update diagnostics every 500ms
  useEffect(() => {
    if (!isVisible) return
    
    const interval = setInterval(() => {
      const pool = poolRef.current
      pool.tick()
      
      const summaries = pool.getAllSummaries()
      setDiagnostics(summaries)
      
      const decoderPressure = pool.getDecoderPressure()
      setPressure(decoderPressure)
    }, 500)
    
    return () => clearInterval(interval)
  }, [isVisible])

  if (!isVisible) return null

  const pressureColor = {
    SAFE: '#4ade80',
    MODERATE: '#facc15',
    CRITICAL: '#ef4444',
  }[pressure.level] || '#aaa'

  const pressureBar = pressure.ratio * 100

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3>🔍 Decoder Diagnostics</h3>
        <button 
          onClick={(e) => {
            e.stopPropagation()
            // Close via parent
          }}
          style={styles.closeBtn}
        >
          ×
        </button>
      </div>

      {/* Decoder Pressure Gauge */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Decoder Pressure</div>
        <div style={styles.pressureGauge}>
          <div style={styles.pressureLabel}>
            <span>{pressure.level}</span>
            <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
              {(pressure.ratio * 100).toFixed(0)}% of clips stalled
            </span>
          </div>
          <div style={styles.pressureBarBg}>
            <div
              style={{
                ...styles.pressureBarFill,
                width: `${pressureBar}%`,
                backgroundColor: pressureColor,
              }}
            />
          </div>
        </div>
      </div>

      {/* Per-Clip Diagnostics */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Active Clips ({diagnostics.length})</div>
        <div style={styles.clipList}>
          {diagnostics.map((diag, idx) => (
            <ClipDiagRow key={idx} diag={diag} />
          ))}
          {diagnostics.length === 0 && (
            <div style={{ padding: '0.5em', opacity: 0.5, fontSize: '0.9em' }}>
              No clips loaded
            </div>
          )}
        </div>
      </div>

      {/* Health Summary */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Summary</div>
        <div style={styles.summary}>
          <SummaryRow
            label="Total Clips"
            value={diagnostics.length}
          />
          <SummaryRow
            label="Avg Stalls"
            value={diagnostics.length > 0 
              ? (diagnostics.reduce((sum, d) => sum + (d.stallCount || 0), 0) / diagnostics.length).toFixed(1)
              : '—'
            }
          />
          <SummaryRow
            label="Avg Frame Drop"
            value={diagnostics.length > 0
              ? (diagnostics.reduce((sum, d) => sum + (d.frameDropRate || 0), 0) / diagnostics.length * 100).toFixed(1) + '%'
              : '—'
            }
          />
        </div>
      </div>
    </div>
  )
}

function ClipDiagRow({ diag }) {
  const classColor = {
    SAFE: '#4ade80',
    MODERATE: '#facc15',
    HEAVY: '#f97316',
    EXTREME: '#ef4444',
  }[diag.classification] || '#aaa'

  return (
    <div style={styles.clipRow}>
      <div style={styles.clipName}>
        {diag.filePath.split('/').pop() || 'unknown'}
      </div>
      <div style={styles.clipMeta}>
        <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
          {diag.resolution.width}×{diag.resolution.height} | {diag.codec.toUpperCase()}
        </span>
      </div>
      <div style={styles.clipStats}>
        <Stat label="Stalls" value={diag.stallCount} />
        <Stat label="Drop" value={(diag.frameDropRate * 100).toFixed(1) + '%'} />
        <Stat 
          label="Class" 
          value={diag.classification}
          color={classColor}
        />
        {diag.isCurrentlyStalled && (
          <Stat label="Status" value="🔴 STALLED" color="#ef4444" />
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color = 'inherit' }) {
  return (
    <div style={{ fontSize: '0.75em', display: 'flex', gap: '0.3em', alignItems: 'center' }}>
      <span style={{ opacity: 0.6 }}>{label}:</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

function SummaryRow({ label, value }) {
  return (
    <div style={styles.summaryRow}>
      <span style={{ opacity: 0.7 }}>{label}:</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

const styles = {
  container: {
    position: 'fixed',
    bottom: '1em',
    right: '1em',
    width: '320px',
    maxHeight: '500px',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderRadius: '0.5em',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    padding: '1em',
    fontFamily: 'monospace',
    fontSize: '0.9em',
    color: '#fff',
    overflowY: 'auto',
    zIndex: 9999,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1em',
    paddingBottom: '0.5em',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '1.5em',
    opacity: 0.5,
    '&:hover': { opacity: 1 },
  },
  section: {
    marginBottom: '1em',
  },
  sectionTitle: {
    fontSize: '0.85em',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    opacity: 0.7,
    marginBottom: '0.5em',
  },
  pressureGauge: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5em',
  },
  pressureLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontSize: '0.95em',
  },
  pressureBarBg: {
    width: '100%',
    height: '0.3em',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '0.2em',
    overflow: 'hidden',
  },
  pressureBarFill: {
    height: '100%',
    transition: 'width 0.3s ease',
    borderRadius: '0.2em',
  },
  clipList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.7em',
    maxHeight: '250px',
    overflowY: 'auto',
  },
  clipRow: {
    padding: '0.7em',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '0.3em',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  clipName: {
    fontSize: '0.9em',
    fontWeight: 500,
    marginBottom: '0.3em',
    wordBreak: 'break-word',
  },
  clipMeta: {
    fontSize: '0.8em',
    opacity: 0.6,
    marginBottom: '0.4em',
  },
  clipStats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.8em',
    fontSize: '0.75em',
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4em',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.9em',
    padding: '0.3em 0',
  },
}

export { ClipDiagnosticsPanel }
