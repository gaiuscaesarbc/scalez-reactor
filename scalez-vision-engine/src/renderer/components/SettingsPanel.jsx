import { memo, useState } from 'react'

const RESOLUTIONS = [
  { label: '1280 × 720  (720p)',   width: 1280, height: 720  },
  { label: '1920 × 1080 (1080p)',  width: 1920, height: 1080 },
  { label: '2560 × 1440 (1440p)',  width: 2560, height: 1440 },
  { label: '3840 × 2160 (4K)',     width: 3840, height: 2160 },
  { label: 'Custom',               width: null, height: null  },
]

const ASPECT_RATIOS = [
  { label: '16:9 (Standard)',  value: '16:9'  },
  { label: '4:3 (Classic)',    value: '4:3'   },
  { label: '21:9 (Ultrawide)', value: '21:9'  },
  { label: '1:1 (Square)',     value: '1:1'   },
  { label: 'Free',             value: 'free'  },
]

const FRAME_RATES = [
  { label: '30 fps',  value: 30  },
  { label: '60 fps',  value: 60  },
  { label: '120 fps', value: 120 },
]

export default memo(function SettingsPanel({
  isOpen = false,
  onClose,
  settings = {},
  actions = {},
}) {
  const [activeTab, setActiveTab] = useState('output')

  // Output settings
  const [selectedResolution, setSelectedResolution] = useState('1920 × 1080 (1080p)')
  const [customWidth, setCustomWidth] = useState(1920)
  const [customHeight, setCustomHeight] = useState(1080)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [targetFps, setTargetFps] = useState(60)
  const [resizeStatus, setResizeStatus] = useState(null)

  // UI / Appearance settings
  const [uiScale, setUiScale] = useState(1.0)
  const [overlayOpacity, setOverlayOpacity] = useState(0.52)

  const {
    performanceModeEnabled = false,
    safeMode = false,
    energyReactiveEnabled = true,
    beatSyncEnabled = false,
    showEnergyDebug = false,
    dropThresholdLevel = 'medium',
    energySystemEnabled = true,
    autoEvolutionEnabled = false,
    autoEvolutionInterval = 60,
  } = settings

  const {
    setPerformanceModeEnabled = () => {},
    setSafeMode = () => {},
    setEnergyReactiveEnabled = () => {},
    setBeatSyncEnabled = () => {},
    setShowEnergyDebug = () => {},
    setDropThresholdLevel = () => {},
    setEnergySystemEnabled = () => {},
    setAutoEvolutionEnabled = () => {},
    setAutoEvolutionInterval = () => {},
  } = actions

  if (!isOpen) {
    return null
  }

  const selectedRes = RESOLUTIONS.find((r) => r.label === selectedResolution)
  const isCustom = selectedRes?.width === null

  const applyOutputResolution = async () => {
    const width  = isCustom ? Number(customWidth)  : selectedRes.width
    const height = isCustom ? Number(customHeight) : selectedRes.height

    if (!width || !height || width < 320 || height < 240) {
      setResizeStatus('Invalid dimensions.')
      return
    }

    setResizeStatus('Applying…')
    try {
      const result = await window.scalezApi?.setOutputResolution?.({ width, height })
      if (result?.ok) {
        setResizeStatus(`Applied: ${width} × ${height}`)
      } else {
        setResizeStatus(result?.error || 'Failed to resize output window.')
      }
    } catch (err) {
      setResizeStatus(`Error: ${err?.message || 'Unknown'}`)
    }
  }

  const tabs = [
    { id: 'output',     label: 'Output' },
    { id: 'ui',         label: 'Interface' },
    { id: 'about',      label: 'About' },
  ]

  return (
    <div className="settings-panel panel-glass" role="dialog" aria-label="Settings">
      <div className="settings-panel__header">
        <h2>⚙ Settings</h2>
        <button className="settings-panel__close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="settings-panel__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`settings-tab${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="settings-panel__body">

        {/* ── OUTPUT TAB ─────────────────────────────── */}
        {activeTab === 'output' && (
          <div className="settings-section">
            <h3>Output Window</h3>

            <div className="settings-row">
              <label className="settings-label">Resolution</label>
              <select
                className="settings-select"
                value={selectedResolution}
                onChange={(e) => setSelectedResolution(e.target.value)}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r.label} value={r.label}>{r.label}</option>
                ))}
              </select>
            </div>

            {isCustom && (
              <div className="settings-row settings-row--custom-res">
                <label className="settings-label">Width × Height</label>
                <div className="settings-dim-inputs">
                  <input
                    className="settings-input"
                    type="number"
                    min={320}
                    max={7680}
                    step={1}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    placeholder="Width"
                  />
                  <span className="settings-dim-sep">×</span>
                  <input
                    className="settings-input"
                    type="number"
                    min={240}
                    max={4320}
                    step={1}
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    placeholder="Height"
                  />
                </div>
              </div>
            )}

            <div className="settings-row">
              <label className="settings-label">Aspect Ratio</label>
              <select
                className="settings-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
              >
                {ASPECT_RATIOS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <div className="settings-row">
              <label className="settings-label">Target Frame Rate</label>
              <select
                className="settings-select"
                value={targetFps}
                onChange={(e) => setTargetFps(Number(e.target.value))}
              >
                {FRAME_RATES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>

            <div className="settings-actions">
              <button className="pill" onClick={applyOutputResolution}>
                Apply to Output Window
              </button>
              <button className="pill" onClick={() => window.scalezApi?.toggleOutputFullscreen()}>
                Toggle Fullscreen
              </button>
            </div>

            {resizeStatus && (
              <p className="settings-status">{resizeStatus}</p>
            )}

            <h3 style={{ marginTop: 20 }}>Aspect Ratio Preview</h3>
            <div className="settings-aspect-preview">
              {ASPECT_RATIOS.filter((a) => a.value !== 'free').map((a) => {
                const [w, h] = a.value.split(':').map(Number)
                const pct = ((h / w) * 100).toFixed(2)
                return (
                  <button
                    key={a.value}
                    className={`settings-aspect-btn${aspectRatio === a.value ? ' is-active' : ''}`}
                    onClick={() => setAspectRatio(a.value)}
                  >
                    <div
                      className="settings-aspect-box"
                      style={{ paddingBottom: `${pct}%` }}
                    />
                    <span>{a.value}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── INTERFACE TAB ──────────────────────────── */}
        {activeTab === 'ui' && (
          <div className="settings-section">
            <h3>Interface</h3>

            <div className="settings-row">
              <label className="settings-label">UI Scale</label>
              <div className="settings-row__right">
                <input
                  className="settings-range"
                  type="range"
                  min={0.7}
                  max={1.4}
                  step={0.05}
                  value={uiScale}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setUiScale(v)
                    document.documentElement.style.setProperty('--ui-scale', String(v))
                  }}
                />
                <span className="settings-value">{uiScale.toFixed(2)}×</span>
              </div>
            </div>

            <div className="settings-row">
              <label className="settings-label">Overlay Opacity</label>
              <div className="settings-row__right">
                <input
                  className="settings-range"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={overlayOpacity}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setOverlayOpacity(v)
                    document.documentElement.style.setProperty('--overlay-bg-opacity', String(v))
                  }}
                />
                <span className="settings-value">{Math.round(overlayOpacity * 100)}%</span>
              </div>
            </div>

            <div className="settings-row">
              <label className="settings-label">Performance Mode</label>
              <input
                type="checkbox"
                checked={performanceModeEnabled}
                onChange={(e) => setPerformanceModeEnabled(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Safe Mode</label>
              <input
                type="checkbox"
                checked={safeMode}
                onChange={(e) => setSafeMode(e.target.checked)}
              />
            </div>

            <h3 style={{ marginTop: 20 }}>Energy & Debug</h3>

            <div className="settings-row">
              <label className="settings-label">Energy System Enabled</label>
              <input
                type="checkbox"
                checked={energySystemEnabled}
                onChange={(e) => setEnergySystemEnabled(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Energy Reactive Triggers</label>
              <input
                type="checkbox"
                checked={energyReactiveEnabled}
                onChange={(e) => setEnergyReactiveEnabled(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Beat Sync Enabled</label>
              <input
                type="checkbox"
                checked={beatSyncEnabled}
                onChange={(e) => setBeatSyncEnabled(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Show Energy Debug Overlay</label>
              <input
                type="checkbox"
                checked={showEnergyDebug}
                onChange={(e) => setShowEnergyDebug(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Drop Threshold</label>
              <select
                className="settings-select"
                value={dropThresholdLevel}
                onChange={(e) => setDropThresholdLevel(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <h3 style={{ marginTop: 20 }}>Evolution</h3>

            <div className="settings-row">
              <label className="settings-label">Auto Evolution</label>
              <input
                type="checkbox"
                checked={autoEvolutionEnabled}
                onChange={(e) => setAutoEvolutionEnabled(e.target.checked)}
              />
            </div>

            <div className="settings-row">
              <label className="settings-label">Auto Evolution Interval</label>
              <div className="settings-row__right">
                <input
                  className="settings-range"
                  type="range"
                  min={15}
                  max={180}
                  step={5}
                  value={autoEvolutionInterval}
                  onChange={(e) => setAutoEvolutionInterval(Number(e.target.value))}
                />
                <span className="settings-value">{autoEvolutionInterval}s</span>
              </div>
            </div>
          </div>
        )}

        {/* ── ABOUT TAB ──────────────────────────────── */}
        {activeTab === 'about' && (
          <div className="settings-section">
            <h3>SCALEZ Vision Engine</h3>
            <p className="settings-about-line">Version: 0.0.0</p>
            <p className="settings-about-line">Runtime: Electron / Chromium</p>
            <p className="settings-about-line">Renderer: React 19 + Vite</p>
            <p className="settings-about-line">Node: {window.scalezApi?.versions?.node ?? '–'}</p>
            <p className="settings-about-line">Electron: {window.scalezApi?.versions?.electron ?? '–'}</p>
            <p className="settings-about-line">Chrome: {window.scalezApi?.versions?.chrome ?? '–'}</p>
          </div>
        )}

      </div>
    </div>
  )
})
