import { useEffect, useState } from 'react'

export const DEFAULT_MASTER_FX = {
  glow: 0.25,
  strobe: 0,
  shake: 0,
  brightness: 1,
}

export function buildOutputState({ layers, masterFx, blackout, bassLevel = 0.2, spectrumLevels = null }) {
  return {
    layers,
    masterFx,
    blackout,
    audio: {
      bassLevel,
      spectrumLevels: spectrumLevels || { full: bassLevel, low: bassLevel, mid: 0, high: 0 },
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
