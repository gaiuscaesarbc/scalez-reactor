function normalizeText(value) {
  return String(value || '').toLowerCase().trim()
}

export const DEFAULT_SCENE_PRESETS = [
  // === CALM (3) ===
  {
    id: 'void_meditation',
    name: 'VOID MEDITATION',
    mood: 'infinite deep space cinematic',
    energyProfile: 'Calm',
    intendedUse: 'intro/ambient interlude',
    intensity: 5,
    tags: ['space', 'cosmic', 'meditative', 'deep'],
    settings: { bpm: 100, audioSensitivity: 0.56, audioSmoothing: 0.72 },
    clipQueries: {
      layer1: ['nebula', 'space', 'cosmic dust', 'deep space', 'void'],
      layer2: ['particle', 'float', 'drift', 'cloud', 'ambient'],
      layer3: ['subtle', 'glow', 'pulse', 'shimmer', 'distant'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.92, blendMode: 'normal', visible: true },
      { role: 'atmosphere', opacity: 0.48, blendMode: 'screen', visible: true },
      { role: 'shimmer', opacity: 0.24, blendMode: 'add', visible: true },
    ],
    fxStrategy: {
      glow: 0.18,
      brightness: 1.22,
      shake: 0.02,
      strobe: 0,
    },
  },
  {
    id: 'crystal_caverns',
    name: 'CRYSTAL CAVERNS',
    mood: 'ethereal underground cathedral',
    energyProfile: 'Calm',
    intendedUse: 'transition/buildup foundation',
    intensity: 6,
    tags: ['crystal', 'cave', 'refraction', 'light', 'geometric'],
    settings: { bpm: 106, audioSensitivity: 0.62, audioSmoothing: 0.68 },
    clipQueries: {
      layer1: ['crystal', 'prism', 'geometric', 'refraction', 'light structure'],
      layer2: ['glow', 'luminescence', 'reflection', 'chrome', 'shimmer'],
      layer3: ['subtle glitch', 'sparkle', 'grain', 'dust', 'accent'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.88, blendMode: 'normal', visible: true },
      { role: 'refraction', opacity: 0.52, blendMode: 'screen', visible: true },
      { role: 'texture', opacity: 0.3, blendMode: 'overlay', visible: true },
    ],
    fxStrategy: {
      glow: 0.24,
      brightness: 1.18,
      shake: 0.03,
      strobe: 0,
    },
  },
  {
    id: 'neon_rain',
    name: 'NEON RAIN',
    mood: 'atmospheric rain-soaked cyberpunk',
    energyProfile: 'Calm',
    intendedUse: 'chill-but-stylish bridge',
    intensity: 5,
    tags: ['rain', 'neon', 'cyberpunk', 'wet', 'reflective'],
    settings: { bpm: 112, audioSensitivity: 0.64, audioSmoothing: 0.66 },
    clipQueries: {
      layer1: ['rain', 'water', 'wet', 'neon', 'reflective'],
      layer2: ['light', 'glow', 'bokeh', 'blur', 'soft'],
      layer3: ['shimmer', 'subtle', 'accent', 'small motion', 'breath'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.94, blendMode: 'normal', visible: true },
      { role: 'glow layer', opacity: 0.44, blendMode: 'screen', visible: true },
      { role: 'shimmer', opacity: 0.28, blendMode: 'add', visible: true },
    ],
    fxStrategy: {
      glow: 0.2,
      brightness: 1.14,
      shake: 0.04,
      strobe: 0,
    },
  },

  // === BUILD (4) ===
  {
    id: 'hypersonic_acceleration',
    name: 'HYPERSONIC ACCELERATION',
    mood: 'high-speed tunnel warp buildup',
    energyProfile: 'Build',
    intendedUse: 'buildup momentum ramp',
    intensity: 8,
    tags: ['tunnel', 'warp', 'speed', 'acceleration', 'hyperdrive'],
    settings: { bpm: 128, audioSensitivity: 0.84, audioSmoothing: 0.42 },
    clipQueries: {
      layer1: ['tunnel', 'warp', 'speed', 'acceleration', 'hyperdrive', 'vortex'],
      layer2: ['light streak', 'velocity', 'cosmic dust', 'particle flow', 'motion'],
      layer3: ['glitch accent', 'subtle flicker', 'digital noise', 'pulse overlay'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.98, blendMode: 'normal', visible: true },
      { role: 'motion', opacity: 0.62, blendMode: 'add', visible: true },
      { role: 'glitch', opacity: 0.32, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.32,
      brightness: 1.12,
      shake: 0.16,
      strobe: 0.08,
    },
  },
  {
    id: 'black_hole_ritual',
    name: 'BLACK HOLE RITUAL',
    mood: 'dark gravitational pull pre-drop',
    energyProfile: 'Build',
    intendedUse: 'tension riser before impact',
    intensity: 9,
    tags: ['vortex', 'black hole', 'cosmic', 'dark', 'gravity', 'ritual'],
    settings: { bpm: 124, audioSensitivity: 0.88, audioSmoothing: 0.38 },
    clipQueries: {
      layer1: ['vortex', 'black hole', 'warp', 'tunnel', 'spiral', 'dark center'],
      layer2: ['cosmic dust', 'particles', 'debris field', 'nebula', 'space'],
      layer3: ['glitch', 'corruption', 'noise', 'static', 'signal break'],
    },
    layerStrategy: [
      { role: 'vortex', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'atmosphere', opacity: 0.48, blendMode: 'screen', visible: true },
      { role: 'chaos', opacity: 0.28, blendMode: 'add', visible: true },
    ],
    fxStrategy: {
      glow: 0.34,
      brightness: 1.08,
      shake: 0.2,
      strobe: 0.12,
    },
  },
  {
    id: 'synth_rise',
    name: 'SYNTH RISE',
    mood: 'melodic digital ascension',
    energyProfile: 'Build',
    intendedUse: 'euphoric buildpower',
    intensity: 7,
    tags: ['synth', 'digital', 'melodic', 'geometric', 'rise', 'ascending'],
    settings: { bpm: 132, audioSensitivity: 0.76, audioSmoothing: 0.48 },
    clipQueries: {
      layer1: ['synth', 'digital', 'geometric', 'grid', 'pattern', 'structure'],
      layer2: ['light', 'glow', 'digital glow', 'energy', 'bright'],
      layer3: ['accent', 'pulse', 'rhythm', 'beat', 'sync'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.92, blendMode: 'normal', visible: true },
      { role: 'brightness', opacity: 0.58, blendMode: 'screen', visible: true },
      { role: 'pulse', opacity: 0.36, blendMode: 'add', visible: true },
    ],
    fxStrategy: {
      glow: 0.36,
      brightness: 1.16,
      shake: 0.12,
      strobe: 0.06,
    },
  },
  {
    id: 'cyberspace_breach',
    name: 'CYBERSPACE BREACH',
    mood: 'digital intrusion system activation',
    energyProfile: 'Build',
    intendedUse: 'cyber thriller buildtension',
    intensity: 8,
    tags: ['cyber', 'breach', 'digital', 'code', 'security', 'infiltration'],
    settings: { bpm: 120, audioSensitivity: 0.82, audioSmoothing: 0.44 },
    clipQueries: {
      layer1: ['digital', 'code', 'circuit', 'matrix', 'grid', 'data'],
      layer2: ['glitch', 'signal', 'corruption', 'digital noise', 'scan'],
      layer3: ['strobe', 'flicker', 'alert', 'warning', 'breach effect'],
    },
    layerStrategy: [
      { role: 'foundation', opacity: 0.96, blendMode: 'normal', visible: true },
      { role: 'corruption', opacity: 0.5, blendMode: 'add', visible: true },
      { role: 'alert', opacity: 0.34, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.28,
      brightness: 1.1,
      shake: 0.18,
      strobe: 0.14,
    },
  },

  // === DROP (5) ===
  {
    id: 'plasma_meltdown',
    name: 'PLASMA MELTDOWN',
    mood: 'molten bass impact explosion',
    energyProfile: 'Drop',
    intendedUse: 'heavy drop moment',
    intensity: 9,
    tags: ['plasma', 'fire', 'flame', 'meltdown', 'explosion', 'heat'],
    settings: { bpm: 146, audioSensitivity: 0.92, audioSmoothing: 0.32 },
    clipQueries: {
      layer1: ['plasma', 'flame', 'fire', 'meltdown', 'heat', 'explosion'],
      layer2: ['distortion', 'liquid', 'melt', 'color flow', 'intensity'],
      layer3: ['strobe', 'flicker', 'intensity', 'light burst', 'glitch'],
    },
    layerStrategy: [
      { role: 'impact', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'distortion', opacity: 0.68, blendMode: 'add', visible: true },
      { role: 'chaos', opacity: 0.42, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.42,
      brightness: 1.08,
      shake: 0.34,
      strobe: 0.28,
    },
  },
  {
    id: 'void_collapse',
    name: 'VOID COLLAPSE',
    mood: 'dark matter implosion drop',
    energyProfile: 'Drop',
    intendedUse: 'heavy dark drop',
    intensity: 10,
    tags: ['void', 'collapse', 'dark', 'implosion', 'gravity', 'abyss'],
    settings: { bpm: 142, audioSensitivity: 0.95, audioSmoothing: 0.3 },
    clipQueries: {
      layer1: ['vortex', 'black hole', 'collapse', 'implosion', 'dark center', 'void'],
      layer2: ['distortion', 'warp', 'void particle', 'erosion', 'corruption'],
      layer3: ['glitch', 'noise', 'static', 'breakdown', 'chaos'],
    },
    layerStrategy: [
      { role: 'vortex', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'warp', opacity: 0.72, blendMode: 'add', visible: true },
      { role: 'noise', opacity: 0.5, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.28,
      brightness: 0.96,
      shake: 0.38,
      strobe: 0.32,
    },
  },
  {
    id: 'glitch_downstroke',
    name: 'GLITCH DOWNSTROKE',
    mood: 'aggressive digital corruption drop',
    energyProfile: 'Drop',
    intendedUse: 'chaotic/experimental drop',
    intensity: 9,
    tags: ['glitch', 'corruption', 'digital', 'breakdown', 'noise', 'aggressive'],
    settings: { bpm: 150, audioSensitivity: 0.94, audioSmoothing: 0.3 },
    clipQueries: {
      layer1: ['glitch', 'corruption', 'digital breakdown', 'noise', 'static'],
      layer2: ['signal', 'interference', 'digital noise', 'scan line', 'artifact'],
      layer3: ['strobe', 'flicker', 'rapid glitch', 'VHS effect', 'breakdown'],
    },
    layerStrategy: [
      { role: 'corruption', opacity: 0.98, blendMode: 'normal', visible: true },
      { role: 'signal', opacity: 0.64, blendMode: 'add', visible: true },
      { role: 'strobe', opacity: 0.46, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.22,
      brightness: 1.0,
      shake: 0.36,
      strobe: 0.38,
    },
  },
  {
    id: 'crimson_wave',
    name: 'CRIMSON WAVE',
    mood: 'intense red/orange energy drop',
    energyProfile: 'Drop',
    intendedUse: 'aggressive/tribal drop',
    intensity: 9,
    tags: ['red', 'orange', 'wave', 'energy', 'intensity', 'tribal'],
    settings: { bpm: 140, audioSensitivity: 0.9, audioSmoothing: 0.34 },
    clipQueries: {
      layer1: ['red', 'orange', 'flame', 'wave', 'energy', 'intensity'],
      layer2: ['glow', 'light', 'pulse', 'vibration', 'intensity layer'],
      layer3: ['distortion', 'ripple', 'impact', 'shockwave', 'distort'],
    },
    layerStrategy: [
      { role: 'base', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'glow', opacity: 0.56, blendMode: 'add', visible: true },
      { role: 'distortion', opacity: 0.38, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.38,
      brightness: 1.06,
      shake: 0.3,
      strobe: 0.2,
    },
  },
  {
    id: 'alien_invasion',
    name: 'ALIEN INVASION',
    mood: 'extraterrestrial signal impact',
    energyProfile: 'Drop',
    intendedUse: 'sci-fi/UFO drop moment',
    intensity: 9,
    tags: ['alien', 'invasion', 'UFO', 'signal', 'extraterrestrial', 'sci-fi'],
    settings: { bpm: 138, audioSensitivity: 0.88, audioSmoothing: 0.36 },
    clipQueries: {
      layer1: ['alien', 'UFO', 'signal', 'beam', 'scan', 'extraterrestrial'],
      layer2: ['interference', 'glitch', 'digital distortion', 'alien signal', 'corruption'],
      layer3: ['impact', 'flash', 'burst', 'alert', 'warning'],
    },
    layerStrategy: [
      { role: 'signal', opacity: 0.96, blendMode: 'normal', visible: true },
      { role: 'interference', opacity: 0.58, blendMode: 'add', visible: true },
      { role: 'impact', opacity: 0.42, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.3,
      brightness: 1.04,
      shake: 0.32,
      strobe: 0.24,
    },
  },

  // === PEAK (4) ===
  {
    id: 'fractal_overload',
    name: 'FRACTAL OVERLOAD',
    mood: 'psychedelic maximum-energy assault',
    energyProfile: 'Peak',
    intendedUse: 'peak moment maximum intensity',
    intensity: 10,
    tags: ['fractal', 'psychedelic', 'overload', 'kaleidoscope', 'intense', 'peak'],
    settings: { bpm: 160, audioSensitivity: 0.96, audioSmoothing: 0.28 },
    clipQueries: {
      layer1: ['fractal', 'kaleidoscope', 'psychedelic', 'colorful', 'intense', 'mandelbrot'],
      layer2: ['liquid', 'distortion', 'color', 'flow', 'motion', 'transform'],
      layer3: ['strobe', 'flashing', 'rhythm', 'pulse', 'intense flicker'],
    },
    layerStrategy: [
      { role: 'fractal', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'liquid', opacity: 0.72, blendMode: 'add', visible: true },
      { role: 'strobe', opacity: 0.54, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.48,
      brightness: 1.08,
      shake: 0.38,
      strobe: 0.42,
    },
  },
  {
    id: 'cyber_apex',
    name: 'CYBER APEX',
    mood: 'ultimate digital transcendence',
    energyProfile: 'Peak',
    intendedUse: 'digital peak climax',
    intensity: 9,
    tags: ['cyber', 'apex', 'digital', 'transcendence', 'ultimate', 'peak'],
    settings: { bpm: 155, audioSensitivity: 0.93, audioSmoothing: 0.32 },
    clipQueries: {
      layer1: ['digital', 'cyber', 'apex', 'technology', 'circuit', 'intense'],
      layer2: ['glitch', 'signal', 'corruption', 'digital', 'noise', 'breakthrough'],
      layer3: ['strobe', 'flicker', 'intense', 'peak', 'climax', 'pulse'],
    },
    layerStrategy: [
      { role: 'digital', opacity: 0.98, blendMode: 'normal', visible: true },
      { role: 'glitch', opacity: 0.66, blendMode: 'add', visible: true },
      { role: 'strobe', opacity: 0.48, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.4,
      brightness: 1.1,
      shake: 0.36,
      strobe: 0.4,
    },
  },
  {
    id: 'supernova_burst',
    name: 'SUPERNOVA BURST',
    mood: 'cosmic explosion maximum brightness',
    energyProfile: 'Peak',
    intendedUse: 'explosive cosmic peak',
    intensity: 10,
    tags: ['supernova', 'burst', 'explosion', 'cosmic', 'star', 'brightness'],
    settings: { bpm: 152, audioSensitivity: 0.94, audioSmoothing: 0.3 },
    clipQueries: {
      layer1: ['supernova', 'explosion', 'burst', 'star', 'cosmic', 'bright'],
      layer2: ['light', 'glow', 'energy', 'radiation', 'cosmic', 'intense'],
      layer3: ['shimmer', 'shimmer burst', 'light flicker', 'cosmic shimmer', 'glitter'],
    },
    layerStrategy: [
      { role: 'burst', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'light', opacity: 0.68, blendMode: 'add', visible: true },
      { role: 'shimmer', opacity: 0.52, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.5,
      brightness: 1.2,
      shake: 0.28,
      strobe: 0.16,
    },
  },
  {
    id: 'singularity',
    name: 'SINGULARITY',
    mood: 'point of no return infinite density',
    energyProfile: 'Peak',
    intendedUse: 'ultimate climax moment',
    intensity: 10,
    tags: ['singularity', 'infinity', 'void', 'center', 'density', 'ultimate'],
    settings: { bpm: 158, audioSensitivity: 0.97, audioSmoothing: 0.28 },
    clipQueries: {
      layer1: ['singularity', 'infinity', 'void', 'center', 'black hole', 'density'],
      layer2: ['distortion', 'warp', 'gravity', 'pull', 'intense', 'breakdown'],
      layer3: ['chaos', 'noise', 'static', 'glitch', 'ultimate breakdown', 'finale'],
    },
    layerStrategy: [
      { role: 'singularity', opacity: 1.0, blendMode: 'normal', visible: true },
      { role: 'distortion', opacity: 0.74, blendMode: 'add', visible: true },
      { role: 'chaos', opacity: 0.56, blendMode: 'screen', visible: true },
    ],
    fxStrategy: {
      glow: 0.36,
      brightness: 1.04,
      shake: 0.42,
      strobe: 0.36,
    },
  },
]

export function groupDefaultScenesByEnergy(scenes = DEFAULT_SCENE_PRESETS) {
  const order = ['Calm', 'Build', 'Drop', 'Peak']
  return order.map((energyProfile) => ({
    energyProfile,
    scenes: scenes.filter((scene) => scene.energyProfile === energyProfile),
  }))
}

function scoreClipMatch(entry, matchers) {
  const hay = normalizeText(`${entry.clipName} ${entry.filePath}`)
  let score = 0
  for (let i = 0; i < matchers.length; i += 1) {
    const matcher = normalizeText(matchers[i])
    if (!matcher) {
      continue
    }
    if (hay.includes(matcher)) {
      score += 100 - i * 4
    }
  }
  return score
}

export function resolveSceneAssignments(scene, layers) {
  const library = []

  layers.forEach((layer) => {
    layer.slots.forEach((slot) => {
      if (slot.status === 'loaded' && slot.filePath) {
        library.push({
          sourceLayerIndex: layer.layerIndex,
          sourceSlotIndex: slot.slotIndex,
          clipName: slot.clipName,
          filePath: slot.filePath,
        })
      }
    })
  })

  const usedPaths = new Set()
  const layerStrategy = scene?.layerStrategy || []
  const clipQueries = scene?.clipQueries || {}
  const sceneId = scene?.id || 'unknown'

  const assignments = (layerStrategy || []).map((layerDef, targetLayerIndex) => {
    const queryKey = `layer${targetLayerIndex + 1}`
    const matchers = clipQueries[queryKey] || []

    if (!matchers.length) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Scene: ${sceneId}] No clip queries for layer${targetLayerIndex + 1}`)
      }
      return {
        ...layerDef,
        targetLayerIndex,
        clip: null,
        fallbackReason: 'no_matchers',
      }
    }

    const ranked = library
      .map((entry) => ({ entry, score: scoreClipMatch(entry, matchers) }))
      .sort((a, b) => b.score - a.score)

    const bestUnused = ranked.find((item) => !usedPaths.has(item.entry.filePath))
    const candidate = bestUnused || ranked[0] || null

    if (candidate?.entry?.filePath) {
      usedPaths.add(candidate.entry.filePath)
      if (process.env.NODE_ENV === 'development' && !bestUnused) {
        console.log(
          `[Scene: ${sceneId}] Layer ${targetLayerIndex + 1}: fallback to reused clip "${candidate.entry.clipName}"`,
        )
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.warn(`[Scene: ${sceneId}] Layer ${targetLayerIndex + 1}: no matching clips for matchers [${matchers.join(', ')}]`)
    }

    return {
      ...layerDef,
      targetLayerIndex,
      clip: candidate?.entry || null,
      fallbackReason: bestUnused ? null : candidate ? 'reused' : 'missing',
    }
  })

  const missingCount = assignments.filter((a) => !a.clip).length
  if (process.env.NODE_ENV === 'development' && missingCount > 0) {
    console.warn(`[Scene: ${sceneId}] ${missingCount} layers have no clip assignment (fallback or missing)`)
  }

  return {
    assignments,
    missingCount,
  }
}

export function buildMasterFxFromScene(scene) {
  const fxStrategy = scene?.fxStrategy || {}

  const masterFx = {
    shake: Number(fxStrategy.shake || 0),
    brightness: Number(fxStrategy.brightness || 1),
    strobe: Number(fxStrategy.strobe || 0),
  }

  return masterFx
}
