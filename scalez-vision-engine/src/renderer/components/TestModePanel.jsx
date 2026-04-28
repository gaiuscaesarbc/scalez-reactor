import { useState, useRef } from 'react'

export default function TestModePanel({
  layers,
  onTriggerClip,
  onBassSimulate,
  onToggleLayerVisibility,
}) {
  const [isStressActive, setIsStressActive] = useState(false)
  const stressRef = useRef(null)

  const startStressTest = () => {
    if (isStressActive) return
    setIsStressActive(true)

    const stressInterval = setInterval(() => {
      // Random layer
      const layerIdx = Math.floor(Math.random() * layers.length)
      const layer = layers[layerIdx]

      if (!layer) return

      // Random slot from loaded clips
      const loadedSlots = layer.slots.filter((s) => s.status === 'loaded')
      if (loadedSlots.length > 0) {
        const randomSlot = loadedSlots[Math.floor(Math.random() * loadedSlots.length)]
        onTriggerClip(layerIdx, randomSlot.slotIndex)
      }

      // Random bass pulse
      if (Math.random() > 0.6) {
        onBassSimulate?.()
      }

      // Random layer visibility toggle
      if (Math.random() > 0.8) {
        onToggleLayerVisibility(layerIdx, !layer.visible)
      }
    }, 400)

    stressRef.current = stressInterval
  }

  const stopStressTest = () => {
    if (stressRef.current) {
      clearInterval(stressRef.current)
      stressRef.current = null
    }
    setIsStressActive(false)
  }

  const cycleRandomClips = () => {
    layers.forEach((layer, layerIdx) => {
      const loadedSlots = layer.slots.filter((s) => s.status === 'loaded')
      if (loadedSlots.length > 0) {
        const randomSlot = loadedSlots[Math.floor(Math.random() * loadedSlots.length)]
        onTriggerClip(layerIdx, randomSlot.slotIndex)
      }
    })
  }

  const rapidLayerSwitch = () => {
    let count = 0
    const switchInterval = setInterval(() => {
      const layerIdx = count % layers.length
      const layer = layers[layerIdx]
      const loadedSlots = layer.slots.filter((s) => s.status === 'loaded')
      if (loadedSlots.length > 0) {
        const randomSlot = loadedSlots[Math.floor(Math.random() * loadedSlots.length)]
        onTriggerClip(layerIdx, randomSlot.slotIndex)
      }
      count++
      if (count >= 12) {
        clearInterval(switchInterval)
      }
    }, 150)
  }

  const simulateBass = () => {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => onBassSimulate?.(), i * 100)
    }
  }

  return (
    <div className="test-mode-panel panel-glass">
      <h3>🧪 Test Mode</h3>
      <div className="test-controls">
        <button
          type="button"
          className={`test-btn ${isStressActive ? 'is-active' : ''}`}
          onClick={isStressActive ? stopStressTest : startStressTest}
        >
          {isStressActive ? '⏹️ Stop Stress' : '▶️ Stress Test'}
        </button>
        <button type="button" className="test-btn" onClick={cycleRandomClips}>
          🔄 Random Cycle
        </button>
        <button type="button" className="test-btn" onClick={rapidLayerSwitch}>
          ⚡ Layer Rapid
        </button>
        <button type="button" className="test-btn" onClick={simulateBass}>
          🔊 Bass Pulse
        </button>
      </div>
    </div>
  )
}
