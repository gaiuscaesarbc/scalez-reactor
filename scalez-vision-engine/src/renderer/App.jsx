import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import LayerStrip from './components/LayerStrip'
import MasterFxPanel from './components/MasterFxPanel'
import OutputPreview from './components/OutputPreview'
import TestModePanel from './components/TestModePanel'
import ShowManager from './components/ShowManager'
import MidiPanel from './components/MidiPanel'
import { EnergyDebugBadge } from './components/EnergyDebugBadge'
import SettingsPanel from './components/SettingsPanel'
import AutomationWorkspace from './components/AutomationWorkspace'
import { useClipStore } from './hooks/useClipStore'
import { useFps } from './hooks/useFps'
import { useSessionTimer } from './hooks/useSessionTimer'
import { useAudioAnalysis } from './hooks/useAudioAnalysis'
import { useHotkeys } from './hooks/useHotkeys'
import { useMidiController } from './hooks/useMidiController'
import { useTapTempo } from './hooks/useTapTempo'
import { usePerformanceMode } from './hooks/usePerformanceMode'
import { useEnergyState } from './hooks/useEnergyState'
import { useEnergyFxMapping } from './hooks/useEnergyFxMapping'
import { useEnergyFxSmoother } from './hooks/useEnergyFxSmoother'
import { useClipVariation } from './hooks/useClipVariation'
import { useAutoEvolution } from './hooks/useAutoEvolution'
import { useDropSystem } from './hooks/useDropSystem'
import { useBeatSync } from './hooks/useBeatSync'
import { useAutomationEngine } from './hooks/useAutomationEngine'
import { useTransitionEngine } from './hooks/useTransitionEngine'
import PerformanceHUD from './components/PerformanceHUD'
import {
  buildOutputState,
  DEFAULT_MASTER_FX,
  useOutputStateSubscription,
} from './hooks/useOutputSync'
import {
  DEFAULT_SCENE_PRESETS,
  buildMasterFxFromScene,
  resolveSceneAssignments,
} from './utils/defaultScenes'
import { DEFAULT_AUTOMATION_SCENES } from './utils/automationDefaults'
import { DEFAULT_TRANSITION, normalizeTransition } from './utils/transitionPresets'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(value) {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

const STABLE_ZERO_SPECTRUM_LEVELS = Object.freeze({
  full: 0,
  sub: 0,
  low: 0,
  lowMid: 0,
  mid: 0,
  presence: 0,
  high: 0,
})
const STABLE_EMPTY_BINS = Object.freeze([])
const DEFAULT_OUTPUT_TELEMETRY = Object.freeze({
  totalStallDetections: 0,
  totalSoftRecoveries: 0,
  lastRecoveryAt: 0,
  health: 'Healthy',
  updatedAt: 0,
})

function areMappingsEqual(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => {
    const leftValue = left[key]
    const rightValue = right[key]
    if (!rightValue) return false
    return JSON.stringify(leftValue) === JSON.stringify(rightValue)
  })
}

function getReactiveAmount(level, threshold, mode, amount) {
  const normalizedThreshold = clamp01(threshold)
  const normalizedAmount = clamp01(amount)
  const effectiveRange = Math.max(0.0001, 1 - normalizedThreshold)

  if (mode === 'pulse') {
    // Soft pulse gate: ramps in/out around threshold instead of hard on/off.
    const width = 0.1
    const gateStart = clamp01(normalizedThreshold - width * 0.5)
    const gateEnd = clamp01(normalizedThreshold + width * 0.5)
    const gateRange = Math.max(0.0001, gateEnd - gateStart)
    const gateValue = smoothstep01((clamp01(level) - gateStart) / gateRange)
    return gateValue * normalizedAmount
  }

  const sourceLevel = mode === 'invert' ? 1 - clamp01(level) : clamp01(level)
  const gatedLevel = Math.max(0, sourceLevel - normalizedThreshold)
  const normalizedLevel = gatedLevel / effectiveRange
  // Ease-in response avoids sharp jumps as audio crosses threshold.
  const easedLevel = smoothstep01(normalizedLevel)
  return easedLevel * normalizedAmount
}

function getSpectrumSourceLevel(spectrumLevels, source) {
  if (!spectrumLevels) {
    return 0
  }
  if (source === 'sub') return spectrumLevels.sub ?? spectrumLevels.low ?? 0
  if (source === 'mid') return spectrumLevels.mid ?? 0
  if (source === 'lowMid') return spectrumLevels.lowMid ?? spectrumLevels.mid ?? 0
  if (source === 'presence') return spectrumLevels.presence ?? spectrumLevels.high ?? 0
  if (source === 'high') return spectrumLevels.high ?? 0
  if (source === 'full') return spectrumLevels.full ?? 0
  return spectrumLevels.low ?? spectrumLevels.full ?? 0
}

function normalizeAutomationScenes(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return DEFAULT_AUTOMATION_SCENES
  }

  return scenes.map((scene) => ({
    ...scene,
    cues: (scene.cues || []).map((cue) => ({
      ...cue,
      transition: normalizeTransition(cue.transition),
    })),
    blocks: (scene.blocks || []).map((block) => ({
      ...block,
      transition: normalizeTransition(block.transition),
    })),
  }))
}

function createDefaultLayerSequences(layerCount = 3) {
  return Array.from({ length: Math.max(1, layerCount) }, (_, layerIndex) => ({
    layerIndex,
    entries: [],
    currentEntryIndex: 0,
    elapsedMs: 0,
    isPlaying: false,
    loopSection: false,
    manualOverride: false,
    autoAdvanceMode: 'beat',
  }))
}

function createLayerSequenceEntry(slotIndex, slot) {
  const title = slot?.clipName || `Slot ${slotIndex + 1}`
  return {
    id: `seq-entry-${Date.now()}-${slotIndex}`,
    slotIndex,
    clipName: title,
    durationBeats: 4,
    advanceMode: 'beat',
  }
}

const ENERGY_STATES = ['calm', 'build', 'drop', 'peak']
const WORKSPACES = [
  { id: 'performance', label: 'Performance' },
  { id: 'fx', label: 'FX' },
  { id: 'scene', label: 'Scene/Clip' },
  { id: 'audio', label: 'Audio' },
  { id: 'automation', label: 'Automation' },
  { id: 'debug', label: 'Dev/Debug' },
]

const WORKSPACE_KEY_HINTS = {
  performance: 'F1',
  fx: 'F2',
  scene: 'F3',
  audio: 'F4',
  automation: 'F5',
  debug: 'F6',
}

function makeDefaultVideoMotion() {
  return {
    inPoint: 0,
    outPoint: 1,
    baseSpeed: 1,
    bounceEnabled: false,
    bounceSpeed: 1,
    speedAmount: 0,
    speedThreshold: 0.12,
    speedMode: 'normal',
    speedSource: 'low',
    timelineAmount: 0,
    timelineThreshold: 0.2,
    timelineMode: 'pulse',
    timelineSource: 'low',
    scale: 1,
    scaleAmount: 0,
    scaleThreshold: 0.06,
    scaleMode: 'normal',
    scaleSource: 'low',
    shakeEnabled: true,
  }
}

function getWindowMode() {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('window')
  return mode === 'output' ? 'output' : 'control'
}

