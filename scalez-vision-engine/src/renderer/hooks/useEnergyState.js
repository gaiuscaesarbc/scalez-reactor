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
  spectrumBins = [],
  performanceMode = false,
  enabled = true,
  safeMode = false,
}) {
  const [energyState, setEnergyState] = useState('calm')
  const [energyIntensity, setEnergyIntensity] = useState(0)
  const [energyMetrics, setEnergyMetrics] = useState({ rel: 1, shortAvg: 0, longAvg: 0, sectionScore: 0 })
  const lastIntensityRef = useRef(0)
  const metricsRef = useRef({ rel: 1, shortAvg: 0, longAvg: 0, sectionScore: 0, flux01: 0, brightness: 0, bassRel: 0 })
  // Refs for props that create new object/array references on every parent render.
  // The main analysis effect reads from these refs instead of the props directly,
  // avoiding "dependency changes on every render" infinite-loop errors.
  const spectrumLevelsRef = useRef(spectrumLevels)
  const spectrumBinsRef   = useRef(spectrumBins)

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
  const startupTimeRef = useRef(0)
  const silenceFramesRef = useRef(0)

  // Candidate frame counters — now decay (not hard reset) to prevent flickering
  const peakCandidateFramesRef = useRef(0)

  const buildCandidateFramesRef = useRef(0)
  const dropCandidateFramesRef = useRef(0)

  // Spectral analysis refs
  const prevBinsRef = useRef(null)     // previous frame bins for flux computation
  const smoothFluxRef = useRef(0)      // smoothed spectral flux (0–1 normalized)
  const brightnessRef = useRef(0.5)    // smoothed spectral brightness (upper-freq ratio)
  const bassShortRef = useRef(0)       // fast EMA of low band (~2-3 frames) for transient detection
  const bassLongRef = useRef(0)        // medium EMA of low band (~15 frames) baseline

  // Keep spectrumLevels/spectrumBins refs in sync without triggering the main analysis.
  useEffect(() => { spectrumLevelsRef.current = spectrumLevels }, [spectrumLevels])
  useEffect(() => { spectrumBinsRef.current   = spectrumBins   }, [spectrumBins])

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
    prevBinsRef.current = null
    smoothFluxRef.current = 0
    brightnessRef.current = 0.5
    bassShortRef.current = 0
    bassLongRef.current = 0
  }

  useEffect(() => {
    startupTimeRef.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) {
      resetAllRefs(Date.now())
      setEnergyState('calm')
      setEnergyIntensity(0)
      return
    }

    const now = Date.now()

    // Full mix for general energy; low band for drop/bass hits
    // Read from refs to avoid depending on object identity of the props.
    const sl = spectrumLevelsRef.current
    const fullBand = sl?.full ?? bassLevel
    const lowBand = Math.max(
      sl?.sub ?? 0,
      sl?.low ?? 0,
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

    // High-water mark: tracks recent peak energy, decays slowly (~3s)
    highWaterRef.current = Math.max(highWaterRef.current * 0.991, shortAvg)
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

    // ── Spectral flux ─────────────────────────────────────────────────────────
    // Measures frame-to-frame change across all frequency bins.
    // High flux = onset, transient, drop hit. Low flux = sustained/calm.
    const bins = Array.isArray(spectrumBinsRef.current) ? spectrumBinsRef.current : []
    const prevBins = prevBinsRef.current
    let rawFlux = 0
    if (bins.length > 0 && prevBins?.length === bins.length) {
      let diffSum = 0
      for (let i = 0; i < bins.length; i++) diffSum += Math.abs(bins[i] - prevBins[i])
      rawFlux = diffSum / bins.length
    }
    prevBinsRef.current = bins.length > 0 ? bins.slice() : null
    // Smooth flux and normalize (0.06 ≈ typical heavy-onset flux at 24fps/64-bin)
    smoothFluxRef.current = smoothFluxRef.current * 0.72 + rawFlux * 0.28
    const flux01 = Math.min(1, smoothFluxRef.current / 0.06)

    // ── Spectral brightness ───────────────────────────────────────────────────
    // Ratio of upper-frequency energy (mid + presence + high) vs total.
    // Rises during builds; collapses when a drop hits heavy sub-bass.
    const midBand      = sl?.mid ?? 0
    const presenceBand = sl?.presence ?? 0
    const highBand     = sl?.high ?? 0
    const rawBrightness = (midBand + presenceBand + highBand) / (Math.max(fullBand, 0.01) * 3)
    const prevBrightness = brightnessRef.current
    brightnessRef.current = prevBrightness * 0.88 + rawBrightness * 0.12
    const brightness = brightnessRef.current
    // isBrightnessRising: raw frame is pulling the smoothed average upward
    const isBrightnessRising = rawBrightness > prevBrightness + 0.025

    // ── Bass transient detector ───────────────────────────────────────────────
    // Short EMA vs medium EMA of the low band. A spike (bassRel > 1.3) signals
    // a kick or sub-bass hit — the defining EDM drop signature.
    bassShortRef.current = bassShortRef.current * 0.65 + lowEnergy * 0.35  // ~2-3 frames
    bassLongRef.current  = bassLongRef.current  * 0.94 + lowEnergy * 0.06  // ~15 frames
    const bassRel = bassShortRef.current / Math.max(bassLongRef.current, 0.04)

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
      // flux01 >= 0.30 = clear spectral burst => lower sectionScore bar
      const peakFluxBoost = flux01 >= 0.30 ? 0.06 : 0
      const peakCandidate = wasPeak
        ? rel >= 1.08 && shortAvg >= 0.34 && fullEnergy >= 0.52 && sectionScore >= 0.42
        : rel >= 1.14 && shortAvg >= 0.38 && fullEnergy >= 0.55 && sectionScore >= (0.48 - peakFluxBoost)

      // Build: rising loudness OR spectral brightness climbing (more highs/mids = tonal build-up)
      const buildCandidate =
        (isRising || isBrightnessRising) &&
        rel >= 1.07 &&
        shortAvg >= 0.27 &&
        fullEnergy >= 0.36 &&
        sectionScore >= 0.40

      // Drop path A: energy cliff below high-water mark
      const dropCliff =
        hadRecentHighEnergy &&
        highWater >= 0.26 &&
        shortAvg < highWater * 0.75 &&
        sectionScore >= 0.10

      // Drop path B: bass transient + brightness collapse (EDM kick-drop signature)
      const dropBassHit =
        hadRecentHighEnergy &&
        bassRel >= 1.30 &&
        brightness < 0.52 &&
        sectionScore >= 0.14

      const dropCandidate = dropCliff || dropBassHit

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
        hadRecentHighEnergy
      ) {
        // Drop after any high-energy state (energy cliff)
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

    const nextMetrics = { rel, shortAvg, longAvg, sectionScore, flux01, brightness, bassRel }
    const prevMetrics = metricsRef.current
    const metricsChanged =
      Math.abs(nextMetrics.rel - (prevMetrics.rel ?? 0)) >= 0.02
      || Math.abs(nextMetrics.shortAvg - (prevMetrics.shortAvg ?? 0)) >= 0.015
      || Math.abs(nextMetrics.longAvg - (prevMetrics.longAvg ?? 0)) >= 0.015
      || Math.abs(nextMetrics.sectionScore - (prevMetrics.sectionScore ?? 0)) >= 0.015
      || Math.abs(nextMetrics.flux01 - (prevMetrics.flux01 ?? 0)) >= 0.03
      || Math.abs(nextMetrics.brightness - (prevMetrics.brightness ?? 0)) >= 0.03
      || Math.abs(nextMetrics.bassRel - (prevMetrics.bassRel ?? 0)) >= 0.04

    if (metricsChanged) {
      metricsRef.current = nextMetrics
      setEnergyMetrics(nextMetrics)
    }
  }, [bassLevel, enabled])

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
