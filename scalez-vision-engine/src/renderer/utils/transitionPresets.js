export const TRANSITION_TYPE_OPTIONS = [
  { value: 'hard-cut', label: 'Hard Cut' },
  { value: 'crossfade', label: 'Crossfade' },
  { value: 'bloom-fade', label: 'Bloom Fade' },
  { value: 'glitch-cut', label: 'Glitch Cut' },
  { value: 'blackout-pulse', label: 'Blackout Pulse' },
  { value: 'portal-warp', label: 'Portal Warp' },
  { value: 'strobe-hit', label: 'Strobe Hit' },
]

export const TRANSITION_QUANTIZE_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: '1beat', label: '1 Beat' },
  { value: '2beats', label: '2 Beats' },
  { value: '1bar', label: '1 Bar' },
  { value: '2bars', label: '2 Bars' },
]

export const TRANSITION_EASING_OPTIONS = [
  { value: 'linear', label: 'Linear' },
  { value: 'easeOutCubic', label: 'Ease Out' },
  { value: 'easeInOutCubic', label: 'Ease In/Out' },
]

export const DEFAULT_TRANSITION = {
  type: 'crossfade',
  durationMs: 450,
  intensity: 0.75,
  quantize: '1bar',
  easing: 'easeOutCubic',
}

const QUANTIZE_BEAT_MULTIPLIER = {
  off: 0,
  '1beat': 1,
  '2beats': 2,
  '1bar': 4,
  '2bars': 8,
}

export function normalizeTransition(transition) {
  if (typeof transition === 'string') {
    return {
      ...DEFAULT_TRANSITION,
      type: transition,
    }
  }

  if (!transition || typeof transition !== 'object') {
    return { ...DEFAULT_TRANSITION }
  }

  return {
    type: transition.type || DEFAULT_TRANSITION.type,
    durationMs: Math.max(80, Number(transition.durationMs) || DEFAULT_TRANSITION.durationMs),
    intensity: Math.min(1, Math.max(0, Number(transition.intensity) || DEFAULT_TRANSITION.intensity)),
    quantize: transition.quantize || DEFAULT_TRANSITION.quantize,
    easing: transition.easing || DEFAULT_TRANSITION.easing,
  }
}

export function getTransitionDurationMs(transition, bpm = 140) {
  const normalized = normalizeTransition(transition)
  const beatMs = 60000 / Math.max(20, Number(bpm) || 140)
  const multiplier = QUANTIZE_BEAT_MULTIPLIER[normalized.quantize] ?? 0

  if (multiplier > 0) {
    return Math.max(80, Math.round(beatMs * multiplier))
  }

  return normalized.durationMs
}

export function getTransitionTypeLabel(type) {
  return TRANSITION_TYPE_OPTIONS.find((entry) => entry.value === type)?.label || 'Crossfade'
}