function OutputShell() {
  const syncedState = useOutputStateSubscription()

  useEffect(() => {
    console.info('[devtools:output-shell-ready]', {
      mode: 'output',
      at: Date.now(),
    })
  }, [])

  const layers = syncedState?.layers || []
  const masterFx = syncedState?.masterFx || DEFAULT_MASTER_FX
  const blackout = Boolean(syncedState?.blackout)
  const bassLevel = syncedState?.audio?.bassLevel ?? 0.2
  const spectrumLevels = syncedState?.audio?.spectrumLevels || {
    full: bassLevel,
    sub: bassLevel,
    low: bassLevel,
    lowMid: 0,
    mid: 0,
    presence: 0,
    high: 0,
  }
  const spectrumBins = Array.isArray(syncedState?.audio?.spectrumBins) ? syncedState.audio.spectrumBins : []
  const generatedQualityMode = syncedState?.rendering?.generatedQualityMode || 'safe'
  const generatedMaxFps = Number.isFinite(syncedState?.rendering?.generatedMaxFps)
    ? syncedState.rendering.generatedMaxFps
    : 40
  const performanceOutputMode = syncedState?.rendering?.performanceOutputMode !== false
  const energyEnabled = Boolean(syncedState?.energy?.enabled)
  const smoothedEnergyFx = syncedState?.energy?.smoothedFx || null
  const energyStrobeCount = syncedState?.energy?.strobeCount ?? 0
  const energyState = syncedState?.energy?.state || 'calm'
  const energyIntensity = syncedState?.energy?.intensity ?? 0
  const smoothedDropFx = syncedState?.drop?.smoothedFx || null
  const dropStrobeCount = syncedState?.drop?.strobeCount ?? 0
  const bpm = syncedState?.tempo?.bpm ?? 140
  const activeLayerCount = layers.reduce(
    (count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count),
    0,
  )
  const isMultiLayerVideoMode = activeLayerCount >= 2
  const conservativeOutputMode = performanceOutputMode && isMultiLayerVideoMode
  const previewBassLevel = isMultiLayerVideoMode ? 0 : bassLevel
  const previewSpectrumLevels = isMultiLayerVideoMode ? STABLE_ZERO_SPECTRUM_LEVELS : spectrumLevels
  const previewSpectrumBins = isMultiLayerVideoMode ? STABLE_EMPTY_BINS : spectrumBins

  return (
    <main className="output-shell">
      <OutputPreview
        layers={layers}
        fps={60}
        bassLevel={previewBassLevel}
        spectrumLevels={previewSpectrumLevels}
        spectrumBins={previewSpectrumBins}
        bpm={bpm}
        masterFx={conservativeOutputMode ? { ...masterFx, brightness: 1 } : masterFx}
        blackout={blackout}
        showOverlays={false}
        enablePreload={false}
        energySystemEnabled={energyEnabled}
        smoothedEnergyFx={smoothedEnergyFx}
        energyStrobeCount={energyStrobeCount}
        energyState={energyState}
        energyIntensity={energyIntensity}
        smoothedDropFx={smoothedDropFx}
        dropStrobeCount={dropStrobeCount}
        generatedQualityMode={conservativeOutputMode ? 'safe' : generatedQualityMode}
        generatedMaxFps={conservativeOutputMode ? Math.min(36, generatedMaxFps) : generatedMaxFps}
        performanceOutputMode={performanceOutputMode}
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
    clearSlot,
    triggerClip,
    loadClipIntoSlot,
    markSlotFailed,
    saveShow,
    loadShow,
    getSavedShows,
    deleteShow,
    restoreLastShow,
    autosaveShow,
    applySceneComposition,
    loadGeneratedClipIntoSlot,
    loadGeneratedPackToLayer,
    loadGeneratedPackToAllLayers,
    persistMidiMappings,
    restoreMidiMappings,
  } = useClipStore()
  const midiState = useMidiController()
  const {
    mappings: midiControllerMappings,
    loadMappings: loadControllerMappings,
    getMappings: getControllerMappings,
  } = midiState
  const { bpm, tap: tapTempo, reset: resetTempo, setManualBpm, lastTapTimeRef } = useTapTempo()
  const [masterFx, setMasterFx] = useState(DEFAULT_MASTER_FX)
  const [blackout, setBlackout] = useState(false)
  const [audioSensitivity, setAudioSensitivity] = useState(0.75)
  const [audioSmoothing, setAudioSmoothing] = useState(0.55)
  const [audioNoiseFloor, setAudioNoiseFloor] = useState(0.02)
  const [audioPreGain, setAudioPreGain] = useState(1.5)
  const [audioDeviceId, setAudioDeviceId] = useState(null)
  const [audioEq, setAudioEq] = useState({ low: 1, mid: 1, high: 1 })
  const [audioFxLinks, setAudioFxLinks] = useState({
    strobe: { amount: 0, threshold: 0.12, mode: 'pulse', source: 'low' },
    shake: { amount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    brightness: { amount: 0.25, threshold: 0.03, mode: 'normal', source: 'low' },
  })
  const [layerAudioLinks, setLayerAudioLinks] = useState({
    0: { amount: 0, speedAmount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    1: { amount: 0, speedAmount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    2: { amount: 0, speedAmount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
  })
  const [layerVideoMotion, setLayerVideoMotion] = useState({
    0: makeDefaultVideoMotion(),
    1: makeDefaultVideoMotion(),
    2: makeDefaultVideoMotion(),
  })
  const [clipVideoMotion, setClipVideoMotion] = useState({})
  const [safeMode, setSafeMode] = useState(false)
  const [performanceOutputMode, setPerformanceOutputMode] = useState(true)
  const [showTestMode, setShowTestMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState('performance')
  const [automationScenes, setAutomationScenes] = useState(DEFAULT_AUTOMATION_SCENES)
  const [automationSceneId, setAutomationSceneId] = useState(DEFAULT_AUTOMATION_SCENES[0]?.id || null)
  const [automationQuantizeBeats, setAutomationQuantizeBeats] = useState(1)
  const [automationAutoTransitionEnabled, setAutomationAutoTransitionEnabled] = useState(true)
  const [layerSequences, setLayerSequences] = useState(() => createDefaultLayerSequences(3))
  const [selectedSequenceLayerIndex, setSelectedSequenceLayerIndex] = useState(0)
  const [savedShows, setSavedShows] = useState([])
  const [nativePlaybackStatus, setNativePlaybackStatus] = useState(null)
  const [nativePlaybackBusy, setNativePlaybackBusy] = useState(false)
  const [outputTelemetry, setOutputTelemetry] = useState(DEFAULT_OUTPUT_TELEMETRY)

  // Performance & Energy Systems (PART 1-5)
  const performanceMode = usePerformanceMode()
  const [energySystemEnabled, setEnergySystemEnabled] = useState(true)
  const [energyManualOverrideEnabled, setEnergyManualOverrideEnabled] = useState(false)
  const [manualEnergyState, setManualEnergyState] = useState('calm')
  const [manualEnergyIntensity, setManualEnergyIntensity] = useState(0.35)
  const [dropSystemEnabled, setDropSystemEnabled] = useState(false)
  const [dropThresholdLevel, setDropThresholdLevel] = useState('medium')
  const [clipVariationEnabled, setClipVariationEnabled] = useState(false)
  const [autoEvolutionEnabled, setAutoEvolutionEnabled] = useState(false)
  const [autoEvolutionInterval, setAutoEvolutionInterval] = useState(60)
  const [energyReactiveEnabled, setEnergyReactiveEnabled] = useState(true)
  const [beatSyncEnabled, setBeatSyncEnabled] = useState(false)

    // Debug overlay toggle (PART 7)
    const [showEnergyDebug, setShowEnergyDebug] = useState(false)

  // M9: performance control state
  const [focusedLayer, setFocusedLayer] = useState(null) // null | 0 | 1 | 2
  const [cueMode, setCueMode] = useState(false)
  const [cuedSlots, setCuedSlots] = useState({}) // { layerIndex: slotIndex }
  const [midiFlashSlots, setMidiFlashSlots] = useState(new Set())
  const automationManualOverrideRef = useRef(() => {})
  const layerSequencesRef = useRef(layerSequences)
  const masterFxRef = useRef(masterFx)
  const fps = useFps()
  const sessionTimer = useSessionTimer()

  useEffect(() => {
    masterFxRef.current = masterFx
  }, [masterFx])

  useEffect(() => {
    layerSequencesRef.current = layerSequences
  }, [layerSequences])

  useEffect(() => {
    console.info('[devtools:control-shell-ready]', {
      mode: 'control',
      at: Date.now(),
    })
  }, [])
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

  const pauseLayerSequenceForManualOverride = useCallback((layerIndex) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, isPlaying: false, manualOverride: true }
        : sequence
    )))
  }, [])

  // Cue mode: either cue the slot or trigger it depending on mode
  const handleTriggerOrCue = useCallback((layerIndex, slotIndex) => {
    if (cueMode) {
      setCuedSlots((prev) => ({ ...prev, [layerIndex]: slotIndex }))
    } else {
      pauseLayerSequenceForManualOverride(layerIndex)
      automationManualOverrideRef.current?.()
      triggerClip(layerIndex, slotIndex)
    }
  }, [cueMode, pauseLayerSequenceForManualOverride, triggerClip])

  // Launch a cued clip (exits cue mode for that layer)
  const handleLaunchCue = useCallback((layerIndex) => {
    const slotIndex = cuedSlots[layerIndex]
    if (typeof slotIndex === 'number') {
      pauseLayerSequenceForManualOverride(layerIndex)
      automationManualOverrideRef.current?.()
      triggerClip(layerIndex, slotIndex)
      setCuedSlots((prev) => {
        const next = { ...prev }
        delete next[layerIndex]
        return next
      })
    }
  }, [cuedSlots, pauseLayerSequenceForManualOverride, triggerClip])

  const handleDeleteSlot = useCallback((layerIndex, slotIndex) => {
    clearSlot(layerIndex, slotIndex)
    setCuedSlots((prev) => {
      if (prev[layerIndex] !== slotIndex) {
        return prev
      }
      const next = { ...prev }
      delete next[layerIndex]
      return next
    })
  }, [clearSlot])

  // Focus toggle: only one layer can be focused at a time
  const handleFocusToggle = useCallback((layerIndex) => {
    setFocusedLayer((prev) => (prev === layerIndex ? null : layerIndex))
  }, [])

  // Scroll ref registration callback passed to LayerStrip
  const handleScrollRef = useCallback((layerIndex, el) => {
    scrollContainersRef.current[layerIndex] = el
  }, [])

  useEffect(() => {
    let disposed = false

    async function enforceRendererPlaybackPath() {
      try {
        const status = await window.scalezApi?.getNativePlaybackStatus?.()
        if (disposed || !status) {
          return
        }
        setNativePlaybackStatus(status)

        if (!status.available || !status.enabled) {
          return
        }

        // Fullscreen effects are rendered in OutputPreview, so native playback must stay disabled.
        const nextStatus = await window.scalezApi?.setNativePlaybackEnabled?.(false)
        if (!disposed && nextStatus) {
          setNativePlaybackStatus(nextStatus)
        }
      } catch {
        // Native playback control is optional.
      }
    }

    void enforceRendererPlaybackPath()
    const timer = setInterval(() => {
      void enforceRendererPlaybackPath()
    }, 3000)

    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.scalezApi?.onNativePlaybackDiagnostic?.((payload) => {
      if (!payload) {
        return
      }
      console.error('[bounce:bug-report]', payload)
      try {
        console.error('[bounce:bug-report:json]', JSON.stringify(payload))
      } catch {
        // Ignore JSON serialization failures for diagnostics.
      }
    })

    console.info('[devtools:native-diagnostic-listener-ready]', {
      at: Date.now(),
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return () => {}
    }

    let disposed = false
    let lastSignature = ''

    const poll = async () => {
      try {
        const status = await window.scalezApi?.getNativePlaybackStatus?.()
        if (disposed || !status) {
          return
        }
        const signature = [
          status.enabled ? '1' : '0',
          status.available ? '1' : '0',
          status.running ? '1' : '0',
          status.lastError || '',
        ].join('|')
        if (signature !== lastSignature) {
          lastSignature = signature
          console.info('[native:status]', status)
        }
      } catch {
        // Ignore polling failures during reload.
      }
    }

    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 1500)

    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  const handleToggleNativePlayback = useCallback(async () => {
    if (nativePlaybackBusy) {
      return
    }

    try {
      setNativePlaybackBusy(true)
      const enabledNow = Boolean(nativePlaybackStatus?.enabled)
      const nextStatus = await window.scalezApi?.setNativePlaybackEnabled?.(!enabledNow)
      if (nextStatus) {
        setNativePlaybackStatus(nextStatus)
        window.localStorage.setItem('scalez-native-playback', nextStatus.enabled ? '1' : '0')
      }
    } catch {
      // Ignore toggle failures and keep UI responsive.
    } finally {
      setNativePlaybackBusy(false)
    }
  }, [nativePlaybackBusy, nativePlaybackStatus])

  useEffect(() => {
    let disposed = false

    const applyTelemetry = (nextTelemetry) => {
      if (!nextTelemetry || disposed) {
        return
      }

      setOutputTelemetry((current) => {
        const candidate = {
          totalStallDetections: Number.isFinite(nextTelemetry.totalStallDetections)
            ? nextTelemetry.totalStallDetections
            : current.totalStallDetections,
          totalSoftRecoveries: Number.isFinite(nextTelemetry.totalSoftRecoveries)
            ? nextTelemetry.totalSoftRecoveries
            : current.totalSoftRecoveries,
          lastRecoveryAt: Number.isFinite(nextTelemetry.lastRecoveryAt)
            ? nextTelemetry.lastRecoveryAt
            : current.lastRecoveryAt,
          health: typeof nextTelemetry.health === 'string' ? nextTelemetry.health : current.health,
          updatedAt: Number.isFinite(nextTelemetry.updatedAt) ? nextTelemetry.updatedAt : current.updatedAt,
        }

        if (
          candidate.totalStallDetections === current.totalStallDetections
          && candidate.totalSoftRecoveries === current.totalSoftRecoveries
          && candidate.lastRecoveryAt === current.lastRecoveryAt
          && candidate.health === current.health
          && candidate.updatedAt === current.updatedAt
        ) {
          return current
        }

        return candidate
      })
    }

    const unsubscribe = window.scalezApi?.onOutputTelemetryUpdate?.((nextTelemetry) => {
      applyTelemetry(nextTelemetry)
    })

    window.scalezApi?.getOutputTelemetry?.().then((initialTelemetry) => {
      applyTelemetry(initialTelemetry)
    }).catch(() => {
      // Ignore missing telemetry channel during reload.
    })

    return () => {
      disposed = true
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  // Restore last show and MIDI mappings on mount
  useEffect(() => {
    const result = restoreLastShow()
    if (result?.appSettings) {
      applyAppSettings(result.appSettings)
    }
    setSavedShows(getSavedShows())

    const restoredMappings =
      result?.midiMappings && typeof result.midiMappings === 'object' && Object.keys(result.midiMappings).length > 0
        ? result.midiMappings
        : restoreMidiMappings()
    loadControllerMappings(restoredMappings || {})
  }, [])

  // Keep clip store + independent persistence synced from controller changes.
  useEffect(() => {
    const nextMappings = midiControllerMappings || {}
    if (!areMappingsEqual(midiMappings || {}, nextMappings)) {
      setMidiMappings(nextMappings)
    }
    persistMidiMappings(nextMappings)
  }, [midiControllerMappings, midiMappings, setMidiMappings, persistMidiMappings])

  // Persist MIDI mappings independently (not tied to shows) so they survive app restarts
  useEffect(() => {
    const midiPersistInterval = setInterval(() => {
      const currentMappings = getControllerMappings()
      if (currentMappings && Object.keys(currentMappings).length > 0) {
        persistMidiMappings(currentMappings)
      }
    }, 10000) // Check every 10 seconds

    return () => clearInterval(midiPersistInterval)
  }, [getControllerMappings, persistMidiMappings])

  // Listen for MIDI commands and execute them
  useEffect(() => {
    const handleMidiCommand = (event) => {
      const { mapping, midiValue } = event.detail

      // Ignore release/zero values for button mappings so note-off does not
      // instantly undo toggles or retrigger destructive actions.
      if (mapping?.type === 'button' && Number(midiValue) <= 0) {
        return
      }

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

        case 'energy-manual-override':
          setEnergyManualOverrideEnabled((current) => !current)
          break

        case 'energy-manual-state-next':
          setManualEnergyState((current) => {
            const index = ENERGY_STATES.indexOf(current)
            const nextIndex = index >= 0 ? (index + 1) % ENERGY_STATES.length : 0
            return ENERGY_STATES[nextIndex]
          })
          break

        case 'energy-manual-intensity':
          setManualEnergyIntensity(clamp01(midiValue / 127))
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
            automationManualOverrideRef.current?.()
            triggerClip(layerIndex, slotIndex)
          }
          break
        }

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

        case 'layer-1-bounce-toggle':
          setLayerVideoMotion((current) => ({
            ...current,
            0: { ...(current[0] || makeDefaultVideoMotion()), bounceEnabled: !(current[0]?.bounceEnabled) },
          }))
          break

        case 'layer-2-bounce-toggle':
          setLayerVideoMotion((current) => ({
            ...current,
            1: { ...(current[1] || makeDefaultVideoMotion()), bounceEnabled: !(current[1]?.bounceEnabled) },
          }))
          break

        case 'layer-3-bounce-toggle':
          setLayerVideoMotion((current) => ({
            ...current,
            2: { ...(current[2] || makeDefaultVideoMotion()), bounceEnabled: !(current[2]?.bounceEnabled) },
          }))
          break

        case 'focused-layer-bounce-toggle':
          if (focusedLayer !== null) {
            setLayerVideoMotion((current) => ({
              ...current,
              [focusedLayer]: {
                ...(current[focusedLayer] || makeDefaultVideoMotion()),
                bounceEnabled: !(current[focusedLayer]?.bounceEnabled),
              },
            }))
          }
          break

        case 'layer-1-clear':
          clearLayer(0)
          break

        case 'layer-2-clear':
          clearLayer(1)
          break

        case 'layer-3-clear':
          clearLayer(2)
          break

        case 'focused-layer-clear':
          if (focusedLayer !== null) {
            clearLayer(focusedLayer)
          }
          break

        case 'layer-1-scale':
          setLayerVideoMotion((current) => ({
            ...current,
            0: { ...(current[0] || makeDefaultVideoMotion()), scale: 0.25 + (midiValue / 127) * 2.75 },
          }))
          break

        case 'layer-2-scale':
          setLayerVideoMotion((current) => ({
            ...current,
            1: { ...(current[1] || makeDefaultVideoMotion()), scale: 0.25 + (midiValue / 127) * 2.75 },
          }))
          break

        case 'layer-3-scale':
          setLayerVideoMotion((current) => ({
            ...current,
            2: { ...(current[2] || makeDefaultVideoMotion()), scale: 0.25 + (midiValue / 127) * 2.75 },
          }))
          break

        case 'focused-layer-scale':
          if (focusedLayer !== null) {
            setLayerVideoMotion((current) => ({
              ...current,
              [focusedLayer]: {
                ...(current[focusedLayer] || makeDefaultVideoMotion()),
                scale: 0.25 + (midiValue / 127) * 2.75,
              },
            }))
          }
          break

        default:
          break
      }
    }

    window.addEventListener('midi-command', handleMidiCommand)
    return () => window.removeEventListener('midi-command', handleMidiCommand)
  }, [
    clearLayer,
    setLayerOpacity,
    focusedLayer,
    tapTempo,
    flashMidiSlot,
    handleLaunchCue,
    triggerClip,
    setLayerVideoMotion,
  ])

  const buildAppSettings = () => ({
    audioSensitivity,
    audioSmoothing,
    audioNoiseFloor,
    audioPreGain,
    audioEq,
    audioFxLinks,
    layerAudioLinks,
    layerVideoMotion,
    clipVideoMotion,
    masterFx,
    // New Performance & Energy System settings (PART 7)
    performanceModeEnabled: performanceMode.performanceModeEnabled,
    energySystemEnabled,
    energyManualOverrideEnabled,
    manualEnergyState,
    manualEnergyIntensity,
    dropSystemEnabled,
    dropThresholdLevel,
    dropThreshold:
      dropThresholdLevel === 'low'
        ? 0
        : dropThresholdLevel === 'medium'
          ? 0.5
          : 1,
    bpm,
    clipVariationEnabled,
    autoEvolutionEnabled,
    autoEvolutionInterval,
    energyReactiveEnabled,
    beatSyncEnabled,
    showEnergyDebug,
    performanceOutputMode,
    automation: {
      scenes: automationScenes,
      selectedSceneId: automationSceneId,
      quantizeBeats: automationQuantizeBeats,
      autoTransitionEnabled: automationAutoTransitionEnabled,
    },
  })

  const applyAppSettings = (settings) => {
    if (!settings) return
    if (settings.audioSensitivity != null) setAudioSensitivity(settings.audioSensitivity)
    if (settings.audioSmoothing != null) setAudioSmoothing(settings.audioSmoothing)
    if (settings.audioNoiseFloor != null) setAudioNoiseFloor(settings.audioNoiseFloor)
    if (settings.audioPreGain != null) setAudioPreGain(settings.audioPreGain)
    if (settings.audioEq != null) setAudioEq(settings.audioEq)
    if (settings.audioFxLinks != null) setAudioFxLinks(settings.audioFxLinks)
    if (settings.layerAudioLinks != null) setLayerAudioLinks(settings.layerAudioLinks)
    if (settings.layerVideoMotion != null) setLayerVideoMotion(settings.layerVideoMotion)
    if (settings.clipVideoMotion != null) setClipVideoMotion(settings.clipVideoMotion)
    if (settings.masterFx != null) {
      setMasterFx({
        ...DEFAULT_MASTER_FX,
        ...settings.masterFx,
      })
    }
    // Load new settings if available
    if (settings.performanceModeEnabled != null)
      performanceMode.setPerformanceModeEnabled(settings.performanceModeEnabled)
    if (settings.energySystemEnabled != null) setEnergySystemEnabled(settings.energySystemEnabled)
    if (settings.energyManualOverrideEnabled != null)
      setEnergyManualOverrideEnabled(settings.energyManualOverrideEnabled)
    if (settings.manualEnergyState) setManualEnergyState(settings.manualEnergyState)
    if (settings.manualEnergyIntensity != null)
      setManualEnergyIntensity(settings.manualEnergyIntensity)
    if (settings.dropSystemEnabled != null) setDropSystemEnabled(settings.dropSystemEnabled)
    if (typeof settings.dropThresholdLevel === 'string') {
      setDropThresholdLevel(settings.dropThresholdLevel)
    } else if (typeof settings.dropThreshold === 'number') {
      if (settings.dropThreshold <= 0.33) {
        setDropThresholdLevel('low')
      } else if (settings.dropThreshold <= 0.66) {
        setDropThresholdLevel('medium')
      } else {
        setDropThresholdLevel('high')
      }
    }
    if (typeof settings.bpm === 'number') {
      setManualBpm(settings.bpm)
    }
    if (settings.clipVariationEnabled != null) setClipVariationEnabled(settings.clipVariationEnabled)
    if (settings.autoEvolutionEnabled != null) setAutoEvolutionEnabled(settings.autoEvolutionEnabled)
    if (settings.autoEvolutionInterval != null) setAutoEvolutionInterval(settings.autoEvolutionInterval)
    if (typeof settings.energyReactiveEnabled === 'boolean') {
      setEnergyReactiveEnabled(settings.energyReactiveEnabled)
    }
    if (typeof settings.beatSyncEnabled === 'boolean') {
      setBeatSyncEnabled(settings.beatSyncEnabled)
    }
    if (typeof settings.showEnergyDebug === 'boolean') {
      setShowEnergyDebug(settings.showEnergyDebug)
    }
    if (typeof settings.performanceOutputMode === 'boolean') {
      setPerformanceOutputMode(settings.performanceOutputMode)
    }
    if (settings.automation && typeof settings.automation === 'object') {
      const nextScenes = normalizeAutomationScenes(settings.automation.scenes)
      setAutomationScenes(nextScenes.length > 0 ? nextScenes : DEFAULT_AUTOMATION_SCENES)
      setAutomationSceneId(settings.automation.selectedSceneId || nextScenes[0]?.id || DEFAULT_AUTOMATION_SCENES[0]?.id || null)
      setAutomationQuantizeBeats(Math.max(1, Number(settings.automation.quantizeBeats) || 1))
      setAutomationAutoTransitionEnabled(settings.automation.autoTransitionEnabled !== false)
    }
  }

  // Autosave MIDI mappings with show data
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      autosaveShow(midiState.getMappings(), buildAppSettings())
    }, 30000)

    return () => clearInterval(autosaveInterval)
  }, [autosaveShow])

  // Stable ref to current spectrumLevels/spectrumBins — passed to BandPicker so it can animate
  // bars via rAF without triggering LayerStrip memo invalidation, and used in the
  // output-state publish effect so spectrumLevels/spectrumBins don't need to be
  // in the dep array (they're not control flow — they're data).
  const spectrumLevelsRef = useRef({})
  const spectrumBinsRef   = useRef([])

  const {
    bassLevel,
    spectrumLevels,
    spectrumBins,
    isActive: audioActive,
    permissionDenied,
    audioError,
    audioDevices,
    startAudio,
    stopAudio,
  } = useAudioAnalysis({
    sensitivity: audioSensitivity,
    smoothing: audioSmoothing,
    eqGains: audioEq,
    deviceId: audioDeviceId,
    noiseFloor: audioNoiseFloor,
    preGain: audioPreGain,
  })

  // Keep spectrumLevels/spectrumBins refs in sync each audio frame
  spectrumLevelsRef.current = spectrumLevels
  spectrumBinsRef.current   = spectrumBins

  // Energy System (PART 3)
  const { energyState, energyIntensity, energyMetrics, getEnergyFxRecommendation } = useEnergyState({
    bassLevel,
    spectrumLevels,
    spectrumBins,
    performanceMode: performanceMode.performanceModeEnabled,
    enabled: energySystemEnabled,
    safeMode,
  })

  const activeEnergyState = energyManualOverrideEnabled ? manualEnergyState : energyState
  const activeEnergyIntensity = energyManualOverrideEnabled ? manualEnergyIntensity : energyIntensity

  const dropSystem = useDropSystem({
    energyState: activeEnergyState,
    energyIntensity: activeEnergyIntensity,
    energySystemEnabled,
    dropSystemEnabled,
    dropThresholdLevel,
    safeModeEnabled: safeMode,
    performanceModeEnabled: performanceMode.performanceModeEnabled,
    blackoutEnabled: blackout,
    layers,
    triggerClip,
    setLayerOpacity,
    setMasterFx,
  })

  const generatedQualityMode = safeMode || performanceMode.performanceModeEnabled ? 'safe' : 'performance'
  const generatedMaxFps = safeMode || performanceMode.performanceModeEnabled ? 36 : 45

    // Energy FX Mapping (PART 1-2): Convert energy state to FX values with strobe cooldown
    const energyFxMapping = useEnergyFxMapping({
      energyState: activeEnergyState,
      energyIntensity: activeEnergyIntensity,
      enabled: energySystemEnabled,
      safeMode,
      performanceMode: performanceMode.performanceModeEnabled,
      subLevel: spectrumLevels.sub ?? 0,
    })

    // Energy FX Smoother (PART 4): Smooth transitions to prevent snapping
    const smoothedEnergyFx = useEnergyFxSmoother({
      shakeIntensity: energyFxMapping.shakeIntensity,
      brightnessBoost: energyFxMapping.brightnessBoost,
      lerpFactor: 0.12,
      enabled: energySystemEnabled,
    })

    const smoothedDropFx = useEnergyFxSmoother({
      shakeIntensity: dropSystem.dropFx.shakeBoost,
      brightnessBoost: dropSystem.dropFx.brightnessBoost,
      lerpFactor: 0.22,
      enabled: energySystemEnabled && dropSystemEnabled && !performanceMode.performanceModeEnabled,
    })

  // Clip Variation (PART 4)
  const { applyVariationToMotion } = useClipVariation({ enabled: clipVariationEnabled })

  // Auto Evolution (PART 5)
  useAutoEvolution({
    enabled: autoEvolutionEnabled,
    intervalSeconds: autoEvolutionInterval,
    layers,
    masterFx,
    energyState: activeEnergyState,
    energyReactiveEnabled,
    onTriggerClip: triggerClip,
    onSetLayerOpacity: setLayerOpacity,
    onSetLayerBlendMode: setLayerBlendMode,
  })

  // Beat-Sync Clip Trigger (PART 5b)
  useBeatSync({
    enabled: beatSyncEnabled && energySystemEnabled,
    bpm,
    lastTapTimeRef,
    energyState: activeEnergyState,
    layers,
    onTriggerClip: triggerClip,
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

  // F1-F6 workspace switching
  useEffect(() => {
    const handleWorkspaceKeydown = (event) => {
      // Ignore if typing in input/select/textarea
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) {
        return
      }

      const workspaceMap = {
        'F1': 'performance',
        'F2': 'fx',
        'F3': 'scene',
        'F4': 'audio',
        'F5': 'automation',
        'F6': 'debug',
      }

      const workspace = workspaceMap[event.key]
      if (workspace) {
        event.preventDefault()
        setActiveWorkspace(workspace)
      }
    }

    window.addEventListener('keydown', handleWorkspaceKeydown)
    return () => window.removeEventListener('keydown', handleWorkspaceKeydown)
  }, [])

  const [sceneClipSelectedSlot, setSceneClipSelectedSlot] = useState(null)

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
        ...(current[layerIndex] || { amount: 0, speedAmount: 0, threshold: 0.12, mode: 'normal', source: 'low' }),
        [field]: field === 'mode' || field === 'source' ? value : Number(value),
      },
    }))
  }, [])

  const setLayerVideoMotionValue = useCallback((layerIndex, field, value) => {
    const isClipTrimField = field === 'inPoint' || field === 'outPoint'
    const activeSlotIndex = layers[layerIndex]?.activeSlotIndex
    const activeClip =
      typeof activeSlotIndex === 'number' ? layers[layerIndex]?.slots?.[activeSlotIndex] : null
    const activeFilePath = activeClip?.filePath || ''

    if (isClipTrimField && activeFilePath) {
      setClipVideoMotion((current) => {
        const baseMotion = layerVideoMotion[layerIndex] || makeDefaultVideoMotion()
        const prev = current[activeFilePath] || {
          inPoint: baseMotion.inPoint,
          outPoint: baseMotion.outPoint,
        }
        const nextRaw = {
          ...prev,
          [field]: Number(value),
        }

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
          [activeFilePath]: next,
        }
      })
      return
    }

    setLayerVideoMotion((current) => {
      const prev = current[layerIndex] || makeDefaultVideoMotion()
      const nextRaw = {
        ...prev,
        [field]:
          field === 'bounceEnabled' || field === 'shakeEnabled'
            ? Boolean(value)
            : field.includes('Mode') || field.includes('Source')
              ? value
              : Number(value),
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
  }, [layers, layerVideoMotion])

  const loadDefaultSceneComposition = useCallback((sceneId) => {
    const scene = DEFAULT_SCENE_PRESETS.find((entry) => entry.id === sceneId)
    if (!scene) {
      return
    }

    const { assignments } = resolveSceneAssignments(scene, layers)
    applySceneComposition(assignments)

    const nextMasterFx = buildMasterFxFromScene(scene)
    setMasterFx((current) => ({
      ...current,
      ...nextMasterFx,
    }))

    applyAppSettings(scene.settings)
  }, [layers, applySceneComposition, applyAppSettings])

  const rebuildLayerReverseCache = useCallback(async (layerIndex) => {
    const layer = layers[layerIndex]
    if (!layer || typeof layer.activeSlotIndex !== 'number') {
      return false
    }

    const active = layer.slots[layer.activeSlotIndex]
    if (!active?.filePath) {
      return false
    }

    await window.scalezApi?.rebuildReverseCache?.(active.filePath)
    return true
  }, [layers])

  const activeLayerCount = useMemo(
    () => layers.reduce((count, layer) => (typeof layer.activeSlotIndex === 'number' ? count + 1 : count), 0),
    [layers],
  )
  const isMultiLayerVideoMode = activeLayerCount >= 2
  const spectrumLevelsForLayerModulation = spectrumLevels

  const effectiveLayers = useMemo(
    () => layers.map((layer) => {
      const speedDisabledForStability = isMultiLayerVideoMode
      const layerSpectrum = spectrumLevelsForLayerModulation || {}
      const link = layerAudioLinks[layer.layerIndex] || {
        amount: 0,
        speedAmount: 0,
        threshold: 0.12,
        mode: 'normal',
        source: 'low',
      }
      const sourceLevel = getSpectrumSourceLevel(layerSpectrum, link.source)
      const linkAmount = clamp01(link.amount ?? 0)
      const linkSpeedAmount = speedDisabledForStability ? 0 : clamp01(link.speedAmount ?? 0)
      const reactiveLevel = getReactiveAmount(sourceLevel, link.threshold, link.mode, 1)
      // Modulate within a range so audio link remains visible even when base opacity is 1.
      const opacityFloor = Math.max(0, layer.opacity * (1 - linkAmount))
      const reactiveOpacity = opacityFloor + reactiveLevel * (layer.opacity - opacityFloor)
      const baseVideoMotion = layerVideoMotion[layer.layerIndex] || makeDefaultVideoMotion()
      const activeSlotIndex = layer.activeSlotIndex
      const activeClip = typeof activeSlotIndex === 'number' ? layer.slots?.[activeSlotIndex] : null
      const clipMotion = activeClip?.filePath ? clipVideoMotion[activeClip.filePath] : null
      const videoMotion = clipMotion
        ? {
            ...baseVideoMotion,
            inPoint: clipMotion.inPoint ?? baseVideoMotion.inPoint,
            outPoint: clipMotion.outPoint ?? baseVideoMotion.outPoint,
          }
        : baseVideoMotion

      const scaleSourceLevel = getSpectrumSourceLevel(layerSpectrum, videoMotion.scaleSource || 'low')
      const scaleBoost = speedDisabledForStability
        ? 0
        : getReactiveAmount(
            scaleSourceLevel,
            videoMotion.scaleThreshold ?? 0.06,
            videoMotion.scaleMode || 'normal',
            videoMotion.scaleAmount ?? 0,
          )
      const reactiveScale = Math.max(0.05, (videoMotion.scale ?? 1) + scaleBoost)
      const dropOpacityFloor = dropSystem.layerOpacityFloors[layer.layerIndex] ?? 0

      return {
        ...layer,
        opacity: Math.min(1, Math.max(reactiveOpacity, dropOpacityFloor)),
        videoMotion: {
          ...videoMotion,
          scale: reactiveScale,
          timelineLinkAmount: linkSpeedAmount,
          timelineLinkThreshold: clamp01(link.threshold ?? 0.12),
          timelineLinkMode: link.mode || 'normal',
          timelineLinkSource: link.source || 'low',
        },
      }
    }),
    [layers, layerAudioLinks, layerVideoMotion, clipVideoMotion, spectrumLevelsForLayerModulation, dropSystem.layerOpacityFloors],
  )

  const previewBassLevel = isMultiLayerVideoMode ? 0 : bassLevel
  const previewSpectrumLevels = isMultiLayerVideoMode ? STABLE_ZERO_SPECTRUM_LEVELS : spectrumLevels
  const previewSpectrumBins = isMultiLayerVideoMode ? STABLE_EMPTY_BINS : spectrumBins

  // When energy is ON, audio-reactive FX links are disabled (linksActive=false),
  // so spectrumLevels has no effect on effectiveMasterFx. Use null as a stable
  // sentinel so the memo does NOT recompute on every audio frame in that case.
  // When energy is OFF, pass spectrumLevels normally so reactive links update.
  const spectrumLevelsForFxLinks = (energySystemEnabled || isMultiLayerVideoMode) ? null : spectrumLevels

  const effectiveMasterFx = useMemo(
    () => {
      // When energy system is on, audio reactive links are silenced for the same
      // FX channels (strobe, shake, brightness) so they don't stack or fight.
      const linksActive = !energySystemEnabled
      const sl = spectrumLevelsForFxLinks || {}

      const strobeBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(sl, audioFxLinks.strobe.source),
            audioFxLinks.strobe.threshold,
            audioFxLinks.strobe.mode,
            audioFxLinks.strobe.amount,
          )
        : 0
      const shakeBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(sl, audioFxLinks.shake.source),
            audioFxLinks.shake.threshold,
            audioFxLinks.shake.mode,
            audioFxLinks.shake.amount,
          )
        : 0
      const brightnessBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(sl, audioFxLinks.brightness.source),
            audioFxLinks.brightness.threshold,
            audioFxLinks.brightness.mode,
            audioFxLinks.brightness.amount,
          )
        : 0

      const base = {
        ...masterFx,
        strobe: Math.min(1, masterFx.strobe + strobeBoost * 0.52),
        shake: Math.min(1, masterFx.shake + shakeBoost * 0.62),
        brightness: Math.min(2, masterFx.brightness + brightnessBoost * 0.58),
      }
      if (safeMode) {
        return {
          ...base,
          strobe: 0,
          shake: base.shake * 0.5,
          brightness: base.brightness,
        }
      }
      return base
    },
    [masterFx, audioFxLinks, safeMode, energySystemEnabled, spectrumLevelsForFxLinks],
  )

  const isPerformanceWorkspace = activeWorkspace === 'performance'
  const isFxWorkspace = activeWorkspace === 'fx'
  const isSceneWorkspace = activeWorkspace === 'scene'
  const isAudioWorkspace = activeWorkspace === 'audio'
  const isAutomationWorkspace = activeWorkspace === 'automation'
  const isDebugWorkspace = activeWorkspace === 'debug'
  const showLayerWorkspace = isPerformanceWorkspace || isSceneWorkspace
  const showMasterPanel = isFxWorkspace || isAudioWorkspace || isDebugWorkspace

  const applyAutomationCueNow = useCallback((cue) => {
    if (!cue) {
      return
    }

    if (cue.energyState) {
      setEnergyManualOverrideEnabled(true)
      setManualEnergyState(cue.energyState)
      if (typeof cue.energyIntensity === 'number') {
        setManualEnergyIntensity(clamp01(cue.energyIntensity))
      }
    }

    if (typeof cue.blackout === 'boolean') {
      setBlackout(cue.blackout)
    }

    if (cue.fxPatch && typeof cue.fxPatch === 'object') {
      setMasterFx((current) => ({
        ...current,
        ...cue.fxPatch,
      }))
    }

    if (Array.isArray(cue.layers)) {
      cue.layers.forEach((layerState) => {
        if (typeof layerState.layerIndex !== 'number') {
          return
        }
        if (typeof layerState.visible === 'boolean') {
          setLayerVisible(layerState.layerIndex, layerState.visible)
        }
        if (typeof layerState.opacity === 'number') {
          setLayerOpacity(layerState.layerIndex, clamp01(layerState.opacity))
        }
        if (typeof layerState.blendMode === 'string') {
          setLayerBlendMode(layerState.layerIndex, layerState.blendMode)
        }
        if (Number.isInteger(layerState.slotIndex) && layerState.slotIndex >= 0) {
          triggerClip(layerState.layerIndex, layerState.slotIndex)
        }
      })
    }
  }, [
    setLayerBlendMode,
    setLayerOpacity,
    setLayerVisible,
    triggerClip,
  ])

  const transitionEngine = useTransitionEngine({
    bpm,
    getMasterFx: () => masterFxRef.current,
    setMasterFx,
    setBlackout,
    applyCueNow: applyAutomationCueNow,
  })

  const applyAutomationCue = useCallback((cue, meta = {}) => {
    if (!cue) {
      return
    }

    if (!automationAutoTransitionEnabled) {
      applyAutomationCueNow(cue)
      return
    }

    const blockTransition = normalizeTransition(meta.block?.transition)
    const cueTransition = normalizeTransition(cue.transition)
    const transition = meta.reason === 'manual-trigger' ? cueTransition : blockTransition || cueTransition

    transitionEngine.runTransition({
      cue,
      transition,
      meta,
      reason: meta.reason || 'automation',
    })
  }, [
    automationAutoTransitionEnabled,
    applyAutomationCueNow,
    transitionEngine,
  ])

  const automationTransport = useAutomationEngine({
    scenes: automationScenes,
    bpm,
    quantizeBeats: automationQuantizeBeats,
    enabled: true,
    onCueTrigger: applyAutomationCue,
  })

  useEffect(() => {
    automationManualOverrideRef.current = () => {
      transitionEngine.cancelTransition('manual-override')
      automationTransport.enterManualOverride()
    }
  }, [automationTransport.enterManualOverride, transitionEngine])

  const updateAutomationScene = useCallback((sceneId, updater) => {
    setAutomationScenes((current) => current.map((scene) => (scene.id === sceneId ? updater(scene) : scene)))
  }, [])

  const setLayerSequence = useCallback((layerIndex, updater) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex ? updater(sequence) : sequence
    )))
  }, [])

  const addLayerSequenceEntry = useCallback((layerIndex, slotIndex) => {
    const layer = layers[layerIndex]
    if (!layer || !Array.isArray(layer.slots) || typeof slotIndex !== 'number') {
      return
    }
    const slot = layer.slots[slotIndex]
    if (!slot || slot.status !== 'loaded') {
      return
    }

    const entry = createLayerSequenceEntry(slotIndex, slot)
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, entries: [...sequence.entries, entry] }
        : sequence
    )))
  }, [layers])

  const updateLayerSequenceEntry = useCallback((layerIndex, entryId, patch) => {
    setLayerSequences((current) => current.map((sequence) => {
      if (sequence.layerIndex !== layerIndex) {
        return sequence
      }
      return {
        ...sequence,
        entries: sequence.entries.map((entry) => (
          entry.id === entryId ? { ...entry, ...patch } : entry
        )),
      }
    }))
  }, [])

  const removeLayerSequenceEntry = useCallback((layerIndex, entryId) => {
    setLayerSequences((current) => current.map((sequence) => {
      if (sequence.layerIndex !== layerIndex) {
        return sequence
      }
      const nextEntries = sequence.entries.filter((entry) => entry.id !== entryId)
      const nextIndex = Math.min(sequence.currentEntryIndex, Math.max(0, nextEntries.length - 1))
      return {
        ...sequence,
        entries: nextEntries,
        currentEntryIndex: nextIndex,
        elapsedMs: 0,
      }
    }))
  }, [])

  const moveLayerSequenceEntry = useCallback((layerIndex, fromIndex, toIndex) => {
    setLayerSequences((current) => current.map((sequence) => {
      if (sequence.layerIndex !== layerIndex) {
        return sequence
      }
      if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= sequence.entries.length || toIndex >= sequence.entries.length) {
        return sequence
      }
      const nextEntries = [...sequence.entries]
      const [moved] = nextEntries.splice(fromIndex, 1)
      nextEntries.splice(toIndex, 0, moved)
      return {
        ...sequence,
        entries: nextEntries,
        currentEntryIndex: Math.min(nextEntries.length - 1, Math.max(0, sequence.currentEntryIndex === fromIndex ? toIndex : sequence.currentEntryIndex)),
      }
    }))
  }, [])

  const triggerLayerSequenceEntry = useCallback((layerIndex, entryIndex, shouldPlay = true) => {
    const layer = layers[layerIndex]
    const sequence = layerSequencesRef.current.find((entry) => entry.layerIndex === layerIndex)
    if (!layer || !sequence) {
      return
    }
    const boundedIndex = Math.min(Math.max(0, entryIndex), sequence.entries.length - 1)
    const entry = sequence.entries[boundedIndex]
    if (!entry) {
      return
    }
    const slot = layer.slots?.[entry.slotIndex]
    if (slot) {
      triggerClip(layerIndex, entry.slotIndex)
    }

    setLayerSequences((current) => current.map((sequenceItem) => (
      sequenceItem.layerIndex === layerIndex
        ? { ...sequenceItem, currentEntryIndex: boundedIndex, elapsedMs: 0, isPlaying: shouldPlay }
        : sequenceItem
    )))
  }, [layers, triggerClip])

  const advanceLayerSequenceEntry = useCallback((layerIndex) => {
    const sequence = layerSequencesRef.current.find((entry) => entry.layerIndex === layerIndex)
    if (!sequence) {
      return
    }
    const nextIndex = sequence.currentEntryIndex + 1
    if (nextIndex >= sequence.entries.length) {
      if (sequence.loopSection && sequence.entries.length > 0) {
        triggerLayerSequenceEntry(layerIndex, 0)
      } else {
        setLayerSequences((current) => current.map((sequenceItem) => (
          sequenceItem.layerIndex === layerIndex
            ? { ...sequenceItem, isPlaying: false, elapsedMs: 0 }
            : sequenceItem
        )))
      }
      return
    }
    triggerLayerSequenceEntry(layerIndex, nextIndex)
  }, [triggerLayerSequenceEntry])

  const rewindLayerSequenceEntry = useCallback((layerIndex) => {
    const sequence = layerSequencesRef.current.find((entry) => entry.layerIndex === layerIndex)
    if (!sequence) {
      return
    }
    const prevIndex = Math.max(0, sequence.currentEntryIndex - 1)
    triggerLayerSequenceEntry(layerIndex, prevIndex)
  }, [triggerLayerSequenceEntry])

  const toggleLayerSequencePlay = useCallback((layerIndex) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, isPlaying: !sequence.isPlaying, manualOverride: sequence.isPlaying ? sequence.manualOverride : false }
        : sequence
    )))
  }, [])

  const toggleLayerSequenceLoop = useCallback((layerIndex) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, loopSection: !sequence.loopSection }
        : sequence
    )))
  }, [])

  const clearLayerSequence = useCallback((layerIndex) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, entries: [], currentEntryIndex: 0, elapsedMs: 0, isPlaying: false, manualOverride: false }
        : sequence
    )))
  }, [])

  const resumeLayerSequence = useCallback((layerIndex) => {
    setLayerSequences((current) => current.map((sequence) => (
      sequence.layerIndex === layerIndex
        ? { ...sequence, manualOverride: false }
        : sequence
    )))
  }, [])

  const handleLayerClipEnded = useCallback((layerIndex, slotIndex) => {
    const sequence = layerSequencesRef.current.find((entry) => entry.layerIndex === layerIndex)
    if (!sequence || !sequence.isPlaying || sequence.manualOverride) {
      return
    }
    const currentEntry = sequence.entries[sequence.currentEntryIndex]
    if (!currentEntry || currentEntry.slotIndex !== slotIndex || currentEntry.advanceMode !== 'clip-end') {
      return
    }
    advanceLayerSequenceEntry(layerIndex)
  }, [advanceLayerSequenceEntry])

  const handleAddSlotSequenceEntry = useCallback((layerIndex, slotIndex) => {
    addLayerSequenceEntry(layerIndex, slotIndex)
  }, [addLayerSequenceEntry])

  const handleMoveLayerSequenceEntry = useCallback((layerIndex, fromIndex, toIndex) => {
    moveLayerSequenceEntry(layerIndex, fromIndex, toIndex)
  }, [moveLayerSequenceEntry])

  useEffect(() => {
    const beatMs = 60000 / Math.max(20, bpm || 140)
    const interval = setInterval(() => {
      const triggers = []
      setLayerSequences((current) => current.map((sequence) => {
        if (!sequence.isPlaying || sequence.manualOverride || sequence.entries.length === 0) {
          return sequence
        }
        const entry = sequence.entries[sequence.currentEntryIndex]
        if (!entry || entry.advanceMode === 'clip-end') {
          return sequence
        }
        const beats = Math.max(1, Number(entry.durationBeats) || 4)
        const multiplier = entry.advanceMode === 'bar' ? 4 : 1
        const durationMs = beatMs * beats * multiplier
        const nextElapsed = sequence.elapsedMs + 50
        if (nextElapsed < durationMs) {
          return { ...sequence, elapsedMs: nextElapsed }
        }
        const nextIndex = sequence.currentEntryIndex + 1
        if (nextIndex >= sequence.entries.length) {
          if (sequence.loopSection) {
            const nextEntry = sequence.entries[0]
            if (nextEntry) {
              triggers.push({ layerIndex: sequence.layerIndex, slotIndex: nextEntry.slotIndex })
              return { ...sequence, currentEntryIndex: 0, elapsedMs: 0 }
            }
          }
          return { ...sequence, isPlaying: false, elapsedMs: 0 }
        }
        const nextEntry = sequence.entries[nextIndex]
        if (nextEntry) {
          triggers.push({ layerIndex: sequence.layerIndex, slotIndex: nextEntry.slotIndex })
        }
        return { ...sequence, currentEntryIndex: nextIndex, elapsedMs: 0 }
      }))
      if (triggers.length > 0) {
        queueMicrotask(() => {
          triggers.forEach(({ layerIndex, slotIndex }) => {
            const layer = layers[layerIndex]
            if (layer && layer.slots?.[slotIndex]?.status === 'loaded') {
              triggerClip(layerIndex, slotIndex)
            }
          })
        })
      }
    }, 50)

    return () => clearInterval(interval)
  }, [bpm, layers, triggerClip])

  const handleAutomationCaptureCue = useCallback((sceneId) => {
    const cueId = `cue-live-${Date.now()}`
    const blockId = `block-live-${Date.now()}`
    const liveLayers = layers.map((layer) => ({
      layerIndex: layer.layerIndex,
      slotIndex: typeof layer.activeSlotIndex === 'number' ? layer.activeSlotIndex : null,
      opacity: Number((layer.opacity ?? 1).toFixed(2)),
      blendMode: layer.blendMode,
      visible: Boolean(layer.visible),
    }))

    const cue = {
      id: cueId,
      name: `Live Snapshot ${new Date().toLocaleTimeString()}`,
      energyState: activeEnergyState,
      energyIntensity: Number(activeEnergyIntensity.toFixed(2)),
      blackout,
      transition: { ...DEFAULT_TRANSITION },
      layers: liveLayers,
      fxPatch: {
        strobe: masterFx.strobe,
        shake: masterFx.shake,
        brightness: masterFx.brightness,
      },
    }

    const block = {
      id: blockId,
      cueId,
      durationBeats: 16,
      transition: { ...DEFAULT_TRANSITION },
    }

    updateAutomationScene(sceneId, (scene) => ({
      ...scene,
      cues: [...(scene.cues || []), cue],
      blocks: [...(scene.blocks || []), block],
    }))
  }, [
    layers,
    activeEnergyState,
    activeEnergyIntensity,
    blackout,
    masterFx,
    updateAutomationScene,
  ])

  const handleAutomationBlockDurationChange = useCallback((sceneId, blockId, durationBeats) => {
    updateAutomationScene(sceneId, (scene) => ({
      ...scene,
      blocks: (scene.blocks || []).map((block) => (
        block.id === blockId
          ? { ...block, durationBeats: Math.max(4, Number(durationBeats) || 4) }
          : block
      )),
    }))
  }, [updateAutomationScene])

  const handleAutomationTriggerCueNow = useCallback((cueId) => {
    const scene = automationScenes.find((entry) => entry.id === automationSceneId)
    const cue = scene?.cues?.find((entry) => entry.id === cueId)
    if (!cue) {
      return
    }
    transitionEngine.cancelTransition('manual-trigger')
    automationTransport.enterManualOverride()
    applyAutomationCue(cue, { reason: 'manual-trigger' })
  }, [automationScenes, automationSceneId, automationTransport, applyAutomationCue, transitionEngine])

  const handleAutomationBlockTransitionChange = useCallback((sceneId, blockId, patch) => {
    updateAutomationScene(sceneId, (scene) => ({
      ...scene,
      blocks: (scene.blocks || []).map((block) => {
        if (block.id !== blockId) {
          return block
        }
        return {
          ...block,
          transition: {
            ...normalizeTransition(block.transition),
            ...patch,
          },
        }
      }),
    }))
  }, [updateAutomationScene])

  const handleAutomationPreviewTransition = useCallback((sceneId, blockId) => {
    const scene = automationScenes.find((entry) => entry.id === sceneId)
    const block = scene?.blocks?.find((entry) => entry.id === blockId)
    if (!scene || !block) {
      return
    }
    const cue = scene.cues?.find((entry) => entry.id === block.cueId)
    if (!cue) {
      return
    }
    transitionEngine.previewTransition(normalizeTransition(block.transition), cue, {
      reason: 'preview',
      block,
      blockIndex: -1,
    })
  }, [automationScenes, transitionEngine])

  const publishedBassLevel = isMultiLayerVideoMode ? 0 : bassLevel
  const publishedSpectrumLevels = isMultiLayerVideoMode ? STABLE_ZERO_SPECTRUM_LEVELS : spectrumLevelsRef.current
  const publishedSpectrumBins = isMultiLayerVideoMode ? STABLE_EMPTY_BINS : spectrumBinsRef.current

  useEffect(() => {
    const nextState = buildOutputState({
      layers: effectiveLayers,
      masterFx: effectiveMasterFx,
      blackout,
      bassLevel: publishedBassLevel,
      spectrumLevels: publishedSpectrumLevels,
      spectrumBins: publishedSpectrumBins,
      bpm,
      energySystemEnabled,
      smoothedEnergyFx,
      energyStrobeCount: energyFxMapping.strobeCount,
      energyState: activeEnergyState,
      energyIntensity: activeEnergyIntensity,
      smoothedDropFx,
      dropStrobeCount: dropSystem.dropStrobeCount,
      generatedQualityMode,
      generatedMaxFps,
      performanceOutputMode,
    })
    window.scalezApi?.publishOutputState?.(nextState)
  }, [effectiveLayers, effectiveMasterFx, blackout, publishedBassLevel, publishedSpectrumLevels, publishedSpectrumBins, bpm, energySystemEnabled, smoothedEnergyFx, energyFxMapping.strobeCount, activeEnergyState, activeEnergyIntensity, smoothedDropFx, dropSystem.dropStrobeCount, generatedQualityMode, generatedMaxFps, performanceOutputMode])

  const lastRecoveryLabel = outputTelemetry.lastRecoveryAt
    ? new Date(outputTelemetry.lastRecoveryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'n/a'
  const outputHealthClass = outputTelemetry.health === 'Recovering'
    ? 'is-recovering'
    : outputTelemetry.health === 'Warning'
      ? 'is-warning'
      : 'is-healthy'

  return (
    <main className={`control-shell workspace-${activeWorkspace}${compactMode ? ' is-compact' : ''}`}>
      <header className="top-bar panel-glass">
        <div>
          <h1>SCALEZ Vision Engine</h1>
          <div className="subtitle">
            {WORKSPACES.find((workspace) => workspace.id === activeWorkspace)?.label || 'Performance'} Workspace
            {' · '}
            <span className="session-timer">{sessionTimer.formatted}</span>
          </div>
        </div>
        <div className="header-actions">
          <div className="workspace-switcher" role="tablist" aria-label="Workspace mode">
            {WORKSPACES.map((workspace, index) => {
              const keyHint = WORKSPACE_KEY_HINTS[workspace.id] || `F${index + 1}`
              return (
                <button
                  key={workspace.id}
                  type="button"
                  className={`pill workspace-pill${activeWorkspace === workspace.id ? ' is-active' : ''}`}
                  role="tab"
                  aria-selected={activeWorkspace === workspace.id}
                  onClick={() => setActiveWorkspace(workspace.id)}
                  title={`${workspace.label} (${keyHint})`}
                >
                  {workspace.label}
                  <span className="workspace-pill__hint">{keyHint}</span>
                </button>
              )
            })}
          </div>
          <MidiPanel midiState={midiState} />
          <ShowManager
            savedShows={savedShows}
            defaultScenes={DEFAULT_SCENE_PRESETS}
            onRefreshShows={() => {
              setSavedShows(getSavedShows())
            }}
            onSaveShow={(name) => {
              saveShow(name, midiState.getMappings(), buildAppSettings())
              setSavedShows(getSavedShows())
            }}
            onLoadShow={(name) => {
              const result = loadShow(name)
              if (!result?.ok) {
                window.alert(`Could not load show "${name}". It may be incompatible or corrupted.`)
                return
              }
              const loadedMappings =
                result?.midiMappings && typeof result.midiMappings === 'object' && Object.keys(result.midiMappings).length > 0
                  ? result.midiMappings
                  : restoreMidiMappings()
              loadControllerMappings(loadedMappings || {})
              if (result?.appSettings) {
                applyAppSettings(result.appSettings)
              }
            }}
            onLoadDefaultScene={(sceneId) => {
              loadDefaultSceneComposition(sceneId)
              setBlackout(false)
            }}
            onDeleteShow={(name) => {
              deleteShow(name)
              setSavedShows(getSavedShows())
            }}
          />
          {isPerformanceWorkspace && (
            <div className="tap-tempo">
              <button
                type="button"
                className="tap-tempo__btn"
                onClick={tapTempo}
                title="Tap to set tempo (no sync)"
              >
                TAP
              </button>
              <input
                type="number"
                className="tap-tempo__input"
                min={20}
                max={300}
                step={1}
                value={bpm ?? ''}
                onChange={(event) => setManualBpm(event.target.value)}
                placeholder="BPM"
                title="Type BPM manually (20-300)"
              />
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
          )}
          {isPerformanceWorkspace && (
            <button
              type="button"
              className={`pill${beatSyncEnabled ? ' is-active' : ''}`}
              onClick={() => setBeatSyncEnabled((v) => !v)}
              title={bpm ? `Beat-sync: trigger clips on beat at drop/peak (${bpm} BPM)` : 'Tap a BPM first to use beat-sync'}
              disabled={!bpm}
            >
              ⏱ Beat Sync
            </button>
          )}
          {isPerformanceWorkspace && (
            <button
              type="button"
              className={`pill${cueMode ? ' is-active' : ''}`}
              onClick={() => setCueMode((c) => !c)}
              title="Cue mode: select clip to stage, then press Launch to play"
            >
              {cueMode ? '⏸ Cue ON' : '⏸ Cue'}
            </button>
          )}
          {(isPerformanceWorkspace || isSceneWorkspace) && (
            <button
              type="button"
              className={`pill${compactMode ? ' is-active' : ''}`}
              onClick={() => setCompactMode((v) => !v)}
              title="Compact mode: reduce preview and layer height"
            >
              {compactMode ? 'Compact ON' : 'Compact'}
            </button>
          )}
          {isDebugWorkspace && (
            <button
              type="button"
              className={`pill ${showTestMode ? 'is-active' : ''}`}
              onClick={() => setShowTestMode(!showTestMode)}
            >
              🧪 Test
            </button>
          )}
          <button
            type="button"
            className="pill"
            onClick={() => window.scalezApi?.toggleOutputFullscreen()}
          >
            Fullscreen Output
          </button>
          <button
            type="button"
            className={`pill${showSettings ? ' is-active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
          >
            ⚙ Settings
          </button>
          {isDebugWorkspace && (
            <button
              type="button"
              className="pill"
              onClick={() => window.scalezApi?.openDevTools()}
              title="Open DevTools for this window"
            >
              DevTools
            </button>
          )}
          {isDebugWorkspace && (
            <button
              type="button"
              className="pill"
              onClick={() => window.scalezApi?.openControlDevTools?.()}
              title="Open DevTools for Control window"
            >
              DevTools Control
            </button>
          )}
          {isDebugWorkspace && (
            <button
              type="button"
              className="pill"
              onClick={() => window.scalezApi?.openOutputDevTools?.()}
              title="Open DevTools for Output window"
            >
              DevTools Output
            </button>
          )}
        </div>
      </header>

      <section className="output-telemetry panel-glass" aria-live="polite">
        <div className="output-telemetry__row">
          <span className={`output-telemetry__health ${outputHealthClass}`}>{outputTelemetry.health}</span>
          <span className="output-telemetry__item">Stalls: {outputTelemetry.totalStallDetections}</span>
          <span className="output-telemetry__item">Soft Recoveries: {outputTelemetry.totalSoftRecoveries}</span>
          <span className="output-telemetry__item">Last Recovery: {lastRecoveryLabel}</span>
          <span className="output-telemetry__item">Mode: {performanceOutputMode ? 'Performance Output' : 'Standard Output'}</span>
        </div>
      </section>

      <div className={`output-preview-container${isPerformanceWorkspace ? ' with-hud' : ''}`}>
        <OutputPreview
          layers={effectiveLayers}
          fps={fps}
          bassLevel={previewBassLevel}
          spectrumLevels={previewSpectrumLevels}
          spectrumBins={previewSpectrumBins}
          bpm={bpm}
          masterFx={effectiveMasterFx}
          blackout={blackout}
          showOverlays={isDebugWorkspace}
          markSlotFailed={markSlotFailed}
          enablePreload={false}
          energyState={activeEnergyState}
          energyIntensity={activeEnergyIntensity}
          smoothedEnergyFx={smoothedEnergyFx}
          energyFxMapping={energyFxMapping}
          energyStrobeCount={energyFxMapping.strobeCount}
          energySystemEnabled={energySystemEnabled}
          smoothedDropFx={smoothedDropFx}
          dropStrobeCount={dropSystem.dropStrobeCount}
          generatedQualityMode={generatedQualityMode}
          generatedMaxFps={generatedMaxFps}
        />
        {isPerformanceWorkspace && (
          <PerformanceHUD
            bpm={bpm}
            energyState={activeEnergyState}
            energyIntensity={activeEnergyIntensity}
            blackout={blackout}
            fps={fps}
            bassLevel={bassLevel}
            activeLayerCount={effectiveLayers.filter((l) => l.activeSlotIndex !== null).length}
          />
        )}
      </div>

      {!hasAnyLoadedClip && showLayerWorkspace && (
        <p className="empty-guidance panel-glass">Load a clip into any slot to begin.</p>
      )}

      {isSceneWorkspace && (
        <section className="scene-clip-browser panel-glass">
          <div className="scene-clip-browser__header">
            <h3>Scene / Clip Browser</h3>
            <div className="scene-clip-browser__info">
              {sceneClipSelectedSlot !== null && (
                <span className="scene-clip-browser__selection">
                  Selected: Layer {sceneClipSelectedSlot.layerIndex + 1} / Slot {sceneClipSelectedSlot.slotIndex + 1}
                </span>
              )}
            </div>
          </div>
          <div className="scene-clip-browser__content">
            <div className="scene-clip-browser__section">
              <h4>Generated Scenes</h4>
              <div className="scene-clip-cards">
                {/* Generated scenes will render here */}
                <div className="scene-clip-card-placeholder">No generated scenes loaded yet.</div>
              </div>
            </div>
            <div className="scene-clip-browser__section">
              <h4>Quick Actions</h4>
              <div className="scene-clip-browser__actions">
                <button
                  type="button"
                  className="pill"
                  onClick={() => setSceneClipSelectedSlot(null)}
                  disabled={sceneClipSelectedSlot === null}
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setActiveWorkspace('performance')}
                >
                  Go to Performance
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {isAutomationWorkspace && (
        <AutomationWorkspace
          scenes={automationScenes}
          selectedSceneId={automationSceneId}
          onSelectScene={setAutomationSceneId}
          onCaptureCue={handleAutomationCaptureCue}
          onTriggerCueNow={handleAutomationTriggerCueNow}
          onBlockDurationChange={handleAutomationBlockDurationChange}
          onBlockTransitionChange={handleAutomationBlockTransitionChange}
          onPreviewTransition={handleAutomationPreviewTransition}
          quantizeBeats={automationQuantizeBeats}
          onQuantizeBeatsChange={setAutomationQuantizeBeats}
          autoTransitionEnabled={automationAutoTransitionEnabled}
          onAutoTransitionChange={setAutomationAutoTransitionEnabled}
          onEmergencyBlackout={() => {
            transitionEngine.cancelTransition('emergency-blackout')
            automationTransport.enterManualOverride()
            setBlackout(true)
          }}
          transitionState={transitionEngine.activeTransition}
          transport={automationTransport}
        />
      )}

      {showLayerWorkspace && (
      <section className="layer-stack">
        {displayLayers.map((layer) => {
          const baseVideoMotion = layerVideoMotion[layer.layerIndex] || makeDefaultVideoMotion()
          const activeSlotIndex = layer.activeSlotIndex
          const activeClip =
            typeof activeSlotIndex === 'number' ? layer.slots?.[activeSlotIndex] : null
          const clipMotion = activeClip?.filePath ? clipVideoMotion[activeClip.filePath] : null
          const uiVideoMotion = clipMotion
            ? {
                ...baseVideoMotion,
                inPoint: clipMotion.inPoint ?? baseVideoMotion.inPoint,
                outPoint: clipMotion.outPoint ?? baseVideoMotion.outPoint,
              }
            : baseVideoMotion

          return (
            <LayerStrip
              key={layer.label}
              layer={layer}
              performanceMode={isPerformanceWorkspace}
              isSceneSelectMode={isSceneWorkspace}
              sceneClipSelectedSlot={sceneClipSelectedSlot}
              onSceneClipSelectSlot={setSceneClipSelectedSlot}
              layers={layers}
              isFocused={focusedLayer === layer.layerIndex}
              spectrumRef={spectrumLevelsRef}
              cueMode={cueMode}
              cuedSlotIndex={cuedSlots[layer.layerIndex] ?? null}
              midiFlashSlots={midiFlashSlots}
              audioLink={layerAudioLinks[layer.layerIndex] || {
                amount: 0,
                speedAmount: 0,
                threshold: 0.12,
                mode: 'normal',
                source: 'low',
              }}
              videoMotion={uiVideoMotion}
              onToggleVisible={setLayerVisible}
              onOpacityChange={setLayerOpacity}
              onBlendModeChange={setLayerBlendMode}
              onClear={clearLayer}
              onTrigger={handleTriggerOrCue}
              onLoad={loadClipIntoSlot}
              onDelete={handleDeleteSlot}
              onFocusToggle={handleFocusToggle}
              onLaunchCue={handleLaunchCue}
              onScrollRef={handleScrollRef}
              onAudioLinkChange={setLayerAudioLink}
              onVideoMotionChange={setLayerVideoMotionValue}
              onRebuildReverseCache={rebuildLayerReverseCache}
              onLoadGeneratedClip={loadGeneratedClipIntoSlot}
              onLoadGeneratedPackToLayer={loadGeneratedPackToLayer}
              onLoadGeneratedPackToAllLayers={loadGeneratedPackToAllLayers}
            />
          )
        })}
      </section>
      )}

      {isPerformanceWorkspace && (
        <section className="performance-fx-rack panel-glass">
          <div className="performance-fx-rack__header">
            <h3>Master FX Rack</h3>
            <div className="performance-fx-rack__status">
              <span className="energy-badge" title={`Energy state: ${activeEnergyState}`}>
                {activeEnergyState.toUpperCase()}
              </span>
              <span className="overlay-chip">BPM {bpm ?? '--'}</span>
            </div>
          </div>
          <div className="performance-fx-rack__grid">
            <label className="fx-control">
              <span>Strobe: <strong>{masterFx.strobe.toFixed(2)}</strong></span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterFx.strobe}
                onChange={(event) => setFxValue('strobe', Number(event.target.value))}
              />
            </label>
            <label className="fx-control">
              <span>Shake: <strong>{masterFx.shake.toFixed(2)}</strong></span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterFx.shake}
                onChange={(event) => setFxValue('shake', Number(event.target.value))}
              />
            </label>
            <label className="fx-control">
              <span>Brightness: <strong>{masterFx.brightness.toFixed(2)}</strong></span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.01"
                value={masterFx.brightness}
                onChange={(event) => setFxValue('brightness', Number(event.target.value))}
              />
            </label>
          </div>
          <div className="performance-fx-rack__actions">
            <button type="button" className="danger-pill" onClick={() => setBlackout((current) => !current)}>
              {blackout ? 'Disable Blackout' : 'Blackout'}
            </button>
            <button type="button" className="pill ghost" onClick={resetFx}>
              Reset FX
            </button>
            <button
              type="button"
              className="pill"
              onClick={() => setActiveWorkspace('fx')}
              title="Open full FX workspace"
            >
              Open Full FX Workspace
            </button>
          </div>
        </section>
      )}

      {showMasterPanel && (
        <MasterFxPanel
          masterFx={masterFx}
          blackout={blackout}
          onFxChange={setFxValue}
          onToggleBlackout={() => setBlackout((current) => !current)}
          onReset={resetFx}
          safeMode={safeMode}
          onSafeModeChange={setSafeMode}
          workspace={activeWorkspace}
          // Performance & Energy System props (PART 6)
          performanceModeEnabled={performanceMode.performanceModeEnabled}
          onPerformanceModeChange={performanceMode.setPerformanceModeEnabled}
          energyState={activeEnergyState}
          energyIntensity={activeEnergyIntensity}
          energyMetrics={energyMetrics}
          energySystemEnabled={energySystemEnabled}
          onEnergySystemChange={setEnergySystemEnabled}
          energyManualOverrideEnabled={energyManualOverrideEnabled}
          onEnergyManualOverrideChange={setEnergyManualOverrideEnabled}
          manualEnergyState={manualEnergyState}
          onManualEnergyStateChange={setManualEnergyState}
          manualEnergyIntensity={manualEnergyIntensity}
          onManualEnergyIntensityChange={setManualEnergyIntensity}
          dropSystemEnabled={dropSystemEnabled}
          onDropSystemChange={setDropSystemEnabled}
          dropThresholdLevel={dropThresholdLevel}
          onDropThresholdLevelChange={setDropThresholdLevel}
          lastDropIntensity={dropSystem.lastDropIntensity}
          dropCount={dropSystem.dropCount}
          recentDropEvent={dropSystem.recentDropEvent}
          dropArmed={dropSystem.dropArmed}
          energyStrobeCount={energyFxMapping.strobeCount}
          dropStrobeCount={dropSystem.dropStrobeCount}
          clipVariationEnabled={clipVariationEnabled}
          onClipVariationChange={setClipVariationEnabled}
          autoEvolutionEnabled={autoEvolutionEnabled}
          onAutoEvolutionChange={setAutoEvolutionEnabled}
          autoEvolutionInterval={autoEvolutionInterval}
          onAutoEvolutionIntervalChange={setAutoEvolutionInterval}
          audioPanel={{
            bassLevel,
            spectrumLevels,
            spectrumBins,
            isActive: audioActive,
            permissionDenied,
            audioError,
            eq: audioEq,
            fxLinks: audioFxLinks,
            sensitivity: audioSensitivity,
            smoothing: audioSmoothing,
            noiseFloor: audioNoiseFloor,
            preGain: audioPreGain,
            onEqChange: setAudioEqValue,
            onFxLinkChange: setAudioFxLink,
            audioDevices,
            selectedDeviceId: audioDeviceId,
            onDeviceChange: setAudioDeviceId,
            onStartAudio: startAudio,
            onStopAudio: stopAudio,
            onSensitivityChange: setAudioSensitivity,
            onSmoothingChange: setAudioSmoothing,
            onNoiseFloorChange: setAudioNoiseFloor,
            onPreGainChange: setAudioPreGain,
            spectrumRef: spectrumLevelsRef,
          }}
          layers={layers}
          smoothedEnergyFx={smoothedEnergyFx}
          smoothedDropFx={smoothedDropFx}
        />
      )}

      {isDebugWorkspace && showTestMode && (
        <TestModePanel
          layers={layers}
          onTriggerClip={triggerClip}
          onBassSimulate={() => {}}
          onToggleLayerVisibility={setLayerVisible}
        />
      )}
      {showSettings && (
        <>
          <div className="settings-backdrop" onClick={() => setShowSettings(false)} />
          <SettingsPanel
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            settings={{
              performanceModeEnabled: performanceMode.performanceModeEnabled,
              safeMode,
              energyReactiveEnabled,
              beatSyncEnabled,
              showEnergyDebug,
              dropThresholdLevel,
              energySystemEnabled,
              autoEvolutionEnabled,
              autoEvolutionInterval,
              performanceOutputMode,
            }}
            actions={{
              setPerformanceModeEnabled: performanceMode.setPerformanceModeEnabled,
              setSafeMode,
              setEnergyReactiveEnabled,
              setBeatSyncEnabled,
              setShowEnergyDebug,
              setDropThresholdLevel,
              setEnergySystemEnabled,
              setAutoEvolutionEnabled,
              setAutoEvolutionInterval,
              setPerformanceOutputMode,
            }}
          />
        </>
      )}
      <EnergyDebugBadge
        energyState={activeEnergyState}
        energyIntensity={activeEnergyIntensity}
        energyMetrics={energyMetrics}
        enabled={showEnergyDebug}
      />
    </main>
  )
}

export default function App() {
  const mode = getWindowMode()

  useEffect(() => {
    const body = document.body
    if (!body) {
      return undefined
    }

    if (mode === 'output') {
      body.classList.add('output-window')
    } else {
      body.classList.remove('output-window')
    }

    return () => {
      body.classList.remove('output-window')
    }
  }, [mode])

  return mode === 'output' ? <OutputShell /> : <ControlShell />
}
