import * as THREE from 'three'

/**
 * INFINITE HEX TERRAIN
 * Premium procedural machine-world flyover.
 * Massive hex columns, glowing seams, broken zones, and atmospheric depth.
 */

const TMP_MATRIX = new THREE.Matrix4()
const TMP_QUAT = new THREE.Quaternion()
const TMP_SCALE = new THREE.Vector3()
const TMP_POS = new THREE.Vector3()

function hash2(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123
  return v - Math.floor(v)
}

function updateIM(mesh, index, d) {
  TMP_POS.set(d.x, d.y, d.z)
  TMP_QUAT.setFromEuler(new THREE.Euler(d.rx || 0, d.ry || 0, d.rz || 0))
  TMP_SCALE.set(d.sx, d.sy, d.sz)
  TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE)
  mesh.setMatrixAt(index, TMP_MATRIX)
}

function makeDetailTexture(seed, glow = false) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255]), 1, 1)
    t.needsUpdate = true
    return t
  }

  let s = seed * 7919
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967295
  }

  if (glow) {
    ctx.fillStyle = '#0b1323'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 72; i += 1) {
      const hue = rand() > 0.5 ? 188 + rand() * 18 : 326 + rand() * 16
      const x = 8 + rand() * 240
      const y = 8 + rand() * 240
      const w = 6 + rand() * 46
      const h = 1 + rand() * 4
      ctx.fillStyle = `hsla(${hue},100%,${56 + rand() * 30}%,${0.18 + rand() * 0.72})`
      ctx.fillRect(x, y, w, h)
      if (rand() > 0.45) {
        ctx.fillRect(x + w * 0.5, y - h * (1 + rand() * 2.5), h * 0.9, h * (1 + rand() * 4.5))
      }
    }
  } else {
    ctx.fillStyle = '#777777'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 3600; i += 1) {
      const v = Math.floor(58 + rand() * 120)
      ctx.fillStyle = `rgb(${v},${v},${v})`
      const x = Math.floor(rand() * 256)
      const y = Math.floor(rand() * 256)
      ctx.fillRect(x, y, 1 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2))
    }
    for (let i = 0; i < 140; i += 1) {
      const v = Math.floor(50 + rand() * 150)
      const x = Math.floor(rand() * 240)
      const y = Math.floor(rand() * 240)
      const w = Math.floor(8 + rand() * 24)
      const h = Math.floor(1 + rand() * 3)
      ctx.fillStyle = `rgb(${v},${v},${v})`
      ctx.fillRect(x, y, w, h)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  if (glow) tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function makePointCloud(count, spanX, minY, maxY, spanZ, color, size, opacity) {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count)

  for (let i = 0; i < count; i += 1) {
    const idx = i * 3
    positions[idx] = (Math.random() - 0.5) * spanX
    positions[idx + 1] = minY + Math.random() * (maxY - minY)
    positions[idx + 2] = -Math.random() * spanZ
    velocities[i] = 0.45 + Math.random() * 1.8
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

export const infiniteHexTerrainRenderer = {
  createScene({ scene, camera, qualityPreset }) {
    const pr = qualityPreset?.pixelRatio ?? 0.5
    const qualityBand = pr <= 0.35 ? 'safe' : pr <= 0.5 ? 'performance' : 'ultra'

    const cols = qualityBand === 'safe' ? 14 : qualityBand === 'performance' ? 18 : 22
    const rows = qualityBand === 'safe' ? 24 : qualityBand === 'performance' ? 30 : 36
    const spacing = 4.2
    const rowDepth = spacing * 1.15
    const worldDepth = rows * rowDepth
    const worldWidth = cols * spacing
    const counts = {
      skyline: qualityBand === 'safe' ? 120 : qualityBand === 'performance' ? 180 : 260,
      foregroundFrames: qualityBand === 'safe' ? 10 : qualityBand === 'performance' ? 14 : 20,
      suspendedPlatforms: qualityBand === 'safe' ? 40 : qualityBand === 'performance' ? 68 : 96,
      lightFragments: qualityBand === 'safe' ? 46 : qualityBand === 'performance' ? 72 : 110,
      groundScanners: qualityBand === 'safe' ? 16 : qualityBand === 'performance' ? 24 : 36,
      cityBlocks: qualityBand === 'safe' ? 90 : qualityBand === 'performance' ? 140 : 210,
      neonSigns: qualityBand === 'safe' ? 80 : qualityBand === 'performance' ? 120 : 180,
      signalBeacons: qualityBand === 'safe' ? 16 : qualityBand === 'performance' ? 26 : 38,
    }

    const state = {
      columnsA: null,
      columnsB: null,
      seamsA: null,
      seamsB: null,
      capsA: null,
      capsB: null,
      sideStructures: [],
      suspendedPlatforms: [],
      fissureStrips: [],
      fogSheets: [],
      debrisChunks: [],
      movingLightFragments: [],
      groundScanners: [],
      foregroundFrames: [],
      skylineData: [],
      skylineMesh: null,
      cityBlockData: [],
      cityBlocks: null,
      neonSignData: [],
      neonSigns: null,
      signalBeacons: [],
      trackedObjects: [],
      textures: [],
      dataA: [],
      dataB: [],
      cols,
      rows,
      spacing,
      rowDepth,
      worldWidth,
      worldDepth,
      flowOffset: 0,
      speedSmoothed: 9.5,
      time: 0,
      dummy: new THREE.Object3D(),
      lookTarget: new THREE.Vector3(),
      prevBass: 0,
      beatPulse: 0,
      eventPulse: 0,
      eventCooldown: 2.2,
      ambientLight: null,
      hemiLight: null,
      keyLight: null,
      rimLight: null,
      laneLightCyan: null,
      laneLightMagenta: null,
      postFx: {
        bloomStrength: qualityBand === 'safe' ? 0.72 : qualityBand === 'performance' ? 0.92 : 1.12,
        bloomRadius: qualityBand === 'safe' ? 0.5 : qualityBand === 'performance' ? 0.62 : 0.75,
        bloomThreshold: 0.74,
        noiseAmount: qualityBand === 'safe' ? 0.015 : qualityBand === 'performance' ? 0.022 : 0.03,
        vignetteStrength: 0.43,
        saturation: 0.94,
        chromaticAberration: 0.00052,
        exposure: 0.99,
      },
    }

    scene.background = new THREE.Color(0x060a12)
    scene.fog = new THREE.FogExp2(0x0b1221, qualityBand === 'safe' ? 0.0065 : 0.0054)

    const ambient = new THREE.AmbientLight(0x162845, 0.4)
    scene.add(ambient)
    state.ambientLight = ambient
    state.trackedObjects.push(ambient)

    const hemi = new THREE.HemisphereLight(0x78b8ff, 0x090d15, 0.5)
    scene.add(hemi)
    state.hemiLight = hemi
    state.trackedObjects.push(hemi)

    const key = new THREE.DirectionalLight(0x9bc1ff, 1.0)
    key.position.set(-120, 140, 90)
    scene.add(key)
    state.keyLight = key
    state.trackedObjects.push(key)

    const rim = new THREE.DirectionalLight(0xff6488, 0.56)
    rim.position.set(140, 70, -150)
    scene.add(rim)
    state.rimLight = rim
    state.trackedObjects.push(rim)

    const laneLightCyan = new THREE.PointLight(0x35c8ff, 1.55, 170, 2.0)
    laneLightCyan.position.set(-state.worldWidth * 0.22, 8, -48)
    scene.add(laneLightCyan)
    state.laneLightCyan = laneLightCyan
    state.trackedObjects.push(laneLightCyan)

    const laneLightMagenta = new THREE.PointLight(0xff5d87, 1.45, 170, 2.0)
    laneLightMagenta.position.set(state.worldWidth * 0.22, 7, -58)
    scene.add(laneLightMagenta)
    state.laneLightMagenta = laneLightMagenta
    state.trackedObjects.push(laneLightMagenta)

    const detailTexA = makeDetailTexture(71, false)
    const detailTexB = makeDetailTexture(127, false)
    const panelTex = makeDetailTexture(311, true)
    state.textures.push(detailTexA, detailTexB, panelTex)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldWidth * 2.6, worldDepth + 300),
      new THREE.MeshStandardMaterial({
        color: 0x0a1120,
        emissive: 0x1b2f52,
        emissiveIntensity: 0.26,
        metalness: 0.56,
        roughness: 0.56,
        roughnessMap: detailTexA,
        metalnessMap: detailTexB,
      })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -1.05
    ground.position.z = -worldDepth * 0.5
    scene.add(ground)
    state.ground = ground
    state.trackedObjects.push(ground)

    const horizonGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(worldWidth * 2.2, 120),
      new THREE.MeshBasicMaterial({
        color: 0x2c5d9f,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
    horizonGlow.position.set(0, 18, -worldDepth * 0.88)
    scene.add(horizonGlow)
    state.horizonGlow = horizonGlow
    state.trackedObjects.push(horizonGlow)

    const colGeometry = new THREE.CylinderGeometry(1.95, 2.25, 1, 6, 1, false)
    const seamGeometry = new THREE.CylinderGeometry(2.33, 2.33, 1.04, 6, 1, true)
    const capGeometry = new THREE.CylinderGeometry(1.32, 1.62, 0.18, 6, 1, false)

    const colMatA = new THREE.MeshStandardMaterial({
      color: 0x13243e,
      emissive: 0x1a406e,
      emissiveIntensity: 0.26,
      metalness: 0.74,
      roughness: 0.42,
      roughnessMap: detailTexA,
      metalnessMap: detailTexB,
    })
    const colMatB = new THREE.MeshStandardMaterial({
      color: 0x261630,
      emissive: 0x4f2142,
      emissiveIntensity: 0.24,
      metalness: 0.72,
      roughness: 0.42,
      roughnessMap: detailTexB,
      metalnessMap: detailTexA,
    })
    const seamMatA = new THREE.MeshStandardMaterial({
      color: 0x12253d,
      emissive: 0x24d4ff,
      emissiveIntensity: 0.65,
      emissiveMap: panelTex,
      metalness: 0.84,
      roughness: 0.24,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    })
    const seamMatB = new THREE.MeshStandardMaterial({
      color: 0x2d162f,
      emissive: 0xff4c71,
      emissiveIntensity: 0.6,
      emissiveMap: panelTex,
      metalness: 0.84,
      roughness: 0.24,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    })
    const capMatA = new THREE.MeshStandardMaterial({
      color: 0x101a2f,
      emissive: 0x2e8fff,
      emissiveIntensity: 0.28,
      emissiveMap: panelTex,
      metalness: 0.86,
      roughness: 0.3,
      roughnessMap: detailTexA,
    })
    const capMatB = new THREE.MeshStandardMaterial({
      color: 0x23152a,
      emissive: 0xc94f8f,
      emissiveIntensity: 0.25,
      emissiveMap: panelTex,
      metalness: 0.86,
      roughness: 0.3,
      roughnessMap: detailTexB,
    })

    let aCount = 0
    let bCount = 0
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (((row + col) & 1) === 0) aCount += 1
        else bCount += 1
      }
    }

    state.columnsA = new THREE.InstancedMesh(colGeometry, colMatA, aCount)
    state.columnsB = new THREE.InstancedMesh(colGeometry, colMatB, bCount)
    state.seamsA = new THREE.InstancedMesh(seamGeometry, seamMatA, aCount)
    state.seamsB = new THREE.InstancedMesh(seamGeometry, seamMatB, bCount)
    state.capsA = new THREE.InstancedMesh(capGeometry, capMatA, aCount)
    state.capsB = new THREE.InstancedMesh(capGeometry, capMatB, bCount)

    ;[state.columnsA, state.columnsB, state.seamsA, state.seamsB, state.capsA, state.capsB].forEach((mesh) => {
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      scene.add(mesh)
      state.trackedObjects.push(mesh)
    })

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const xOffset = (row % 2) * (spacing * 0.5)
        const x = (col - cols * 0.5) * spacing + xOffset
        const z = -row * rowDepth

        const nA = hash2(col * 0.71 + 11.3, row * 0.92 + 7.4)
        const nB = hash2(col * 1.91 + 23.1, row * 1.37 + 17.7)
        const nC = hash2(col * 3.13 + 4.7, row * 2.41 + 9.1)
        const deadZone = nB < 0.11
        const broken = nC > 0.78
        const mega = nA > 0.94 ? 1 + (nA - 0.94) * 12 : 0
        const fissure = hash2(col * 5.7 + 0.2, row * 8.9 + 0.5) > 0.975

        const tile = {
          x,
          z,
          baseHeight: 1.2 + nA * 3.4,
          seedA: nA,
          seedB: nB,
          seedC: nC,
          deadZone,
          broken,
          mega,
          fissure,
          phase: Math.random() * Math.PI * 2,
        }

        if (((row + col) & 1) === 0) state.dataA.push(tile)
        else state.dataB.push(tile)
      }
    }

    const structureCount = qualityBand === 'safe' ? 14 : qualityBand === 'performance' ? 20 : 28
    for (let i = 0; i < structureCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const struct = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65 + Math.random() * 0.4, 1.6 + Math.random() * 0.9, 26 + Math.random() * 22, 6),
        new THREE.MeshStandardMaterial({
          color: 0x151b2d,
          emissive: side < 0 ? 0x17cfff : 0xff4d7a,
          emissiveIntensity: 0.56,
          metalness: 0.75,
          roughness: 0.3,
          roughnessMap: detailTexA,
          emissiveMap: panelTex,
        })
      )
      struct.position.set(side * (worldWidth * 0.62 + Math.random() * 28), 9 + Math.random() * 18, -i * (worldDepth / structureCount))
      struct.userData = {
        side,
        drift: 0.6 + Math.random() * 1.4,
      }
      scene.add(struct)
      state.sideStructures.push(struct)
      state.trackedObjects.push(struct)
    }

    const cityBlockGeo = new THREE.BoxGeometry(1, 1, 1)
    const cityBlockMat = new THREE.MeshStandardMaterial({
      color: 0x101a2d,
      emissive: 0x2f66ae,
      emissiveIntensity: 0.24,
      emissiveMap: panelTex,
      metalness: 0.86,
      roughness: 0.34,
      roughnessMap: detailTexB,
    })
    for (let i = 0; i < counts.cityBlocks; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const lane = i % 3
      const xBand = lane === 0 ? 0.35 : lane === 1 ? 0.55 : 0.75
      const xJitter = (Math.random() - 0.5) * worldWidth * 0.08
      state.cityBlockData.push({
        x: side * (worldWidth * xBand + xJitter),
        y: 8 + Math.random() * 56,
        z: -Math.random() * (worldDepth * 1.35),
        sx: 6 + Math.random() * 24,
        sy: 16 + Math.random() * 140,
        sz: 8 + Math.random() * 40,
        rx: (Math.random() - 0.5) * 0.03,
        ry: Math.random() * Math.PI,
        rz: (Math.random() - 0.5) * 0.03,
        drift: 0.03 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const cityBlocks = new THREE.InstancedMesh(cityBlockGeo, cityBlockMat, state.cityBlockData.length)
    cityBlocks.frustumCulled = false
    cityBlocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    state.cityBlockData.forEach((d, i) => updateIM(cityBlocks, i, d))
    scene.add(cityBlocks)
    state.cityBlocks = cityBlocks
    state.trackedObjects.push(cityBlocks)

    const platformGeo = new THREE.BoxGeometry(1, 1, 1)
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x141f33,
      emissive: 0x2f7ccf,
      emissiveIntensity: 0.26,
      metalness: 0.8,
      roughness: 0.36,
      roughnessMap: detailTexA,
      emissiveMap: panelTex,
    })
    for (let i = 0; i < counts.suspendedPlatforms; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      const platform = new THREE.Mesh(platformGeo, platformMat)
      platform.position.set(
        side * (worldWidth * (0.28 + Math.random() * 0.42)),
        8 + Math.random() * 26,
        -Math.random() * worldDepth
      )
      platform.scale.set(6 + Math.random() * 20, 0.8 + Math.random() * 2.2, 8 + Math.random() * 32)
      platform.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2)
      platform.userData = {
        phase: Math.random() * Math.PI * 2,
        sway: 0.3 + Math.random() * 0.7,
      }
      scene.add(platform)
      state.suspendedPlatforms.push(platform)
      state.trackedObjects.push(platform)
    }

    const skylineGeo = new THREE.CylinderGeometry(0.9, 1.25, 1, 5, 1, false)
    const skylineMat = new THREE.MeshStandardMaterial({
      color: 0x0d1527,
      emissive: 0x274e85,
      emissiveIntensity: 0.24,
      metalness: 0.76,
      roughness: 0.52,
      roughnessMap: detailTexB,
      emissiveMap: panelTex,
    })
    for (let i = 0; i < counts.skyline; i += 1) {
      const angle = (i / counts.skyline) * Math.PI * 2 + Math.random() * 0.6
      const radius = worldWidth * (1.2 + Math.random() * 2.0)
      state.skylineData.push({
        x: Math.cos(angle) * radius,
        y: 15 + Math.random() * 120,
        z: -worldDepth * (0.35 + Math.random() * 1.6) + Math.sin(angle) * radius * 0.25,
        sx: 20 + Math.random() * 80,
        sy: 80 + Math.random() * 420,
        sz: 20 + Math.random() * 80,
        ry: angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.4,
        rx: (Math.random() - 0.5) * 0.06,
        rz: (Math.random() - 0.5) * 0.08,
      })
    }
    const skyline = new THREE.InstancedMesh(skylineGeo, skylineMat, state.skylineData.length)
    skyline.frustumCulled = false
    state.skylineData.forEach((d, i) => updateIM(skyline, i, d))
    scene.add(skyline)
    state.skylineMesh = skyline
    state.trackedObjects.push(skyline)

    const signGeo = new THREE.PlaneGeometry(1, 1)
    const signMat = new THREE.MeshBasicMaterial({
      color: 0x7ad3ff,
      map: panelTex,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    for (let i = 0; i < counts.neonSigns; i += 1) {
      const side = i % 2 === 0 ? -1 : 1
      state.neonSignData.push({
        x: side * (worldWidth * (0.32 + Math.random() * 0.5)),
        y: 4 + Math.random() * 34,
        z: -Math.random() * (worldDepth * 1.2),
        sx: 3 + Math.random() * 16,
        sy: 0.9 + Math.random() * 4.2,
        sz: 1,
        ry: side > 0 ? -Math.PI * 0.5 : Math.PI * 0.5,
        rx: (Math.random() - 0.5) * 0.06,
        rz: (Math.random() - 0.5) * 0.08,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const neonSigns = new THREE.InstancedMesh(signGeo, signMat, state.neonSignData.length)
    neonSigns.frustumCulled = false
    neonSigns.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    state.neonSignData.forEach((d, i) => updateIM(neonSigns, i, d))
    scene.add(neonSigns)
    state.neonSigns = neonSigns
    state.trackedObjects.push(neonSigns)

    for (let i = 0; i < counts.signalBeacons; i += 1) {
      const beacon = new THREE.PointLight(i % 3 === 0 ? 0x2ed0ff : i % 3 === 1 ? 0xff5a86 : 0xff3f2f, 1.35, 180, 1.9)
      beacon.position.set(
        (Math.random() - 0.5) * worldWidth * 1.25,
        8 + Math.random() * 40,
        -Math.random() * worldDepth * 1.1
      )
      beacon.userData = {
        speed: 0.35 + Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 0.45,
        phase: Math.random() * Math.PI * 2,
      }
      scene.add(beacon)
      state.signalBeacons.push(beacon)
      state.trackedObjects.push(beacon)
    }

    for (let i = 0; i < counts.foregroundFrames; i += 1) {
      const frame = new THREE.Mesh(
        new THREE.TorusGeometry(24 + Math.random() * 32, 0.8 + Math.random() * 1.7, 10, 36, Math.PI * (0.55 + Math.random() * 0.3)),
        new THREE.MeshStandardMaterial({
          color: 0x10192b,
          emissive: 0x1f3f6f,
          emissiveIntensity: 0.18,
          metalness: 0.78,
          roughness: 0.46,
          roughnessMap: detailTexA,
        })
      )
      frame.position.set(
        (Math.random() > 0.5 ? -1 : 1) * (worldWidth * (0.24 + Math.random() * 0.26)),
        9 + Math.random() * 18,
        -8 - Math.random() * worldDepth
      )
      frame.rotation.set((Math.random() - 0.5) * 0.18, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3)
      frame.userData = {
        drift: 0.25 + Math.random() * 0.5,
      }
      scene.add(frame)
      state.foregroundFrames.push(frame)
      state.trackedObjects.push(frame)
    }

    for (let i = 0; i < counts.lightFragments; i += 1) {
      const frag = new THREE.Mesh(
        new THREE.PlaneGeometry(1 + Math.random() * 6, 0.15 + Math.random() * 0.8),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x2ad3ff : 0xff5d84,
          transparent: true,
          opacity: 0.08 + Math.random() * 0.18,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      frag.position.set((Math.random() - 0.5) * worldWidth * 1.6, 2 + Math.random() * 20, -Math.random() * worldDepth)
      frag.rotation.z = (Math.random() - 0.5) * 1.6
      frag.userData = {
        speed: 4 + Math.random() * 12,
        drift: (Math.random() - 0.5) * 1.1,
        phase: Math.random() * Math.PI * 2,
      }
      scene.add(frag)
      state.movingLightFragments.push(frag)
      state.trackedObjects.push(frag)
    }

    for (let i = 0; i < counts.groundScanners; i += 1) {
      const scan = new THREE.Mesh(
        new THREE.PlaneGeometry(worldWidth * (0.45 + Math.random() * 0.35), 0.7 + Math.random() * 1.2),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x30b8ff : 0xff4f7b,
          transparent: true,
          opacity: 0.08 + Math.random() * 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      scan.rotation.x = -Math.PI / 2
      scan.rotation.z = (Math.random() - 0.5) * 0.35
      scan.position.set((Math.random() - 0.5) * worldWidth * 0.3, -0.78, -Math.random() * worldDepth)
      scan.userData = {
        speed: 8 + Math.random() * 12,
        phase: Math.random() * Math.PI * 2,
      }
      scene.add(scan)
      state.groundScanners.push(scan)
      state.trackedObjects.push(scan)
    }

    const fissureCount = qualityBand === 'safe' ? 8 : qualityBand === 'performance' ? 13 : 18
    for (let i = 0; i < fissureCount; i += 1) {
      const fissure = new THREE.Mesh(
        new THREE.PlaneGeometry(40 + Math.random() * 120, 1.4 + Math.random() * 4.2),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x21d2ff : i % 3 === 1 ? 0xff4d70 : 0xff5d2f,
          transparent: true,
          opacity: 0.12 + Math.random() * 0.08,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      )
      fissure.rotation.x = -Math.PI / 2
      fissure.rotation.z = (Math.random() - 0.5) * 0.9
      fissure.position.set((Math.random() - 0.5) * worldWidth * 0.85, -0.28 + Math.random() * 0.24, -Math.random() * worldDepth)
      fissure.userData = {
        phase: Math.random() * Math.PI * 2,
        drift: 0.5 + Math.random() * 1.2,
      }
      scene.add(fissure)
      state.fissureStrips.push(fissure)
      state.trackedObjects.push(fissure)
    }

    const fogCount = qualityBand === 'safe' ? 7 : qualityBand === 'performance' ? 11 : 16
    for (let i = 0; i < fogCount; i += 1) {
      const fog = new THREE.Mesh(
        new THREE.PlaneGeometry(80 + Math.random() * 170, 44 + Math.random() * 100),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x2a4c73 : 0x4b2d66,
          transparent: true,
          opacity: 0.03 + Math.random() * 0.04,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.NormalBlending,
        })
      )
      fog.position.set((Math.random() - 0.5) * worldWidth * 1.2, 3 + Math.random() * 13, -Math.random() * worldDepth)
      fog.rotation.y = (Math.random() - 0.5) * 0.7
      fog.userData = {
        phase: Math.random() * Math.PI * 2,
        drift: 0.8 + Math.random() * 1.6,
      }
      scene.add(fog)
      state.fogSheets.push(fog)
      state.trackedObjects.push(fog)
    }

    const debrisCount = qualityBand === 'safe' ? 36 : qualityBand === 'performance' ? 62 : 94
    for (let i = 0; i < debrisCount; i += 1) {
      const debris = new THREE.Mesh(
        new THREE.TetrahedronGeometry(0.2 + Math.random() * 1.3),
        new THREE.MeshStandardMaterial({
          color: 0x14233a,
          emissive: 0x3b75cc,
          emissiveIntensity: 0.3,
          metalness: 0.72,
          roughness: 0.42,
        })
      )
      debris.position.set((Math.random() - 0.5) * worldWidth * 1.3, 1 + Math.random() * 12, -Math.random() * worldDepth)
      debris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      debris.userData = {
        spin: (Math.random() - 0.5) * 1.1,
        drift: (Math.random() - 0.5) * 0.7,
      }
      scene.add(debris)
      state.debrisChunks.push(debris)
      state.trackedObjects.push(debris)
    }

    const dust = makePointCloud(
      qualityBand === 'safe' ? 220 : qualityBand === 'performance' ? 360 : 520,
      worldWidth * 1.3,
      0.2,
      12,
      worldDepth * 1.2,
      0x5a7ca4,
      qualityBand === 'safe' ? 0.42 : 0.58,
      qualityBand === 'safe' ? 0.1 : 0.14
    )
    dust.points.material.blending = THREE.NormalBlending
    scene.add(dust.points)
    state.dustPoints = dust.points
    state.dustPositions = dust.positions
    state.dustVelocities = dust.velocities
    state.trackedObjects.push(dust.points)

    const sparks = makePointCloud(
      qualityBand === 'safe' ? 90 : qualityBand === 'performance' ? 140 : 220,
      worldWidth * 1.1,
      0.5,
      8,
      worldDepth * 1.35,
      0xff7a8e,
      qualityBand === 'safe' ? 0.52 : 0.7,
      0.2
    )
    scene.add(sparks.points)
    state.sparkPoints = sparks.points
    state.sparkPositions = sparks.positions
    state.sparkVelocities = sparks.velocities
    state.trackedObjects.push(sparks.points)

    camera.position.set(0, 4.9, 11)
    camera.lookAt(0, 1.4, -46)

    return state
  },

  updateScene({ deltaTime, spectrumLevels }, state) {
    if (!state) return

    state.time += deltaTime
    const bass = spectrumLevels?.sub ?? spectrumLevels?.low ?? 0
    const mids = spectrumLevels?.lowMid ?? spectrumLevels?.mid ?? 0
    const highs = spectrumLevels?.presence ?? spectrumLevels?.high ?? 0

    const bassDelta = bass - state.prevBass
    state.prevBass = bass

    if (bass > 0.36 && bassDelta > 0.11) {
      state.beatPulse = 1
    } else {
      state.beatPulse = Math.max(0, state.beatPulse - deltaTime * 2.45)
    }

    state.eventCooldown -= deltaTime
    if (state.eventCooldown <= 0 && highs > 0.66) {
      state.eventPulse = 1
      state.eventCooldown = 2.8 + Math.random() * 3.8
    } else {
      state.eventPulse = Math.max(0, state.eventPulse - deltaTime * 2.0)
    }

    const speedTarget = 8.5 + mids * 13 + state.beatPulse * 1.8
    state.speedSmoothed += (speedTarget - state.speedSmoothed) * Math.min(1, deltaTime * 2.2)
    state.flowOffset += deltaTime * state.speedSmoothed
    const speed = state.speedSmoothed

    const frontWrap = 22
    const terrainOffset = -34
    const waveGain = 1 + bass * 1.6 + state.beatPulse * 0.4

    const updateLane = (tiles, columns, seams, caps, laneSign) => {
      for (let i = 0; i < tiles.length; i += 1) {
        const tile = tiles[i]
        let z = tile.z + state.flowOffset
        if (z > frontWrap) {
          z -= state.worldDepth
          tile.z -= state.worldDepth
        }

        const waveLong = Math.sin(z * 0.038 - state.time * (0.72 + mids * 0.8) + tile.seedA * 6.4)
        const waveCross = Math.sin((tile.x * 0.09 + z * 0.06) + tile.seedB * 9 + state.time * 0.3)
        const waveMicro = Math.sin((tile.x + z * 0.8) * 0.21 + state.time * 1.3 + tile.seedC * 12)
        const pressureWave = Math.max(0, Math.sin(z * 0.22 - state.time * 6.2 + tile.seedA * 13.5)) * bass * 2.4
        const megaLift = tile.mega * (8 + Math.sin(state.time * 0.55 + tile.seedB * 7) * 2.2)

        let h = tile.baseHeight + (waveLong * 1.7 + waveCross * 1.2 + waveMicro * 0.65 + 2.7) * waveGain + pressureWave + megaLift
        if (tile.deadZone) h *= 0.44
        if (tile.broken) h *= 0.75
        h = Math.max(0.7, h)

        const terrainZ = z + terrainOffset
        const lean = tile.broken ? (laneSign * 0.07 + (Math.sin(state.time * 0.6 + tile.phase) * 0.06)) : 0

        state.dummy.position.set(tile.x, h * 0.5 - 1.05, terrainZ)
        state.dummy.scale.set(tile.deadZone ? 0.9 : 1, h, tile.broken ? 0.88 : 1)
        state.dummy.rotation.set(lean, tile.seedA * 0.9 + Math.sin(state.time * 0.17 + tile.phase) * 0.08, 0)
        state.dummy.updateMatrix()
        columns.setMatrixAt(i, state.dummy.matrix)

        state.dummy.position.set(tile.x, h * 0.5 - 1.0, terrainZ)
        state.dummy.scale.set(1.03, tile.deadZone ? h * 0.52 : h * 0.96, 1.03)
        state.dummy.rotation.set(0, tile.seedA * 0.9 + Math.sin(state.time * 0.17 + tile.phase) * 0.08, 0)
        state.dummy.updateMatrix()
        seams.setMatrixAt(i, state.dummy.matrix)

        state.dummy.position.set(tile.x, h - 1.05, terrainZ)
        state.dummy.scale.set(1, 1, 1)
        state.dummy.rotation.set(0, tile.seedA * 0.9, tile.fissure ? Math.sin(state.time * 0.7 + tile.phase) * 0.06 : 0)
        state.dummy.updateMatrix()
        caps.setMatrixAt(i, state.dummy.matrix)
      }

      columns.instanceMatrix.needsUpdate = true
      seams.instanceMatrix.needsUpdate = true
      caps.instanceMatrix.needsUpdate = true
    }

    updateLane(state.dataA, state.columnsA, state.seamsA, state.capsA, -1)
    updateLane(state.dataB, state.columnsB, state.seamsB, state.capsB, 1)

    const flickerBoost = highs > 0.62 ? 1.15 : 1.0
    state.columnsA.material.emissiveIntensity = (0.26 + bass * 0.44 + state.beatPulse * 0.2) * flickerBoost
    state.columnsB.material.emissiveIntensity = (0.24 + bass * 0.38 + state.beatPulse * 0.18) * flickerBoost
    state.seamsA.material.emissiveIntensity = 0.64 + bass * 1.0 + highs * 0.25 + state.beatPulse * 0.35
    state.seamsB.material.emissiveIntensity = 0.6 + bass * 0.92 + highs * 0.22 + state.beatPulse * 0.32
    state.capsA.material.emissiveIntensity = 0.34 + bass * 0.5 + highs * 0.1
    state.capsB.material.emissiveIntensity = 0.32 + bass * 0.44 + highs * 0.1

    state.sideStructures.forEach((struct, index) => {
      struct.position.z += deltaTime * speed * 0.9
      if (struct.position.z > frontWrap + 25) {
        struct.position.z -= state.worldDepth
      }
      struct.position.y += Math.sin(state.time * struct.userData.drift + index) * deltaTime * 0.8
      struct.material.emissiveIntensity = 0.42 + bass * 0.65 + Math.max(0, Math.sin(state.time * 6.5 + index * 0.7)) * highs * 0.4
    })

    state.suspendedPlatforms.forEach((platform, index) => {
      platform.position.z += deltaTime * speed * 0.78
      if (platform.position.z > frontWrap + 18) {
        platform.position.z -= state.worldDepth
      }
      platform.position.y += Math.sin(state.time * platform.userData.sway + platform.userData.phase + index) * deltaTime * 0.55
      platform.rotation.z += Math.sin(state.time * 0.12 + index) * deltaTime * 0.018
      platform.material.emissiveIntensity = 0.18 + bass * 0.26 + state.eventPulse * 0.08
    })

    if (state.skylineMesh && state.skylineData) {
      let changed = false
      for (let i = 0; i < state.skylineData.length; i += 1) {
        const s = state.skylineData[i]
        s.z += deltaTime * (speed * 0.18 + mids * 1.1)
        if (s.z > frontWrap + 60) {
          s.z -= state.worldDepth * 1.8
        }
        updateIM(state.skylineMesh, i, s)
        changed = true
      }
      if (changed) state.skylineMesh.instanceMatrix.needsUpdate = true
      state.skylineMesh.material.emissiveIntensity = 0.2 + bass * 0.26 + highs * 0.1 + state.beatPulse * 0.08
    }

    if (state.cityBlocks && state.cityBlockData) {
      let changed = false
      for (let i = 0; i < state.cityBlockData.length; i += 1) {
        const b = state.cityBlockData[i]
        b.z += deltaTime * (speed * 0.24 + mids * 1.35)
        if (b.z > frontWrap + 26) {
          b.z -= state.worldDepth * 1.4
        }
        b.ry += deltaTime * b.drift * 0.08
        b.rz = Math.sin(state.time * 0.2 + b.phase) * 0.035
        updateIM(state.cityBlocks, i, b)
        changed = true
      }
      if (changed) state.cityBlocks.instanceMatrix.needsUpdate = true
      state.cityBlocks.material.emissiveIntensity = 0.24 + bass * 0.28 + state.beatPulse * 0.1
    }

    if (state.neonSigns && state.neonSignData) {
      let changed = false
      for (let i = 0; i < state.neonSignData.length; i += 1) {
        const n = state.neonSignData[i]
        n.z += deltaTime * (speed * 0.42 + mids * 2.0)
        if (n.z > frontWrap + 14) {
          n.z -= state.worldDepth * 1.25
          n.y = 4 + Math.random() * 34
        }
        n.rz = Math.sin(state.time * 1.2 + n.phase + i * 0.1) * (0.03 + highs * 0.03)
        updateIM(state.neonSigns, i, n)
        changed = true
      }
      if (changed) state.neonSigns.instanceMatrix.needsUpdate = true
      state.neonSigns.material.opacity = 0.26 + highs * 0.18 + state.eventPulse * 0.1 + Math.max(0, Math.sin(state.time * 7.2)) * 0.05
    }

    state.foregroundFrames.forEach((frame, index) => {
      frame.position.z += deltaTime * (speed * 0.95 + 2)
      if (frame.position.z > frontWrap + 10) {
        frame.position.z -= state.worldDepth
      }
      frame.rotation.y += deltaTime * (0.035 + index * 0.002)
      frame.material.emissiveIntensity = 0.12 + bass * 0.18 + state.beatPulse * 0.08
    })

    state.movingLightFragments.forEach((frag, index) => {
      frag.position.z += deltaTime * (frag.userData.speed + mids * 3.5)
      frag.position.x += deltaTime * frag.userData.drift
      frag.rotation.z += deltaTime * (0.5 + index * 0.01)
      if (frag.position.z > frontWrap + 8) {
        frag.position.z -= state.worldDepth
        frag.position.y = 2 + Math.random() * 20
      }
      frag.material.opacity = 0.06 + highs * 0.12 + state.eventPulse * 0.08 + Math.sin(state.time * 1.7 + frag.userData.phase) * 0.02
    })

    state.groundScanners.forEach((scan, index) => {
      scan.position.z += deltaTime * (scan.userData.speed + mids * 4)
      if (scan.position.z > frontWrap + 6) {
        scan.position.z -= state.worldDepth
      }
      scan.material.opacity = 0.05 + bass * 0.06 + state.beatPulse * 0.05 + Math.max(0, Math.sin(state.time * 4.8 + scan.userData.phase + index)) * highs * 0.06
    })

    state.fissureStrips.forEach((fissure, index) => {
      fissure.position.z += deltaTime * (speed * 0.96 + mids * 3)
      if (fissure.position.z > frontWrap + 12) {
        fissure.position.z -= state.worldDepth
        fissure.position.x = (Math.random() - 0.5) * state.worldWidth * 0.9
      }
      fissure.material.opacity = 0.1 + bass * 0.07 + state.beatPulse * 0.07 + Math.sin(state.time * fissure.userData.drift + fissure.userData.phase + index) * 0.02
    })

    state.fogSheets.forEach((fog, index) => {
      fog.position.z += deltaTime * (speed * 0.35 + mids * 1.8)
      fog.position.x += Math.sin(state.time * 0.17 + fog.userData.phase) * deltaTime * fog.userData.drift
      fog.rotation.y = Math.sin(state.time * 0.08 + index) * 0.55
      if (fog.position.z > frontWrap + 16) {
        fog.position.z -= state.worldDepth
        fog.position.y = 2 + Math.random() * 16
      }
      fog.material.opacity = 0.034 + bass * 0.04 + Math.sin(state.time * 0.2 + index) * 0.01
    })

    state.debrisChunks.forEach((debris) => {
      debris.position.z += deltaTime * (speed * 0.7)
      debris.position.x += deltaTime * debris.userData.drift
      debris.rotation.x += deltaTime * debris.userData.spin * 0.23
      debris.rotation.y += deltaTime * debris.userData.spin * 0.31
      if (debris.position.z > frontWrap + 10) {
        debris.position.z -= state.worldDepth
      }
      debris.material.emissiveIntensity = 0.24 + bass * 0.24 + highs * 0.08
    })

    state.signalBeacons.forEach((beacon, index) => {
      beacon.position.z += deltaTime * (speed * 0.62 + mids * 2.2)
      beacon.position.x += Math.sin(state.time * 0.7 + beacon.userData.phase + index) * deltaTime * beacon.userData.speed
      beacon.position.y += Math.sin(state.time * 0.38 + beacon.userData.phase) * deltaTime * 1.8
      if (beacon.position.z > frontWrap + 14) {
        beacon.position.z -= state.worldDepth * 1.18
      }
      beacon.intensity = 1.22 + bass * 0.95 + highs * 0.26 + state.beatPulse * 0.36 + Math.max(0, Math.sin(state.time * 4.6 + beacon.userData.phase)) * 0.24
    })

    if (state.dustPoints && state.dustPositions && state.dustVelocities) {
      const pos = state.dustPoints.geometry.getAttribute('position')
      for (let i = 0; i < state.dustVelocities.length; i += 1) {
        const idx = i * 3
        state.dustPositions[idx] += Math.sin(state.time * 0.33 + i * 0.09) * deltaTime * 0.6
        state.dustPositions[idx + 1] += Math.sin(state.time * 0.2 + i * 0.04) * deltaTime * 0.3
        state.dustPositions[idx + 2] += deltaTime * (speed + mids * 7)

        if (state.dustPositions[idx + 2] > frontWrap + 6) {
          state.dustPositions[idx] = (Math.random() - 0.5) * state.worldWidth * 1.3
          state.dustPositions[idx + 1] = 0.2 + Math.random() * 12
          state.dustPositions[idx + 2] = -state.worldDepth - Math.random() * state.worldDepth * 0.2
        }
      }
      state.dustPoints.material.opacity = 0.11 + bass * 0.04
      pos.needsUpdate = true
    }

    if (state.sparkPoints && state.sparkPositions && state.sparkVelocities) {
      const pos = state.sparkPoints.geometry.getAttribute('position')
      const burst = highs > 0.68 ? 1.7 + highs * 1.8 : 1
      for (let i = 0; i < state.sparkVelocities.length; i += 1) {
        const idx = i * 3
        state.sparkPositions[idx + 1] += deltaTime * state.sparkVelocities[i] * 0.5 * burst
        state.sparkPositions[idx + 2] += deltaTime * (speed * 1.5 + mids * 14)

        if (state.sparkPositions[idx + 1] > 18 || state.sparkPositions[idx + 2] > frontWrap + 4) {
          state.sparkPositions[idx] = (Math.random() - 0.5) * state.worldWidth * 1.1
          state.sparkPositions[idx + 1] = 0.4 + Math.random() * 5
          state.sparkPositions[idx + 2] = -state.worldDepth - Math.random() * state.worldDepth * 0.3
        }
      }
      state.sparkPoints.material.opacity = 0.16 + highs * 0.22 + state.eventPulse * 0.14
      pos.needsUpdate = true
    }

    if (state.horizonGlow) {
      state.horizonGlow.position.z += deltaTime * (speed * 0.22)
      if (state.horizonGlow.position.z > -state.worldDepth * 0.52) {
        state.horizonGlow.position.z -= state.worldDepth * 0.42
      }
      state.horizonGlow.material.opacity = 0.1 + bass * 0.07 + state.beatPulse * 0.05
    }

    if (state.ground?.material) {
      state.ground.material.emissiveIntensity = 0.24 + bass * 0.18 + state.beatPulse * 0.1
      state.ground.material.roughness = Math.min(0.8, Math.max(0.46, 0.66 - bass * 0.12 - highs * 0.04))
      state.ground.material.metalness = Math.min(0.82, 0.62 + bass * 0.14)
    }

    if (state.ambientLight) {
      state.ambientLight.intensity = 0.38 + bass * 0.18 + state.beatPulse * 0.06
    }
    if (state.hemiLight) {
      state.hemiLight.intensity = 0.46 + mids * 0.2 + highs * 0.08
    }
    if (state.keyLight) {
      state.keyLight.intensity = 0.95 + bass * 0.32 + state.beatPulse * 0.18
      state.keyLight.position.x = -120 + Math.sin(state.time * 0.09) * 25
      state.keyLight.position.z = 90 + Math.cos(state.time * 0.07) * 18
    }
    if (state.rimLight) {
      state.rimLight.intensity = 0.54 + highs * 0.24 + state.eventPulse * 0.18
      state.rimLight.position.x = 140 + Math.sin(state.time * 0.11 + 1.4) * 16
      state.rimLight.position.z = -150 + Math.cos(state.time * 0.08 + 0.7) * 18
    }
    if (state.laneLightCyan) {
      state.laneLightCyan.intensity = 1.35 + bass * 0.42 + state.beatPulse * 0.3
      state.laneLightCyan.position.z += deltaTime * (speed * 0.5)
      if (state.laneLightCyan.position.z > frontWrap + 15) state.laneLightCyan.position.z -= state.worldDepth * 0.9
    }
    if (state.laneLightMagenta) {
      state.laneLightMagenta.intensity = 1.25 + bass * 0.38 + state.eventPulse * 0.34
      state.laneLightMagenta.position.z += deltaTime * (speed * 0.45)
      if (state.laneLightMagenta.position.z > frontWrap + 15) state.laneLightMagenta.position.z -= state.worldDepth * 0.9
    }

    if (state.camera) {
      state.camera.position.z = 10 + Math.sin(state.time * 0.08) * 1.2
      state.camera.position.x = Math.sin(state.time * 0.12) * (7.2 + mids * 5.2) + Math.sin(state.time * 0.39) * 1.5
      state.camera.position.y = 4.9 + Math.sin(state.time * 0.25 + 0.6) * 1.2 + bass * 0.76 + state.beatPulse * 0.32
      state.lookTarget.set(
        Math.sin(state.time * 0.08) * 7,
        1.7 + bass * 0.96,
        -58 - speed * 1.85
      )
      state.camera.lookAt(state.lookTarget)
      state.camera.rotation.z = Math.sin(state.time * 0.19) * 0.02
    }

    if (state.scene?.fog) {
      state.scene.fog.density = 0.0048 + bass * 0.00085 + mids * 0.0003
      state.scene.fog.color.setRGB(
        0.04 + bass * 0.015,
        0.07 + mids * 0.02,
        0.13 + highs * 0.02
      )
    }

    state.postFx.bloomStrength = Math.min(1.55, 0.92 + bass * 0.54 + highs * 0.16 + state.beatPulse * 0.24)
    state.postFx.bloomRadius = Math.min(0.88, 0.58 + highs * 0.12)
    state.postFx.bloomThreshold = Math.max(0.62, 0.75 - bass * 0.08)
    state.postFx.noiseAmount = Math.min(0.072, 0.018 + highs * 0.02 + state.eventPulse * 0.012)
    state.postFx.vignetteStrength = Math.min(0.54, 0.38 + mids * 0.06)
    state.postFx.saturation = Math.max(0.98, 1.05 - highs * 0.03 + bass * 0.04)
    state.postFx.chromaticAberration = 0.00055 + highs * 0.00075 + state.eventPulse * 0.0008
    state.postFx.exposure = Math.min(1.18, 1.04 + state.beatPulse * 0.05 + bass * 0.04 + state.eventPulse * 0.03)
  },

  disposeScene(state) {
    if (!state) return

    state.trackedObjects?.forEach((obj) => {
      if (!obj) return
      if (obj.parent) obj.parent.remove(obj)
      obj.geometry?.dispose?.()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m?.dispose?.())
        else obj.material.dispose?.()
      }
    })

    state.textures?.forEach((tex) => tex?.dispose?.())
  },
}
