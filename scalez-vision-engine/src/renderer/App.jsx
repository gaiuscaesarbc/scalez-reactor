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

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function getReactiveAmount(level, threshold, mode, amount) {
  const normalizedThreshold = clamp01(threshold)
  const normalizedAmount = clamp01(amount)
  const effectiveRange = Math.max(0.0001, 1 - normalizedThreshold)

  if (mode === 'pulse') {
    return level >= normalizedThreshold ? normalizedAmount : 0
  }

  const sourceLevel = mode === 'invert' ? 1 - clamp01(level) : clamp01(level)
  const gatedLevel = Math.max(0, sourceLevel - normalizedThreshold)
  return (gatedLevel / effectiveRange) * normalizedAmount
}

function getSpectrumSourceLevel(spectrumLevels, source) {
  if (!spectrumLevels) {
    return 0
  }
  if (source === 'mid') return spectrumLevels.mid ?? 0
  if (source === 'high') return spectrumLevels.high ?? 0
  if (source === 'full') return spectrumLevels.full ?? 0
  return spectrumLevels.low ?? spectrumLevels.full ?? 0
}

function makeDefaultVideoMotion() {
  return {
    inPoint: 0,
    outPoint: 1,
    baseSpeed: 1,
    speedAmount: 0,
    speedThreshold: 0.12,
    speedMode: 'normal',
    speedSource: 'low',
    timelineAmount: 0,
    timelineThreshold: 0.2,
    timelineMode: 'pulse',
    timelineSource: 'low',
  }
}

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
  const spectrumLevels = syncedState?.audio?.spectrumLevels || { full: bassLevel, low: bassLevel, mid: 0, high: 0 }

  return (
    <main className="output-shell">
      <OutputPreview
        layers={layers}
        fps={60}
        bassLevel={bassLevel}
        spectrumLevels={spectrumLevels}
        masterFx={masterFx}
        blackout={blackout}
        showOverlays={false}
        enablePreload={false}
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
  const [audioEq, setAudioEq] = useState({ low: 1, mid: 1, high: 1 })
  const [audioFxLinks, setAudioFxLinks] = useState({
    glow: { amount: 0.35, threshold: 0.08, mode: 'normal', source: 'low' },
    strobe: { amount: 0, threshold: 0.32, mode: 'pulse', source: 'low' },
    shake: { amount: 0, threshold: 0.14, mode: 'normal', source: 'low' },
    brightness: { amount: 0.25, threshold: 0.08, mode: 'normal', source: 'low' },
  })
  const [layerAudioLinks, setLayerAudioLinks] = useState({
    0: { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' },
    1: { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' },
    2: { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' },
  })
  const [layerVideoMotion, setLayerVideoMotion] = useState({
    0: makeDefaultVideoMotion(),
    1: makeDefaultVideoMotion(),
    2: makeDefaultVideoMotion(),
  })
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

  const {
    bassLevel,
    spectrumLevels,
    isActive: audioActive,
    permissionDenied,
    audioError,
    startAudio,
    stopAudio,
  } = useAudioAnalysis({
    sensitivity: audioSensitivity,
    smoothing: audioSmoothing,
    eqGains: audioEq,
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

  const setAudioFxLink = useCallback((key, field, value) => {
    setAudioFxLinks((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: field === 'mode' || field === 'source' ? value : Number(value),
      },
    }))
  }, [])

  const setAudioEqValue = useCallback((band, value) => {
    setAudioEq((current) => ({
      ...current,
      [band]: Number(value),
    }))
  }, [])

  const setLayerAudioLink = useCallback((layerIndex, field, value) => {
    setLayerAudioLinks((current) => ({
      ...current,
      [layerIndex]: {
        ...(current[layerIndex] || { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' }),
        [field]: field === 'mode' || field === 'source' ? value : Number(value),
      },
    }))
  }, [])

  const setLayerVideoMotionValue = useCallback((layerIndex, field, value) => {
    setLayerVideoMotion((current) => {
      const prev = current[layerIndex] || makeDefaultVideoMotion()
      const nextRaw = {
        ...prev,
        [field]: field.includes('Mode') || field.includes('Source') ? value : Number(value),
      }

      // Keep a valid range: outPoint always >= inPoint + 0.01
      const minGap = 0.01
      const next = { ...nextRaw }
      if (next.outPoint < next.inPoint + minGap) {
        if (field === 'inPoint') {
          next.outPoint = Math.min(1, next.inPoint + minGap)
        } else if (field === 'outPoint') {
          next.inPoint = Math.max(0, next.outPoint - minGap)
        }
      }

      return {
        ...current,
        [layerIndex]: next,
      }
    })
  }, [])

  const effectiveLayers = useMemo(
    () => layers.map((layer) => {
      const link = layerAudioLinks[layer.layerIndex] || { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' }
      const sourceLevel = getSpectrumSourceLevel(spectrumLevels, link.source)
      const reactiveBoost = getReactiveAmount(sourceLevel, link.threshold, link.mode, link.amount)
      const videoMotion = layerVideoMotion[layer.layerIndex] || makeDefaultVideoMotion()
      return {
        ...layer,
        opacity: Math.min(1, layer.opacity + reactiveBoost),
        videoMotion,
      }
    }),
    [layers, layerAudioLinks, layerVideoMotion, spectrumLevels],
  )

  const effectiveMasterFx = useMemo(
    () => {
      const glowSource = getSpectrumSourceLevel(spectrumLevels, audioFxLinks.glow.source)
      const glowBoost = getReactiveAmount(
        glowSource,
        audioFxLinks.glow.threshold,
        audioFxLinks.glow.mode,
        audioFxLinks.glow.amount,
      )
      const strobeSource = getSpectrumSourceLevel(spectrumLevels, audioFxLinks.strobe.source)
      const strobeBoost = getReactiveAmount(
        strobeSource,
        audioFxLinks.strobe.threshold,
        audioFxLinks.strobe.mode,
        audioFxLinks.strobe.amount,
      )
      const shakeSource = getSpectrumSourceLevel(spectrumLevels, audioFxLinks.shake.source)
      const shakeBoost = getReactiveAmount(
        shakeSource,
        audioFxLinks.shake.threshold,
        audioFxLinks.shake.mode,
        audioFxLinks.shake.amount,
      )
      const brightnessSource = getSpectrumSourceLevel(spectrumLevels, audioFxLinks.brightness.source)
      const brightnessBoost = getReactiveAmount(
        brightnessSource,
        audioFxLinks.brightness.threshold,
        audioFxLinks.brightness.mode,
        audioFxLinks.brightness.amount,
      )

      const base = {
        ...masterFx,
        glow: Math.min(1, masterFx.glow + glowBoost),
        strobe: Math.min(1, masterFx.strobe + strobeBoost),
        shake: Math.min(1, masterFx.shake + shakeBoost),
        brightness: Math.min(2, masterFx.brightness + brightnessBoost),
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
    [masterFx, spectrumLevels, audioFxLinks, safeMode],
  )

  useEffect(() => {
    const nextState = buildOutputState({
      layers: effectiveLayers,
      masterFx: effectiveMasterFx,
      blackout,
      bassLevel,
      spectrumLevels,
    })
    window.scalezApi?.publishOutputState?.(nextState)
  }, [effectiveLayers, effectiveMasterFx, blackout, bassLevel, spectrumLevels])

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
        layers={effectiveLayers}
        fps={fps}
        bassLevel={bassLevel}
        spectrumLevels={spectrumLevels}
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
            audioLink={layerAudioLinks[layer.layerIndex] || { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' }}
            videoMotion={layerVideoMotion[layer.layerIndex] || makeDefaultVideoMotion()}
            onToggleVisible={setLayerVisible}
            onOpacityChange={setLayerOpacity}
            onBlendModeChange={setLayerBlendMode}
            onClear={clearLayer}
            onTrigger={handleTriggerOrCue}
            onLoad={loadClipIntoSlot}
            onFocusToggle={handleFocusToggle}
            onLaunchCue={handleLaunchCue}
            onScrollRef={handleScrollRef}
            onAudioLinkChange={setLayerAudioLink}
            onVideoMotionChange={setLayerVideoMotionValue}
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
          spectrumLevels,
          isActive: audioActive,
          permissionDenied,
          audioError,
          eq: audioEq,
          fxLinks: audioFxLinks,
          sensitivity: audioSensitivity,
          smoothing: audioSmoothing,
          onEqChange: setAudioEqValue,
          onFxLinkChange: setAudioFxLink,
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
