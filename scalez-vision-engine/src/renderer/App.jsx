import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import LayerStrip from './components/LayerStrip'
import MasterFxPanel from './components/MasterFxPanel'
import OutputPreview from './components/OutputPreview'
import TestModePanel from './components/TestModePanel'
import ShowManager from './components/ShowManager'
import MidiPanel from './components/MidiPanel'
import { useClipStore } from './hooks/useClipStore'
import { useFps } from './hooks/useFps'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useAudioAnalysis } from './hooks/useAudioAnalysis'
import { useHotkeys } from './hooks/useHotkeys'
import { useMidiController } from './hooks/useMidiController'
import { useTapTempo } from './hooks/useTapTempo'
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
    midiMappings,
    setMidiMappings,
    setLayerVisible,
    setLayerOpacity,
    setLayerBlendMode,
    clearLayer,
    triggerClip,
    loadClipIntoSlot,
    markSlotFailed,
    saveShow,
    loadShow,
    getSavedShows,
    deleteShow,
    restoreLastShow,
    autosaveShow,
  } = useClipStore()
  const midiState = useMidiController()
  const { bpm, tap: tapTempo, reset: resetTempo } = useTapTempo()
  const [masterFx, setMasterFx] = useState(DEFAULT_MASTER_FX)
  const [blackout, setBlackout] = useState(false)
  const [audioSensitivity, setAudioSensitivity] = useState(1)
  const [audioSmoothing, setAudioSmoothing] = useState(0.8)
  const [safeMode, setSafeMode] = useState(false)
  const [showTestMode, setShowTestMode] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [savedShows, setSavedShows] = useState([])
  // M9: performance control state
  const [focusedLayer, setFocusedLayer] = useState(null) // null | 0 | 1 | 2
  const [cueMode, setCueMode] = useState(false)
  const [cuedSlots, setCuedSlots] = useState({}) // { layerIndex: slotIndex }
  const [midiFlashSlots, setMidiFlashSlots] = useState(new Set())
  const fps = useFps()
  const sessionTimer = useSessionTimer()
  // Scroll ref map: layerIndex → DOM element
  const scrollContainersRef = useRef({})

  // Flash a slot briefly when triggered via MIDI
  const flashMidiSlot = useCallback((layerIndex, slotIndex) => {
    const key = `${layerIndex}-${slotIndex}`
    setMidiFlashSlots((prev) => {
      const next = new Set(prev)
      next.add(key)
      return next
    })
    setTimeout(() => {
      setMidiFlashSlots((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 400)
  }, [])

  // Cue mode: either cue the slot or trigger it depending on mode
  const handleTriggerOrCue = useCallback((layerIndex, slotIndex) => {
    if (cueMode) {
      setCuedSlots((prev) => ({ ...prev, [layerIndex]: slotIndex }))
    } else {
      triggerClip(layerIndex, slotIndex)
    }
  }, [cueMode, triggerClip])

  // Launch a cued clip (exits cue mode for that layer)
  const handleLaunchCue = useCallback((layerIndex) => {
    const slotIndex = cuedSlots[layerIndex]
    if (typeof slotIndex === 'number') {
      triggerClip(layerIndex, slotIndex)
      setCuedSlots((prev) => {
        const next = { ...prev }
        delete next[layerIndex]
        return next
      })
    }
  }, [cuedSlots, triggerClip])

  // Focus toggle: only one layer can be focused at a time
  const handleFocusToggle = useCallback((layerIndex) => {
    setFocusedLayer((prev) => (prev === layerIndex ? null : layerIndex))
  }, [])

  // Scroll ref registration callback passed to LayerStrip
  const handleScrollRef = useCallback((layerIndex, el) => {
    scrollContainersRef.current[layerIndex] = el
  }, [])

  // Restore last show on mount
  useEffect(() => {
    restoreLastShow()
    setSavedShows(getSavedShows())
  }, [])

  // Load MIDI mappings when show changes
  useEffect(() => {
    if (midiMappings && Object.keys(midiMappings).length > 0) {
      midiState.loadMappings(midiMappings)
    }
  }, [])

  // Listen for MIDI commands and execute them
  useEffect(() => {
    const handleMidiCommand = (event) => {
      const { mapping, midiValue } = event.detail

      switch (mapping.action) {
        case 'blackout':
          setBlackout((current) => !current)
          break

        case 'reset':
          setMasterFx(DEFAULT_MASTER_FX)
          break

        case 'safe-mode':
          setSafeMode((current) => !current)
          break

        case 'tap-tempo':
          tapTempo()
          break

        case 'launch-cue':
          if (focusedLayer !== null) {
            handleLaunchCue(focusedLayer)
          }
          break

        case 'clip-slot': {
          const { layerIndex, slotIndex } = mapping
          if (typeof layerIndex === 'number' && typeof slotIndex === 'number') {
            flashMidiSlot(layerIndex, slotIndex)
            triggerClip(layerIndex, slotIndex)
          }
          break
        }

        case 'glow':
          setMasterFx((current) => ({ ...current, glow: Math.min(1, midiValue / 127) }))
          break

        case 'strobe':
          setMasterFx((current) => ({ ...current, strobe: Math.min(1, midiValue / 127) }))
          break

        case 'shake':
          setMasterFx((current) => ({ ...current, shake: Math.min(1, midiValue / 127) }))
          break

        case 'brightness':
          setMasterFx((current) => ({
            ...current,
            brightness: 0.5 + (midiValue / 127) * 1.5,
          }))
          break

        case 'layer-1-opacity':
          setLayerOpacity(0, midiValue / 127)
          break

        case 'layer-2-opacity':
          setLayerOpacity(1, midiValue / 127)
          break

        case 'layer-3-opacity':
          setLayerOpacity(2, midiValue / 127)
          break

        case 'focused-layer-opacity':
          if (focusedLayer !== null) {
            setLayerOpacity(focusedLayer, midiValue / 127)
          }
          break

        default:
          break
      }
    }

    window.addEventListener('midi-command', handleMidiCommand)
    return () => window.removeEventListener('midi-command', handleMidiCommand)
  }, [setLayerOpacity, focusedLayer, tapTempo, flashMidiSlot, handleLaunchCue, triggerClip])

  // Autosave MIDI mappings with show data
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      autosaveShow(midiState.getMappings())
    }, 30000)

    return () => clearInterval(autosaveInterval)
  }, [autosaveShow, midiState])

  const { bassLevel, isActive: audioActive, permissionDenied, startAudio, stopAudio } = useAudioAnalysis({
    sensitivity: audioSensitivity,
    smoothing: audioSmoothing,
  })

  const displayLayers = useMemo(() => layers.slice().reverse(), [layers])
  const hasAnyLoadedClip = useMemo(
    () => layers.some((layer) => layer.slots.some((slot) => slot.status === 'loaded')),
    [layers],
  )

  const setFxValue = (key, value) => {
    setMasterFx((current) => ({
      ...current,
      [key]: value,
    }))
  }

  const resetFx = () => {
    setMasterFx(DEFAULT_MASTER_FX)
  }

  const handleTriggerByKeyNumber = (layerIndex, slotNum) => {
    if (slotNum >= 0 && slotNum < 9) {
      const layer = layers[layerIndex]
      if (layer && layer.slots[slotNum]) {
        handleTriggerOrCue(layerIndex, slotNum)
      }
    }
  }

  const handleScrollClips = (direction) => {
    // Snap one full slot width per arrow press (matches CSS grid sizes)
    const step = compactMode ? 131 : 138
    const scrollAmount = step * direction
    Object.values(scrollContainersRef.current).forEach((container) => {
      if (container) {
        container.scrollBy({ left: scrollAmount, behavior: 'smooth' })
      }
    })
  }

  useHotkeys({
    onBlackoutToggle: () => setBlackout((current) => !current),
    onResetFx: resetFx,
    onTriggerLayer1: (slot) => handleTriggerByKeyNumber(0, slot),
    onTriggerLayer2: (slot) => handleTriggerByKeyNumber(1, slot),
    onTriggerLayer3: (slot) => handleTriggerByKeyNumber(2, slot),
    onScrollClips: handleScrollClips,
  })

  const bassBoost = bassLevel * 0.35
  const effectiveMasterFx = useMemo(
    () => {
      const base = {
        ...masterFx,
        glow: Math.min(1, masterFx.glow + bassBoost),
        brightness: masterFx.brightness + bassBoost * 0.25,
      }
      if (safeMode) {
        return {
          ...base,
          strobe: 0,
          glow: base.glow * 0.5,
          shake: base.shake * 0.5,
          brightness: base.brightness,
        }
      }
      return base
    },
    [masterFx, bassBoost, safeMode],
  )

  useEffect(() => {
    const nextState = buildOutputState({
      layers,
      masterFx: effectiveMasterFx,
      blackout,
      bassLevel,
    })
    window.scalezApi?.publishOutputState?.(nextState)
  }, [layers, effectiveMasterFx, blackout, bassLevel])

  return (
    <main className={`control-shell${compactMode ? ' is-compact' : ''}`}>
      <header className="top-bar panel-glass">
        <div>
          <h1>SCALEZ Vision Engine</h1>
          <div className="subtitle">
            Live Performance Control
            {' · '}
            <span className="session-timer">{sessionTimer.formatted}</span>
          </div>
        </div>
        <div className="header-actions">
          <MidiPanel midiState={midiState} />
          <ShowManager
            savedShows={savedShows}
            onSaveShow={(name) => {
              saveShow(name, midiState.getMappings())
              setSavedShows(getSavedShows())
            }}
            onLoadShow={(name) => {
              loadShow(name)
              if (midiMappings) {
                midiState.loadMappings(midiMappings)
              }
            }}
            onDeleteShow={(name) => {
              deleteShow(name)
              setSavedShows(getSavedShows())
            }}
          />
          {/* Tap Tempo */}
          <div className="tap-tempo">
            <button
              type="button"
              className="tap-tempo__btn"
              onClick={tapTempo}
              title="Tap to set tempo (no sync)"
            >
              TAP
            </button>
            <span className="tap-tempo__bpm">
              {bpm !== null ? `${bpm} BPM` : '— BPM'}
            </span>
            {bpm !== null && (
              <button
                type="button"
                className="tap-tempo__reset"
                onClick={resetTempo}
                title="Reset tap tempo"
              >
                ✕
              </button>
            )}
          </div>
          {/* Cue Mode */}
          <button
            type="button"
            className={`pill${cueMode ? ' is-active' : ''}`}
            onClick={() => setCueMode((c) => !c)}
            title="Cue mode: select clip to stage, then press Launch to play"
          >
            {cueMode ? '⏸ Cue ON' : '⏸ Cue'}
          </button>
          <button
            type="button"
            className={`pill${compactMode ? ' is-active' : ''}`}
            onClick={() => setCompactMode((v) => !v)}
            title="Compact mode: reduce preview, layer, and FX panel height"
          >
            {compactMode ? 'Compact ON' : 'Compact'}
          </button>
          <button
            type="button"
            className={`pill ${showTestMode ? 'is-active' : ''}`}
            onClick={() => setShowTestMode(!showTestMode)}
          >
            🧪 Test
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => window.scalezApi?.toggleOutputFullscreen()}
          >
            Fullscreen Output
          </button>
        </div>
      </header>

      <OutputPreview
        layers={layers}
        fps={fps}
        bassLevel={bassLevel}
        masterFx={effectiveMasterFx}
        blackout={blackout}
        showOverlays
        markSlotFailed={markSlotFailed}
      />

      {!hasAnyLoadedClip && (
        <p className="empty-guidance panel-glass">Load a clip into any slot to begin.</p>
      )}

      <section className="layer-stack">
        {displayLayers.map((layer) => (
          <LayerStrip
            key={layer.label}
            layer={layer}
            isFocused={focusedLayer === layer.layerIndex}
            cueMode={cueMode}
            cuedSlotIndex={cuedSlots[layer.layerIndex] ?? null}
            midiFlashSlots={midiFlashSlots}
            onToggleVisible={setLayerVisible}
            onOpacityChange={setLayerOpacity}
            onBlendModeChange={setLayerBlendMode}
            onClear={clearLayer}
            onTrigger={handleTriggerOrCue}
            onLoad={loadClipIntoSlot}
            onFocusToggle={handleFocusToggle}
            onLaunchCue={handleLaunchCue}
            onScrollRef={handleScrollRef}
          />
        ))}
      </section>

      <MasterFxPanel
        masterFx={masterFx}
        blackout={blackout}
        onFxChange={setFxValue}
        onToggleBlackout={() => setBlackout((current) => !current)}
        onReset={resetFx}
        safeMode={safeMode}
        onSafeModeChange={setSafeMode}
        audioPanel={{
          bassLevel,
          isActive: audioActive,
          permissionDenied,
          sensitivity: audioSensitivity,
          smoothing: audioSmoothing,
          onStartAudio: startAudio,
          onStopAudio: stopAudio,
          onSensitivityChange: setAudioSensitivity,
          onSmoothingChange: setAudioSmoothing,
        }}
      />

      {showTestMode && (
        <TestModePanel
          layers={layers}
          onTriggerClip={triggerClip}
          onBassSimulate={() => {}}
          onToggleLayerVisibility={setLayerVisible}
        />
      )}
    </main>
  )
}

export default function App() {
  const mode = getWindowMode()
  return mode === 'output' ? <OutputShell /> : <ControlShell />
}
