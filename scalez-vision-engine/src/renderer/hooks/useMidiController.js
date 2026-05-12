import { useState, useEffect, useRef, useCallback } from 'react'

const MIDI_DEVICE_KEY = 'scalez.midi.lastDeviceId'

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

export function useMidiController() {
  const [midiAvailable, setMidiAvailable] = useState(false)
  const [hasPermission, setHasPermission] = useState(false)
  const [midiInputs, setMidiInputs] = useState([])
  const [selectedInput, setSelectedInput] = useState(null)
  const [isLearning, setIsLearning] = useState(false)
  const [learnMode, setLearnMode] = useState(null)
  const [learnConfig, setLearnConfig] = useState(null)
  const [mappings, setMappings] = useState({})
  const midiAccessRef = useRef(null)
  const inputsRef = useRef({})
  const learnResolverRef = useRef(null)
  const isLearningRef = useRef(false)
  const mappingsRef = useRef({})
  const selectedInputRef = useRef(null)

  // mappingsRef stays in sync so MIDI handlers never close over stale values
  useEffect(() => { mappingsRef.current = mappings }, [mappings])

  // ---------------------------------------------------------------------------
  // attachMidiListener: detaches any existing onmidimessage handler on the
  // previously selected input, then attaches a new handler to the target device.
  //
  // The handler dispatches a 'midi-command' CustomEvent on window so that
  // ControlShell's useEffect listener can respond without any prop drilling.
  // Using a ref-stable callback avoids stale closure issues in updateInputList
  // and selectInput, which are both defined with empty/stable dep arrays.
  // ---------------------------------------------------------------------------
  const attachMidiListener = useCallback((deviceId, inputsMap) => {
    const inputs = inputsMap || inputsRef.current

    // Detach listener from the previously selected input (if any).
    const prevId = selectedInputRef.current
    if (prevId && prevId !== deviceId && inputs[prevId]) {
      inputs[prevId].onmidimessage = null
    }

    const input = inputs[deviceId]
    if (!input) {
      return
    }

    input.onmidimessage = (event) => {
      const [status, data1, data2] = event.data
      const type = status >> 4
      const channel = status & 0x0f

      // Only handle note-on (0x9) and control-change (0xB) messages.
      if (type !== 0x9 && type !== 0xB) {
        return
      }

      const midiKey = type === 0xB ? `cc_${data1}` : `note_${data1}`
      const midiValue = data2

      // In learn mode: resolve the pending promise and record the mapping.
      if (isLearningRef.current && learnResolverRef.current) {
        const resolver = learnResolverRef.current
        learnResolverRef.current = null
        isLearningRef.current = false
        resolver({ midiKey, midiValue, type: type === 0x9 ? 'button' : 'knob' })
        return
      }

      // Normal mode: look up the mapping and dispatch a command event.
      const mapping = mappingsRef.current[midiKey]
      if (!mapping) {
        return
      }

      window.dispatchEvent(
        new CustomEvent('midi-command', {
          detail: { mapping, midiValue, midiKey },
        }),
      )
    }
  }, []) // stable — reads from refs, never needs to close over state

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
  }, [attachMidiListener])

  // Check Web MIDI support
  useEffect(() => {
    const checkMidiSupport = async () => {
      if (navigator.requestMIDIAccess) {
        setMidiAvailable(true)
        try {
          const access = await navigator.requestMIDIAccess({ sysex: false })
          midiAccessRef.current = access
          setHasPermission(true)
          updateInputList(access)

          access.addEventListener('statechange', () => {
            updateInputList(access)
          })
        } catch {
          setHasPermission(false)
        }
      }
    }
    checkMidiSupport()
  }, [updateInputList])

  // Request MIDI permission
  const requestPermission = useCallback(async () => {
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false })
      midiAccessRef.current = access
      setHasPermission(true)
      updateInputList(access)

      access.addEventListener('statechange', () => {
        updateInputList(access)
      })

      return true
    } catch (err) {
      console.error('MIDI access denied:', err)
      setHasPermission(false)
      return false
    }
  }, [updateInputList])

  // Set selected input and attach listener
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

  // Start learn mode
  const startLearn = useCallback((type, config) => {
    isLearningRef.current = true
    setIsLearning(true)
    setLearnMode(type)
    setLearnConfig(config)

    return new Promise((resolve) => {
      learnResolverRef.current = (result) => {
        resolve(result)
      }
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
    setMappings((prev) => {
      const next = { ...prev }

      if (mapping?.action && mapping.action !== 'clip-slot') {
        Object.entries(next).forEach(([existingKey, existingMapping]) => {
          if (existingKey !== midiKey && existingMapping?.action === mapping.action) {
            delete next[existingKey]
          }
        })
      }

      next[midiKey] = mapping
      return next
    })
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
    if (!loadedMappings || typeof loadedMappings !== 'object') return
    setMappings((prev) => (areMappingsEqual(prev, loadedMappings) ? prev : loadedMappings))
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
