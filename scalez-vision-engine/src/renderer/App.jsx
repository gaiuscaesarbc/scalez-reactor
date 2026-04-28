import { useMemo } from 'react'
import LayerStrip from './components/LayerStrip'
import OutputPreview from './components/OutputPreview'
import { useClipStore } from './hooks/useClipStore'
import { useFps } from './hooks/useFps'

function getWindowMode() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('window')
  return mode === 'output' ? 'output' : 'control'
}

function OutputShell({ layers }) {
  return (
    <main className="output-shell">
      <div className="output-label">OUTPUT WINDOW</div>
      <OutputPreview layers={layers} fps={60} bassLevel={0.2} />
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
  } = useClipStore()
  const fps = useFps()

  const displayLayers = useMemo(() => layers.slice().reverse(), [layers])

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

      <OutputPreview layers={layers} fps={fps} bassLevel={0.2} />

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
          />
        ))}
      </section>

      <section className="bottom-panel panel-glass">
        <h2>Master FX + Audio</h2>
        <p>Placeholder panel ready for next milestone (FX, blackout/reset, live audio analysis).</p>
      </section>
    </main>
  )
}

export default function App() {
  const mode = getWindowMode()
  const { layers } = useClipStore()
  return mode === 'output' ? <OutputShell layers={layers} /> : <ControlShell />
}
