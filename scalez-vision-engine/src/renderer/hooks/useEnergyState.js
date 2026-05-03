import { useEffect, useRef, useState } from 'react'

/**
 * Energy System: Derives performance state (Calm/Build/Drop/Peak) from audio levels.
 *
 * Uses short-window vs long-window relative energy so state transitions are based on
 * "is this louder than the last few seconds" rather than fixed absolute thresholds.
 * Per-state hold times prevent rapid flickering between states.
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
  const lastIntensityRef = useRef(0)

  // Short window: ~0.4s average (reacts quickly to current moment)
  const shortAvgRef = useRef(0)
  // Long window: ~6s average (represents baseline of the track section)
  const longAvgRef = useRef(0)

  const lastStateChangeTimeRef = useRef(0)
  const lastEnergyStateRef = useRef('calm')
  const lastPeakTimeRef = useRef(0)
  const prevShortAvgRef = useRef(0)
  const startupTimeRef = useRef(Date.now())
  const silenceFramesRef = useRef(0)
  const peakCandidateFramesRef = useRef(0)
  const buildCandidateFramesRef = useRef(0)

    // Minimum time each state must hold before it can transition away.
  const STATE_HOLD_MS = {
    calm: 600,
    build: 400,
    drop: 300,
    peak: 600,
  }

  useEffect(() => {
    if (!enabled) {
      shortAvgRef.current = 0
      longAvgRef.current = 0
      prevShortAvgRef.current = 0
      lastStateChangeTimeRef.current = 0
      lastPeakTimeRef.current = 0
      lastEnergyStateRef.current = 'calm'
      lastIntensityRef.current = 0
      startupTimeRef.current = Date.now()
      silenceFramesRef.current = 0
      peakCandidateFramesRef.current = 0
      buildCandidateFramesRef.current = 0
      setEnergyState('calm')
      setEnergyIntensity(0)
      return
    }

    const now = Date.now()

    // Read the whole song section from the full mix, but keep some low-end weight so
    // drops and choruses still register as more intense than airy breakdowns.
    const fullBand = spectrumLevels?.full ?? bassLevel
    const lowBand = Math.max(
      spectrumLevels?.sub ?? 0,
      spectrumLevels?.low ?? 0,
      bassLevel,
    )

    // Mild power compression so loud tracks do not pin the scale, while preserving
    // enough separation between calm, build, and peak sections.
    const fullEnergy = Math.min(1, Math.pow(Math.max(0, fullBand), 1.1))
    const lowEnergy = Math.min(1, Math.pow(Math.max(0, lowBand), 0.98))
    // Keep some low-end awareness for drops, but bias the classifier toward the
    // full mix so bass-heavy dubstep intros do not read as full-track peaks.
    const energy = fullEnergy * 0.88 + lowEnergy * 0.12

    // Recalibrate on first real signal, or when a new song starts after silence.
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
        prevShortAvgRef.current = energy
        lastStateChangeTimeRef.current = now
        lastPeakTimeRef.current = 0
        lastEnergyStateRef.current = 'calm'
        startupTimeRef.current = now
        silenceFramesRef.current = 0
        peakCandidateFramesRef.current = 0
        buildCandidateFramesRef.current = 0
        if (energyState !== 'calm') {
          setEnergyState('calm')
        }
      } else {
        silenceFramesRef.current = 0
      }
    }

    // Short window reacts quickly to phrase changes. Long window tracks the song's
    // rolling baseline more slowly so loud steady sections do not collapse to calm.
    shortAvgRef.current = shortAvgRef.current * 0.82 + energy * 0.18
    longAvgRef.current = longAvgRef.current * 0.994 + energy * 0.006

    const shortAvg = shortAvgRef.current
    const longAvg = Math.max(longAvgRef.current, 0.06) // prevent div/0 in silence
    const prevShort = prevShortAvgRef.current
    prevShortAvgRef.current = shortAvg

    // Relative energy: >1.0 means louder than recent baseline, <1.0 means quieter.
    const rel = shortAvg / longAvg
    const relNormalized = Math.min(1, Math.max(0, (rel - 0.96) / 0.34))
    const sectionScore = shortAvg * 0.72 + relNormalized * 0.28

    // Delta on the short window to detect directional movement.
    const delta = shortAvg - prevShort
    const isRising = delta > 0.0018
    const isFalling = delta < -0.0018

    const currentState = lastEnergyStateRef.current
    const holdMs = STATE_HOLD_MS[currentState] ?? 800
    const heldLongEnough = now - lastStateChangeTimeRef.current >= holdMs

    let nextState = currentState

    // Always stay in calm for the first 2 seconds so the long-window average
    // has time to stabilize (prevents false peak/build on first audio frames).
    const isWarmedUp = now - startupTimeRef.current >= 2000

    if (heldLongEnough && isWarmedUp) {
      const wasPeak = currentState === 'peak'
      const hadRecentHighEnergy =
        now - lastPeakTimeRef.current < 2600 ||
        currentState === 'build' ||
        currentState === 'peak'
      const peakCandidate =
        (wasPeak ? rel >= 1.05 : rel >= 1.12) &&
        shortAvg >= 0.36 &&
        fullEnergy >= 0.58 &&
        sectionScore >= 0.54
      const buildCandidate =
        isRising &&
        rel >= 1.03 &&
        shortAvg >= 0.24 &&
        fullEnergy >= 0.32 &&
        sectionScore >= 0.34

      peakCandidateFramesRef.current = peakCandidate
        ? Math.min(12, peakCandidateFramesRef.current + 1)
        : 0
      buildCandidateFramesRef.current = buildCandidate
        ? Math.min(12, buildCandidateFramesRef.current + 1)
        : 0

      if (
        peakCandidateFramesRef.current >= (wasPeak ? 2 : 4)
      ) {
        // Peak needs both relative lift and enough absolute energy.
        nextState = 'peak'
        lastPeakTimeRef.current = now
      } else if (buildCandidateFramesRef.current >= 3) {
        // Build is a real upward move with moderate song energy.
        nextState = 'build'
      } else if (
        isFalling &&
        shortAvg >= 0.2 &&
        sectionScore >= 0.28 &&
        hadRecentHighEnergy
      ) {
        // Drop is the release after a high-energy moment, not just any decline.
        nextState = 'drop'
      } else if (shortAvg < 0.18 || (sectionScore < 0.3 && rel < 1.02 && !isRising)) {
        // Calm requires genuinely low absolute energy or a low, settled section.
        nextState = 'calm'
      }
    }

    if (nextState !== currentState) {
      setEnergyState(nextState)
      lastEnergyStateRef.current = nextState
      lastStateChangeTimeRef.current = now
      if (nextState !== 'peak') {
        peakCandidateFramesRef.current = 0
      }
      if (nextState !== 'build') {
        buildCandidateFramesRef.current = 0
      }
    }

    // Intensity follows a blended section score so it reads the song more musically
    // than a pure relative ratio.
    const intensity = Math.min(1, Math.max(0, (sectionScore - 0.22) / 0.46))
    // Only update state when intensity changes meaningfully to avoid render cascade
    if (Math.abs(intensity - lastIntensityRef.current) >= 0.015) {
      lastIntensityRef.current = intensity
      setEnergyIntensity(intensity)
    }
  }, [bassLevel, spectrumLevels, enabled])

  // Return FX recommendations based on energy state
  const getEnergyFxRecommendation = () => {
    if (!enabled || performanceMode) {
      return { glowBoost: 0, strobeActive: false, shakeAmount: 0, brightnessBoost: 0 }
    }

    switch (energyState) {
      case 'calm':
        return {
          glowBoost: 0,
          strobeActive: false,
          shakeAmount: 0,
          brightnessBoost: 0,
        }
      case 'build':
        return {
          glowBoost: energyIntensity * 0.3,
          strobeActive: false,
          shakeAmount: energyIntensity * 0.15,
          brightnessBoost: energyIntensity * 0.1,
        }
      case 'drop':
        // Short strobe burst on energy drop
        return {
          glowBoost: energyIntensity * 0.6,
          strobeActive: !safeMode && energyIntensity > 0.5,
          shakeAmount: energyIntensity * 0.4,
          brightnessBoost: energyIntensity * 0.25,
        }
      case 'peak':
        return {
          glowBoost: 1.0, // Max controlled glow
          strobeActive: false, // Avoid constant strobe spam at peak
          shakeAmount: !safeMode ? energyIntensity * 0.5 : 0,
          brightnessBoost: energyIntensity * 0.3,
        }
      default:
        return { glowBoost: 0, strobeActive: false, shakeAmount: 0, brightnessBoost: 0 }
    }
  }

  return {
    energyState,
    energyIntensity,
    getEnergyFxRecommendation,
  }
}
