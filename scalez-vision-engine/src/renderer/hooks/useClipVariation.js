import { useRef } from 'react'

/**
 * Clip Variation System: Adds subtle variation to clip playback
 * Makes long sets feel less repetitive without breaking reliability or bounce
 */
export function useClipVariation({ enabled = true, randomSeed = Math.random() }) {
  const variationCacheRef = useRef(new Map())

  /**
   * Get subtle variation for a clip trigger
   * Returns objects that modify playback behavior slightly
   */
  const getClipVariation = (clipKey) => {
    if (!enabled) {
      return { speedVariation: 1.0, scaleVariation: 1.0, offsetVariation: 0 }
    }

    // Use cache to keep variations consistent per clip key across triggers
    if (!variationCacheRef.current.has(clipKey)) {
      // Seeded random for deterministic but varied playback
      const seed = clipKey.charCodeAt(0) + randomSeed * 1000
      const rng1 = Math.sin(seed) * 10000
      const rng2 = Math.sin(seed * 2) * 10000
      const rng3 = Math.sin(seed * 3) * 10000

      const speedVariation = 0.95 + (rng1 % 0.1) // ±5% speed variation
      const scaleVariation = 0.97 + (rng2 % 0.06) // ±3% scale variation
      const offsetVariation = (rng3 % 0.08) * 0.01 // 0-8% offset within in/out bounds

      variationCacheRef.current.set(clipKey, {
        speedVariation,
        scaleVariation,
        offsetVariation,
      })
    }

    return variationCacheRef.current.get(clipKey)
  }

  /**
   * Apply variation to video motion
   */
  const applyVariationToMotion = (motion, clipKey) => {
    if (!enabled || !motion) return motion

    const variation = getClipVariation(clipKey)

    return {
      ...motion,
      baseSpeed: (motion.baseSpeed ?? 1) * variation.speedVariation,
      scale: (motion.scale ?? 1) * variation.scaleVariation,
      // Small offset within in/out bounds
      inPoint: Math.min(
        motion.outPoint ?? 1,
        (motion.inPoint ?? 0) + variation.offsetVariation,
      ),
    }
  }

  const clearVariationCache = () => {
    variationCacheRef.current.clear()
  }

  return {
    getClipVariation,
    applyVariationToMotion,
    clearVariationCache,
  }
}
