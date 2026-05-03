import { useEffect, useRef, useState } from 'react'

/**
 * Auto Evolution System: Gently evolves the visual state over time
 * Makes long sets feel dynamic without being disruptive
 */
export function useAutoEvolution({
  enabled = true,
  intervalSeconds = 60,
  layers = [],
  masterFx = {},
  onTriggerClip = null,
  onSetLayerOpacity = null,
  onSetLayerBlendMode = null,
}) {
  const [isAutoEvolving, setIsAutoEvolving] = useState(false)
  const lastActionTimeRef = useRef(0)
  const pauseUntilRef = useRef(0)
  const PAUSE_AFTER_USER_ACTION_MS = 2000

  // Get list of valid clips to randomly trigger
  const getValidLoadedClips = () => {
    const clips = []
    if (!layers || !Array.isArray(layers)) return clips

    for (let layerIndex = 0; layerIndex < layers.length; layerIndex++) {
      const layer = layers[layerIndex]
      if (!layer?.slots) continue

      for (let slotIndex = 0; slotIndex < layer.slots.length; slotIndex++) {
        const slot = layer.slots[slotIndex]
        if (slot?.status === 'loaded') {
          clips.push({ layerIndex, slotIndex, slot })
        }
      }
    }
    return clips
  }

  useEffect(() => {
    if (!enabled) {
      setIsAutoEvolving(false)
      return
    }

    const intervalMs = Math.max(15000, intervalSeconds * 1000) // Min 15s

    const evolutionTimer = setInterval(() => {
      const now = Date.now()

      // Skip if user recently took action
      if (now < pauseUntilRef.current) {
        return
      }

      // Randomly decide which evolution action to take
      const action = Math.floor(Math.random() * 3)
      const validClips = getValidLoadedClips()

      switch (action) {
        case 0:
          // Trigger random loaded clip on an inactive layer
          if (validClips.length > 0 && onTriggerClip) {
            const randomClip = validClips[Math.floor(Math.random() * validClips.length)]
            try {
              onTriggerClip(randomClip.layerIndex, randomClip.slotIndex)
              pauseUntilRef.current = now + PAUSE_AFTER_USER_ACTION_MS
            } catch {
              // Silently ignore if trigger fails
            }
          }
          break

        case 1:
          // Gently change opacity on a random layer
          if (layers.length > 0 && onSetLayerOpacity) {
            const randomLayerIndex = Math.floor(Math.random() * layers.length)
            const layer = layers[randomLayerIndex]
            const currentOpacity = layer?.opacity ?? 1
            // Only change if not at extremes
            if (currentOpacity > 0.2 && currentOpacity < 1) {
              const newOpacity = Math.max(0.2, Math.min(1, currentOpacity + (Math.random() - 0.5) * 0.2))
              try {
                onSetLayerOpacity(randomLayerIndex, newOpacity)
                pauseUntilRef.current = now + PAUSE_AFTER_USER_ACTION_MS
              } catch {
                // Silently ignore
              }
            }
          }
          break

        case 2:
          // Occasionally cycle blend mode on a layer with active content
          if (layers.length > 0 && onSetLayerBlendMode) {
            const layersWithClips = layers.filter((l) => l?.activeSlotIndex !== null)
            if (layersWithClips.length > 0) {
              const randomLayer = layersWithClips[Math.floor(Math.random() * layersWithClips.length)]
              const blendModes = ['normal', 'screen', 'multiply', 'overlay', 'color-dodge']
              const randomMode = blendModes[Math.floor(Math.random() * blendModes.length)]
              if (randomMode && onSetLayerBlendMode) {
                try {
                  onSetLayerBlendMode(randomLayer.layerIndex, randomMode)
                  pauseUntilRef.current = now + PAUSE_AFTER_USER_ACTION_MS
                } catch {
                  // Silently ignore
                }
              }
            }
          }
          break

        default:
          break
      }

      lastActionTimeRef.current = now
    }, intervalMs)

    return () => clearInterval(evolutionTimer)
  }, [enabled, intervalSeconds, layers, onTriggerClip, onSetLayerOpacity, onSetLayerBlendMode])

  // Called when user takes an action (any manual control)
  const pauseEvolution = () => {
    pauseUntilRef.current = Date.now() + PAUSE_AFTER_USER_ACTION_MS
  }

  return {
    isAutoEvolving: enabled,
    pauseEvolution,
    getValidLoadedClips,
  }
}
