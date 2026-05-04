import { useEffect, useRef } from 'react'

/**
 * Beat-Sync Clip Trigger
 *
 * When a BPM is set via tap tempo, schedules clip triggers to land on the
 * next beat boundary. Fires on drop and peak state entries — so the visual
 * cut is tight to the music rather than immediate/late.
 *
 * Design:
 * - Beat grid is anchored to the last tap time (from the tap-tempo reference).
 * - On drop/peak entry, schedules a trigger for the next upcoming beat.
 * - "Beat quantize window": if the next beat is < SNAP_EARLY_MS away, fire on
 *   that beat; otherwise fire on the beat after (avoids stutter triggers).
 * - A cooldown prevents double-fires during sustained states.
 */
export function useBeatSync({
  enabled = true,
  bpm = null,
  lastTapTimeRef,           // ref to the timestamp of the most recent tap
  energyState = 'calm',
  layers = [],
  onTriggerClip = null,
}) {
  const lastEnergyStateRef = useRef('calm')
  const triggerCooldownRef = useRef(0)
  const scheduledTimerRef = useRef(null)

  const TRIGGER_COOLDOWN_MS = 2500   // min gap between beat-sync triggers
  const SNAP_EARLY_MS = 80           // if next beat is within 80ms, snap to it now

  const getValidClips = () => {
    const clips = []
    if (!Array.isArray(layers)) return clips
    for (let li = 0; li < layers.length; li++) {
      const layer = layers[li]
      if (!layer?.slots) continue
      for (let si = 0; si < layer.slots.length; si++) {
        if (layer.slots[si]?.status === 'loaded') clips.push({ layerIndex: li, slotIndex: si })
      }
    }
    return clips
  }

  const fireRandomClip = () => {
    if (!onTriggerClip) return
    const clips = getValidClips()
    if (clips.length === 0) return
    const clip = clips[Math.floor(Math.random() * clips.length)]
    try { onTriggerClip(clip.layerIndex, clip.slotIndex) } catch { /* ignore */ }
  }

  useEffect(() => {
    if (!enabled || !bpm || bpm < 20) return

    const prevState = lastEnergyStateRef.current
    lastEnergyStateRef.current = energyState

    const isNewDrop = energyState === 'drop' && prevState !== 'drop'
    const isNewPeak = energyState === 'peak' && prevState !== 'peak'
    if (!isNewDrop && !isNewPeak) return

    const now = performance.now()
    if (now < triggerCooldownRef.current) return

    // Clear any pending scheduled trigger from a previous state transition
    if (scheduledTimerRef.current !== null) {
      clearTimeout(scheduledTimerRef.current)
      scheduledTimerRef.current = null
    }

    const beatIntervalMs = 60000 / bpm
    const lastTap = lastTapTimeRef?.current ?? now

    // How many beats have elapsed since the last tap?
    const msSinceLastTap = now - lastTap
    const beatsElapsed = msSinceLastTap / beatIntervalMs
    // Time until the NEXT beat boundary
    const msToNextBeat = (Math.ceil(beatsElapsed) - beatsElapsed) * beatIntervalMs

    const delay = msToNextBeat <= SNAP_EARLY_MS ? msToNextBeat : msToNextBeat

    scheduledTimerRef.current = setTimeout(() => {
      scheduledTimerRef.current = null
      triggerCooldownRef.current = performance.now() + TRIGGER_COOLDOWN_MS
      fireRandomClip()
    }, Math.max(0, delay))

    return () => {
      if (scheduledTimerRef.current !== null) {
        clearTimeout(scheduledTimerRef.current)
        scheduledTimerRef.current = null
      }
    }
  }, [energyState, enabled, bpm])
}
