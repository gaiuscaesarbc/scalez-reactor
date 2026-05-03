import { useRef, useEffect, useState } from 'react'

/**
 * Energy FX Smoother: Applies lerp to prevent visual snapping
 * Smoothly transitions energy FX changes over time
 */
export function useEnergyFxSmoother({
  glowBoost = 0,
  shakeIntensity = 0,
  brightnessBoost = 0,
  lerpFactor = 0.12, // 0.08–0.15 tunable
  enabled = true,
}) {
  const [smoothedValues, setSmoothedValues] = useState({
    glowBoost: 0,
    shakeIntensity: 0,
    brightnessBoost: 0,
  })

  const smoothedRef = useRef({
    glowBoost: 0,
    shakeIntensity: 0,
    brightnessBoost: 0,
  })

  useEffect(() => {
    if (!enabled) {
      smoothedRef.current = { glowBoost: 0, shakeIntensity: 0, brightnessBoost: 0 }
      setSmoothedValues({ glowBoost: 0, shakeIntensity: 0, brightnessBoost: 0 })
      return
    }

    // Lerp toward target values
    smoothedRef.current.glowBoost =
      smoothedRef.current.glowBoost * (1 - lerpFactor) + glowBoost * lerpFactor
    // Snap shake to zero immediately — calm should have no residual shake
    smoothedRef.current.shakeIntensity = shakeIntensity === 0
      ? 0
      : smoothedRef.current.shakeIntensity * (1 - lerpFactor) + shakeIntensity * lerpFactor
    smoothedRef.current.brightnessBoost =
      smoothedRef.current.brightnessBoost * (1 - lerpFactor) +
      brightnessBoost * lerpFactor

    setSmoothedValues({ ...smoothedRef.current })
  }, [glowBoost, shakeIntensity, brightnessBoost, lerpFactor, enabled])

  return smoothedValues
}
