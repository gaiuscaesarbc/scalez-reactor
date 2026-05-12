import { useRef, useEffect, useState } from 'react'

/**
 * Energy-to-FX Mapping: Converts energy state to FX boost values
 * Implements strobe cooldown to prevent spam
 */
export function useEnergyFxMapping({
  energyState = 'calm',
  energyIntensity = 0,
  enabled = true,
  safeMode = false,
  performanceMode = false,
  subLevel = 0,
}) {
  const [fxValues, setFxValues] = useState({
    glowBoost: 0,
    shakeIntensity: 0,
    brightnessBoost: 0,
    strobeCount: 0,
  })

  const lastEnergyStateRef = useRef('calm')
  const strobeCooldownRef = useRef(0)
  const strobeCountRef = useRef(0)
  const prevFxRef = useRef({ glowBoost: 0, shakeIntensity: 0, brightnessBoost: 0, strobeCount: 0 })
  const prevSubRef = useRef(0)
  // Keep subLevel in a ref so the main FX effect does not depend on it.
  // subLevel changes every audio frame; including it in deps would fire the
  // effect 20× per second and create render cascades under load.
  const subLevelRef = useRef(subLevel)
  useEffect(() => { subLevelRef.current = subLevel }, [subLevel])
  const STROBE_COOLDOWN_MS = 150   // beat-sync: allow up to ~6 strobes/sec
  const PEAK_STROBE_COOLDOWN_MS = 150

  useEffect(() => {
    if (!enabled || performanceMode) {
      setFxValues({
        glowBoost: 0,
        shakeIntensity: 0,
        brightnessBoost: 0,
        strobeCount: 0,
      })
      return
    }

    const now = Date.now()
    let nextValues = {
      glowBoost: 0,
      shakeIntensity: 0,
      brightnessBoost: 0,
      strobeCount: strobeCountRef.current,
    }

    // Map energy state to FX values
    switch (energyState) {
      case 'calm':
        nextValues = {
          glowBoost: 0,
          shakeIntensity: 0,
          brightnessBoost: 0,
          strobeCount: strobeCountRef.current,
        }
        break

      case 'build':
        // Gradual increase as energy builds
        nextValues = {
          glowBoost: 0.2 + energyIntensity * 0.2, // 0.2–0.4
          shakeIntensity: 0.05 + energyIntensity * 0.1, // 0.05–0.15
          brightnessBoost: 0.05 + energyIntensity * 0.05, // 0.05–0.1
          strobeCount: strobeCountRef.current,
        }
        break

      case 'drop': {
        // Beat-sync strobe: fire on sub transient (kick hit) during drop/peak
        const subLevelNow = subLevelRef.current
        const bassDelta = subLevelNow - prevSubRef.current
        const isBeatHit = bassDelta > 0.04 && subLevelNow > 0.2
        const shouldStrobe = !safeMode && isBeatHit && now >= strobeCooldownRef.current
        if (shouldStrobe) {
          strobeCountRef.current += 1
          strobeCooldownRef.current = now + STROBE_COOLDOWN_MS
        }
        nextValues = {
          glowBoost: 0.6 + energyIntensity * 0.3, // 0.6–0.9
          shakeIntensity: 0.2 + energyIntensity * 0.2, // 0.2–0.4
          brightnessBoost: 0.15 + energyIntensity * 0.1, // 0.15–0.25
          strobeCount: strobeCountRef.current,
        }
        break
      }

      case 'peak': {
        // Beat-sync strobe on sub transient during peak
        const subLevelNow = subLevelRef.current
        const bassDelta = subLevelNow - prevSubRef.current
        const isBeatHit = bassDelta > 0.03 && subLevelNow > 0.15
        const shouldPeakStrobe = !safeMode && isBeatHit && now >= strobeCooldownRef.current
        if (shouldPeakStrobe) {
          strobeCountRef.current += 1
          strobeCooldownRef.current = now + PEAK_STROBE_COOLDOWN_MS
        }
        nextValues = {
          glowBoost: 0.8 + energyIntensity * 0.2, // 0.8–1.0
          shakeIntensity: 0.3 + energyIntensity * 0.2, // 0.3–0.5
          brightnessBoost: 0.2 + energyIntensity * 0.15, // 0.2–0.35
          strobeCount: strobeCountRef.current,
        }
        break
      }

      default:
        break
    }

    // Apply Safe Mode caps
    if (safeMode) {
      nextValues.shakeIntensity *= 0.5 // Cap shake
      nextValues.glowBoost = Math.min(nextValues.glowBoost, 0.5) // Cap glow
      // strobeCount stays — safe mode never increments it above so no-op
    }

    lastEnergyStateRef.current = energyState
    prevSubRef.current = subLevelRef.current

    // Only call setFxValues if something actually changed to avoid render cascade
    const prev = prevFxRef.current
    if (
      Math.abs(nextValues.glowBoost - prev.glowBoost) >= 0.01 ||
      Math.abs(nextValues.shakeIntensity - prev.shakeIntensity) >= 0.01 ||
      Math.abs(nextValues.brightnessBoost - prev.brightnessBoost) >= 0.01 ||
      nextValues.strobeCount !== prev.strobeCount
    ) {
      prevFxRef.current = nextValues
      setFxValues(nextValues)
    }
  }, [energyState, energyIntensity, enabled, safeMode, performanceMode])

  return fxValues
}
