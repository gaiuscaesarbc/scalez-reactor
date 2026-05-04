import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import LayerStrip from './components/LayerStrip'
import MasterFxPanel from './components/MasterFxPanel'
import OutputPreview from './components/OutputPreview'
import TestModePanel from './components/TestModePanel'
import ShowManager from './components/ShowManager'
import MidiPanel from './components/MidiPanel'
import { EnergyDebugBadge } from './components/EnergyDebugBadge'
import SettingsPanel from './components/SettingsPanel'
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
import {
  buildOutputState,
  DEFAULT_MASTER_FX,
  useOutputStateSubscription,
} from './hooks/useOutputSync'

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep01(value) {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
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

const ENERGY_STATES = ['calm', 'build', 'drop', 'peak']

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
  const energyEnabled = Boolean(syncedState?.energy?.enabled)
  const smoothedEnergyFx = syncedState?.energy?.smoothedFx || null
  const energyStrobeCount = syncedState?.energy?.strobeCount ?? 0
  const energyState = syncedState?.energy?.state || 'calm'
  const energyIntensity = syncedState?.energy?.intensity ?? 0
  const smoothedDropFx = syncedState?.drop?.smoothedFx || null
  const dropStrobeCount = syncedState?.drop?.strobeCount ?? 0

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
        energySystemEnabled={energyEnabled}
        smoothedEnergyFx={smoothedEnergyFx}
        energyStrobeCount={energyStrobeCount}
        energyState={energyState}
        energyIntensity={energyIntensity}
        smoothedDropFx={smoothedDropFx}
        dropStrobeCount={dropStrobeCount}
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
    glow: { amount: 0.35, threshold: 0.03, mode: 'normal', source: 'low' },
    strobe: { amount: 0, threshold: 0.12, mode: 'pulse', source: 'low' },
    shake: { amount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    brightness: { amount: 0.25, threshold: 0.03, mode: 'normal', source: 'low' },
  })
  const [layerAudioLinks, setLayerAudioLinks] = useState({
    0: { amount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    1: { amount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
    2: { amount: 0, threshold: 0.06, mode: 'normal', source: 'low' },
  })
  const [layerVideoMotion, setLayerVideoMotion] = useState({
    0: makeDefaultVideoMotion(),
    1: makeDefaultVideoMotion(),
    2: makeDefaultVideoMotion(),
  })
  const [clipVideoMotion, setClipVideoMotion] = useState({})
  const [safeMode, setSafeMode] = useState(false)
  const [showTestMode, setShowTestMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [compactMode, setCompactMode] = useState(false)
  const [savedShows, setSavedShows] = useState([])
  const [nativePlaybackStatus, setNativePlaybackStatus] = useState(null)
  const [nativePlaybackBusy, setNativePlaybackBusy] = useState(false)

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
  const fps = useFps()
  const sessionTimer = useSessionTimer()

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

  useEffect(() => {
    let disposed = false

    async function initNativePlayback() {
      try {
        const status = await window.scalezApi?.getNativePlaybackStatus?.()
        if (disposed || !status) {
          return
        }
        setNativePlaybackStatus(status)

        if (!status.available) {
          return
        }

        // Browser compositor is the display path; keep native disabled by default.
        const nextStatus = await window.scalezApi?.setNativePlaybackEnabled?.(false)
        if (!disposed && nextStatus) {
          setNativePlaybackStatus(nextStatus)
        }
      } catch {
        // Native playback control is optional.
      }
    }

    void initNativePlayback()
    return () => {
      disposed = true
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

  // Restore last show on mount
  useEffect(() => {
    const result = restoreLastShow()
    if (result?.appSettings) {
      applyAppSettings(result.appSettings)
    }
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
    clipVariationEnabled,
    autoEvolutionEnabled,
    autoEvolutionInterval,
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
    if (settings.masterFx != null) setMasterFx(settings.masterFx)
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
    if (settings.dropThresholdLevel) setDropThresholdLevel(settings.dropThresholdLevel)
    if (settings.clipVariationEnabled != null) setClipVariationEnabled(settings.clipVariationEnabled)
    if (settings.autoEvolutionEnabled != null) setAutoEvolutionEnabled(settings.autoEvolutionEnabled)
    if (settings.autoEvolutionInterval != null) setAutoEvolutionInterval(settings.autoEvolutionInterval)
  }

  // Autosave MIDI mappings with show data
  useEffect(() => {
    const autosaveInterval = setInterval(() => {
      autosaveShow(midiState.getMappings(), buildAppSettings())
    }, 30000)

    return () => clearInterval(autosaveInterval)
  }, [autosaveShow, midiState])

  // Stable ref to current spectrumLevels — passed to BandPicker so it can animate
  // bars via rAF without triggering LayerStrip memo invalidation.
  const spectrumLevelsRef = useRef({})

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

  // Keep spectrumLevelsRef in sync each audio frame
  spectrumLevelsRef.current = spectrumLevels

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
      glowBoost: energyFxMapping.glowBoost,
      shakeIntensity: energyFxMapping.shakeIntensity,
      brightnessBoost: energyFxMapping.brightnessBoost,
      lerpFactor: 0.12,
      enabled: energySystemEnabled,
    })

    const smoothedDropFx = useEnergyFxSmoother({
      glowBoost: dropSystem.dropFx.glowBoost,
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
          field === 'bounceEnabled'
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

  const effectiveLayers = useMemo(
    () => layers.map((layer) => {
      const link = layerAudioLinks[layer.layerIndex] || { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' }
      const sourceLevel = getSpectrumSourceLevel(spectrumLevels, link.source)
      const linkAmount = clamp01(link.amount ?? 0)
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

      const scaleSourceLevel = getSpectrumSourceLevel(spectrumLevels, videoMotion.scaleSource || 'low')
      const scaleBoost = getReactiveAmount(
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
        videoMotion: { ...videoMotion, scale: reactiveScale },
      }
    }),
    [layers, layerAudioLinks, layerVideoMotion, clipVideoMotion, spectrumLevels, dropSystem.layerOpacityFloors],
  )

  const effectiveMasterFx = useMemo(
    () => {
      // When energy system is on, audio reactive links are silenced for the same
      // FX channels (glow, strobe, shake, brightness) so they don't stack or fight.
      const linksActive = !energySystemEnabled

      const glowBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(spectrumLevels, audioFxLinks.glow.source),
            audioFxLinks.glow.threshold,
            audioFxLinks.glow.mode,
            audioFxLinks.glow.amount,
          )
        : 0
      const strobeBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(spectrumLevels, audioFxLinks.strobe.source),
            audioFxLinks.strobe.threshold,
            audioFxLinks.strobe.mode,
            audioFxLinks.strobe.amount,
          )
        : 0
      const shakeBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(spectrumLevels, audioFxLinks.shake.source),
            audioFxLinks.shake.threshold,
            audioFxLinks.shake.mode,
            audioFxLinks.shake.amount,
          )
        : 0
      const brightnessBoost = linksActive
        ? getReactiveAmount(
            getSpectrumSourceLevel(spectrumLevels, audioFxLinks.brightness.source),
            audioFxLinks.brightness.threshold,
            audioFxLinks.brightness.mode,
            audioFxLinks.brightness.amount,
          )
        : 0

      const base = {
        ...masterFx,
        glow: Math.min(1, masterFx.glow + glowBoost * 0.78),
        strobe: Math.min(1, masterFx.strobe + strobeBoost * 0.52),
        shake: Math.min(1, masterFx.shake + shakeBoost * 0.62),
        brightness: Math.min(2, masterFx.brightness + brightnessBoost * 0.58),
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
    [masterFx, spectrumLevels, audioFxLinks, safeMode, energySystemEnabled],
  )

  useEffect(() => {
    const nextState = buildOutputState({
      layers: effectiveLayers,
      masterFx: effectiveMasterFx,
      blackout,
      bassLevel,
      spectrumLevels,
      energySystemEnabled,
      smoothedEnergyFx,
      energyStrobeCount: energyFxMapping.strobeCount,
      energyState: activeEnergyState,
      energyIntensity: activeEnergyIntensity,
      smoothedDropFx,
      dropStrobeCount: dropSystem.dropStrobeCount,
    })
    window.scalezApi?.publishOutputState?.(nextState)
  }, [effectiveLayers, effectiveMasterFx, blackout, bassLevel, spectrumLevels, energySystemEnabled, smoothedEnergyFx, energyFxMapping.strobeCount, activeEnergyState, activeEnergyIntensity, smoothedDropFx, dropSystem.dropStrobeCount])

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
              saveShow(name, midiState.getMappings(), buildAppSettings())
              setSavedShows(getSavedShows())
            }}
            onLoadShow={(name) => {
              const result = loadShow(name)
              if (result?.appSettings) {
                applyAppSettings(result.appSettings)
              }
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
          {/* Beat-sync toggle — quantizes clip triggers to beat grid on drop/peak */}
          <button
            type="button"
            className={`pill${beatSyncEnabled ? ' is-active' : ''}`}
            onClick={() => setBeatSyncEnabled((v) => !v)}
            title={bpm ? `Beat-sync: trigger clips on beat at drop/peak (${bpm} BPM)` : 'Tap a BPM first to use beat-sync'}
            disabled={!bpm}
          >
            ⏱ Beat Sync
          </button>
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
          <button
            type="button"
            className={`pill${showSettings ? ' is-active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
          >
            ⚙ Settings
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => window.scalezApi?.openDevTools()}
            title="Open DevTools for this window"
          >
            DevTools
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => window.scalezApi?.openControlDevTools?.()}
            title="Open DevTools for Control window"
          >
            DevTools Control
          </button>
          <button
            type="button"
            className="pill"
            onClick={() => window.scalezApi?.openOutputDevTools?.()}
            title="Open DevTools for Output window"
          >
            DevTools Output
          </button>
        </div>
      </header>

      <OutputPreview
        layers={effectiveLayers}
        fps={fps}
        bassLevel={bassLevel}
        spectrumLevels={spectrumLevels}
        spectrumBins={spectrumBins}
        masterFx={effectiveMasterFx}
        blackout={blackout}
        showOverlays
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
      />

      {!hasAnyLoadedClip && (
        <p className="empty-guidance panel-glass">Load a clip into any slot to begin.</p>
      )}

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
              isFocused={focusedLayer === layer.layerIndex}
              spectrumRef={spectrumLevelsRef}
              cueMode={cueMode}
              cuedSlotIndex={cuedSlots[layer.layerIndex] ?? null}
              midiFlashSlots={midiFlashSlots}
              audioLink={layerAudioLinks[layer.layerIndex] || { amount: 0, threshold: 0.12, mode: 'normal', source: 'low' }}
              videoMotion={uiVideoMotion}
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
              onRebuildReverseCache={rebuildLayerReverseCache}
            />
          )
        })}
      </section>

      <MasterFxPanel
        masterFx={masterFx}
        blackout={blackout}
        onFxChange={setFxValue}
        onToggleBlackout={() => setBlackout((current) => !current)}
        onReset={resetFx}
        safeMode={safeMode}
        onSafeModeChange={setSafeMode}
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

      {showTestMode && (
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
          <SettingsPanel onClose={() => setShowSettings(false)} />
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
  return mode === 'output' ? <OutputShell /> : <ControlShell />
}
