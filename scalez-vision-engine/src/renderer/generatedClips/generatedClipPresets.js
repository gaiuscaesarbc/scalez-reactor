/**
 * SCALEZ Generated Clip Presets - Cinematic Procedural Environments
 * 
 * Premium WebGL/Three.js-based scenes with:
 * - 3D depth and atmospheric effects
 * - Procedural geometry and terrain
 * - Camera movement and world-space motion
 * - Cinematic lighting, bloom, and fog
 * - Audio reactivity on camera, distortion, bloom, fog density
 * - Quality scaling for live VJ performance
 */

export const GENERATED_CLIP_PRESETS = [
  {
    id: 'gen_neon_megacity',
    name: 'NEON MEGACITY CANYON',
    type: 'generated',
    generatorType: 'neonMegacityCanyon',
    duration: null,
    loop: true,
    tags: ['cyberpunk', 'urban', 'neon', 'cinematic', 'camera-flight'],
    energyProfile: 'Peak',
    intensity: 10,
    description: 'Futuristic cityscape with towering neon-lit structures. Camera flies through procedural canyon of skyscrapers with bloom, lens flares, and atmospheric haze. Audio drives camera speed and building glow intensity.',
    settings: {
      cameraSpeed: 0.5,
      fogDensity: 0.003,
      bloomStrength: 1.2,
      colorScheme: 'cyan-magenta',
      qualityMode: 'auto',
      audioReactivity: {
        cameraSpeedMod: 'bass',
        glowIntensityMod: 'mids',
        bloomMod: 'energy',
        fogDensityMod: 'highs',
      },
    },
  },
  {
    id: 'gen_black_hole_cathedral',
    name: 'BLACK HOLE CATHEDRAL',
    type: 'generated',
    generatorType: 'blackHoleCathedral',
    duration: null,
    loop: true,
    tags: ['cosmic', 'cathedral', 'alien', 'dark', 'cinematic', 'ritual'],
    energyProfile: 'Peak',
    intensity: 10,
    description: 'A colossal alien megastructure surrounds a dangerous singularity. Towering pillars, broken cathedral rings, runic emissive panels, drifting ash, and deep fog layers create a dark ritual chamber. Bass drives black-hole pressure and lighting surges, mids shape heavy camera drift and ring motion, highs trigger rune flickers and spark artifacts.',
    settings: {
      cameraSpeed: 0.22,
      fogDensity: 0.006,
      bloomStrength: 1.3,
      colorScheme: 'void-cyan-violet-crimson',
      qualityMode: 'auto',
      audioReactivity: {
        blackHolePulseMod: 'bass',
        ringDriftMod: 'mids',
        runeFlickerMod: 'highs',
        exposurePulseMod: 'beat',
      },
    },
  },
  {
    id: 'gen_fractal_reactor',
    name: 'FRACTAL REACTOR CHAMBER',
    type: 'generated',
    generatorType: 'fractalReactorChamber',
    duration: null,
    loop: true,
    tags: ['fractal', 'geometric', 'sci-fi', 'energy', 'procedural'],
    energyProfile: 'Drop',
    intensity: 9,
    description: 'Infinite recursive fractal chamber with geometric walls. Glowing core pulses with energy. Camera spirals inward through layered fractal geometry. Walls shimmer with procedural displacement. Bloom and volumetric lighting.',
    settings: {
      fractalDepth: 8,
      coreGlowIntensity: 1.5,
      displacementAmount: 0.5,
      spiralSpeed: 0.3,
      qualityMode: 'auto',
      audioReactivity: {
        coreGlowMod: 'bass',
        displacementMod: 'mids',
        spiralSpeedMod: 'energy',
        bloomMod: 'beat',
      },
    },
  },
  {
    id: 'gen_infinite_hex_terrain',
    name: 'INFINITE HEX TERRAIN',
    type: 'generated',
    generatorType: 'infiniteHexTerrain',
    duration: null,
    loop: true,
    tags: ['terrain', 'geometric', 'procedural', 'abstract', 'digital'],
    energyProfile: 'Build',
    intensity: 8,
    description: 'Endless procedural hexagon-based landscape with Perlin noise displacement. Emissive hex tiles shift colors based on audio. Camera flies over the terrain with bloom and light rays. Scanlines and digital artifacts create cyberpunk aesthetic.',
    settings: {
      hexScale: 2.0,
      displacementAmount: 1.5,
      emissiveIntensity: 0.8,
      bloomRadius: 0.5,
      qualityMode: 'auto',
      audioReactivity: {
        hexHeightMod: 'bass',
        colorShiftMod: 'mids',
        emissiveIntensityMod: 'energy',
        cameraAltitudeMod: 'highs',
      },
    },
  },
]

export function getGeneratedClipById(id) {
  return GENERATED_CLIP_PRESETS.find((clip) => clip.id === id)
}

export function getAllGeneratedClips() {
  return [...GENERATED_CLIP_PRESETS]
}
