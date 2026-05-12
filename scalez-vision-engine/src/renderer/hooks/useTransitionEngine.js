import { useCallback, useEffect, useRef, useState } from 'react'
import { getTransitionDurationMs, normalizeTransition } from '../utils/transitionPresets'

function easingValue(name, t) {
  const x = Math.min(1, Math.max(0, t))
  if (name === 'linear') {
    return x
  }
  if (name === 'easeInOutCubic') {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  }
  return 1 - Math.pow(1 - x, 3)
}

function resolvePatch(type, progress, intensity) {
  const p = Math.min(1, Math.max(0, progress))
  const i = Math.min(1, Math.max(0, intensity))

  if (type === 'hard-cut') {
    return { strobeBoost: 0, shakeBoost: 0, brightnessBoost: 0, forceBlackout: false }
  }

  if (type === 'crossfade') {
    return {
      strobeBoost: 0,
      shakeBoost: 0.02 * i * (1 - p),
      brightnessBoost: 0.12 * i * (1 - Math.abs(0.5 - p) * 2),
      forceBlackout: false,
    }
  }

  if (type === 'bloom-fade') {
    return {
      strobeBoost: 0,
      shakeBoost: 0.03 * i * (1 - p),
      brightnessBoost: 0.42 * i * (1 - p),
      forceBlackout: false,
    }
  }

  if (type === 'glitch-cut') {
    return {
      strobeBoost: p < 0.26 ? 0.5 * i : 0,
      shakeBoost: (p < 0.52 ? 0.45 : 0.12) * i * (1 - p),
      brightnessBoost: p < 0.35 ? 0.24 * i : 0.08 * i * (1 - p),
      forceBlackout: false,
    }
  }

  if (type === 'blackout-pulse') {
    return {
      strobeBoost: 0,
      shakeBoost: 0.05 * i * (1 - p),
      brightnessBoost: 0.08 * i * (1 - p),
      forceBlackout: p < 0.34,
    }
  }

  if (type === 'portal-warp') {
    return {
      strobeBoost: p < 0.18 ? 0.22 * i : 0,
      shakeBoost: 0.32 * i * (1 - Math.abs(0.45 - p) * 1.7),
      brightnessBoost: 0.25 * i * (1 - p * 0.7),
      forceBlackout: false,
    }
  }

  if (type === 'strobe-hit') {
    return {
      strobeBoost: p < 0.22 ? 0.8 * i : 0,
      shakeBoost: 0.08 * i * (1 - p),
      brightnessBoost: p < 0.22 ? 0.3 * i : 0,
      forceBlackout: false,
    }
  }

  return { strobeBoost: 0, shakeBoost: 0, brightnessBoost: 0, forceBlackout: false }
}

export function useTransitionEngine({
  bpm = 140,
  getMasterFx,
  setMasterFx,
  setBlackout,
  applyCueNow,
  onTransitionStateChange,
}) {
  const [activeTransition, setActiveTransition] = useState(null)
  const timersRef = useRef([])
  const rafRef = useRef(null)
  const snapshotRef = useRef(null)
  const cueAppliedRef = useRef(false)

  const clearScheduled = useCallback(() => {
    timersRef.current.forEach((timerId) => clearTimeout(timerId))
    timersRef.current = []
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  const cleanupTransitionFx = useCallback((options = {}) => {
    const { forceBlackoutOff = false } = options
    const snapshot = snapshotRef.current
    if (snapshot) {
      setMasterFx((current) => ({
        ...current,
        strobe: snapshot.strobe,
        shake: snapshot.shake,
        brightness: snapshot.brightness,
      }))
    }
    if (forceBlackoutOff) {
      setBlackout(false)
    }
    snapshotRef.current = null
    cueAppliedRef.current = false
  }, [setMasterFx, setBlackout])

  const cancelTransition = useCallback((reason = 'cancel') => {
    clearScheduled()
    cleanupTransitionFx({ forceBlackoutOff: false })
    setActiveTransition(null)
    onTransitionStateChange?.({ isTransitioning: false, reason })
  }, [clearScheduled, cleanupTransitionFx, onTransitionStateChange])

  const runTransition = useCallback((input) => {
    const { cue, transition, meta = {}, reason = 'automation' } = input || {}
    if (!cue) {
      return
    }

    cancelTransition('replace')

    const normalized = normalizeTransition(transition)
    const durationMs = getTransitionDurationMs(normalized, bpm)
    const start = performance.now()
    const applyAtRatio =
      normalized.type === 'hard-cut'
        ? 0
        : normalized.type === 'crossfade'
          ? 0.5
          : normalized.type === 'bloom-fade'
            ? 0.62
            : normalized.type === 'blackout-pulse'
              ? 0.52
              : normalized.type === 'portal-warp'
                ? 0.48
                : normalized.type === 'strobe-hit'
                  ? 0.18
                  : 0.24

    const applyAtMs = Math.max(0, Math.round(durationMs * applyAtRatio))
    snapshotRef.current = getMasterFx?.() || { strobe: 0, shake: 0, brightness: 1 }
    cueAppliedRef.current = false

    const tick = () => {
      const elapsed = performance.now() - start
      const rawProgress = durationMs <= 0 ? 1 : elapsed / durationMs
      const eased = easingValue(normalized.easing, rawProgress)
      const patch = resolvePatch(normalized.type, eased, normalized.intensity)

      setMasterFx((current) => ({
        ...current,
        strobe: Math.min(1, Math.max(snapshotRef.current?.strobe ?? 0, (snapshotRef.current?.strobe ?? 0) + patch.strobeBoost)),
        shake: Math.min(1, Math.max(snapshotRef.current?.shake ?? 0, (snapshotRef.current?.shake ?? 0) + patch.shakeBoost)),
        brightness: Math.min(2, (snapshotRef.current?.brightness ?? 1) + patch.brightnessBoost),
      }))

      if (patch.forceBlackout) {
        setBlackout(true)
      } else if (normalized.type === 'blackout-pulse' && cueAppliedRef.current && !cue.blackout) {
        setBlackout(false)
      }

      if (elapsed < durationMs) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    setActiveTransition({
      ...normalized,
      durationMs,
      startedAt: Date.now(),
      reason,
      cueId: cue.id,
    })
    onTransitionStateChange?.({ isTransitioning: true, transition: normalized, reason })

    rafRef.current = requestAnimationFrame(tick)

    const applyTimer = setTimeout(() => {
      cueAppliedRef.current = true
      applyCueNow?.(cue, meta)
      if (normalized.type === 'hard-cut') {
        cleanupTransitionFx({ forceBlackoutOff: false })
      }
    }, applyAtMs)

    const doneTimer = setTimeout(() => {
      clearScheduled()
      cleanupTransitionFx({ forceBlackoutOff: normalized.type === 'blackout-pulse' && !cue.blackout })
      setActiveTransition(null)
      onTransitionStateChange?.({ isTransitioning: false, reason: 'complete' })
    }, durationMs + 20)

    timersRef.current.push(applyTimer, doneTimer)
  }, [
    bpm,
    cancelTransition,
    clearScheduled,
    cleanupTransitionFx,
    applyCueNow,
    getMasterFx,
    onTransitionStateChange,
    setBlackout,
    setMasterFx,
  ])

  useEffect(() => () => cancelTransition('unmount'), [cancelTransition])

  return {
    activeTransition,
    isTransitioning: Boolean(activeTransition),
    runTransition,
    previewTransition: (transition, cue, meta = {}) => runTransition({ transition, cue, meta, reason: 'preview' }),
    cancelTransition,
  }
}
