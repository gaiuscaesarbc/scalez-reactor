import { useEffect, useMemo, useRef, useState } from 'react'

const DROP_COOLDOWN_MS = 1500

const DROP_THRESHOLDS = {
  low: 0.45,
  medium: 0.55,
  high: 0.68,
}

export function useDropSystem({
  energyState = 'calm',
  energyIntensity = 0,
  energySystemEnabled = true,
  dropSystemEnabled = false,
  dropThresholdLevel = 'medium',
  safeModeEnabled = false,
  performanceModeEnabled = false,
  blackoutEnabled = false,
  layers = [],
  triggerClip,
  setLayerOpacity,
  setMasterFx,
  triggerTemporaryFx,
}) {
  const [lastDropTime, setLastDropTime] = useState(0)
  const [lastDropIntensity, setLastDropIntensity] = useState(0)
  const [dropCount, setDropCount] = useState(0)
  const [recentDropEvent, setRecentDropEvent] = useState(null)
  const [dropFx, setDropFx] = useState({
    glowBoost: 0,
    brightnessBoost: 0,
    shakeBoost: 0,
  })
  const [layerOpacityFloors, setLayerOpacityFloors] = useState({})
  const [dropStrobeCount, setDropStrobeCount] = useState(0)

  const previousEnergyStateRef = useRef(energyState)
  const lastDropTimeRef = useRef(0)
  const layer3RestoreUntilRef = useRef(0)
  const layer3FloorRef = useRef(0)
  const layer3TriggerOpacityRef = useRef(null)
  const fxTimerRef = useRef(null)

  const threshold = DROP_THRESHOLDS[dropThresholdLevel] ?? DROP_THRESHOLDS.medium
  const dropSystemActive =
    energySystemEnabled &&
    dropSystemEnabled &&
    !performanceModeEnabled

  const activeClipLayers = useMemo(
    () => layers.filter((layer) => {
      const activeIndex = layer?.activeSlotIndex
      const activeClip = typeof activeIndex === 'number' ? layer?.slots?.[activeIndex] : null
      return activeClip?.status === 'loaded'
    }),
    [layers],
  )

  const layer3 = layers.find((layer) => layer?.layerIndex === 2) || null
  const layer3HasActiveClip = useMemo(() => {
    if (!layer3) {
      return false
    }
    const activeIndex = layer3.activeSlotIndex
    const activeClip = typeof activeIndex === 'number' ? layer3?.slots?.[activeIndex] : null
    return activeClip?.status === 'loaded'
  }, [layer3])

  const dropArmed =
    dropSystemActive &&
    !blackoutEnabled &&
    activeClipLayers.length > 0 &&
    (energyState === 'build' || energyState === 'peak') &&
    energyIntensity >= threshold

  useEffect(() => {
    if (!dropSystemActive || blackoutEnabled) {
      layer3RestoreUntilRef.current = 0
      layer3FloorRef.current = 0
      layer3TriggerOpacityRef.current = null
      setDropFx({ glowBoost: 0, brightnessBoost: 0, shakeBoost: 0 })
      setLayerOpacityFloors({})
      return
    }

    const currentLayer3Opacity = layer3?.opacity ?? null
    if (
      layer3FloorRef.current > 0 &&
      currentLayer3Opacity != null &&
      layer3TriggerOpacityRef.current != null &&
      Math.abs(currentLayer3Opacity - layer3TriggerOpacityRef.current) >= 0.01
    ) {
      layer3RestoreUntilRef.current = 0
      layer3FloorRef.current = 0
      layer3TriggerOpacityRef.current = null
      setLayerOpacityFloors({})
    }
  }, [blackoutEnabled, dropSystemActive, layer3?.opacity])

  useEffect(() => {
    if (!dropSystemActive || blackoutEnabled || activeClipLayers.length === 0) {
      previousEnergyStateRef.current = energyState
      return
    }

    const now = Date.now()
    const previousEnergyState = previousEnergyStateRef.current
    const isDropEdge = energyState === 'drop' && previousEnergyState !== 'drop'
    const cameFromHighEnergy = previousEnergyState === 'build' || previousEnergyState === 'peak'
    const cooldownPassed = now - lastDropTimeRef.current >= DROP_COOLDOWN_MS

    if (isDropEdge && cameFromHighEnergy && energyIntensity >= threshold && cooldownPassed) {
      const normalizedIntensity = Math.max(threshold, energyIntensity)
      const intensityScale = Math.min(1, Math.max(0, (normalizedIntensity - threshold) / (1 - threshold)))
      const fxHoldMs = Math.round(300 + intensityScale * 400)
      const layer3HoldMs = Math.round(800 + intensityScale * 400)
      const nextDropFx = {
        glowBoost: 0.14 + intensityScale * 0.24,
        brightnessBoost: 0.1 + intensityScale * 0.16,
        shakeBoost: safeModeEnabled
          ? 0.04 + intensityScale * 0.06
          : 0.1 + intensityScale * 0.16,
      }

      lastDropTimeRef.current = now
      setLastDropTime(now)
      setLastDropIntensity(energyIntensity)
      setDropCount((count) => count + 1)
      setDropFx(nextDropFx)

      if (fxTimerRef.current) {
        clearTimeout(fxTimerRef.current)
      }
      fxTimerRef.current = setTimeout(() => {
        setDropFx({ glowBoost: 0, brightnessBoost: 0, shakeBoost: 0 })
        fxTimerRef.current = null
      }, fxHoldMs)

      const affectedLayerIds = []
      if (layer3HasActiveClip) {
        const nextFloor = Math.max(0.85, layer3?.opacity ?? 0.85)
        layer3FloorRef.current = nextFloor
        layer3RestoreUntilRef.current = now + layer3HoldMs
        layer3TriggerOpacityRef.current = layer3?.opacity ?? null
        setLayerOpacityFloors({ 2: nextFloor })
        affectedLayerIds.push(2)
      }

      if (!safeModeEnabled) {
        setDropStrobeCount((count) => count + 1)
      }

      setRecentDropEvent({
        timestamp: now,
        intensity: energyIntensity,
        previousEnergyState,
        affectedLayerIds,
        actionSummary: {
          layer3Boosted: layer3HasActiveClip,
          fxHoldMs,
          layer3HoldMs: layer3HasActiveClip ? layer3HoldMs : 0,
          strobeBurst: !safeModeEnabled,
        },
      })

      // Reserved for future extensions; kept in the hook interface intentionally.
      void triggerClip
      void setLayerOpacity
      void setMasterFx
      void triggerTemporaryFx
    }

    previousEnergyStateRef.current = energyState
  }, [
    activeClipLayers.length,
    blackoutEnabled,
    dropSystemActive,
    energyIntensity,
    energyState,
    layer3?.opacity,
    layer3HasActiveClip,
    safeModeEnabled,
    threshold,
    triggerClip,
    setLayerOpacity,
    setMasterFx,
    triggerTemporaryFx,
  ])

  useEffect(() => {
    if (layer3FloorRef.current <= 0) {
      return undefined
    }

    const timer = setInterval(() => {
      const now = Date.now()
      if (now < layer3RestoreUntilRef.current) {
        return
      }

      const nextFloor = layer3FloorRef.current * 0.74
      if (nextFloor <= 0.02) {
        layer3FloorRef.current = 0
        layer3TriggerOpacityRef.current = null
        setLayerOpacityFloors({})
        clearInterval(timer)
        return
      }

      layer3FloorRef.current = nextFloor
      setLayerOpacityFloors({ 2: nextFloor })
    }, 45)

    return () => clearInterval(timer)
  }, [layerOpacityFloors])

  useEffect(() => () => {
    if (fxTimerRef.current) {
      clearTimeout(fxTimerRef.current)
    }
  }, [])

  return {
    lastDropTime,
    lastDropIntensity,
    dropArmed,
    dropCount,
    recentDropEvent,
    dropFx,
    layerOpacityFloors,
    dropStrobeCount,
  }
}