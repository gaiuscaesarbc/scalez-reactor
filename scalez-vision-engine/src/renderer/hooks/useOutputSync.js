import { useEffect, useState } from 'react'

export const DEFAULT_MASTER_FX = {
  strobe: 0,
  shake: 0,
  brightness: 1,
}

function sanitizeOutputLayers(layers) {
  if (!Array.isArray(layers)) {
    return []
  }

  return layers.map((layer) => {
    const activeSlotIndex = typeof layer?.activeSlotIndex === 'number' ? layer.activeSlotIndex : null
    const activeSlot = activeSlotIndex !== null ? layer?.slots?.[activeSlotIndex] : null
    const activeInvalid = !activeSlot
      || !activeSlot.filePath
      || activeSlot.status === 'missing'
      || activeSlot.status === 'failed'
      || activeSlot.status === 'unsupported'

    return activeInvalid && activeSlotIndex !== null
      ? { ...layer, activeSlotIndex: null }
      : layer
  })
}

export function buildOutputState({
  layers,
  masterFx,
  blackout,
  bassLevel = 0.2,
  spectrumLevels = null,
  spectrumBins = [],
  bpm = 140,
  energySystemEnabled = false,
  smoothedEnergyFx = null,
  energyStrobeCount = 0,
  energyState = 'calm',
  energyIntensity = 0,
  smoothedDropFx = null,
  dropStrobeCount = 0,
  generatedQualityMode = 'performance',
  generatedMaxFps = 45,
  performanceOutputMode = true,
}) {
  const sanitizedLayers = sanitizeOutputLayers(layers)

  return {
    layers: sanitizedLayers,
    masterFx,
    blackout,
    audio: {
      bassLevel,
      spectrumLevels: spectrumLevels || {
        full: bassLevel,
        sub: bassLevel,
        low: bassLevel,
        lowMid: 0,
        mid: 0,
        presence: 0,
        high: 0,
      },
      spectrumBins: Array.isArray(spectrumBins) ? spectrumBins : [],
    },
    rendering: {
      generatedQualityMode,
      generatedMaxFps: Number.isFinite(generatedMaxFps) ? generatedMaxFps : 45,
      performanceOutputMode: performanceOutputMode !== false,
    },
    tempo: {
      bpm: Number.isFinite(bpm) ? bpm : 140,
    },
    energy: {
      enabled: energySystemEnabled,
      smoothedFx: smoothedEnergyFx || { glowBoost: 0, shakeIntensity: 0, brightnessBoost: 0 },
      strobeCount: energyStrobeCount,
      state: energyState,
      intensity: energyIntensity,
    },
    drop: {
      smoothedFx: smoothedDropFx || { glowBoost: 0, shakeIntensity: 0, brightnessBoost: 0 },
      strobeCount: dropStrobeCount,
    },
    updatedAt: Date.now(),
  }
}

export function useOutputStateSubscription() {
  const [outputState, setOutputState] = useState(null)

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.scalezApi?.onOutputStateUpdate?.((nextState) => {
      if (!disposed && nextState) {
        setOutputState(nextState)
      }
    })

    window.scalezApi
      ?.getOutputState?.()
      .then((initialState) => {
        if (!disposed && initialState) {
          setOutputState(initialState)
        }
      })
      .catch(() => {
        // Keep output window alive even if sync channel is temporarily unavailable.
      })

    return () => {
      disposed = true
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [])

  return outputState
}
