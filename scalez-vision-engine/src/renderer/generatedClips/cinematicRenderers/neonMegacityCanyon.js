import * as THREE from 'three'

/**
 * NEON MEGACITY CANYON
 * Flagship cinematic procedural world-space environment.
 */

const TMP_MATRIX = new THREE.Matrix4()
const TMP_QUAT = new THREE.Quaternion()
const TMP_SCALE = new THREE.Vector3()
const TMP_POS = new THREE.Vector3()

function createWindowTexture(seed = 1, options = {}) {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const fallback = new THREE.DataTexture(new Uint8Array([220, 220, 220, 255]), 1, 1)
    fallback.colorSpace = THREE.SRGBColorSpace
    fallback.needsUpdate = true
    return fallback
  }

  const rng = (() => {
    let s = seed * 2654435761
    return () => {
      s ^= s << 13
      s ^= s >> 17
      s ^= s << 5
      return ((s >>> 0) % 100000) / 100000
    }
  })()

  ctx.fillStyle = '#090d16'
  ctx.fillRect(0, 0, size, size)

  const cols = options.cols || (14 + Math.floor(rng() * 10))
  const rows = options.rows || (20 + Math.floor(rng() * 18))
  const cellW = size / cols
  const cellH = size / rows

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const deadZone = x > cols * 0.75 && y > rows * 0.65 && rng() > 0.6
      const lit = deadZone ? false : rng() > 0.28
      const warm = rng() > 0.75
      const hue = warm ? 30 + Math.floor(rng() * 18) : 188 + Math.floor(rng() * 15)
      const sat = warm ? 82 : 72
      const light = lit ? 62 + Math.floor(rng() * 24) : 8 + Math.floor(rng() * 8)
      ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`
      const padX = 0.6 + rng() * 2.2
      const padY = 0.7 + rng() * 2.4
      ctx.fillRect(
        x * cellW + padX,
        y * cellH + padY,
        Math.max(1, cellW - padX * 2),
        Math.max(1, cellH - padY * 2)
      )
    }
  }

  // Break perfect tiling with sparse scan bars and dead rows.
  for (let i = 0; i < 16; i += 1) {
    const y = Math.floor(rng() * rows) * cellH
    const flicker = 0.2 + rng() * 0.35
    ctx.fillStyle = `rgba(40, 220, 255, ${flicker})`
    ctx.fillRect(0, y, size, Math.max(1, cellH * 0.18))
  }
  for (let i = 0; i < 40; i += 1) {
    const x = Math.floor(rng() * cols) * cellW
    const y = Math.floor(rng() * rows) * cellH
    ctx.fillStyle = 'rgba(4, 6, 10, 0.9)'
    ctx.fillRect(x + 1, y + 1, Math.max(1, cellW - 2), Math.max(1, cellH - 2))
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1.8, 3.2)
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function createFacadeTexture(seed = 11) {
  const size = 256
  const data = new Uint8Array(size * size * 4)
  let s = seed * 9781

  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967295
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4
      const n = 0.82 + rand() * 0.3
      const stripe = Math.sin(x * 0.15) * 0.05 + Math.sin(y * 0.09) * 0.04
      const base = (24 + ((x + y) % 18)) * n + stripe * 255
      data[i] = Math.min(255, Math.max(0, base * 0.85))
      data[i + 1] = Math.min(255, Math.max(0, base * 0.95))
      data[i + 2] = Math.min(255, Math.max(0, base * 1.15))
      data[i + 3] = 255
    }
  }

  const tex = new THREE.DataTexture(data, size, size)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2.5, 6)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makeRoadShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uBass: { value: 0 },
      uMids: { value: 0 },
      uHighs: { value: 0 },
      uCamZ: { value: 0 },
      uColorA: { value: new THREE.Color(0x04111a) },
      uColorB: { value: new THREE.Color(0x1b0718) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBass;
      uniform float uMids;
      uniform float uHighs;
      uniform float uCamZ;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec2 vUv;
      varying vec3 vWorldPos;

      float hash(vec2 p) {
        p = fract(p * vec2(243.13, 191.17));
        p += dot(p, p + 33.33);
        return fract(p.x * p.y);
      }

      void main() {
        float zFlow = (vWorldPos.z + uCamZ) * -0.022;
        float lane = smoothstep(0.43, 0.45, abs(vUv.x - 0.5));
        float lanePulse = sin(zFlow * 7.5 - uTime * (5.0 + uMids * 8.0)) * 0.5 + 0.5;

        float streakA = smoothstep(0.86, 1.0, sin(zFlow * 3.8 - uTime * 2.4));
        float streakB = smoothstep(0.78, 1.0, sin((vUv.x * 20.0) + zFlow * 5.6 - uTime * (6.0 + uHighs * 10.0)));
        float streak = max(streakA * 0.55, streakB * 0.48);

        float grunge = hash(vUv * 64.0 + zFlow) * 0.18;
        float perspectiveFade = smoothstep(1.0, 0.08, vUv.y);

        vec3 base = mix(uColorA, uColorB, vUv.x * 0.55 + 0.22);
        vec3 laneGlow = vec3(0.05, 0.65, 0.8) * lane * (0.3 + lanePulse * (0.4 + uBass));
        vec3 streakColor = mix(vec3(0.7, 0.2, 0.95), vec3(0.2, 0.9, 1.0), vUv.x) * streak * (0.25 + uBass * 0.7);

        vec3 color = base + laneGlow + streakColor;
        color *= (0.86 + perspectiveFade * 0.24);
        color += grunge;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  })
}

function updateInstanceMatrix(mesh, index, data) {
  TMP_POS.set(data.x, data.y, data.z)
  TMP_QUAT.setFromEuler(new THREE.Euler(data.rx || 0, data.ry || 0, data.rz || 0))
  TMP_SCALE.set(data.sx, data.sy, data.sz)
  TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE)
  mesh.setMatrixAt(index, TMP_MATRIX)
}

function createBuildingData({ count, side, corridorLength, near = false, far = false }) {
  const items = []

  for (let i = 0; i < count; i += 1) {
    let width = near ? 9 + Math.random() * 18 : far ? 16 + Math.random() * 22 : 10 + Math.random() * 20
    let height = near ? 30 + Math.random() * 220 : far ? 80 + Math.random() * 260 : 24 + Math.random() * 140
    let depth = near ? 18 + Math.random() * 30 : far ? 50 + Math.random() * 80 : 14 + Math.random() * 28

    // Rare giant structures break scale monotony and imply a larger metropolis.
    if (!far && Math.random() > 0.94) {
      width *= 1.8 + Math.random() * 0.8
      height *= 1.7 + Math.random() * 1.2
      depth *= 1.6 + Math.random() * 0.9
    }

    const sideOffset = near ? 28 : far ? 78 : 46
    const sideJitter = near ? 16 : far ? 22 : 14

    const asymmetryBias = side < 0 ? -4 + Math.random() * 2 : 3 + Math.random() * 6
    const boulevardWave = Math.sin((i / Math.max(1, count)) * Math.PI * 6 + side * 0.7) * (near ? 4.5 : far ? 7.5 : 5.8)
    const corridorJitter = (Math.random() - 0.5) * (near ? 90 : far ? 150 : 120)

    items.push({
      x: side * (sideOffset + width * 0.34 + Math.random() * sideJitter) + asymmetryBias + boulevardWave,
      y: height * 0.5 - 1.2,
      z: -((i / Math.max(1, count)) * corridorLength) + corridorJitter,
      sx: width,
      sy: height,
      sz: depth,
      ry: (Math.random() - 0.5) * (near ? 0.06 : 0.12),
      rz: (Math.random() - 0.5) * 0.02,
      rx: 0,
      side,
      tier: far ? 'far' : near ? 'near' : 'mid',
    })
  }

  return items
}

function recycleInstances(mesh, data, cameraZ, corridorLength, wrapLead, randomizeScale = false) {
  let changed = false
  const recycleZ = cameraZ - corridorLength - 120
  const frontLimit = cameraZ + wrapLead

  for (let i = 0; i < data.length; i += 1) {
    const item = data[i]
    if (item.z > frontLimit) {
      item.z = recycleZ - Math.random() * 340
      if (randomizeScale) {
        const scaleJitter = 0.82 + Math.random() * 0.46
        item.sy *= scaleJitter
        item.sy = Math.max(22, Math.min(item.sy, 320))
        item.y = item.sy * 0.5 - 1.2
      }
      updateInstanceMatrix(mesh, i, item)
      changed = true
    }
  }

  if (changed) {
    mesh.instanceMatrix.needsUpdate = true
  }
}

function createSkyBridgeData(count, corridorLength) {
  const bridges = []
  for (let i = 0; i < count; i += 1) {
    const y = 16 + Math.random() * 44
    const span = 46 + Math.random() * 30
    bridges.push({
      x: (Math.random() - 0.5) * 5,
      y,
      z: -Math.random() * corridorLength,
      sx: span,
      sy: 2 + Math.random() * 2.5,
      sz: 8 + Math.random() * 7,
      ry: (Math.random() - 0.5) * 0.08,
      rx: 0,
      rz: 0,
    })
  }
  return bridges
}

function createSignPanelData(count, corridorLength) {
  const items = []
  for (let i = 0; i < count; i += 1) {
    const side = Math.random() > 0.5 ? 1 : -1
    items.push({
      side,
      x: side * (21 + Math.random() * 34),
      y: 6 + Math.random() * 46,
      z: -Math.random() * corridorLength,
      sx: 2 + Math.random() * 8,
      sy: 0.6 + Math.random() * 3.2,
      sz: 1,
      ry: side > 0 ? -0.32 - Math.random() * 0.18 : 0.32 + Math.random() * 0.18,
      rx: (Math.random() - 0.5) * 0.05,
      rz: (Math.random() - 0.5) * 0.05,
      pulse: Math.random() * Math.PI * 2,
    })
  }
  return items
}

function makePointCloud(count, corridorLength, width, minY, maxY, color, size, opacity) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const idx = i * 3
    positions[idx] = (Math.random() - 0.5) * width
    positions[idx + 1] = minY + Math.random() * (maxY - minY)
    positions[idx + 2] = -Math.random() * corridorLength
    velocities[i] = 0.8 + Math.random() * 2.4
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color,
    size,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  return {
    points: new THREE.Points(geometry, material),
    positions,
    velocities,
  }
}

function makeFogSheetMaterial(color, opacity = 0.08) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  })
}

export const neonMegacityCanyonRenderer = {
  createScene({ scene, camera, qualityPreset }) {
    const pr = qualityPreset?.pixelRatio ?? 0.5
    const qualityBand = pr <= 0.35 ? 'safe' : pr <= 0.5 ? 'performance' : 'ultra'

    const counts = {
      nearBuildings: qualityBand === 'safe' ? 90 : qualityBand === 'performance' ? 140 : 200,
      midBuildings: qualityBand === 'safe' ? 70 : qualityBand === 'performance' ? 110 : 150,
      farBuildings: qualityBand === 'safe' ? 34 : qualityBand === 'performance' ? 50 : 66,
      megaStructures: qualityBand === 'safe' ? 8 : qualityBand === 'performance' ? 12 : 18,
      skylineTowers: qualityBand === 'safe' ? 30 : qualityBand === 'performance' ? 46 : 68,
      skyBridges: qualityBand === 'safe' ? 22 : qualityBand === 'performance' ? 34 : 46,
      signPanels: qualityBand === 'safe' ? 30 : qualityBand === 'performance' ? 54 : 80,
      sparkCount: qualityBand === 'safe' ? 120 : qualityBand === 'performance' ? 200 : 300,
      hazeCount: qualityBand === 'safe' ? 180 : qualityBand === 'performance' ? 280 : 420,
      foregroundDust: qualityBand === 'safe' ? 80 : qualityBand === 'performance' ? 140 : 220,
      roadMistCount: qualityBand === 'safe' ? 6 : qualityBand === 'performance' ? 10 : 14,
      fogSheets: qualityBand === 'safe' ? 5 : qualityBand === 'performance' ? 8 : 12,
      distantLights: qualityBand === 'safe' ? 70 : qualityBand === 'performance' ? 110 : 170,
      dataFragments: qualityBand === 'safe' ? 16 : qualityBand === 'performance' ? 26 : 40,
      droneCount: qualityBand === 'safe' ? 20 : qualityBand === 'performance' ? 34 : 52,
      foregroundStreaks: qualityBand === 'safe' ? 6 : qualityBand === 'performance' ? 10 : 14,
      silhouetteRunners: qualityBand === 'safe' ? 3 : qualityBand === 'performance' ? 5 : 7,
    }

    const state = {
      time: 0,
      scene,
      corridorLength: 2800,
      canyonWidth: 108,
      travelSpeedBase: 38,
      speedSmoothed: 38,
      cameraVelX: 0,
      cameraVelY: 0,
      cameraLookTarget: new THREE.Vector3(0, 12, -120),
      glitchTimer: 0,
      glitchPulse: 0,
      prevBass: 0,
      beatPulse: 0,
      eventCooldown: 1.8,
      eventPulse: 0,
      postFx: {
        bloomStrength: qualityBand === 'safe' ? 0.65 : qualityBand === 'performance' ? 0.95 : 1.2,
        bloomRadius: qualityBand === 'safe' ? 0.42 : qualityBand === 'performance' ? 0.6 : 0.75,
        bloomThreshold: 0.79,
        noiseAmount: qualityBand === 'safe' ? 0.022 : qualityBand === 'performance' ? 0.03 : 0.04,
        vignetteStrength: 0.46,
        saturation: 0.9,
        chromaticAberration: 0.0008,
        exposure: 1.0,
      },
      trackedObjects: [],
      windowTextures: [],
      facadeTextures: [],
      nearBuildingDataLeft: [],
      nearBuildingDataRight: [],
      midBuildingDataLeft: [],
      midBuildingDataRight: [],
      farBuildingDataLeft: [],
      farBuildingDataRight: [],
      megaStructureData: [],
      skylineData: [],
      bridgeData: [],
      droneData: [],
      roadMistPlanes: [],
      fogSheets: [],
      dataFragments: [],
      distantLightPositions: null,
      distantLightVelocities: null,
      sparkPositions: null,
      sparkVelocities: null,
      hazePositions: null,
      hazeVelocities: null,
      foregroundDustPositions: null,
      foregroundDustVelocities: null,
      roadMaterial: null,
      signPanels: null,
      signPanelData: [],
      foregroundStreaks: [],
      silhouetteRunners: [],
      horizonGlow: null,
      scanSweep: null,
      cyanLight: null,
      magentaLight: null,
      overheadLight: null,
      sideRimLeft: null,
      sideRimRight: null,
    }

    scene.background = new THREE.Color(0x020309)
    scene.fog = new THREE.FogExp2(0x04060d, qualityBand === 'safe' ? 0.0074 : 0.0066)

    camera.position.set(0, 12, 24)
    camera.lookAt(0, 10, -120)

    const ambient = new THREE.AmbientLight(0x335577, 0.36)
    scene.add(ambient)
    state.trackedObjects.push(ambient)

    const moonKey = new THREE.DirectionalLight(0x98bbff, 0.7)
    moonKey.position.set(120, 160, -80)
    scene.add(moonKey)
    state.trackedObjects.push(moonKey)

    state.cyanLight = new THREE.PointLight(0x1bcfff, 2.0, 260, 2)
    state.cyanLight.position.set(22, 16, -54)
    scene.add(state.cyanLight)

    state.magentaLight = new THREE.PointLight(0xff3ca1, 1.8, 260, 2)
    state.magentaLight.position.set(-24, 14, -62)
    scene.add(state.magentaLight)

    state.overheadLight = new THREE.SpotLight(0x7ca8ff, 1.2, 320, Math.PI * 0.22, 0.58, 1.5)
    state.overheadLight.position.set(0, 58, -84)
    state.overheadLight.target.position.set(0, 2, -160)
    scene.add(state.overheadLight)
    scene.add(state.overheadLight.target)

    state.sideRimLeft = new THREE.PointLight(0x53dfff, 0.7, 180, 2)
    state.sideRimLeft.position.set(-44, 8, -120)
    scene.add(state.sideRimLeft)

    state.sideRimRight = new THREE.PointLight(0xff4ec8, 0.68, 180, 2)
    state.sideRimRight.position.set(44, 8, -128)
    scene.add(state.sideRimRight)

    state.trackedObjects.push(
      state.cyanLight,
      state.magentaLight,
      state.overheadLight,
      state.overheadLight.target,
      state.sideRimLeft,
      state.sideRimRight
    )

    const windowTexA = createWindowTexture(13, { cols: 16, rows: 30 })
    const windowTexB = createWindowTexture(29, { cols: 21, rows: 25 })
    const windowTexC = createWindowTexture(43, { cols: 14, rows: 38 })
    const facadeTexA = createFacadeTexture(7)
    const facadeTexB = createFacadeTexture(17)
    const facadeTexC = createFacadeTexture(23)
    state.windowTextures.push(windowTexA, windowTexB, windowTexC)
    state.facadeTextures.push(facadeTexA, facadeTexB, facadeTexC)

    const nearGeo = new THREE.BoxGeometry(1, 1, 1)
    const midGeo = new THREE.BoxGeometry(1, 1, 1)
    const farGeo = new THREE.BoxGeometry(1, 1, 1)

    const nearMatLeft = new THREE.MeshStandardMaterial({
      color: 0x0d1628,
      map: facadeTexA,
      emissiveMap: windowTexA,
      emissive: 0x14c8ff,
      emissiveIntensity: 1.25,
      metalness: 0.82,
      roughness: 0.34,
    })
    const nearMatRight = new THREE.MeshStandardMaterial({
      color: 0x1c1027,
      map: facadeTexB,
      emissiveMap: windowTexB,
      emissive: 0xff40b7,
      emissiveIntensity: 1.2,
      metalness: 0.82,
      roughness: 0.35,
    })

    const midMatLeft = new THREE.MeshStandardMaterial({
      color: 0x081427,
      map: facadeTexA,
      emissiveMap: windowTexA,
      emissive: 0x16bfff,
      emissiveIntensity: 0.95,
      metalness: 0.84,
      roughness: 0.42,
    })
    const midMatRight = new THREE.MeshStandardMaterial({
      color: 0x180d25,
      map: facadeTexC,
      emissiveMap: windowTexC,
      emissive: 0xff3d9e,
      emissiveIntensity: 0.92,
      metalness: 0.84,
      roughness: 0.44,
    })

    const farMat = new THREE.MeshStandardMaterial({
      color: 0x121827,
      emissive: 0x16335a,
      emissiveIntensity: 0.58,
      metalness: 0.9,
      roughness: 0.52,
    })

    const nearLeftCount = counts.nearBuildings - (qualityBand === 'safe' ? 8 : 14)
    const nearRightCount = counts.nearBuildings + (qualityBand === 'safe' ? 5 : 10)
    const midLeftCount = counts.midBuildings - (qualityBand === 'safe' ? 5 : 9)
    const midRightCount = counts.midBuildings + (qualityBand === 'safe' ? 4 : 8)
    const farLeftCount = counts.farBuildings + (qualityBand === 'safe' ? 2 : 4)
    const farRightCount = counts.farBuildings - (qualityBand === 'safe' ? 1 : 3)

    state.nearBuildingDataLeft = createBuildingData({
      count: nearLeftCount,
      side: -1,
      corridorLength: state.corridorLength,
      near: true,
    })
    state.nearBuildingDataRight = createBuildingData({
      count: nearRightCount,
      side: 1,
      corridorLength: state.corridorLength,
      near: true,
    })

    state.midBuildingDataLeft = createBuildingData({
      count: midLeftCount,
      side: -1,
      corridorLength: state.corridorLength,
      near: false,
      far: false,
    })
    state.midBuildingDataRight = createBuildingData({
      count: midRightCount,
      side: 1,
      corridorLength: state.corridorLength,
      near: false,
      far: false,
    })

    state.farBuildingDataLeft = createBuildingData({
      count: farLeftCount,
      side: -1,
      corridorLength: state.corridorLength,
      near: false,
      far: true,
    })
    state.farBuildingDataRight = createBuildingData({
      count: farRightCount,
      side: 1,
      corridorLength: state.corridorLength,
      near: false,
      far: true,
    })

    const nearLeft = new THREE.InstancedMesh(nearGeo, nearMatLeft, state.nearBuildingDataLeft.length)
    const nearRight = new THREE.InstancedMesh(nearGeo, nearMatRight, state.nearBuildingDataRight.length)
    const midLeft = new THREE.InstancedMesh(midGeo, midMatLeft, state.midBuildingDataLeft.length)
    const midRight = new THREE.InstancedMesh(midGeo, midMatRight, state.midBuildingDataRight.length)
    const farLeft = new THREE.InstancedMesh(farGeo, farMat, state.farBuildingDataLeft.length)
    const farRight = new THREE.InstancedMesh(farGeo, farMat, state.farBuildingDataRight.length)

    nearLeft.frustumCulled = false
    nearRight.frustumCulled = false
    midLeft.frustumCulled = false
    midRight.frustumCulled = false
    farLeft.frustumCulled = false
    farRight.frustumCulled = false

    state.nearBuildingDataLeft.forEach((item, i) => updateInstanceMatrix(nearLeft, i, item))
    state.nearBuildingDataRight.forEach((item, i) => updateInstanceMatrix(nearRight, i, item))
    state.midBuildingDataLeft.forEach((item, i) => updateInstanceMatrix(midLeft, i, item))
    state.midBuildingDataRight.forEach((item, i) => updateInstanceMatrix(midRight, i, item))
    state.farBuildingDataLeft.forEach((item, i) => updateInstanceMatrix(farLeft, i, item))
    state.farBuildingDataRight.forEach((item, i) => updateInstanceMatrix(farRight, i, item))

    scene.add(nearLeft, nearRight, midLeft, midRight, farLeft, farRight)
    state.nearLeft = nearLeft
    state.nearRight = nearRight
    state.midLeft = midLeft
    state.midRight = midRight
    state.farLeft = farLeft
    state.farRight = farRight
    state.trackedObjects.push(nearLeft, nearRight, midLeft, midRight, farLeft, farRight)

    const megaGeo = new THREE.BoxGeometry(1, 1, 1)
    const megaMat = new THREE.MeshStandardMaterial({
      color: 0x161b2a,
      emissive: 0x20355a,
      emissiveIntensity: 0.74,
      metalness: 0.9,
      roughness: 0.44,
    })
    for (let i = 0; i < counts.megaStructures; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      state.megaStructureData.push({
        x: side * (66 + Math.random() * 30),
        y: 120 + Math.random() * 240,
        z: -Math.random() * (state.corridorLength * 1.35),
        sx: 34 + Math.random() * 45,
        sy: 240 + Math.random() * 500,
        sz: 44 + Math.random() * 90,
        ry: (Math.random() - 0.5) * 0.14,
        rx: 0,
        rz: (Math.random() - 0.5) * 0.03,
      })
    }
    const megaStructures = new THREE.InstancedMesh(megaGeo, megaMat, state.megaStructureData.length)
    megaStructures.frustumCulled = false
    state.megaStructureData.forEach((item, i) => updateInstanceMatrix(megaStructures, i, item))
    scene.add(megaStructures)
    state.megaStructures = megaStructures
    state.trackedObjects.push(megaStructures)

    const skylineGeo = new THREE.BoxGeometry(1, 1, 1)
    const skylineMat = new THREE.MeshStandardMaterial({
      color: 0x121624,
      emissive: 0x1b2d4d,
      emissiveIntensity: 0.42,
      metalness: 0.86,
      roughness: 0.58,
    })
    for (let i = 0; i < counts.skylineTowers; i += 1) {
      const side = Math.random() > 0.5 ? 1 : -1
      state.skylineData.push({
        x: side * (95 + Math.random() * 120),
        y: 60 + Math.random() * 140,
        z: -Math.random() * (state.corridorLength * 1.8) - 300,
        sx: 24 + Math.random() * 34,
        sy: 80 + Math.random() * 220,
        sz: 36 + Math.random() * 70,
        ry: (Math.random() - 0.5) * 0.2,
        rx: 0,
        rz: 0,
      })
    }
    const skyline = new THREE.InstancedMesh(skylineGeo, skylineMat, state.skylineData.length)
    skyline.frustumCulled = false
    state.skylineData.forEach((item, i) => updateInstanceMatrix(skyline, i, item))
    scene.add(skyline)
    state.skyline = skyline
    state.trackedObjects.push(skyline)

    state.bridgeData = createSkyBridgeData(counts.skyBridges, state.corridorLength)
    const bridgeGeo = new THREE.BoxGeometry(1, 1, 1)
    const bridgeMat = new THREE.MeshStandardMaterial({
      color: 0x1b2030,
      emissive: 0x2b2346,
      emissiveIntensity: 0.72,
      metalness: 0.78,
      roughness: 0.3,
    })
    const bridges = new THREE.InstancedMesh(bridgeGeo, bridgeMat, state.bridgeData.length)
    bridges.frustumCulled = false
    state.bridgeData.forEach((item, i) => updateInstanceMatrix(bridges, i, item))
    scene.add(bridges)
    state.bridges = bridges
    state.trackedObjects.push(bridges)

    const railGeo = new THREE.BoxGeometry(1, 1, 1)
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x0f1320,
      emissive: 0x2ad4ff,
      emissiveIntensity: 1.6,
      metalness: 0.5,
      roughness: 0.2,
    })
    const bridgeRails = new THREE.InstancedMesh(railGeo, railMat, state.bridgeData.length * 2)
    bridgeRails.frustumCulled = false
    state.bridgeData.forEach((b, i) => {
      updateInstanceMatrix(bridgeRails, i * 2, {
        x: b.x,
        y: b.y + b.sy * 0.34,
        z: b.z + b.sz * 0.45,
        sx: b.sx * 0.96,
        sy: 0.24,
        sz: 0.34,
        ry: b.ry,
      })
      updateInstanceMatrix(bridgeRails, i * 2 + 1, {
        x: b.x,
        y: b.y + b.sy * 0.34,
        z: b.z - b.sz * 0.45,
        sx: b.sx * 0.96,
        sy: 0.24,
        sz: 0.34,
        ry: b.ry,
      })
    })
    scene.add(bridgeRails)
    state.bridgeRails = bridgeRails
    state.trackedObjects.push(bridgeRails)

    state.signPanelData = createSignPanelData(counts.signPanels, state.corridorLength)
    const signPanelGeo = new THREE.PlaneGeometry(1, 1)
    const signPanelMat = new THREE.MeshStandardMaterial({
      color: 0x101426,
      emissive: 0x66cfff,
      emissiveIntensity: 1.0,
      metalness: 0.12,
      roughness: 0.3,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    })
    const signPanels = new THREE.InstancedMesh(signPanelGeo, signPanelMat, state.signPanelData.length)
    signPanels.frustumCulled = false
    state.signPanelData.forEach((panel, i) => updateInstanceMatrix(signPanels, i, panel))
    scene.add(signPanels)
    state.signPanels = signPanels
    state.trackedObjects.push(signPanels)

    const droneGeo = new THREE.CapsuleGeometry(0.5, 1.6, 3, 6)
    const droneMat = new THREE.MeshStandardMaterial({
      color: 0x111629,
      emissive: 0x54d9ff,
      emissiveIntensity: 1.2,
      metalness: 0.72,
      roughness: 0.18,
    })

    const drones = new THREE.InstancedMesh(droneGeo, droneMat, counts.droneCount)
    drones.frustumCulled = false
    for (let i = 0; i < counts.droneCount; i += 1) {
      const side = Math.random() > 0.5 ? 1 : -1
      const item = {
        x: side * (12 + Math.random() * 28),
        y: 8 + Math.random() * 24,
        z: -Math.random() * state.corridorLength,
        sx: 1,
        sy: 1,
        sz: 1,
        ry: Math.random() * Math.PI * 2,
        rx: 0,
        rz: 0,
        phase: Math.random() * Math.PI * 2,
        side,
      }
      state.droneData.push(item)
      updateInstanceMatrix(drones, i, item)
    }
    scene.add(drones)
    state.drones = drones
    state.trackedObjects.push(drones)

    const roadMat = makeRoadShaderMaterial()
    const roadGeometry = new THREE.PlaneGeometry(46, state.corridorLength, 32, 220)
    const roadPositions = roadGeometry.getAttribute('position')
    const roadBasePositions = new Float32Array(roadPositions.array.length)
    roadBasePositions.set(roadPositions.array)
    const road = new THREE.Mesh(roadGeometry, roadMat)
    road.rotation.x = -Math.PI / 2
    road.position.set(0, -1.2, -state.corridorLength * 0.5)
    scene.add(road)
    state.road = road
    state.roadPositions = roadPositions
    state.roadBasePositions = roadBasePositions
    state.roadMaterial = roadMat
    state.trackedObjects.push(road)

    for (let i = 0; i < counts.roadMistCount; i += 1) {
      const mist = new THREE.Mesh(
        new THREE.PlaneGeometry(18 + Math.random() * 26, 120 + Math.random() * 160),
        makeFogSheetMaterial(i % 2 === 0 ? 0x5f89b6 : 0x775d91, 0.035 + Math.random() * 0.04)
      )
      mist.rotation.x = -Math.PI / 2
      mist.position.set(
        (Math.random() - 0.5) * 20,
        -0.6 + Math.random() * 0.18,
        camera.position.z - 180 - Math.random() * 900
      )
      mist.userData = {
        speed: 8 + Math.random() * 10,
        drift: (Math.random() - 0.5) * 1.2,
      }
      scene.add(mist)
      state.roadMistPlanes.push(mist)
      state.trackedObjects.push(mist)
    }

    const laneEdgeGeo = new THREE.BoxGeometry(0.3, 0.12, state.corridorLength)
    const laneEdgeMat = new THREE.MeshStandardMaterial({
      color: 0x173147,
      emissive: 0x34d7ff,
      emissiveIntensity: 1.2,
      metalness: 0.22,
      roughness: 0.35,
      transparent: true,
      opacity: 0.9,
    })
    const laneEdgeLeft = new THREE.Mesh(laneEdgeGeo, laneEdgeMat)
    laneEdgeLeft.position.set(-19.5, -0.93, -state.corridorLength * 0.5)
    const laneEdgeRight = laneEdgeLeft.clone()
    laneEdgeRight.material = laneEdgeMat.clone()
    laneEdgeRight.position.x = 19.5
    scene.add(laneEdgeLeft, laneEdgeRight)
    state.laneEdgeLeft = laneEdgeLeft
    state.laneEdgeRight = laneEdgeRight
    state.trackedObjects.push(laneEdgeLeft, laneEdgeRight)

    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(460, 170),
      new THREE.MeshBasicMaterial({
        color: 0x3b4a7b,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    horizonGlow.position.set(0, 44, camera.position.z - 980)
    scene.add(horizonGlow)
    state.horizonGlow = horizonGlow
    state.trackedObjects.push(horizonGlow)

    const scanSweep = new THREE.Mesh(
      new THREE.PlaneGeometry(210, 46),
      new THREE.MeshBasicMaterial({
        color: 0x63daff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    scanSweep.position.set(0, 16, camera.position.z - 210)
    scene.add(scanSweep)
    state.scanSweep = scanSweep
    state.trackedObjects.push(scanSweep)

    const beamGeo = new THREE.ConeGeometry(6, 64, 24, 1, true)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x5cb5ff,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })
    const beamLeft = new THREE.Mesh(beamGeo, beamMat)
    beamLeft.position.set(-22, 30, -145)
    beamLeft.rotation.z = -Math.PI * 0.09
    beamLeft.rotation.x = Math.PI

    const beamRight = new THREE.Mesh(beamGeo, beamMat.clone())
    beamRight.material.color = new THREE.Color(0xff58c7)
    beamRight.position.set(24, 32, -156)
    beamRight.rotation.z = Math.PI * 0.07
    beamRight.rotation.x = Math.PI

    scene.add(beamLeft, beamRight)
    state.beamLeft = beamLeft
    state.beamRight = beamRight
    state.trackedObjects.push(beamLeft, beamRight)

    const sparkCloud = makePointCloud(
      counts.sparkCount,
      state.corridorLength,
      78,
      1,
      62,
      0xa6f4ff,
      qualityBand === 'safe' ? 0.14 : 0.2,
      0.82
    )
    scene.add(sparkCloud.points)
    state.sparkPoints = sparkCloud.points
    state.sparkPositions = sparkCloud.positions
    state.sparkVelocities = sparkCloud.velocities
    state.trackedObjects.push(sparkCloud.points)

    const hazeCloud = makePointCloud(
      counts.hazeCount,
      state.corridorLength,
      150,
      5,
      100,
      0x6e80a8,
      qualityBand === 'safe' ? 0.65 : 0.88,
      qualityBand === 'safe' ? 0.08 : 0.11
    )
    hazeCloud.points.material.blending = THREE.NormalBlending
    scene.add(hazeCloud.points)
    state.hazePoints = hazeCloud.points
    state.hazePositions = hazeCloud.positions
    state.hazeVelocities = hazeCloud.velocities
    state.trackedObjects.push(hazeCloud.points)

    const distantLights = makePointCloud(
      counts.distantLights,
      state.corridorLength * 2,
      340,
      24,
      220,
      0x7db2ff,
      qualityBand === 'safe' ? 0.5 : 0.75,
      0.2
    )
    scene.add(distantLights.points)
    state.distantLightPoints = distantLights.points
    state.distantLightPositions = distantLights.positions
    state.distantLightVelocities = distantLights.velocities
    state.trackedObjects.push(distantLights.points)

    for (let i = 0; i < counts.fogSheets; i += 1) {
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(80 + Math.random() * 120, 48 + Math.random() * 90),
        makeFogSheetMaterial(i % 2 === 0 ? 0x5577a8 : 0x6f5888, 0.04 + Math.random() * 0.06)
      )
      sheet.position.set(
        (Math.random() - 0.5) * 120,
        10 + Math.random() * 60,
        camera.position.z - 120 - Math.random() * 1400
      )
      sheet.rotation.y = (Math.random() - 0.5) * 0.6
      sheet.userData = {
        speed: 4 + Math.random() * 8,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: 4 + Math.random() * 10,
      }
      scene.add(sheet)
      state.fogSheets.push(sheet)
      state.trackedObjects.push(sheet)
    }

    for (let i = 0; i < counts.dataFragments; i += 1) {
      const frag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.8 + Math.random() * 3.2, 0.24 + Math.random() * 1.1),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x67e1ff : i % 3 === 1 ? 0xff72d1 : 0x9bc5ff,
          transparent: true,
          opacity: 0.14 + Math.random() * 0.22,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
      frag.position.set(
        (Math.random() - 0.5) * 80,
        6 + Math.random() * 70,
        camera.position.z - 80 - Math.random() * 1000
      )
      frag.rotation.z = (Math.random() - 0.5) * 1.2
      frag.userData = {
        speed: 10 + Math.random() * 18,
        drift: (Math.random() - 0.5) * 1.4,
        pulse: Math.random() * Math.PI * 2,
      }
      scene.add(frag)
      state.dataFragments.push(frag)
      state.trackedObjects.push(frag)
    }

    const foregroundDust = makePointCloud(
      counts.foregroundDust,
      520,
      32,
      -0.4,
      22,
      0x90adcc,
      qualityBand === 'safe' ? 0.22 : 0.34,
      qualityBand === 'safe' ? 0.15 : 0.22
    )
    foregroundDust.points.material.blending = THREE.NormalBlending
    scene.add(foregroundDust.points)
    state.foregroundDustPoints = foregroundDust.points
    state.foregroundDustPositions = foregroundDust.positions
    state.foregroundDustVelocities = foregroundDust.velocities
    state.trackedObjects.push(foregroundDust.points)

    for (let i = 0; i < counts.foregroundStreaks; i += 1) {
      const streak = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9 + Math.random() * 2.4, 12 + Math.random() * 22),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x4fd8ff : 0xff58cb,
          transparent: true,
          opacity: 0.04 + Math.random() * 0.06,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      )
      streak.position.set((Math.random() - 0.5) * 16, 2 + Math.random() * 18, camera.position.z - 20 - Math.random() * 260)
      streak.rotation.z = (Math.random() - 0.5) * 0.3
      streak.userData = {
        speed: 32 + Math.random() * 36,
        drift: (Math.random() - 0.5) * 0.9,
      }
      scene.add(streak)
      state.foregroundStreaks.push(streak)
      state.trackedObjects.push(streak)
    }

    for (let i = 0; i < counts.silhouetteRunners; i += 1) {
      const runner = new THREE.Mesh(
        new THREE.BoxGeometry(2 + Math.random() * 3, 8 + Math.random() * 20, 1.2 + Math.random() * 2.4),
        new THREE.MeshStandardMaterial({
          color: 0x06080f,
          emissive: 0x0e1020,
          emissiveIntensity: 0.12,
          roughness: 0.88,
          metalness: 0.08,
          transparent: true,
          opacity: 0.86,
        })
      )
      const side = Math.random() > 0.5 ? 1 : -1
      runner.position.set(side * (9 + Math.random() * 9), 3 + Math.random() * 11, camera.position.z - 40 - Math.random() * 420)
      runner.userData = {
        speed: 22 + Math.random() * 24,
        side,
        driftPhase: Math.random() * Math.PI * 2,
      }
      scene.add(runner)
      state.silhouetteRunners.push(runner)
      state.trackedObjects.push(runner)
    }

    return state
  },

  updateScene({ deltaTime, spectrumLevels }, state) {
    if (!state || !state.camera) return

    state.time += deltaTime

    const bass = spectrumLevels?.sub ?? spectrumLevels?.low ?? 0
    const mids = spectrumLevels?.lowMid ?? spectrumLevels?.mid ?? 0
    const highs = spectrumLevels?.presence ?? spectrumLevels?.high ?? 0

    const bassDelta = bass - state.prevBass
    state.prevBass = bass
    if (bass > 0.36 && bassDelta > 0.13) {
      state.beatPulse = 1
    } else {
      state.beatPulse = Math.max(0, state.beatPulse - deltaTime * 2.8)
    }

    if (highs > 0.78) {
      state.glitchTimer = Math.min(0.22, state.glitchTimer + deltaTime * 3.6)
      state.glitchPulse = Math.max(state.glitchPulse, highs)
    } else {
      state.glitchTimer = Math.max(0, state.glitchTimer - deltaTime * 1.5)
      state.glitchPulse = Math.max(0, state.glitchPulse - deltaTime * 1.1)
    }

    state.eventCooldown -= deltaTime
    if (state.eventCooldown <= 0 && (highs > 0.72 || bassDelta > 0.16)) {
      state.eventPulse = 1
      state.eventCooldown = 2.5 + Math.random() * 4.2
    } else {
      state.eventPulse = Math.max(0, state.eventPulse - deltaTime * 2.1)
    }

    const speedTarget = state.travelSpeedBase + mids * 46 + bass * 8 + state.beatPulse * 5
    state.speedSmoothed += (speedTarget - state.speedSmoothed) * Math.min(1, deltaTime * 2.6)
    state.camera.position.z -= deltaTime * state.speedSmoothed

    const laneSway = Math.sin(state.time * 0.22) * (2.0 + mids * 2.2)
    const orbit = Math.sin(state.time * 0.07) * 3.5
    const breathing = Math.sin(state.time * 0.045) * 1.2
    const jitter = state.glitchTimer > 0.02 ? (Math.random() - 0.5) * 0.9 * state.glitchPulse : 0
    const targetX = laneSway + orbit + breathing + jitter
    const targetY = 10 + Math.sin(state.time * 0.17) * (1.4 + mids * 1.1) + bass * 0.8 + Math.sin(state.time * 0.053) * 0.45

    state.cameraVelX += (targetX - state.camera.position.x) * Math.min(1, deltaTime * 2.8)
    state.cameraVelY += (targetY - state.camera.position.y) * Math.min(1, deltaTime * 2.4)
    state.cameraVelX *= 0.92
    state.cameraVelY *= 0.9
    state.camera.position.x += state.cameraVelX * deltaTime * 6
    state.camera.position.y += state.cameraVelY * deltaTime * 6

    const lookAhead = 130 + mids * 45
    state.cameraLookTarget.set(
      Math.sin(state.time * 0.19) * 8 + jitter * 0.7,
      11 + bass * 2,
      state.camera.position.z - lookAhead
    )
    state.camera.lookAt(state.cameraLookTarget)
    state.camera.rotation.z = Math.sin(state.time * 0.33) * 0.04 + state.cameraVelX * 0.012 + (state.glitchTimer > 0.02 ? jitter * 0.02 : 0)

    const wrapLead = 80
    recycleInstances(state.nearLeft, state.nearBuildingDataLeft, state.camera.position.z, state.corridorLength, wrapLead)
    recycleInstances(state.nearRight, state.nearBuildingDataRight, state.camera.position.z, state.corridorLength, wrapLead)
    recycleInstances(state.midLeft, state.midBuildingDataLeft, state.camera.position.z, state.corridorLength, wrapLead, true)
    recycleInstances(state.midRight, state.midBuildingDataRight, state.camera.position.z, state.corridorLength, wrapLead, true)
    recycleInstances(state.farLeft, state.farBuildingDataLeft, state.camera.position.z, state.corridorLength, wrapLead)
    recycleInstances(state.farRight, state.farBuildingDataRight, state.camera.position.z, state.corridorLength, wrapLead)
    recycleInstances(state.megaStructures, state.megaStructureData, state.camera.position.z, state.corridorLength * 1.4, 160)
    recycleInstances(state.skyline, state.skylineData, state.camera.position.z, state.corridorLength * 1.9, 220)

    if (state.signPanels && state.signPanelData) {
      let panelChanged = false
      for (let i = 0; i < state.signPanelData.length; i += 1) {
        const panel = state.signPanelData[i]
        if (panel.z > state.camera.position.z + 40) {
          panel.z = state.camera.position.z - state.corridorLength - Math.random() * 300
          panel.y = 6 + Math.random() * 46
          panel.side = Math.random() > 0.5 ? 1 : -1
          panel.x = panel.side * (21 + Math.random() * 34)
          panel.sx = 2 + Math.random() * 8
          panel.sy = 0.6 + Math.random() * 3.2
          panel.ry = panel.side > 0 ? -0.32 - Math.random() * 0.18 : 0.32 + Math.random() * 0.18
        }

        panel.rz = Math.sin(state.time * 0.6 + panel.pulse) * 0.03
        updateInstanceMatrix(state.signPanels, i, panel)
        panelChanged = true
      }
      if (panelChanged) {
        state.signPanels.instanceMatrix.needsUpdate = true
      }
    }

    let bridgeChanged = false
    for (let i = 0; i < state.bridgeData.length; i += 1) {
      const b = state.bridgeData[i]
      if (b.z > state.camera.position.z + 50) {
        b.z = state.camera.position.z - state.corridorLength - Math.random() * 260
        b.y = 16 + Math.random() * 44
        b.ry = (Math.random() - 0.5) * 0.08
        updateInstanceMatrix(state.bridges, i, b)
        updateInstanceMatrix(state.bridgeRails, i * 2, {
          x: b.x,
          y: b.y + b.sy * 0.34,
          z: b.z + b.sz * 0.45,
          sx: b.sx * 0.96,
          sy: 0.24,
          sz: 0.34,
          ry: b.ry,
        })
        updateInstanceMatrix(state.bridgeRails, i * 2 + 1, {
          x: b.x,
          y: b.y + b.sy * 0.34,
          z: b.z - b.sz * 0.45,
          sx: b.sx * 0.96,
          sy: 0.24,
          sz: 0.34,
          ry: b.ry,
        })
        bridgeChanged = true
      }
    }
    if (bridgeChanged) {
      state.bridges.instanceMatrix.needsUpdate = true
      state.bridgeRails.instanceMatrix.needsUpdate = true
    }

    const droneBob = 0.8 + bass * 2.2
    let droneChanged = false
    for (let i = 0; i < state.droneData.length; i += 1) {
      const d = state.droneData[i]
      d.z += deltaTime * (18 + mids * 40)
      d.y += Math.sin(state.time * 2.8 + d.phase) * deltaTime * droneBob
      d.ry += deltaTime * (0.45 + highs * 1.8)

      if (d.z > state.camera.position.z + 40) {
        d.z = state.camera.position.z - state.corridorLength - Math.random() * 320
        d.x = d.side * (12 + Math.random() * 28)
        d.y = 8 + Math.random() * 24
      }

      updateInstanceMatrix(state.drones, i, d)
      droneChanged = true
    }
    if (droneChanged) {
      state.drones.instanceMatrix.needsUpdate = true
    }

    if (state.sparkPoints && state.sparkPositions && state.sparkVelocities) {
      const pos = state.sparkPoints.geometry.getAttribute('position')
      const burst = highs > 0.7 ? 1.9 + highs * 3.2 : 1

      for (let i = 0; i < state.sparkVelocities.length; i += 1) {
        const idx = i * 3
        state.sparkPositions[idx + 1] += deltaTime * state.sparkVelocities[i] * burst
        state.sparkPositions[idx + 2] += deltaTime * (22 + mids * 80)

        if (state.sparkPositions[idx + 1] > 70 || state.sparkPositions[idx + 2] > state.camera.position.z + 12) {
          state.sparkPositions[idx] = (Math.random() - 0.5) * 74
          state.sparkPositions[idx + 1] = 1 + Math.random() * 12
          state.sparkPositions[idx + 2] = state.camera.position.z - 300 - Math.random() * 1100
        }
      }

      state.sparkPoints.material.opacity = 0.52 + highs * 0.24
      pos.needsUpdate = true
    }

    if (state.hazePoints && state.hazePositions && state.hazeVelocities) {
      const pos = state.hazePoints.geometry.getAttribute('position')
      for (let i = 0; i < state.hazeVelocities.length; i += 1) {
        const idx = i * 3
        state.hazePositions[idx + 2] += deltaTime * (4 + state.hazeVelocities[i] * 5 + mids * 10)
        state.hazePositions[idx] += Math.sin(state.time * 0.07 + i * 0.17) * deltaTime * 0.4

        if (state.hazePositions[idx + 2] > state.camera.position.z + 20) {
          state.hazePositions[idx] = (Math.random() - 0.5) * 150
          state.hazePositions[idx + 1] = 5 + Math.random() * 100
          state.hazePositions[idx + 2] = state.camera.position.z - 360 - Math.random() * 1300
        }
      }

      state.hazePoints.material.opacity = 0.11 + bass * 0.05 + Math.sin(state.time * 0.1) * 0.015
      pos.needsUpdate = true
    }

    if (state.foregroundDustPoints && state.foregroundDustPositions && state.foregroundDustVelocities) {
      const pos = state.foregroundDustPoints.geometry.getAttribute('position')
      for (let i = 0; i < state.foregroundDustVelocities.length; i += 1) {
        const idx = i * 3
        const swirl = Math.sin(state.time * 0.8 + i * 0.11) * 0.8
        state.foregroundDustPositions[idx] += deltaTime * swirl
        state.foregroundDustPositions[idx + 1] += deltaTime * (0.4 + state.foregroundDustVelocities[i] * 0.35)
        state.foregroundDustPositions[idx + 2] += deltaTime * (12 + mids * 24)

        if (state.foregroundDustPositions[idx + 1] > 24 || state.foregroundDustPositions[idx + 2] > state.camera.position.z + 5) {
          state.foregroundDustPositions[idx] = (Math.random() - 0.5) * 26
          state.foregroundDustPositions[idx + 1] = -0.4 + Math.random() * 8
          state.foregroundDustPositions[idx + 2] = state.camera.position.z - 20 - Math.random() * 180
        }
      }
      state.foregroundDustPoints.material.opacity = 0.14 + highs * 0.08
      pos.needsUpdate = true
    }

    state.roadMistPlanes.forEach((mist, index) => {
      mist.position.z += deltaTime * (mist.userData.speed + mids * 8)
      mist.position.x += Math.sin(state.time * 0.18 + index) * deltaTime * mist.userData.drift
      if (mist.position.z > state.camera.position.z + 40) {
        mist.position.z = state.camera.position.z - 220 - Math.random() * 1000
        mist.position.x = (Math.random() - 0.5) * 22
      }
      mist.material.opacity = 0.025 + bass * 0.03 + Math.sin(state.time * 0.5 + index) * 0.012
    })

    state.fogSheets.forEach((sheet, index) => {
      sheet.position.z += deltaTime * (sheet.userData.speed + mids * 6)
      sheet.position.x += Math.sin(state.time * 0.15 + sheet.userData.swayPhase) * deltaTime * sheet.userData.swayAmp
      sheet.rotation.y = Math.sin(state.time * 0.1 + sheet.userData.swayPhase) * 0.5
      if (sheet.position.z > state.camera.position.z + 80) {
        sheet.position.z = state.camera.position.z - 260 - Math.random() * 1500
        sheet.position.y = 10 + Math.random() * 60
      }
      sheet.material.opacity = 0.03 + bass * 0.04 + Math.sin(state.time * 0.3 + index) * 0.01
    })

    state.dataFragments.forEach((frag, index) => {
      frag.position.z += deltaTime * (frag.userData.speed + mids * 12)
      frag.position.x += deltaTime * frag.userData.drift
      frag.rotation.z += deltaTime * (0.8 + index * 0.02)
      if (frag.position.z > state.camera.position.z + 40) {
        frag.position.z = state.camera.position.z - 160 - Math.random() * 1200
        frag.position.x = (Math.random() - 0.5) * 84
        frag.position.y = 6 + Math.random() * 70
      }
      frag.material.opacity = 0.06 + highs * 0.12 + state.eventPulse * 0.16 + Math.sin(state.time * 1.5 + frag.userData.pulse) * 0.04
    })

    if (state.distantLightPoints && state.distantLightPositions && state.distantLightVelocities) {
      const pos = state.distantLightPoints.geometry.getAttribute('position')
      for (let i = 0; i < state.distantLightVelocities.length; i += 1) {
        const idx = i * 3
        state.distantLightPositions[idx + 2] += deltaTime * (4 + state.distantLightVelocities[i] * 5 + mids * 6)
        state.distantLightPositions[idx] += Math.sin(state.time * 0.04 + i * 0.03) * deltaTime * 0.8

        if (state.distantLightPositions[idx + 2] > state.camera.position.z + 90) {
          state.distantLightPositions[idx] = (Math.random() - 0.5) * 340
          state.distantLightPositions[idx + 1] = 24 + Math.random() * 220
          state.distantLightPositions[idx + 2] = state.camera.position.z - 500 - Math.random() * state.corridorLength * 2
        }
      }
      state.distantLightPoints.material.opacity = 0.12 + highs * 0.08 + state.eventPulse * 0.1
      pos.needsUpdate = true
    }

    state.foregroundStreaks.forEach((streak, index) => {
      const speedUp = state.beatPulse > 0.1 ? 1.25 : 1
      streak.position.z += deltaTime * streak.userData.speed * speedUp
      streak.position.x += Math.sin(state.time * 0.9 + index) * deltaTime * streak.userData.drift
      if (streak.position.z > state.camera.position.z + 8) {
        streak.position.z = state.camera.position.z - 120 - Math.random() * 360
        streak.position.x = (Math.random() - 0.5) * 16
        streak.position.y = 2 + Math.random() * 18
      }
      streak.material.opacity = 0.03 + (0.05 + highs * 0.06) * (0.5 + Math.sin(state.time * 1.4 + index) * 0.5)
    })

    state.silhouetteRunners.forEach((runner, index) => {
      runner.position.z += deltaTime * runner.userData.speed
      runner.position.x = runner.userData.side * (9 + Math.sin(state.time * 0.5 + runner.userData.driftPhase) * 4)
      runner.rotation.y = Math.sin(state.time * 0.7 + index) * 0.16
      if (runner.position.z > state.camera.position.z + 12) {
        runner.position.z = state.camera.position.z - 120 - Math.random() * 520
        runner.userData.side *= -1
      }
      runner.material.opacity = 0.62 + Math.sin(state.time * 0.4 + index) * 0.08
    })

    const nearPulse = 0.95 + bass * 1.6
    const midPulse = 0.72 + bass * 1.1
    const cityFlicker = 0.88 + Math.sin(state.time * 1.3) * 0.08 + Math.sin(state.time * 0.32) * 0.07
    state.nearLeft.material.emissiveIntensity = nearPulse
    state.nearRight.material.emissiveIntensity = nearPulse * (0.9 + highs * 0.12)
    state.midLeft.material.emissiveIntensity = midPulse * cityFlicker
    state.midRight.material.emissiveIntensity = midPulse * 0.9 * cityFlicker
    state.farLeft.material.emissiveIntensity = 0.45 + Math.sin(state.time * 0.42) * 0.08
    state.farRight.material.emissiveIntensity = 0.43 + Math.sin(state.time * 0.5 + 0.7) * 0.07

    state.bridges.material.emissiveIntensity = 0.64 + bass * 0.72 + state.eventPulse * 0.22
    state.bridgeRails.material.emissiveIntensity = 1.0 + bass * 0.8 + highs * 0.5 + state.eventPulse * 0.3
    state.signPanels.material.emissiveIntensity = 0.7 + highs * 0.52 + Math.sin(state.time * 2.4) * 0.18 + state.eventPulse * 0.85
    state.signPanels.material.opacity = 0.55 + highs * 0.14 + state.eventPulse * 0.2
    state.drones.material.emissiveIntensity = 0.68 + highs * 1.0 + bass * 0.28

    const lightPulse = 1 + bass * 0.95 + state.beatPulse * 0.28 + state.eventPulse * 0.24
    state.cyanLight.intensity = 1.5 * lightPulse
    state.magentaLight.intensity = 1.35 * lightPulse
    state.overheadLight.intensity = 0.86 + mids * 1.0 + bass * 0.24 + state.eventPulse * 0.22

    state.cyanLight.position.set(28 + Math.sin(state.time * 0.27) * 12, 14, state.camera.position.z - 72)
    state.magentaLight.position.set(-30 + Math.sin(state.time * 0.25 + 1.7) * 14, 13, state.camera.position.z - 86)
    state.overheadLight.position.z = state.camera.position.z - 104
    state.overheadLight.target.position.z = state.camera.position.z - 200

    state.sideRimLeft.intensity = 0.56 + highs * 1.4
    state.sideRimRight.intensity = 0.54 + highs * 1.35
    state.sideRimLeft.position.z = state.camera.position.z - 130
    state.sideRimRight.position.z = state.camera.position.z - 124

    if (state.beamLeft && state.beamRight) {
      state.beamLeft.position.z = state.camera.position.z - 148
      state.beamRight.position.z = state.camera.position.z - 164
      state.beamLeft.material.opacity = 0.06 + bass * 0.05 + state.eventPulse * 0.05 + Math.sin(state.time * 0.7) * 0.015
      state.beamRight.material.opacity = 0.055 + bass * 0.05 + state.eventPulse * 0.05 + Math.sin(state.time * 0.8 + 0.9) * 0.014
    }

    if (state.roadMaterial) {
      state.roadMaterial.uniforms.uTime.value = state.time
      state.roadMaterial.uniforms.uBass.value = bass
      state.roadMaterial.uniforms.uMids.value = mids
      state.roadMaterial.uniforms.uHighs.value = highs
      state.roadMaterial.uniforms.uCamZ.value = state.camera.position.z
    }

    if (state.roadPositions && state.roadBasePositions) {
      const pos = state.roadPositions
      const base = state.roadBasePositions
      for (let i = 0; i < pos.count; i += 1) {
        const idx = i * 3
        const x = base[idx]
        const z = base[idx + 2]
        const waveA = Math.sin((z + state.camera.position.z) * 0.035 + state.time * 1.6) * 0.07
        const waveB = Math.sin((x * 0.28) + (z + state.camera.position.z) * 0.012 - state.time * 0.8) * 0.06
        const laneWarp = Math.sin((z + state.camera.position.z) * 0.09 + state.time * 3.5) * 0.03 * (0.2 + bass)
        pos.array[idx + 1] = base[idx + 1] + waveA + waveB + laneWarp
      }
      pos.needsUpdate = true
    }

    if (state.horizonGlow) {
      state.horizonGlow.position.z = state.camera.position.z - 980
      state.horizonGlow.material.opacity = 0.08 + bass * 0.06 + Math.sin(state.time * 0.2) * 0.02
    }

    if (state.scanSweep) {
      state.scanSweep.position.z = state.camera.position.z - 220 + Math.sin(state.time * 1.5) * 60
      state.scanSweep.material.opacity = state.eventPulse * 0.16 + highs * 0.05
    }

    const edgePulse = 0.78 + bass * 1.0 + highs * 0.34 + state.beatPulse * 0.22
    state.laneEdgeLeft.material.emissiveIntensity = edgePulse
    state.laneEdgeRight.material.emissiveIntensity = edgePulse * 0.95

    state.postFx.bloomStrength = Math.min(1.62, 0.84 + bass * 0.54 + highs * 0.24 + state.beatPulse * 0.12 + state.eventPulse * 0.2)
    state.postFx.bloomRadius = Math.min(0.92, 0.6 + highs * 0.16)
    state.postFx.bloomThreshold = Math.max(0.64, 0.8 - bass * 0.14)
    state.postFx.noiseAmount = Math.min(0.08, 0.022 + highs * 0.018 + state.glitchTimer * 0.03 + state.eventPulse * 0.015)
    state.postFx.vignetteStrength = Math.min(0.74, 0.52 + mids * 0.12)
    state.postFx.saturation = Math.max(0.76, 0.88 - highs * 0.08 + bass * 0.05)
    state.postFx.chromaticAberration = 0.00065 + highs * 0.0008 + state.glitchTimer * 0.001 + state.eventPulse * 0.0007
    state.postFx.exposure = 0.98 + state.beatPulse * 0.05 + bass * 0.035 + state.eventPulse * 0.04

    if (state.scene?.fog) {
      state.scene.fog.density = 0.0068 + bass * 0.001 + highs * 0.0009 + Math.sin(state.time * 0.08) * 0.00035
    }
  },

  disposeScene(state) {
    if (!state) return

    state.trackedObjects?.forEach((obj) => {
      if (!obj) return
      if (obj.parent) {
        obj.parent.remove(obj)
      }
      if (obj.geometry) {
        obj.geometry.dispose?.()
      }
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m?.dispose?.())
        } else {
          obj.material.dispose?.()
        }
      }
    })

    state.windowTextures?.forEach((tex) => tex?.dispose?.())
    state.facadeTextures?.forEach((tex) => tex?.dispose?.())
  },
}
