function getWindowMode() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('window')
  return mode === 'output' ? 'output' : 'control'
}

function OutputShell() {
  return (
    <main className="output-shell">
      <div className="output-label">OUTPUT WINDOW</div>
      <h1>SCALEZ Vision Engine</h1>
      <p>Composited visual feed will render here in v1 implementation.</p>
    </main>
  )
}

function ControlShell() {
  return (
    <main className="control-shell">
      <header className="top-bar">
        <h1>SCALEZ Vision Engine</h1>
        <button
          type="button"
          className="pill"
          onClick={() => window.scalezApi?.toggleOutputFullscreen()}
        >
          Toggle Output Fullscreen
        </button>
      </header>

      <section className="panel">
        <h2>Control Window Ready</h2>
        <p>
          Electron + React + Vite scaffold is active with dedicated control and output
          windows.
        </p>
      </section>

      <section className="grid">
        <div className="panel">
          <h3>src/main</h3>
          <p>Electron main and preload processes configured.</p>
        </div>
        <div className="panel">
          <h3>src/renderer</h3>
          <p>Renderer app wired through Vite and ready for UI buildout.</p>
        </div>
      </section>
    </main>
  )
}

export default function App() {
  const mode = getWindowMode()
  return mode === 'output' ? <OutputShell /> : <ControlShell />
}
