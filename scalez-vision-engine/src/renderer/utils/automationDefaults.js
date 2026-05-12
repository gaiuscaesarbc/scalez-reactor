export const TRANSITION_TYPES = [
  'hard-cut',
  'crossfade',
  'bloom-fade',
  'glitch-cut',
  'blackout-pulse',
  'portal-warp',
  'strobe-hit',
]

export const DEFAULT_AUTOMATION_SCENES = [
  {
    id: 'scene-intro',
    name: 'Intro Sequence',
    color: '#4ab4ff',
    cues: [
      {
        id: 'cue-intro-atmo',
        name: 'Intro Atmosphere',
        energyState: 'calm',
        energyIntensity: 0.24,
        blackout: false,
        transition: { type: 'crossfade', durationMs: 420, intensity: 0.68, quantize: '1bar', easing: 'easeOutCubic' },
        layers: [
          { layerIndex: 0, slotIndex: null, opacity: 0.65, blendMode: 'screen', visible: true },
          { layerIndex: 1, slotIndex: null, opacity: 0.52, blendMode: 'add', visible: true },
          { layerIndex: 2, slotIndex: null, opacity: 0.4, blendMode: 'normal', visible: true },
        ],
        fxPatch: { strobe: 0, shake: 0.08, brightness: 1.05 },
      },
      {
        id: 'cue-intro-build',
        name: 'Tunnel Build',
        energyState: 'build',
        energyIntensity: 0.52,
        blackout: false,
        transition: { type: 'portal-warp', durationMs: 700, intensity: 0.8, quantize: '1bar', easing: 'easeInOutCubic' },
        layers: [
          { layerIndex: 0, slotIndex: null, opacity: 0.75, blendMode: 'screen', visible: true },
          { layerIndex: 1, slotIndex: null, opacity: 0.62, blendMode: 'overlay', visible: true },
          { layerIndex: 2, slotIndex: null, opacity: 0.48, blendMode: 'add', visible: true },
        ],
        fxPatch: { strobe: 0.08, shake: 0.16, brightness: 1.14 },
      },
    ],
    blocks: [
      {
        id: 'block-intro-1',
        cueId: 'cue-intro-atmo',
        durationBeats: 16,
        transition: { type: 'crossfade', durationMs: 420, intensity: 0.7, quantize: '1bar', easing: 'easeOutCubic' },
      },
      {
        id: 'block-intro-2',
        cueId: 'cue-intro-build',
        durationBeats: 16,
        transition: { type: 'portal-warp', durationMs: 720, intensity: 0.82, quantize: '1bar', easing: 'easeInOutCubic' },
      },
    ],
  },
  {
    id: 'scene-peak',
    name: 'Peak Section',
    color: '#ff8c42',
    cues: [
      {
        id: 'cue-peak-drop',
        name: 'Peak Drop',
        energyState: 'drop',
        energyIntensity: 0.82,
        blackout: false,
        transition: { type: 'glitch-cut', durationMs: 240, intensity: 0.9, quantize: '1beat', easing: 'easeOutCubic' },
        layers: [
          { layerIndex: 0, slotIndex: null, opacity: 0.92, blendMode: 'add', visible: true },
          { layerIndex: 1, slotIndex: null, opacity: 0.84, blendMode: 'screen', visible: true },
          { layerIndex: 2, slotIndex: null, opacity: 0.64, blendMode: 'overlay', visible: true },
        ],
        fxPatch: { strobe: 0.26, shake: 0.32, brightness: 1.28 },
      },
      {
        id: 'cue-peak-breakdown',
        name: 'Breakdown',
        energyState: 'build',
        energyIntensity: 0.44,
        blackout: false,
        transition: { type: 'bloom-fade', durationMs: 520, intensity: 0.62, quantize: '1bar', easing: 'easeInOutCubic' },
        layers: [
          { layerIndex: 0, slotIndex: null, opacity: 0.66, blendMode: 'screen', visible: true },
          { layerIndex: 1, slotIndex: null, opacity: 0.54, blendMode: 'normal', visible: true },
          { layerIndex: 2, slotIndex: null, opacity: 0.42, blendMode: 'normal', visible: true },
        ],
        fxPatch: { strobe: 0.06, shake: 0.14, brightness: 1.08 },
      },
    ],
    blocks: [
      {
        id: 'block-peak-1',
        cueId: 'cue-peak-drop',
        durationBeats: 16,
        transition: { type: 'glitch-cut', durationMs: 260, intensity: 0.92, quantize: '1beat', easing: 'easeOutCubic' },
      },
      {
        id: 'block-peak-2',
        cueId: 'cue-peak-breakdown',
        durationBeats: 12,
        transition: { type: 'bloom-fade', durationMs: 540, intensity: 0.64, quantize: '1bar', easing: 'easeInOutCubic' },
      },
    ],
  },
]
