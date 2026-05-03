import { useEffect, useRef, useState } from 'react'

/**
 * Energy System: Derives performance state (Calm/Build/Drop/Peak) from audio levels.
 *
 * Uses short-window vs long-window relative energy so state transitions are based on
 * "is this louder than the last few seconds" rather than fixed absolute thresholds.
 *
 * v2 improvements:
 * - Much stricter peak/build thresholds + more confirmation frames to prevent false positives
 * - High-watermark drop detection: fires on real energy cliff, not just isFalling delta
 * - Longer hold times + decaying frame counters to kill flickering
 * - Per-state intensity weighting so values match perceived energy
 * - Hysteresis: peak cannot jump directly to calm â€” must route through build or drop
 */
export function useEnergyState({
  bassLevel = 0,
  spectrumLevels = {},
  performanceMode = false,
  enabled = true,
  safeMode = false,
}) {
  const [energyState, setEnergyState] = useState('calm')
  const [energyIntensity, setEnergyIntensity] = useState(0)
  const [energyMetrics, setEnergyMetrics] = useState({ rel: 1, shortAvg: 0, longAvg: 0, sectionScore: 0 })
  const lastIntensityRef = useRef(0)

  // Short window: ~0.5s average (slightly slower than v1 to reduce noise)
  const shortAvgRef = useRef(0)
  // Long window: ~9s average (much slower â€” tracks section baseline more stably)
  const longAvgRef = useRef(0)
  // High-water mark: recent peak energy, decays ~1.5s â€” used for drop cliff detection
  const highWaterRef = useRef(0)

  const lastStateChangeTimeRef = useRef(0)
  const lastEnergyStateRef = useRef('calm')
  const lastPeakTimeRef = useRef(0)
  const prevShortAvgRef = useRef(0)
  const startupTimeRef = useRef(Date.now())
  const silenceFramesRef = useRef(0)

  // Candidate frame counters â€” now decay (not hard reset) to prevent flickering
  const peakCandidateFramesRef = useRef(0)
  const buildCandidateFramesRef = useRef(0)
  const dropCandidateFramesRef = useRef(0)

  // Minimum time each state must hold before it can transition away.
  // Much longer than v1 to kill rapid flickering.
  const STATE_HOLD_MS = {
    calm: 1000,
    build:  800,
    drop:   700,
    peak:  1100,
  }

  function resetAllRefs(now) {
    shortAvgRef.current = 0
    longAvgRef.current = 0
    highWaterRef.current = 0
    prevShortAvgRef.current = 0
    lastStateChangeTimeRef.current = now ?? 0
    lastPeakTimeRef.current = 0
    lastEnergyStateRef.current = 'calm'
    lastIntensityRef.current = 0
    startupTimeRef.current = now ?? Date.now()
    silenceFramesRef.current = 0
    peakCandidateFramesRef.current = 0
    buildCandidateFramesRef.current = 0
    dropCandidateFramesRef.current = 0
  }

  useEffect(() => {
    if (!enabled) {
      resetAllRefs(Date.now())
      setEnergyState('calm')
      setEnergyIntensity(0)
      return
    }

    const now = Date.now()

    // Full mix for general energy; low band for drop/bass hits
    const fullBand = spectrumLevels?.full ?? bassLevel
    const lowBand = Math.max(
      spectrumLevels?.sub ?? 0,
      spectrumLevels?.low ?? 0,
      bassLevel,
    )

    // Mild compression to preserve separation without pinning the scale
    const fullEnergy = Math.min(1, Math.pow(Math.max(0, fullBand), 1.05))
    const lowEnergy  = Math.min(1, Math.pow(Math.max(0, lowBand),  0.95))
    // 80% full mix, 20% low-end â€” better than v1's 88/12 for EDM drops
    const energy = fullEnergy * 0.80 + lowEnergy * 0.20

    // â”€â”€ Silence / recalibration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (energy < 0.035) {
      silenceFramesRef.current += 1
    } else {
      const needsCalibration =
        longAvgRef.current <= 0.001 ||
        shortAvgRef.current <= 0.001 ||
        silenceFramesRef.current >= 18

      if (needsCalibration) {
        shortAvgRef.current = energy
        longAvgRef.current = Math.max(energy, 0.08)
        highWaterRef.current = energy
        prevShortAvgRef.current = energy
        lastStateChangeTimeRef.current = now
        lastPeakTimeRef.current = 0
        lastEnergyStateRef.current = 'calm'
        startupTimeRef.current = now
        silenceFramesRef.current = 0
        peakCandidateFramesRef.current = 0
        buildCandidateFramesRef.current = 0
        dropCandidateFramesRef.current = 0
        if (energyState !== 'calm') setEnergyState('calm')
      } else {
        silenceFramesRef.current = 0
      }
    }

    // â”€â”€ Moving averages â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Short: ~0.5s (Î±=0.16 at ~24fps)
    shortAvgRef.current = shortAvgRef.current * 0.84 + energy * 0.16
    // Long: ~9s  (Î±=0.003 at ~24fps)
    longAvgRef.current  = longAvgRef.current  * 0.997 + energy * 0.003

    const shortAvg = shortAvgRef.current
    const longAvg  = Math.max(longAvgRef.current, 0.06)
    const prevShort = prevShortAvgRef.current
    prevShortAvgRef.current = shortAvg

    // High-water mark: tracks recent peak energy, decays slowly (~1.5s)
    highWaterRef.current = Math.max(highWaterRef.current * 0.982, shortAvg)
    const highWater = highWaterRef.current

    // â”€â”€ Derived signals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const rel = shortAvg / longAvg
    // Normalize rel: 1.0 = neutral, 1.0â†’1.45 maps to 0â†’1
    const relNormalized = Math.min(1, Math.max(0, (rel - 0.95) / 0.50))
    // Section score: blend of absolute level and relative lift
    const sectionScore = shortAvg * 0.70 + relNormalized * 0.30

    const delta   = shortAvg - prevShort
    const isRising  = delta >  0.0022
    const isFalling = delta < -0.0022

    const currentState   = lastEnergyStateRef.current
    const holdMs         = STATE_HOLD_MS[currentState] ?? 1000
    const heldLongEnough = now - lastStateChangeTimeRef.current >= holdMs

    let nextState = currentState

    // Extra warm-up (2.5s) so long-window baseline stabilises before classifying
    const isWarmedUp = now - startupTimeRef.current >= 2500

    if (heldLongEnough && isWarmedUp) {
      const wasPeak   = currentState === 'peak'
      const wasBuild  = currentState === 'build'
      const wasDrop   = currentState === 'drop'
      const hadRecentHighEnergy =
        now - lastPeakTimeRef.current < 3500 ||
        wasPeak || wasBuild || wasDrop

      // â”€â”€ PEAK candidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Staying in peak: looser (already there)
      // Entering peak: strict â€” requires strong absolute + strong relative lift
      const peakCandidate = wasPeak
        ? rel >= 1.10 && shortAvg >= 0.40 && fullEnergy >= 0.60 && sectionScore >= 0.58
        : rel >= 1.22 && shortAvg >= 0.46 && fullEnergy >= 0.66 && sectionScore >= 0.64

      // â”€â”€ BUILD candidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Must be actively rising with moderate song energy
      const buildCandidate =
        isRising &&
        rel >= 1.07 &&
        shortAvg >= 0.27 &&
        fullEnergy >= 0.36 &&
        sectionScore >= 0.40

      // â”€â”€ DROP candidate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // Real energy cliff: current level fell significantly below recent peak.
      // Does NOT require isFalling (tiny per-frame delta) â€” compares to highWater.
      const dropCandidate =
        hadRecentHighEnergy &&
        highWater >= 0.32 &&
        shortAvg < highWater * 0.68 &&
        sectionScore >= 0.16  // still some energy (not just falling silent)

      // â”€â”€ Accumulate / decay (prevents hard-reset flicker) â”€â”€â”€â”€â”€â”€â”€â”€â”€
      peakCandidateFramesRef.current  = peakCandidate
        ? Math.min(12, peakCandidateFramesRef.current + 1)
        : Math.max(0,  peakCandidateFramesRef.current - 1)

      buildCandidateFramesRef.current = buildCandidate
        ? Math.min(12, buildCandidateFramesRef.current + 1)
        : Math.max(0,  buildCandidateFramesRef.current - 1)

      dropCandidateFramesRef.current  = dropCandidate
        ? Math.min(8,  dropCandidateFramesRef.current  + 1)
        : Math.max(0,  dropCandidateFramesRef.current  - 1)

      // â”€â”€ Priority-ordered transitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (peakCandidateFramesRef.current >= (wasPeak ? 2 : 6)) {
        // Enough sustained evidence for peak
        nextState = 'peak'
        lastPeakTimeRef.current = now

      } else if (
        dropCandidateFramesRef.current >= 3 &&
        (wasPeak || wasBuild)
      ) {
        // Drop immediately after peak or build (energy cliff)
        nextState = 'drop'

      } else if (buildCandidateFramesRef.current >= 5) {
        // Build requires 5 frames of sustained upward momentum
        nextState = 'build'

      } else if (wasPeak) {
        // â”€â”€ Peak hysteresis: cannot jump directly to calm â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Must route through build or drop first.
        if (shortAvg < highWater * 0.72 && shortAvg >= 0.18) {
          nextState = 'drop'
        } else if (shortAvg >= 0.24 && !isFalling) {
          nextState = 'build'
        }
        // else: hold in peak until hold time allows calm

      } else if (
        shortAvg < 0.16 ||
        (sectionScore < 0.24 && rel < 1.01 && !isRising)
      ) {
        // Calm: genuinely low energy, well settled
        nextState = 'calm'
      }
    }

    if (nextState !== currentState) {
      setEnergyState(nextState)
      lastEnergyStateRef.current = nextState
      lastStateChangeTimeRef.current = now
      if (nextState !== 'peak')  peakCandidateFramesRef.current  = 0
      if (nextState !== 'build') buildCandidateFramesRef.current = 0
      if (nextState !== 'drop')  dropCandidateFramesRef.current  = 0
    }

    // â”€â”€ Intensity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Per-state base + dynamic component from sectionScore.
    // This makes intensity meaningful within each state rather than a flat scale.
    const STATE_INTENSITY_BASE   = { calm: 0, build: 0.22, drop: 0.52, peak: 0.70 }
    const dynamicScore = Math.min(1, Math.max(0, (sectionScore - 0.18) / 0.54))
    const dynamicSpread = 0.32
    const stateBase = STATE_INTENSITY_BASE[nextState] ?? 0
    const intensity = Math.min(1, stateBase + dynamicScore * dynamicSpread)

    if (Math.abs(intensity - lastIntensityRef.current) >= 0.012) {
      lastIntensityRef.current = intensity
      setEnergyIntensity(intensity)
    }

    setEnergyMetrics({ rel, shortAvg, longAvg, sectionScore })
  }, [bassLevel, spectrumLevels, enabled])

  // Return FX recommendations based on energy state
  const getEnergyFxRecommendation = () => {
    if (!enabled || performanceMode) {
      return { glowBoost: 0, strobeActive: false, shakeAmount: 0, brightnessBoost: 0 }
    }

    switch (energyState) {
      case 'calm':
        return { glowBoost: 0, strobeActive: false, shakeAmount: 0, brightnessBoost: 0 }
      case 'build':
        return {
          glowBoost: energyIntensity * 0.3,
          strobeActive: false,
          shakeAmount: energyIntensity * 0.15,
          brightnessBoost: energyIntensity * 0.1,
        }
      case 'drop':
        return {
          glowBoost: energyIntensity * 0.6,
          strobeActive: !safeMode && energyIntensity > 0.5,
          shakeAmount: energyIntensity * 0.4,
          brightnessBoost: energyIntensity * 0.25,
        }
      case 'peak':
        return {
          glowBoost: 1.0,
          strobeActive: false,
          shakeAmount: !safeMode ? energyIntensity * 0.5 : 0,
          brightnessBoost: energyIntensity * 0.3,
        }
      default:
        return { glowBoost: 0, strobeActive: false, shakeAmount: 0, brightnessBoost: 0 }
    }
  }

  return { energyState, energyIntensity, energyMetrics, getEnergyFxRecommendation }
}
