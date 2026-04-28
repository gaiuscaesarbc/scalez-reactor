import { useState, useEffect, useRef, useCallback } from 'react'

const MIDI_DEVICE_KEY = 'scalez.midi.lastDeviceId'

export function useMidiController() {
  const [midiAvailable, setMidiAvailable] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [midiInputs, setMidiInputs] = useState([])
  const [selectedInput, setSelectedInput] = useState(null)
  const [isLearning, setIsLearning] = useState(false)
  const [learnMode, setLearnMode] = useState(null) // 'button', 'knob', etc
  const [learnConfig, setLearnConfig] = useState(null)
  const [mappings, setMappings] = useState({}) // { midiKey: { type, action, layerIndex?, slotIndex?, ... } }
  const midiAccessRef = useRef(null)
  const inputsRef = useRef({})
  const learnResolverRef = useRef(null)
  // Refs hold current values so the onmidimessage closure never goes stale.
  // isLearningRef is set synchronously (not via useEffect) to prevent a
  // race where a fast MIDI press arrives before React flushes the effect.
  const isLearningRef = useRef(false)
  const mappingsRef = useRef({})
  const selectedInputRef = useRef(null)

  // mappingsRef stays in sync so MIDI handlers never close over stale values
  useEffect(() => { mappingsRef.current = mappings }, [mappings])

  // Check Web MIDI support
  useEffect(() => {
    const checkMidiSupport = async () => {
      if (navigator.requestMIDIAccess) {
        setMidiAvailable(true)
        // Try to request without user prompt first
        try {
          const access = await navigator.requestMIDIAccess({ sysex: false })
          midiAccessRef.current = access
          setHasPermission(true)
          updateInputList(access)

          // Listen for device connection/disconnection
          access.addEventListener('statechange', (event) => {
            updateInputList(access)
          })
        } catch (err) {
          // Permission denied or not granted yet
          setHasPermission(false)
        }
      }
    }
    checkMidiSupport()
  }, [])

  const updateInputList = useCallback((access) => {
    const inputs = []
    const newInputsMap = {}

    for (const input of access.inputs.values()) {
      inputs.push({
        id: input.id,
        name: input.name || 'Unknown MIDI Input',
        manufacturer: input.manufacturer || '',
        state: input.state,
      })
      newInputsMap[input.id] = input
    }

    setMidiInputs(inputs)
    inputsRef.current = newInputsMap

    // Auto-reconnect: if we have a saved device and it's now available, select it.
    const savedId = localStorage.getItem(MIDI_DEVICE_KEY)
    if (savedId && newInputsMap[savedId] && selectedInputRef.current !== savedId) {
      attachMidiListener(savedId, newInputsMap)
      setSelectedInput(savedId)
      selectedInputRef.current = savedId
    }
  }, []) // attachMidiListener defined below via ref pattern — safe here

  // Request MIDI permission
  const requestPermission = useCallback(async () => {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      midiAccessRef.current = access
      setHasPermission(true)
      updateInputList(access)

      // Listen for device changes
      access.addEventListener('statechange', (event) => {
        updateInputList(access)
      })

      return true
    } catch (err) {
      console.error('MIDI access denied:', err)
      setHasPermission(false)
      return false
    }
  }, [updateInputList])

  // Attach the MIDI message handler to a specific device.
  // Uses refs only — safe to call from statechange callbacks without stale closures.
  const attachMidiListener = useCallback((deviceId, inputsMap) => {
    const map = inputsMap || inputsRef.current
    const input = map[deviceId]
    if (!input) {
      return
    }

    input.onmidimessage = (event) => {
      const [status, note, velocity] = event.data
      const isNoteOn = (status & 0xf0) === 0x90
      const isNoteOff = (status & 0xf0) === 0x80
      const isCC = (status & 0xf0) === 0xb0

      let midiKey
      let midiValue = null

      if (isNoteOn || isNoteOff) {
        midiKey = `note_${note}`
        midiValue = isNoteOn ? velocity : 0
      } else if (isCC) {
        midiKey = `cc_${note}`
        midiValue = velocity
      }

      if (!midiKey) {
        return
      }

      // If in learn mode, capture the first event and resolve the promise.
      // isLearningRef is set synchronously in startLearn so this is never stale.
      if (isLearningRef.current && learnResolverRef.current) {
        learnResolverRef.current({ midiKey, midiValue })
        learnResolverRef.current = null
        return
      }

      // Execute mapped command using latest mappings from ref
      const currentMappings = mappingsRef.current
      if (currentMappings[midiKey]) {
        const mapping = currentMappings[midiKey]
        const evt = new CustomEvent('midi-command', {
          detail: { mapping, midiKey, midiValue },
        })
        window.dispatchEvent(evt)
      }
    }
  }, [])

  // Set selected input and attach listener — persists choice for auto-reconnect
  const selectInput = useCallback((deviceId) => {
    attachMidiListener(deviceId)
    setSelectedInput(deviceId)
    selectedInputRef.current = deviceId
    try {
      localStorage.setItem(MIDI_DEVICE_KEY, deviceId)
    } catch {
      // ignore storage errors
    }
  }, [attachMidiListener])

  // Start learn mode — set isLearningRef synchronously so the onmidimessage
  // handler sees it immediately, even before React flushes the state update.
  const startLearn = useCallback((type, config) => {
    isLearningRef.current = true
    setIsLearning(true)
    setLearnMode(type)
    setLearnConfig(config)

    return new Promise((resolve) => {
      learnResolverRef.current = resolve
    })
  }, [])

  // Stop learn mode
  const stopLearn = useCallback(() => {
    isLearningRef.current = false
    setIsLearning(false)
    setLearnMode(null)
    setLearnConfig(null)
    learnResolverRef.current = null
  }, [])

  // Add or update a mapping
  const setMapping = useCallback((midiKey, mapping) => {
    setMappings((prev) => ({
      ...prev,
      [midiKey]: mapping,
    }))
  }, [])

  // Remove a specific mapping
  const clearMapping = useCallback((midiKey) => {
    setMappings((prev) => {
      const updated = { ...prev }
      delete updated[midiKey]
      return updated
    })
  }, [])

  // Clear all mappings
  const clearAllMappings = useCallback(() => {
    setMappings({})
  }, [])

  // Load mappings from show file
  const loadMappings = useCallback((loadedMappings) => {
    if (loadedMappings && typeof loadedMappings === 'object') {
      setMappings(loadedMappings)
    }
  }, [])

  // Export mappings for saving
  const getMappings = useCallback(() => {
    return mappings
  }, [mappings])

  // Get list of all mappings in readable format
  const getMappingsList = useCallback(() => {
    return Object.entries(mappings).map(([midiKey, mapping]) => ({
      midiKey,
      ...mapping,
    }))
  }, [mappings])

  return {
    midiAvailable,
    hasPermission,
    midiInputs,
    selectedInput,
    isLearning,
    learnMode,
    learnConfig,
    mappings,
    requestPermission,
    selectInput,
    startLearn,
    stopLearn,
    setMapping,
    clearMapping,
    clearAllMappings,
    loadMappings,
    getMappings,
    getMappingsList,
  }
}
