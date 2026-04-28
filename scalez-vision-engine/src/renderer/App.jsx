import { useEffect, useMemo, useState } from 'react'
import LayerStrip from './components/LayerStrip'
import MasterFxPanel from './components/MasterFxPanel'
import OutputPreview from './components/OutputPreview'
import { useClipStore } from './hooks/useClipStore'
import { useFps } from './hooks/useFps'
import {
  buildOutputState,
  DEFAULT_MASTER_FX,
  useOutputStateSubscription,
} from './hooks/useOutputSync'

function getWindowMode() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('window')
  return mode === 'output' ? 'output' : 'control'
}

function OutputShell() {
  const syncedState = useOutputStateSubscription()

  const layers = syncedState?.layers || []
  const masterFx = syncedState?.masterFx || DEFAULT_MASTER_FX
  const blackout = Boolean(syncedState?.blackout)
  const bassLevel = syncedState?.audio?.bassLevel ?? 0.2

  return (
    <main className="output-shell">
      <OutputPreview
        layers={layers}
        fps={60}
        bassLevel={bassLevel}
        masterFx={masterFx}
        blackout={blackout}
        showOverlays={false}
      />
    </main>
  )
}

function ControlShell() {
  const {
    layers,
    setLayerVisible,
    setLayerOpacity,
    setLayerBlendMode,
    clearLayer,
    triggerClip,
    loadClipIntoSlot,
  } = useClipStore()
  const [masterFx, setMasterFx] = useState(DEFAULT_MASTER_FX)
  const [blackout, setBlackout] = useState(false)
  const fps = useFps()

  const displayLayers = useMemo(() => layers.slice().reverse(), [layers])

  const setFxValue = (key, value) => {
    setMasterFx((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const resetFx = () => {
    setMasterFx(DEFAULT_MASTER_FX)
  }

  useEffect(() => {
    const nextState = buildOutputState({
      layers,
      masterFx,
      blackout,
      bassLevel: 0.2,
    })
    window.scalezApi?.publishOutputState?.(nextState)
  }, [layers, masterFx, blackout])

  return (
    <main className="control-shell">
      <header className="top-bar panel-glass">
        <div>
          <h1>SCALEZ Vision Engine</h1>
          <div className="subtitle">Live Performance Control</div>
        </div>
        <button
          type="button"
          className="pill"
          onClick={() => window.scalezApi?.toggleOutputFullscreen()}
        >
          Fullscreen Output
        </button>
      </header>

      <OutputPreview
        layers={layers}
        fps={fps}
        bassLevel={0.2}
        masterFx={masterFx}
        blackout={blackout}
        showOverlays
      />

      <section className="layer-stack">
        {displayLayers.map((layer) => (
          <LayerStrip
            key={layer.label}
            layer={layer}
            onToggleVisible={setLayerVisible}
            onOpacityChange={setLayerOpacity}
            onBlendModeChange={setLayerBlendMode}
            onClear={clearLayer}
            onTrigger={triggerClip}
            onLoad={loadClipIntoSlot}
          />
        ))}
      </section>

      <MasterFxPanel
        masterFx={masterFx}
        blackout={blackout}
        onFxChange={setFxValue}
        onToggleBlackout={() => setBlackout((current) => !current)}
        onReset={resetFx}
      />
    </main>
  )
}

export default function App() {
  const mode = getWindowMode()
  return mode === 'output' ? <OutputShell /> : <ControlShell />
}
