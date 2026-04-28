import { useState, useEffect, useRef, useCallback } from 'react'

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
  // Refs hold current values so the onmidimessage closure never goes stale
  const isLearningRef = useRef(false)
  const mappingsRef = useRef({})

  // Keep refs in sync with state so MIDI handlers never close over stale values
  useEffect(() => { isLearningRef.current = isLearning }, [isLearning])
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
  }, [])

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

  // Set selected input and attach listener — uses refs to avoid stale closures
  const selectInput = useCallback((deviceId) => {
    const input = inputsRef.current[deviceId]
    if (!input) return

    setSelectedInput(deviceId)

    // Attach MIDI message listener — reads from refs, never stale
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

      if (!midiKey) return

      // If in learn mode, capture first event and resolve the promise
      if (isLearningRef.current && learnResolverRef.current) {
        learnResolverRef.current({ midiKey, midiValue })
        learnResolverRef.current = null
        return
      }

      // Execute mapped command using latest mappings from ref
      const currentMappings = mappingsRef.current
      if (currentMappings[midiKey]) {
        const mapping = currentMappings[midiKey]
        const event2 = new CustomEvent('midi-command', {
          detail: { mapping, midiKey, midiValue },
        })
        window.dispatchEvent(event2)
      }
    }
  }, []) // no deps — uses refs internally

  // Start learn mode - wait for next MIDI event
  const startLearn = useCallback((type, config) => {
    setIsLearning(true)
    setLearnMode(type)
    setLearnConfig(config)

    return new Promise((resolve) => {
      learnResolverRef.current = resolve
    })
  }, [])

  // Stop learn mode
  const stopLearn = useCallback(() => {
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
