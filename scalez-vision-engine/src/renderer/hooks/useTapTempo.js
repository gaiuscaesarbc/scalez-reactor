import { useState, useRef, useCallback } from 'react'

const MAX_TAPS = 8
const RESET_THRESHOLD_MS = 2000 // Reset if gap between taps > 2 seconds

export function useTapTempo() {
  const [bpm, setBpm] = useState(null)
  const tapTimesRef = useRef([])
  const lastTapTimeRef = useRef(0)  // exposed for beat-sync quantization

  const tap = useCallback(() => {
    const now = performance.now()
    const taps = tapTimesRef.current

    // Reset if too long since last tap
    if (taps.length > 0 && now - taps[taps.length - 1] > RESET_THRESHOLD_MS) {
      tapTimesRef.current = []
    }

    tapTimesRef.current.push(now)
    lastTapTimeRef.current = now

    // Keep only the last MAX_TAPS taps
    if (tapTimesRef.current.length > MAX_TAPS) {
      tapTimesRef.current = tapTimesRef.current.slice(-MAX_TAPS)
    }

    // Need at least 2 taps to compute BPM
    const current = tapTimesRef.current
    if (current.length < 2) return

    // Average the intervals
    let totalInterval = 0
    for (let i = 1; i < current.length; i++) {
      totalInterval += current[i] - current[i - 1]
    }
    const avgIntervalMs = totalInterval / (current.length - 1)
    const computed = Math.round(60000 / avgIntervalMs)

    // Clamp to reasonable BPM range
    setBpm(Math.min(300, Math.max(20, computed)))
  }, [])

  const reset = useCallback(() => {
    tapTimesRef.current = []
    lastTapTimeRef.current = 0
    setBpm(null)
  }, [])

  return { bpm, tap, reset, lastTapTimeRef }
}
