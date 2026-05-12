import * as THREE from 'three'

/**
 * BLACK HOLE CATHEDRAL
 * Gigantic alien ritual megastructure surrounding a growing singularity.
 * Camera orbits INSIDE the cathedral — looking inward through the colonnade
 * at the dominant black hole. Massive scale. Visible structure. Cinematic.
 *
 * Layout (all centered on 0,0,0):
 *  - Black hole core: radius 44 — threatening, dominant
 *  - Energy shell: radius 66, rim-glow shader
 *  - 4 accretion tori: radii 80, 112, 148, 188 — bright glowing rings
 *  - 12 inner colonnade pillars: radius 108-126 — cathedral framing
 *  - Horizontal bridge spans: midground
 *  - 16 floating monoliths: radius 160-280
 *  - 3 mega structural rings: radii 300, 400, 520
 *  - Outer megastructure pillars: radius 320-700
 *  - Orbiting debris bands, energy streams, ash cloud, fog layers
 *  - Distant silhouettes: radius 600-1400
 *
 * Camera orbit radius: 230 — sits between colonnade (108) and outer ring (300).
 */

const TMP_MATRIX = new THREE.Matrix4()
const TMP_QUAT = new THREE.Quaternion()
const TMP_SCALE = new THREE.Vector3()
const TMP_POS = new THREE.Vector3()

const SHELL_VERT = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const SHELL_FRAG = `
  uniform float uTime;
  uniform float uBass;
  uniform float uHighs;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  float hash(vec3 p) {
    p = fract(p * 0.318 + .1); p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float rim = pow(1.0 - abs(dot(normalize(vNormal), viewDir)), 1.7);
    float n = hash(vWorldPos * 0.07 + vec3(uTime * 0.025));
    float pulse = 0.45 + uBass * 1.0 + sin(uTime * 1.9) * 0.12;
    float scan = smoothstep(0.72, 1.0, sin((vWorldPos.y + uTime * (5.0 + uHighs * 15.0)) * 0.5));
    vec3 col = mix(uColorA, uColorB, n * 0.65 + sin(uTime * 0.35) * 0.15 + 0.18);
    col *= rim * pulse * 2.1 + 0.06 + scan * 0.22;
    gl_FragColor = vec4(col, clamp(rim * (0.6 + uBass * 0.4), 0.0, 1.0));
  }
`

function updateIM(mesh, index, d) {
  TMP_POS.set(d.x, d.y, d.z)
  TMP_QUAT.setFromEuler(new THREE.Euler(d.rx || 0, d.ry || 0, d.rz || 0))
  TMP_SCALE.set(d.sx, d.sy, d.sz)
  TMP_MATRIX.compose(TMP_POS, TMP_QUAT, TMP_SCALE)
  mesh.setMatrixAt(index, TMP_MATRIX)
}

function makeRuneTexture(seed) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const t = new THREE.DataTexture(new Uint8Array([200, 220, 255, 255]), 1, 1)
    t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t
  }
  let s = seed * 9319
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295 }
  ctx.fillStyle = '#03050d'; ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 36; i++) {
    const x = 16 + rand() * 224, y = 16 + rand() * 224
    const w = 10 + rand() * 40, h = 1.5 + rand() * 5
    const hue = rand() > 0.5 ? 192 + rand() * 16 : 288 + rand() * 16
    ctx.fillStyle = `hsla(${hue},100%,${55 + rand() * 35}%,${0.55 + rand() * 0.45})`
    ctx.fillRect(x, y, w, h)
    if (rand() > 0.4) ctx.fillRect(x + w * 0.45, y - h * (1 + rand() * 3), h, h * (1 + rand() * 5))
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; return tex
}

function makeCloud(count, color, size, opacity) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  })
  return { points: new THREE.Points(geo, mat), positions: pos, velocities: vel }
}

function makeDetailTexture(seed, withPanels = false) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    const t = new THREE.DataTexture(new Uint8Array([140, 140, 140, 255]), 1, 1)
    t.needsUpdate = true
    return t
  }

  let s = seed * 11213
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967295 }

  ctx.fillStyle = '#787878'
  ctx.fillRect(0, 0, 256, 256)

  for (let i = 0; i < 3200; i += 1) {
    const v = Math.floor(70 + rand() * 110)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    const x = Math.floor(rand() * 256)
    const y = Math.floor(rand() * 256)
    const w = Math.floor(1 + rand() * 2)
    const h = Math.floor(1 + rand() * 2)
    ctx.fillRect(x, y, w, h)
  }

  for (let i = 0; i < 120; i += 1) {
    const x = Math.floor(rand() * 240)
    const y = Math.floor(rand() * 240)
    const w = Math.floor(8 + rand() * 26)
    const h = Math.floor(1 + rand() * 3)
    const v = Math.floor(60 + rand() * 120)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect(x, y, w, h)
    if (rand() > 0.55) ctx.fillRect(x + Math.floor(w * 0.45), y - Math.floor(1 + rand() * 5), 1, Math.floor(3 + rand() * 10))
  }

  if (withPanels) {
    ctx.fillStyle = 'rgba(18, 24, 42, 1)'
    ctx.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 65; i += 1) {
      const hue = rand() > 0.5 ? 194 + rand() * 16 : 286 + rand() * 16
      const x = 10 + rand() * 236
      const y = 10 + rand() * 236
      const w = 6 + rand() * 38
      const h = 1 + rand() * 3
      ctx.fillStyle = `hsla(${hue}, 100%, ${58 + rand() * 26}%, ${0.2 + rand() * 0.7})`
      ctx.fillRect(x, y, w, h)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  tex.needsUpdate = true
  if (withPanels) tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export const blackHoleCathedralRenderer = {
  createScene({ scene, camera, qualityPreset }) {
    const pr = qualityPreset?.pixelRatio ?? 0.5
    const Q = pr <= 0.35 ? 'safe' : pr <= 0.5 ? 'perf' : 'ultra'

    const N = {
      innerPillars:  12,
      outerPillars:  Q === 'safe' ? 36  : Q === 'perf' ? 56  : 80,
      monoliths:     Q === 'safe' ? 10  : Q === 'perf' ? 16  : 24,
      bridges:       Q === 'safe' ? 6   : Q === 'perf' ? 10  : 14,
      buttresses:    Q === 'safe' ? 18  : Q === 'perf' ? 28  : 40,
      pillarBands:   Q === 'safe' ? 70  : Q === 'perf' ? 120 : 180,
      orbitDebris:   Q === 'safe' ? 240 : Q === 'perf' ? 380 : 560,
      coreShards:    Q === 'safe' ? 44  : Q === 'perf' ? 68  : 96,
      ash:           Q === 'safe' ? 400 : Q === 'perf' ? 680 : 1000,
      energyPts:     Q === 'safe' ? 100 : Q === 'perf' ? 180 : 280,
      fogSheets:     Q === 'safe' ? 10  : Q === 'perf' ? 16  : 24,
      shafts:        Q === 'safe' ? 6   : Q === 'perf' ? 8   : 12,
      silhouettes:   Q === 'safe' ? 40  : Q === 'perf' ? 65  : 100,
      runePanels:    Q === 'safe' ? 30  : Q === 'perf' ? 50  : 72,
      brokenArcs:    Q === 'safe' ? 38  : Q === 'perf' ? 62  : 92,
      driftLights:   Q === 'safe' ? 3   : Q === 'perf' ? 5   : 7,
      scaffoldRibs:  Q === 'safe' ? 42  : Q === 'perf' ? 68  : 104,
      ruinChunks:    Q === 'safe' ? 60  : Q === 'perf' ? 96  : 150,
      insetPanels:   Q === 'safe' ? 110 : Q === 'perf' ? 180 : 260,
    }

    const state = {
      time: 0, scene, camera: null,
      orbitAngle: Math.PI * 0.55, orbitRadius: 230,
      orbitHeight: 55, orbitHeightTarget: 55,
      orbitBankAngle: 0, gravitationalPull: 0,
      cameraTarget: new THREE.Vector3(0, 0, 0),
      prevBass: 0, beatPulse: 0, eventPulse: 0, eventCooldown: 2.5,
      trackedObjects: [], runeTextures: [],
      innerPillarData: [], outerPillarData: [], monolithData: [],
      buttressData: [], pillarBandData: [], brokenArcData: [], coreShardData: [],
      scaffoldRibData: [], ruinChunkData: [],
      insetPanelData: [],
      bridgeData: [], orbitDebrisData: [], fogSheets: [],
      accretionRings: [], megaRings: [], lightShafts: [],
      driftLights: [],
      ashPositions: null, ashVelocities: null,
      energyPositions: null, energyVelocities: null,
      coreShaderMat: null,
      exposureSmoothed: 0.92,
      postFx: {
        bloomStrength:       Q === 'safe' ? 1.0 : Q === 'perf' ? 1.35 : 1.75,
        bloomRadius:         Q === 'safe' ? 0.52 : Q === 'perf' ? 0.70 : 0.90,
        bloomThreshold:      0.62,
        noiseAmount:         Q === 'safe' ? 0.018 : Q === 'perf' ? 0.026 : 0.037,
        vignetteStrength:    0.4,
        saturation:          0.94,
        chromaticAberration: 0.00075,
        exposure:            1.08,
      },
    }

    scene.background = new THREE.Color(0x010109)
    scene.fog = new THREE.FogExp2(0x03050f, Q === 'safe' ? 0.0019 : 0.00145)

    state.camera = camera
    camera.position.set(Math.sin(Math.PI * 0.55) * 230, 55, Math.cos(Math.PI * 0.55) * 230)
    camera.lookAt(0, 0, 0)

    const roughMetalTexA = makeDetailTexture(77, false)
    const roughMetalTexB = makeDetailTexture(133, false)
    const panelGlowTex = makeDetailTexture(311, true)
    state.runeTextures.push(roughMetalTexA, roughMetalTexB, panelGlowTex)

    // -- LIGHTING ---------------------------------------------------------------
    const ambient = new THREE.AmbientLight(0x17305a, 0.42)
    scene.add(ambient); state.trackedObjects.push(ambient)

    const coreC = new THREE.PointLight(0x22d8ff, 5.0, 1100, 1.4)
    coreC.position.set(0, 15, 0)
    scene.add(coreC); state.coreC = coreC; state.trackedObjects.push(coreC)

    const coreV = new THREE.PointLight(0xbb44ff, 4.2, 1000, 1.4)
    coreV.position.set(0, -8, 0)
    scene.add(coreV); state.coreV = coreV; state.trackedObjects.push(coreV)

    const ember = new THREE.PointLight(0xff3a18, 2.4, 700, 1.6)
    ember.position.set(0, -70, 0)
    scene.add(ember); state.ember = ember; state.trackedObjects.push(ember)

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const rl = new THREE.PointLight([0x44ddff, 0xcc44ff, 0x44aaff, 0xff44cc][i], 2.2, 750, 1.5)
      rl.position.set(Math.cos(a) * 200, 30 + i * 15, Math.sin(a) * 200)
      scene.add(rl); state.trackedObjects.push(rl)
    }

    const key = new THREE.DirectionalLight(0x9ab8ff, 0.82)
    key.position.set(80, 300, 100)
    scene.add(key); state.trackedObjects.push(key)

    for (let i = 0; i < N.driftLights; i += 1) {
      const angle = (i / N.driftLights) * Math.PI * 2
      const light = new THREE.PointLight(i % 2 === 0 ? 0x66ddff : 0xcf5bff, 0.9, 320, 1.9)
      light.position.set(Math.cos(angle) * 240, 30 + Math.sin(angle * 2.1) * 45, Math.sin(angle) * 240)
      light.userData = {
        angle,
        radius: 220 + Math.random() * 90,
        speed: 0.05 + Math.random() * 0.08,
        phase: Math.random() * Math.PI * 2,
      }
      scene.add(light)
      state.driftLights.push(light)
      state.trackedObjects.push(light)
    }

    // -- BLACK HOLE -------------------------------------------------------------
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(44, 52, 52),
      new THREE.MeshStandardMaterial({
        color: 0x010108, emissive: 0x060618, emissiveIntensity: 0.14,
        metalness: 0.95, roughness: 0.06,
      })
    )
    scene.add(core); state.core = core; state.trackedObjects.push(core)

    const lensHaze = new THREE.Mesh(
      new THREE.SphereGeometry(78, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0x0a0840, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      })
    )
    scene.add(lensHaze); state.lensHaze = lensHaze; state.trackedObjects.push(lensHaze)

    const shellMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:   { value: 0 }, uBass: { value: 0 }, uHighs: { value: 0 },
        uColorA: { value: new THREE.Color(0x22d8ff) },
        uColorB: { value: new THREE.Color(0xb040ff) },
      },
      vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
    const shell = new THREE.Mesh(new THREE.SphereGeometry(66, 56, 56), shellMat)
    scene.add(shell); state.shell = shell; state.coreShaderMat = shellMat; state.trackedObjects.push(shell)

    const warpHaze = new THREE.Mesh(
      new THREE.SphereGeometry(130, 28, 28),
      new THREE.MeshBasicMaterial({
        color: 0x1414a0, transparent: true, opacity: 0.055,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      })
    )
    scene.add(warpHaze); state.warpHaze = warpHaze; state.trackedObjects.push(warpHaze)

    const turbulenceShell = new THREE.Mesh(
      new THREE.SphereGeometry(92, 38, 38),
      new THREE.MeshBasicMaterial({
        color: 0x2b6cbf,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
    )
    scene.add(turbulenceShell)
    state.turbulenceShell = turbulenceShell
    state.trackedObjects.push(turbulenceShell)

    const distortionRingA = new THREE.Mesh(
      new THREE.TorusGeometry(96, 2.4, 18, 200),
      new THREE.MeshBasicMaterial({
        color: 0x59baff,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    distortionRingA.rotation.x = Math.PI * 0.42
    scene.add(distortionRingA)
    state.distortionRingA = distortionRingA
    state.trackedObjects.push(distortionRingA)

    const distortionRingB = new THREE.Mesh(
      new THREE.TorusGeometry(122, 1.7, 14, 240),
      new THREE.MeshBasicMaterial({
        color: 0xba63ff,
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    distortionRingB.rotation.x = Math.PI * 0.53
    distortionRingB.rotation.z = Math.PI * 0.18
    scene.add(distortionRingB)
    state.distortionRingB = distortionRingB
    state.trackedObjects.push(distortionRingB)

    const coreShardGeo = new THREE.IcosahedronGeometry(1, 0)
    const coreShardMat = new THREE.MeshStandardMaterial({
      color: 0x0f1628,
      emissive: 0x2e62c8,
      emissiveIntensity: 1.0,
      metalness: 0.82,
      roughness: 0.34,
    })
    for (let i = 0; i < N.coreShards; i += 1) {
      const band = i % 4
      const angle = (i / N.coreShards) * Math.PI * 2 * (1.3 + band * 0.4)
      const radius = 54 + band * 11 + Math.random() * 8
      state.coreShardData.push({
        x: Math.cos(angle) * radius,
        y: (Math.random() - 0.5) * (16 + band * 5),
        z: Math.sin(angle) * radius,
        sx: 1.5 + Math.random() * 4,
        sy: 1.5 + Math.random() * 6,
        sz: 1.5 + Math.random() * 4,
        ry: angle,
        rx: Math.random() * Math.PI,
        rz: Math.random() * Math.PI,
        radius,
        angle,
        band,
        spin: (Math.random() - 0.5) * 1.6,
      })
    }
    const coreShards = new THREE.InstancedMesh(coreShardGeo, coreShardMat, state.coreShardData.length)
    coreShards.frustumCulled = false
    state.coreShardData.forEach((d, i) => updateIM(coreShards, i, d))
    scene.add(coreShards)
    state.coreShards = coreShards
    state.coreShardMat = coreShardMat
    state.trackedObjects.push(coreShards)

    // -- ACCRETION TORI ---------------------------------------------------------
    const torusDefs = [
      { r: 80,  tube: 3.2, col: 0x55ddff, em: 0x0099cc, ei: 2.6, tx: Math.PI*0.50, tz:  0.00, speed:  0.10 },
      { r: 112, tube: 2.5, col: 0xdd66ff, em: 0x6600bb, ei: 2.3, tx: Math.PI*0.45, tz:  0.06, speed: -0.07 },
      { r: 148, tube: 2.0, col: 0xff7722, em: 0xcc3300, ei: 2.0, tx: Math.PI*0.47, tz: -0.05, speed:  0.05 },
      { r: 188, tube: 1.5, col: 0x33ddff, em: 0x005588, ei: 1.7, tx: Math.PI*0.49, tz:  0.09, speed: -0.04 },
    ]
    torusDefs.forEach((d, i) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(d.r, d.tube, 28, 240),
        new THREE.MeshStandardMaterial({ color: d.col, emissive: d.em, emissiveIntensity: d.ei, metalness: 0.55, roughness: 0.18 })
      )
      mesh.rotation.x = d.tx; mesh.rotation.z = d.tz
      scene.add(mesh); state.accretionRings.push({ mesh, speed: d.speed }); state.trackedObjects.push(mesh)
    })

    // -- INNER CATHEDRAL COLONNADE (radius 108-126) ------------------------------
    const iGeo = new THREE.CylinderGeometry(0.7, 1.0, 1, 7, 1)
    const iMat = new THREE.MeshStandardMaterial({
      color: 0x08101c, emissive: 0x2244aa, emissiveIntensity: 0.6, metalness: 0.86, roughness: 0.40,
      roughnessMap: roughMetalTexA,
      metalnessMap: roughMetalTexB,
      emissiveMap: panelGlowTex,
    })
    for (let i = 0; i < N.innerPillars; i++) {
      const a = (i / N.innerPillars) * Math.PI * 2
      const r = 108 + (i % 3) * 9
      const h = 340 + Math.random() * 200
      const brk = Math.random() > 0.7
      state.innerPillarData.push({
        x: Math.cos(a) * r, y: h * 0.5 - 50, z: Math.sin(a) * r,
        sx: 10 + Math.random() * 10, sy: brk ? h * (0.45 + Math.random() * 0.35) : h,
        sz: 10 + Math.random() * 10, ry: a + Math.PI * 0.5,
        rx: (Math.random() - 0.5) * 0.012, rz: (Math.random() - 0.5) * 0.018,
      })
    }
    for (let i = 0; i < N.innerPillars; i += 2) {
      const a = (i / N.innerPillars) * Math.PI * 2
      const r = 108 + (i % 3) * 9
      state.innerPillarData.push({
        x: Math.cos(a) * r + (Math.random()-0.5)*14, y: 230 + Math.random()*40,
        z: Math.sin(a) * r + (Math.random()-0.5)*14,
        sx: 20 + Math.random()*16, sy: 10 + Math.random()*20, sz: 20 + Math.random()*16,
        ry: Math.random() * Math.PI, rx: (Math.random()-0.5)*0.35, rz: (Math.random()-0.5)*0.25,
      })
    }
    const iPillars = new THREE.InstancedMesh(iGeo, iMat, state.innerPillarData.length)
    iPillars.frustumCulled = false
    state.innerPillarData.forEach((p, i) => updateIM(iPillars, i, p))
    scene.add(iPillars); state.iPillars = iPillars; state.iMat = iMat; state.trackedObjects.push(iPillars)

    const insetPanelGeo = new THREE.BoxGeometry(1, 1, 1)
    const insetPanelMat = new THREE.MeshStandardMaterial({
      color: 0x0c1424,
      emissive: 0x2a63d4,
      emissiveIntensity: 0.62,
      metalness: 0.84,
      roughness: 0.34,
      roughnessMap: roughMetalTexB,
      emissiveMap: panelGlowTex,
    })
    for (let i = 0; i < N.insetPanels; i += 1) {
      const mode = i % 2
      const angle = Math.random() * Math.PI * 2
      const radius = mode === 0 ? 98 + Math.random() * 24 : 300 + Math.random() * 190
      state.insetPanelData.push({
        x: Math.cos(angle) * radius,
        y: -120 + Math.random() * 360,
        z: Math.sin(angle) * radius,
        sx: 8 + Math.random() * 28,
        sy: 1.4 + Math.random() * 5,
        sz: 3 + Math.random() * 11,
        ry: angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.3,
        rx: (Math.random() - 0.5) * 0.22,
        rz: (Math.random() - 0.5) * 0.22,
        phase: Math.random() * Math.PI * 2,
        orbitRadius: radius,
        orbitAngle: angle,
      })
    }
    const insetPanels = new THREE.InstancedMesh(insetPanelGeo, insetPanelMat, state.insetPanelData.length)
    insetPanels.frustumCulled = false
    state.insetPanelData.forEach((d, i) => updateIM(insetPanels, i, d))
    scene.add(insetPanels)
    state.insetPanels = insetPanels
    state.insetPanelMat = insetPanelMat
    state.trackedObjects.push(insetPanels)

    const bandGeo = new THREE.BoxGeometry(1, 1, 1)
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0x0e1628,
      emissive: 0x2b5bb8,
      emissiveIntensity: 0.74,
      metalness: 0.86,
      roughness: 0.3,
      roughnessMap: roughMetalTexB,
      emissiveMap: panelGlowTex,
    })
    for (let i = 0; i < N.pillarBands; i += 1) {
      const ring = i % N.innerPillars
      const angle = (ring / N.innerPillars) * Math.PI * 2 + (Math.random() - 0.5) * 0.09
      const radius = 103 + (ring % 3) * 12 + Math.random() * 7
      const y = -30 + Math.random() * 280
      state.pillarBandData.push({
        x: Math.cos(angle) * radius,
        y,
        z: Math.sin(angle) * radius,
        sx: 10 + Math.random() * 16,
        sy: 2 + Math.random() * 7,
        sz: 8 + Math.random() * 13,
        ry: angle + Math.PI * 0.5,
        rx: (Math.random() - 0.5) * 0.18,
        rz: (Math.random() - 0.5) * 0.18,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const pillarBands = new THREE.InstancedMesh(bandGeo, bandMat, state.pillarBandData.length)
    pillarBands.frustumCulled = false
    state.pillarBandData.forEach((d, i) => updateIM(pillarBands, i, d))
    scene.add(pillarBands)
    state.pillarBands = pillarBands
    state.pillarBandMat = bandMat
    state.trackedObjects.push(pillarBands)

    const buttressGeo = new THREE.CylinderGeometry(0.48, 1.05, 1, 6, 1)
    const buttressMat = new THREE.MeshStandardMaterial({
      color: 0x090f1d,
      emissive: 0x1e366f,
      emissiveIntensity: 0.52,
      metalness: 0.8,
      roughness: 0.46,
      roughnessMap: roughMetalTexA,
      metalnessMap: roughMetalTexB,
    })
    for (let i = 0; i < N.buttresses; i += 1) {
      const angle = (i / N.buttresses) * Math.PI * 2 + (Math.random() - 0.5) * 0.17
      const radius = 146 + Math.random() * 95
      const upward = Math.random() > 0.35
      state.buttressData.push({
        x: Math.cos(angle) * radius,
        y: upward ? -90 + Math.random() * 36 : 90 + Math.random() * 44,
        z: Math.sin(angle) * radius,
        sx: 16 + Math.random() * 28,
        sy: 12 + Math.random() * 30,
        sz: 96 + Math.random() * 130,
        ry: angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.2,
        rx: upward ? -1.08 + Math.random() * 0.28 : 1.02 + Math.random() * 0.3,
        rz: (Math.random() - 0.5) * 0.1,
        phase: Math.random() * Math.PI * 2,
      })
    }
    const buttresses = new THREE.InstancedMesh(buttressGeo, buttressMat, state.buttressData.length)
    buttresses.frustumCulled = false
    state.buttressData.forEach((d, i) => updateIM(buttresses, i, d))
    scene.add(buttresses)
    state.buttresses = buttresses
    state.buttressMat = buttressMat
    state.trackedObjects.push(buttresses)

    // -- BRIDGE SPANS -----------------------------------------------------------
    const bGeo = new THREE.BoxGeometry(1, 1, 1)
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x0a1020, emissive: 0x2255cc, emissiveIntensity: 0.75, metalness: 0.88, roughness: 0.32,
      roughnessMap: roughMetalTexA,
      emissiveMap: panelGlowTex,
    })
    for (let i = 0; i < N.bridges; i++) {
      const a = (i / N.bridges) * Math.PI * 2 + 0.25
      const r = 125 + Math.random() * 55
      const isArch = Math.random() > 0.4
      state.bridgeData.push({
        x: Math.cos(a) * r, y: -20 + Math.random() * 140, z: Math.sin(a) * r,
        sx: isArch ? 90 + Math.random()*80 : 10 + Math.random()*14,
        sy: isArch ? 4 + Math.random()*6 : 55 + Math.random()*80,
        sz: isArch ? 10 + Math.random()*18 : 10 + Math.random()*14,
        ry: a + (Math.random()-0.5)*0.4, rx: isArch ? (Math.random()-0.5)*0.08 : 0, rz: 0,
        floatPhase: Math.random() * Math.PI * 2,
        floatSpeed: 0.14 + Math.random() * 0.18, floatAmp: 3 + Math.random() * 7,
      })
    }
    const bridges = new THREE.InstancedMesh(bGeo, bMat, state.bridgeData.length)
    bridges.frustumCulled = false
    state.bridgeData.forEach((d, i) => updateIM(bridges, i, d))
    scene.add(bridges); state.bridges = bridges; state.bridgesMat = bMat; state.trackedObjects.push(bridges)

    // -- FLOATING MONOLITHS -----------------------------------------------------
    const mGeo = new THREE.CylinderGeometry(0.6, 0.95, 1, 6, 1)
    const mMat = new THREE.MeshStandardMaterial({
      color: 0x070d18, emissive: 0x1a3266, emissiveIntensity: 0.58, metalness: 0.84, roughness: 0.42,
      roughnessMap: roughMetalTexB,
      metalnessMap: roughMetalTexA,
    })
    for (let i = 0; i < N.monoliths; i++) {
      const a = (i / N.monoliths) * Math.PI * 2 + Math.random() * 0.7
      const r = 165 + Math.random() * 115
      const h = 70 + Math.random() * 200
      state.monolithData.push({
        x: Math.cos(a) * r, y: 20 + Math.random() * 90 - Math.random() * 60,
        z: Math.sin(a) * r, sx: 20 + Math.random()*28, sy: h, sz: 14 + Math.random()*22,
        ry: a + (Math.random()-0.5)*0.6, rx: (Math.random()-0.5)*0.18, rz: (Math.random()-0.5)*0.12,
        orbitA: a, orbitR: r, orbitSpeed: (Math.random()-0.5) * 0.009,
        floatPhase: Math.random() * Math.PI * 2,
        floatSpeed: 0.18 + Math.random() * 0.28, floatAmp: 4 + Math.random() * 8,
      })
    }
    const monoliths = new THREE.InstancedMesh(mGeo, mMat, state.monolithData.length)
    monoliths.frustumCulled = false
    state.monolithData.forEach((d, i) => updateIM(monoliths, i, d))
    scene.add(monoliths); state.monoliths = monoliths; state.monolithMat = mMat; state.trackedObjects.push(monoliths)

    // -- 3 MEGA STRUCTURAL RINGS ------------------------------------------------
    const megaDefs = [
      { r: 300, tube: 7, col: 0x162048, em: 0x2a40a0, ei: 0.75, tx: Math.PI*0.10, tz:  0.00, speed:  0.009 },
      { r: 400, tube: 5, col: 0x121535, em: 0x2a2090, ei: 0.70, tx: Math.PI*0.04, tz:  0.14, speed: -0.006 },
      { r: 520, tube: 4, col: 0x0e1228, em: 0x1c2870, ei: 0.65, tx: Math.PI*0.07, tz: -0.10, speed:  0.005 },
    ]
    megaDefs.forEach(d => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(d.r, d.tube, 14, 360),
        new THREE.MeshStandardMaterial({ color: d.col, emissive: d.em, emissiveIntensity: d.ei, metalness: 0.80, roughness: 0.42 })
      )
      mesh.rotation.x = d.tx; mesh.rotation.z = d.tz
      scene.add(mesh); state.megaRings.push({ mesh, speed: d.speed }); state.trackedObjects.push(mesh)
    })

    const brokenArcGeo = new THREE.BoxGeometry(1, 1, 1)
    const brokenArcMat = new THREE.MeshStandardMaterial({
      color: 0x0b1121,
      emissive: 0x244596,
      emissiveIntensity: 0.64,
      metalness: 0.81,
      roughness: 0.41,
      roughnessMap: roughMetalTexA,
      emissiveMap: panelGlowTex,
    })
    for (let i = 0; i < N.brokenArcs; i += 1) {
      const lane = i % 3
      const baseRadius = 286 + lane * 96 + Math.random() * 35
      const angle = (i / N.brokenArcs) * Math.PI * 2 + (Math.random() - 0.5) * 0.18
      if (Math.random() > 0.84) continue
      state.brokenArcData.push({
        x: Math.cos(angle) * baseRadius,
        y: -42 + lane * 52 + (Math.random() - 0.5) * 38,
        z: Math.sin(angle) * baseRadius,
        sx: 42 + Math.random() * 88,
        sy: 6 + Math.random() * 12,
        sz: 10 + Math.random() * 24,
        ry: angle + Math.PI * 0.5,
        rx: (Math.random() - 0.5) * 0.3,
        rz: (Math.random() - 0.5) * 0.22,
        orbitRadius: baseRadius,
        orbitAngle: angle,
        drift: (Math.random() - 0.5) * 0.008,
      })
    }
    const brokenArcs = new THREE.InstancedMesh(brokenArcGeo, brokenArcMat, state.brokenArcData.length)
    brokenArcs.frustumCulled = false
    state.brokenArcData.forEach((d, i) => updateIM(brokenArcs, i, d))
    scene.add(brokenArcs)
    state.brokenArcs = brokenArcs
    state.brokenArcMat = brokenArcMat
    state.trackedObjects.push(brokenArcs)

    // -- OUTER MEGASTRUCTURE PILLARS (background) --------------------------------
    const oPGeo = new THREE.CylinderGeometry(0.86, 1.16, 1, 5, 1)
    const oPMat = new THREE.MeshStandardMaterial({
      color: 0x060c14, emissive: 0x162860, emissiveIntensity: 0.60, metalness: 0.78, roughness: 0.50,
      roughnessMap: roughMetalTexB,
      metalnessMap: roughMetalTexA,
    })
    for (let i = 0; i < N.outerPillars; i++) {
      const a = (i / N.outerPillars) * Math.PI * 2 + Math.random() * 0.4
      const r = 320 + Math.random() * 200
      const h = 500 + Math.random() * 700
      state.outerPillarData.push({
        x: Math.cos(a) * r, y: h * 0.5 - 80, z: Math.sin(a) * r,
        sx: 24 + Math.random()*44, sy: h, sz: 22 + Math.random()*48,
        ry: a + Math.PI * 0.5,
        rx: (Math.random() - 0.5) * 0.06,
        rz: (Math.random() - 0.5) * 0.06,
      })
    }
    const oPillars = new THREE.InstancedMesh(oPGeo, oPMat, state.outerPillarData.length)
    oPillars.frustumCulled = false
    state.outerPillarData.forEach((d, i) => updateIM(oPillars, i, d))
    scene.add(oPillars); state.oPillarMat = oPMat; state.trackedObjects.push(oPillars)

    const scaffoldGeo = new THREE.CylinderGeometry(0.45, 0.9, 1, 6, 1, true)
    const scaffoldMat = new THREE.MeshStandardMaterial({
      color: 0x0a1120,
      emissive: 0x274b9d,
      emissiveIntensity: 0.48,
      metalness: 0.84,
      roughness: 0.38,
      roughnessMap: roughMetalTexB,
      emissiveMap: panelGlowTex,
      side: THREE.DoubleSide,
    })
    for (let i = 0; i < N.scaffoldRibs; i += 1) {
      const ring = i % 3
      const angle = (i / N.scaffoldRibs) * Math.PI * 2 * (1.2 + ring * 0.2)
      const radius = 170 + ring * 64 + Math.random() * 34
      state.scaffoldRibData.push({
        x: Math.cos(angle) * radius,
        y: -120 + Math.random() * 280,
        z: Math.sin(angle) * radius,
        sx: 5 + Math.random() * 9,
        sy: 24 + Math.random() * 80,
        sz: 5 + Math.random() * 9,
        ry: angle + Math.PI * 0.5 + (Math.random() - 0.5) * 0.35,
        rx: (Math.random() > 0.5 ? 1 : -1) * (0.25 + Math.random() * 0.55),
        rz: (Math.random() - 0.5) * 0.18,
        orbitRadius: radius,
        orbitAngle: angle,
        drift: (Math.random() - 0.5) * 0.005,
      })
    }
    const scaffoldRibs = new THREE.InstancedMesh(scaffoldGeo, scaffoldMat, state.scaffoldRibData.length)
    scaffoldRibs.frustumCulled = false
    state.scaffoldRibData.forEach((d, i) => updateIM(scaffoldRibs, i, d))
    scene.add(scaffoldRibs)
    state.scaffoldRibs = scaffoldRibs
    state.scaffoldMat = scaffoldMat
    state.trackedObjects.push(scaffoldRibs)

    const ruinGeo = new THREE.IcosahedronGeometry(1, 0)
    const ruinMat = new THREE.MeshStandardMaterial({
      color: 0x0d1324,
      emissive: 0x224172,
      emissiveIntensity: 0.4,
      metalness: 0.7,
      roughness: 0.52,
      roughnessMap: roughMetalTexA,
    })
    for (let i = 0; i < N.ruinChunks; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const radius = 230 + Math.random() * 560
      state.ruinChunkData.push({
        x: Math.cos(angle) * radius,
        y: -180 + Math.random() * 460,
        z: Math.sin(angle) * radius,
        sx: 3 + Math.random() * 26,
        sy: 2 + Math.random() * 16,
        sz: 3 + Math.random() * 24,
        ry: Math.random() * Math.PI * 2,
        rx: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
        orbitRadius: radius,
        orbitAngle: angle,
        orbitSpeed: (Math.random() - 0.5) * 0.01,
        spin: (Math.random() - 0.5) * 0.5,
      })
    }
    const ruinChunks = new THREE.InstancedMesh(ruinGeo, ruinMat, state.ruinChunkData.length)
    ruinChunks.frustumCulled = false
    state.ruinChunkData.forEach((d, i) => updateIM(ruinChunks, i, d))
    scene.add(ruinChunks)
    state.ruinChunks = ruinChunks
    state.ruinMat = ruinMat
    state.trackedObjects.push(ruinChunks)

    // -- ORBITING DEBRIS RINGS ---------------------------------------------------
    const dGeo = new THREE.DodecahedronGeometry(1, 0)
    const dMat = new THREE.MeshStandardMaterial({
      color: 0x0d1520, emissive: 0x2840a0, emissiveIntensity: 0.85, metalness: 0.72, roughness: 0.44,
    })
    for (let i = 0; i < N.orbitDebris; i++) {
      const ringIdx = i % 5
      const r = 205 + ringIdx * 22 + Math.random() * 10
      const a = (i / N.orbitDebris) * Math.PI * 2 * (8 + ringIdx * 2) + (Math.random()-0.5)*0.12
      if (Math.random() > 0.90) continue
      state.orbitDebrisData.push({
        x: Math.cos(a) * r,
        y: Math.sin(a * (0.7 + ringIdx * 0.12)) * (6 + ringIdx * 3),
        z: Math.sin(a) * r, sx: 2 + Math.random()*6, sy: 1.5 + Math.random()*3.5, sz: 3 + Math.random()*8,
        ry: a + Math.PI * 0.5, rx: (Math.random()-0.5)*0.2, rz: (Math.random()-0.5)*0.2,
        ringIdx, r, spin: (Math.random()-0.5) * 1.0,
      })
    }
    const debrisMesh = new THREE.InstancedMesh(dGeo, dMat, state.orbitDebrisData.length)
    debrisMesh.frustumCulled = false
    state.orbitDebrisData.forEach((d, i) => updateIM(debrisMesh, i, d))
    scene.add(debrisMesh); state.debrisMesh = debrisMesh; state.dMat = dMat; state.trackedObjects.push(debrisMesh)

    // -- RUNE PANELS ON PILLARS -------------------------------------------------
    const runeTexA = makeRuneTexture(11)
    const runeTexB = makeRuneTexture(41)
    state.runeTextures.push(runeTexA, runeTexB)
    const runeGeo = new THREE.PlaneGeometry(1, 1)
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x101828, emissive: 0x66ddff, emissiveMap: runeTexA,
      emissiveIntensity: 1.3, transparent: true, opacity: 0.82,
      metalness: 0.1, roughness: 0.3, side: THREE.DoubleSide,
    })
    const runeData = []
    for (let i = 0; i < N.runePanels; i++) {
      const a = Math.random() * Math.PI * 2
      const r = 60 + Math.random() * 80
      runeData.push({
        x: Math.cos(a) * r, y: 10 + Math.random() * 90, z: Math.sin(a) * r,
        sx: 2 + Math.random()*7, sy: 1 + Math.random()*3.5, sz: 1,
        ry: a + (Math.random()-0.5)*0.6, rx: (Math.random()-0.5)*0.1, rz: (Math.random()-0.5)*0.1,
        pulse: Math.random() * Math.PI * 2,
      })
    }
    const runePanels = new THREE.InstancedMesh(runeGeo, runeMat, runeData.length)
    runePanels.frustumCulled = false
    runeData.forEach((d, i) => updateIM(runePanels, i, d))
    scene.add(runePanels); state.runePanels = runePanels; state.runeData = runeData
    state.runeMat = runeMat; state.trackedObjects.push(runePanels)

    // -- LIGHT SHAFTS -----------------------------------------------------------
    for (let i = 0; i < N.shafts; i++) {
      const a = (i / N.shafts) * Math.PI * 2
      const r = 50 + Math.random() * 90
      const shaft = new THREE.Mesh(
        new THREE.PlaneGeometry(5 + Math.random()*8, 380),
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0x2266ee : 0x7722cc,
          transparent: true, opacity: 0.018 + Math.random()*0.018,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      )
      shaft.position.set(Math.cos(a)*r, 100, Math.sin(a)*r)
      shaft.lookAt(0, 100, 0); shaft.rotation.y += Math.PI * 0.5
      shaft.userData = { base: shaft.material.opacity, phase: Math.random()*Math.PI*2 }
      scene.add(shaft); state.lightShafts.push(shaft); state.trackedObjects.push(shaft)
    }

    // -- FOG SHEETS -------------------------------------------------------------
    for (let i = 0; i < N.fogSheets; i++) {
      const a = (i / N.fogSheets) * Math.PI * 2 + Math.random() * 0.9
      const r = 90 + Math.random() * 180
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(120 + Math.random()*140, 70 + Math.random()*100),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? 0x1a2e60 : i % 3 === 1 ? 0x301a66 : 0x0c1c44,
          transparent: true, opacity: 0.028 + Math.random()*0.026,
          blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
        })
      )
      sheet.position.set(Math.cos(a)*r, -5 + Math.random()*80, Math.sin(a)*r)
      sheet.lookAt(0, sheet.position.y, 0); sheet.rotation.y += Math.PI * 0.5
      sheet.userData = {
        base: sheet.material.opacity, a, r,
        orbitSpeed: 0.003 + Math.random()*0.007,
        phase: Math.random()*Math.PI*2, drift: 0.5 + Math.random()*1.2,
      }
      scene.add(sheet); state.fogSheets.push(sheet); state.trackedObjects.push(sheet)
    }

    // -- DISTANT SILHOUETTES ----------------------------------------------------
    const silGeo = new THREE.CylinderGeometry(0.92, 1.22, 1, 5, 1)
    const silMat = new THREE.MeshStandardMaterial({
      color: 0x040810, emissive: 0x0e1e40, emissiveIntensity: 0.30, metalness: 0.60, roughness: 0.76,
    })
    const silData = []
    for (let i = 0; i < N.silhouettes; i++) {
      const a = (i / N.silhouettes) * Math.PI * 2 + Math.random() * 0.5
      const r = 600 + Math.random() * 800
      silData.push({
        x: Math.cos(a)*r, y: 80 + Math.random()*350 - 60, z: Math.sin(a)*r,
        sx: 35 + Math.random()*70, sy: 140 + Math.random()*500, sz: 35 + Math.random()*70,
        ry: a + Math.PI*0.5, rx: 0, rz: 0,
      })
    }
    const silMesh = new THREE.InstancedMesh(silGeo, silMat, silData.length)
    silMesh.frustumCulled = false
    silData.forEach((d, i) => updateIM(silMesh, i, d))
    scene.add(silMesh); state.trackedObjects.push(silMesh)

    // -- ASH CLOUD --------------------------------------------------------------
    const ash = makeCloud(N.ash, 0x507090, Q === 'safe' ? 0.50 : 0.70, 0.13)
    for (let i = 0; i < N.ash; i++) {
      const th = Math.random()*Math.PI*2, ph = Math.random()*Math.PI
      const r = 90 + Math.random()*260
      ash.positions[i*3]   = Math.cos(th)*Math.sin(ph)*r
      ash.positions[i*3+1] = Math.cos(ph)*r*0.55
      ash.positions[i*3+2] = Math.sin(th)*Math.sin(ph)*r
      ash.velocities[i] = 0.4 + Math.random()*0.9
    }
    ash.points.geometry.getAttribute('position').needsUpdate = true
    scene.add(ash.points); state.ashPoints = ash.points; state.ashPositions = ash.positions
    state.ashVelocities = ash.velocities; state.trackedObjects.push(ash.points)

    // -- ENERGY STREAMS (infall particles) --------------------------------------
    const en = makeCloud(N.energyPts, 0x55ddff, Q === 'safe' ? 0.55 : 0.72, 0.60)
    for (let i = 0; i < N.energyPts; i++) {
      const th = Math.random()*Math.PI*2, r = 60 + Math.random()*200
      en.positions[i*3]   = Math.cos(th)*r
      en.positions[i*3+1] = (Math.random()-0.5)*50
      en.positions[i*3+2] = Math.sin(th)*r
      en.velocities[i] = 22 + Math.random()*45
    }
    en.points.geometry.getAttribute('position').needsUpdate = true
    scene.add(en.points); state.energyPoints = en.points; state.energyPositions = en.positions
    state.energyVelocities = en.velocities; state.trackedObjects.push(en.points)

    return state
  },

  updateScene({ deltaTime, spectrumLevels }, state) {
    if (!state || !state.camera) return

    state.time += deltaTime
    const bass  = spectrumLevels?.sub      ?? spectrumLevels?.low  ?? 0
    const mids  = spectrumLevels?.lowMid   ?? spectrumLevels?.mid  ?? 0
    const highs = spectrumLevels?.presence ?? spectrumLevels?.high ?? 0

    const bassDelta = bass - state.prevBass; state.prevBass = bass
    if (bass > 0.35 && bassDelta > 0.11) state.beatPulse = 1
    else state.beatPulse = Math.max(0, state.beatPulse - deltaTime * 2.6)
    state.eventCooldown -= deltaTime
    if (state.eventCooldown <= 0 && highs > 0.70) {
      state.eventPulse = 1; state.eventCooldown = 2.8 + Math.random() * 4.0
    } else state.eventPulse = Math.max(0, state.eventPulse - deltaTime * 2.1)

    // -- CAMERA ORBIT ----------------------------------------------------------
    state.orbitAngle += deltaTime * (0.020 + mids * 0.012)
    if (state.beatPulse > 0.5) state.gravitationalPull += state.beatPulse * deltaTime * 11
    state.gravitationalPull *= Math.pow(0.22, deltaTime)
    const R = Math.max(140, state.orbitRadius - state.gravitationalPull)
    state.orbitHeightTarget = 55 + Math.sin(state.time * 0.055) * 28 - bass * 18
    state.orbitHeight += (state.orbitHeightTarget - state.orbitHeight) * Math.min(1, deltaTime * 1.1)
    const jitter = state.eventPulse > 0.15 ? (Math.random()-0.5)*4*state.eventPulse : 0
    state.camera.position.set(
      Math.sin(state.orbitAngle) * R + jitter * 0.3, state.orbitHeight,
      Math.cos(state.orbitAngle) * R + jitter * 0.25
    )
    state.cameraTarget.set(
      Math.sin(state.time * 0.038) * 15,
      Math.sin(state.time * 0.048) * 10 - bass * 5, 0
    )
    state.camera.lookAt(state.cameraTarget)
    const bankT = -Math.sin(state.orbitAngle) * 0.055
      + state.beatPulse * 0.07
      + (highs > 0.65 ? Math.sin(state.time * 3.6) * 0.038 * highs : 0)
    state.orbitBankAngle += (bankT - state.orbitBankAngle) * Math.min(1, deltaTime * 2.8)
    state.camera.rotation.z = state.orbitBankAngle

    // -- BLACK HOLE ------------------------------------------------------------
    if (state.core) state.core.scale.setScalar(1 + bass * 0.10 + state.beatPulse * 0.05)
    if (state.shell) {
      state.shell.scale.setScalar(1 + bass * 0.18 + state.eventPulse * 0.09)
      state.coreShaderMat.uniforms.uTime.value  = state.time
      state.coreShaderMat.uniforms.uBass.value  = bass
      state.coreShaderMat.uniforms.uHighs.value = highs
    }
    if (state.lensHaze) { state.lensHaze.scale.setScalar(1 + bass * 0.13 + state.beatPulse * 0.08); state.lensHaze.material.opacity = 0.22 + bass * 0.11 }
    if (state.warpHaze) state.warpHaze.material.opacity = 0.055 + bass * 0.038
    if (state.turbulenceShell) {
      state.turbulenceShell.rotation.y += deltaTime * (0.15 + mids * 0.22)
      state.turbulenceShell.rotation.x += deltaTime * 0.04
      state.turbulenceShell.scale.setScalar(1 + bass * 0.09 + state.eventPulse * 0.06)
      state.turbulenceShell.material.opacity = 0.06 + bass * 0.05 + highs * 0.02
    }
    if (state.distortionRingA) {
      state.distortionRingA.rotation.y += deltaTime * (0.18 + mids * 0.28)
      state.distortionRingA.material.opacity = 0.1 + bass * 0.1 + state.eventPulse * 0.07
    }
    if (state.distortionRingB) {
      state.distortionRingB.rotation.y -= deltaTime * (0.11 + mids * 0.2)
      state.distortionRingB.rotation.z += deltaTime * 0.03
      state.distortionRingB.material.opacity = 0.07 + highs * 0.05 + state.eventPulse * 0.05
    }

    if (state.coreShards && state.coreShardData) {
      let changed = false
      for (let i = 0; i < state.coreShardData.length; i += 1) {
        const s = state.coreShardData[i]
        s.angle += deltaTime * ((0.36 + s.band * 0.07 + mids * 0.5) + s.spin * 0.08)
        const pulsate = 1 + Math.sin(state.time * 0.7 + i * 0.17) * 0.07 + bass * 0.06
        const radius = s.radius * pulsate
        s.x = Math.cos(s.angle) * radius
        s.z = Math.sin(s.angle) * radius
        s.y += Math.sin(state.time * 0.9 + i * 0.11) * deltaTime * (0.7 + highs)
        s.rx += deltaTime * s.spin * 0.24
        s.ry += deltaTime * s.spin * 0.31
        s.rz += deltaTime * s.spin * 0.18
        updateIM(state.coreShards, i, s)
        changed = true
      }
      if (changed) state.coreShards.instanceMatrix.needsUpdate = true
      state.coreShardMat.emissiveIntensity = 0.66 + bass * 0.62 + highs * 0.22 + state.eventPulse * 0.38
    }

    // -- ACCRETION RINGS -------------------------------------------------------
    state.accretionRings.forEach((r, i) => {
      r.mesh.rotation.y += deltaTime * r.speed * (1 + mids * 0.55)
      r.mesh.rotation.z += deltaTime * r.speed * 0.25
      r.mesh.material.emissiveIntensity = (1.8 + i * 0.25) + bass * 1.2 + state.eventPulse * 0.7
    })

    // -- MEGA RINGS ------------------------------------------------------------
    state.megaRings.forEach(r => {
      r.mesh.rotation.y += deltaTime * r.speed
      r.mesh.material.emissiveIntensity = 0.70 + bass * 0.55 + state.eventPulse * 0.35
    })

    if (state.brokenArcs && state.brokenArcData) {
      let changed = false
      for (let i = 0; i < state.brokenArcData.length; i += 1) {
        const arc = state.brokenArcData[i]
        arc.orbitAngle += deltaTime * (arc.drift + mids * 0.006)
        arc.x = Math.cos(arc.orbitAngle) * arc.orbitRadius
        arc.z = Math.sin(arc.orbitAngle) * arc.orbitRadius
        arc.ry = arc.orbitAngle + Math.PI * 0.5
        arc.y += Math.sin(state.time * 0.27 + i * 0.19) * deltaTime * 0.6
        updateIM(state.brokenArcs, i, arc)
        changed = true
      }
      if (changed) state.brokenArcs.instanceMatrix.needsUpdate = true
      state.brokenArcMat.emissiveIntensity = 0.44 + bass * 0.4 + highs * 0.1
    }

    // -- INNER COLONNADE -------------------------------------------------------
    if (state.iMat) state.iMat.emissiveIntensity = 0.55 + bass * 0.55 + state.eventPulse * 0.4

    if (state.pillarBands && state.pillarBandData) {
      let changed = false
      for (let i = 0; i < state.pillarBandData.length; i += 1) {
        const b = state.pillarBandData[i]
        b.ry += deltaTime * 0.08
        b.y += Math.sin(state.time * 0.55 + b.phase) * deltaTime * 0.25
        updateIM(state.pillarBands, i, b)
        changed = true
      }
      if (changed) state.pillarBands.instanceMatrix.needsUpdate = true
      state.pillarBandMat.emissiveIntensity = 0.52 + highs * 0.34 + state.eventPulse * 0.38
    }

    if (state.insetPanels && state.insetPanelData) {
      let changed = false
      for (let i = 0; i < state.insetPanelData.length; i += 1) {
        const p = state.insetPanelData[i]
        p.orbitAngle += deltaTime * (0.002 + mids * 0.003)
        p.x = Math.cos(p.orbitAngle) * p.orbitRadius
        p.z = Math.sin(p.orbitAngle) * p.orbitRadius
        p.y += Math.sin(state.time * 0.45 + p.phase) * deltaTime * 0.35
        p.rz = Math.sin(state.time * 0.52 + p.phase) * 0.05
        updateIM(state.insetPanels, i, p)
        changed = true
      }
      if (changed) state.insetPanels.instanceMatrix.needsUpdate = true
      state.insetPanelMat.emissiveIntensity = 0.52 + highs * 0.26 + state.eventPulse * 0.34
    }

    if (state.buttresses && state.buttressData) {
      let changed = false
      for (let i = 0; i < state.buttressData.length; i += 1) {
        const b = state.buttressData[i]
        b.rz += Math.sin(state.time * 0.21 + b.phase) * deltaTime * 0.008
        updateIM(state.buttresses, i, b)
        changed = true
      }
      if (changed) state.buttresses.instanceMatrix.needsUpdate = true
      state.buttressMat.emissiveIntensity = 0.46 + bass * 0.45 + state.eventPulse * 0.34
    }

    if (state.scaffoldRibs && state.scaffoldRibData) {
      let changed = false
      for (let i = 0; i < state.scaffoldRibData.length; i += 1) {
        const s = state.scaffoldRibData[i]
        s.orbitAngle += deltaTime * (s.drift + mids * 0.004)
        s.x = Math.cos(s.orbitAngle) * s.orbitRadius
        s.z = Math.sin(s.orbitAngle) * s.orbitRadius
        s.ry = s.orbitAngle + Math.PI * 0.5
        s.y += Math.sin(state.time * 0.16 + i * 0.31) * deltaTime * 0.45
        updateIM(state.scaffoldRibs, i, s)
        changed = true
      }
      if (changed) state.scaffoldRibs.instanceMatrix.needsUpdate = true
      state.scaffoldMat.emissiveIntensity = 0.38 + bass * 0.28 + highs * 0.12
    }

    if (state.ruinChunks && state.ruinChunkData) {
      let changed = false
      for (let i = 0; i < state.ruinChunkData.length; i += 1) {
        const r = state.ruinChunkData[i]
        r.orbitAngle += deltaTime * (r.orbitSpeed + mids * 0.002)
        r.x = Math.cos(r.orbitAngle) * r.orbitRadius
        r.z = Math.sin(r.orbitAngle) * r.orbitRadius
        r.rx += deltaTime * r.spin * 0.2
        r.ry += deltaTime * r.spin * 0.33
        r.rz += deltaTime * r.spin * 0.17
        updateIM(state.ruinChunks, i, r)
        changed = true
      }
      if (changed) state.ruinChunks.instanceMatrix.needsUpdate = true
      state.ruinMat.emissiveIntensity = 0.28 + bass * 0.22 + highs * 0.08
    }

    // -- BRIDGES ---------------------------------------------------------------
    if (state.bridges && state.bridgeData) {
      let ch = false
      for (let i = 0; i < state.bridgeData.length; i++) {
        const d = state.bridgeData[i]
        d.y += Math.sin(state.time * d.floatSpeed + d.floatPhase) * deltaTime * d.floatAmp * 0.08
        updateIM(state.bridges, i, d); ch = true
      }
      if (ch) state.bridges.instanceMatrix.needsUpdate = true
      state.bridgesMat.emissiveIntensity = 0.70 + bass * 0.50 + state.eventPulse * 0.35
    }

    // -- MONOLITHS -------------------------------------------------------------
    if (state.monoliths && state.monolithData) {
      let ch = false
      for (let i = 0; i < state.monolithData.length; i++) {
        const d = state.monolithData[i]
        d.orbitA += deltaTime * d.orbitSpeed * (1 + mids * 0.3)
        d.x = Math.cos(d.orbitA) * d.orbitR; d.z = Math.sin(d.orbitA) * d.orbitR
        d.y += Math.sin(state.time * d.floatSpeed + d.floatPhase) * deltaTime * d.floatAmp * 0.09
        updateIM(state.monoliths, i, d); ch = true
      }
      if (ch) state.monoliths.instanceMatrix.needsUpdate = true
      state.monolithMat.emissiveIntensity = 0.52 + bass * 0.42 + state.eventPulse * 0.28
    }

    // -- ORBIT DEBRIS ----------------------------------------------------------
    if (state.debrisMesh && state.orbitDebrisData) {
      let ch = false
      for (let i = 0; i < state.orbitDebrisData.length; i++) {
        const d = state.orbitDebrisData[i]
        const spd = (0.08 + d.ringIdx * 0.03) + mids * 0.35
        const a2 = Math.atan2(d.z, d.x) + deltaTime * spd
        d.x = Math.cos(a2) * d.r; d.z = Math.sin(a2) * d.r
        d.y += Math.sin(state.time * 0.45 + i * 0.04) * deltaTime * 0.55
        d.ry = a2 + Math.PI * 0.5; d.rx += deltaTime * d.spin * 0.2
        updateIM(state.debrisMesh, i, d); ch = true
      }
      if (ch) state.debrisMesh.instanceMatrix.needsUpdate = true
      state.dMat.emissiveIntensity = 0.80 + bass * 0.65 + highs * 0.28
    }

    // -- RUNE PANELS -----------------------------------------------------------
    if (state.runePanels && state.runeData) {
      let ch = false
      for (let i = 0; i < state.runeData.length; i++) {
        const d = state.runeData[i]
        d.rz = Math.sin(state.time * 0.75 + d.pulse) * 0.06
        d.y += Math.sin(state.time * 0.38 + d.pulse) * deltaTime * 0.4
        updateIM(state.runePanels, i, d); ch = true
      }
      if (ch) state.runePanels.instanceMatrix.needsUpdate = true
      state.runeMat.emissiveIntensity = 0.9 + highs * 0.42 + state.eventPulse * 0.62
      state.runeMat.opacity = 0.70 + highs * 0.18 + state.eventPulse * 0.12
    }

    // -- LIGHT SHAFTS ----------------------------------------------------------
    state.lightShafts.forEach(sh => {
      sh.material.opacity = sh.userData.base
        + bass * 0.012
        + Math.sin(state.time * 0.28 + sh.userData.phase) * 0.005
        + state.eventPulse * 0.018
    })

    // -- FOG SHEETS ------------------------------------------------------------
    state.fogSheets.forEach((sh, i) => {
      sh.userData.a += deltaTime * sh.userData.orbitSpeed
      sh.position.x = Math.cos(sh.userData.a) * sh.userData.r
      sh.position.z = Math.sin(sh.userData.a) * sh.userData.r
      sh.position.y += Math.sin(state.time * 0.13 + sh.userData.phase) * deltaTime * sh.userData.drift
      sh.lookAt(0, sh.position.y, 0); sh.rotation.y += Math.PI * 0.5
      sh.material.opacity = sh.userData.base + bass * 0.015 + Math.sin(state.time * 0.18 + i) * 0.006
    })

    // -- ENERGY STREAMS --------------------------------------------------------
    if (state.energyPoints && state.energyPositions) {
      const pos = state.energyPoints.geometry.getAttribute('position')
      const pull = 1 + bass * 2.2 + state.beatPulse * 1.2
      for (let i = 0; i < state.energyVelocities.length; i++) {
        const i3 = i * 3
        const cx = state.energyPositions[i3], cz = state.energyPositions[i3+2]
        const dist = Math.sqrt(cx*cx + cz*cz) + 0.001
        state.energyPositions[i3]   -= (cx/dist) * deltaTime * state.energyVelocities[i] * pull * 0.011
        state.energyPositions[i3+2] -= (cz/dist) * deltaTime * state.energyVelocities[i] * pull * 0.011
        state.energyPositions[i3+1] += Math.sin(state.time * 2.2 + i * 0.38) * deltaTime * 2.5
        if (dist < 44) {
          const th = Math.random()*Math.PI*2, r = 120 + Math.random()*110
          state.energyPositions[i3]   = Math.cos(th)*r
          state.energyPositions[i3+2] = Math.sin(th)*r
          state.energyPositions[i3+1] = (Math.random()-0.5)*40
        }
      }
      state.energyPoints.material.opacity = 0.36 + highs * 0.26 + state.eventPulse * 0.18 + bass * 0.14
      pos.needsUpdate = true
    }

    // -- ASH CLOUD -------------------------------------------------------------
    if (state.ashPoints && state.ashPositions) {
      const pos = state.ashPoints.geometry.getAttribute('position')
      for (let i = 0; i < state.ashVelocities.length; i++) {
        const i3 = i * 3
        const cx = state.ashPositions[i3], cz = state.ashPositions[i3+2]
        const dist = Math.sqrt(cx*cx + cz*cz) + 0.001
        state.ashPositions[i3]   += -cz/dist * deltaTime * state.ashVelocities[i] * 0.55
        state.ashPositions[i3+2] +=  cx/dist * deltaTime * state.ashVelocities[i] * 0.55
        state.ashPositions[i3+1] += Math.sin(state.time * 0.22 + i * 0.09) * deltaTime * 0.38
        if (dist > 380) {
          const th = Math.random()*Math.PI*2, r = 90 + Math.random()*160
          state.ashPositions[i3]   = Math.cos(th)*r
          state.ashPositions[i3+2] = Math.sin(th)*r
          state.ashPositions[i3+1] = (Math.random()-0.5)*140
        }
      }
      state.ashPoints.material.opacity = 0.10 + bass * 0.045
      pos.needsUpdate = true
    }

    // -- LIGHTING --------------------------------------------------------------
    const peakEnergy = bass * 0.7 + highs * 0.25 + state.beatPulse * 0.55 + state.eventPulse * 0.95
    const glowLimiter = 1 - Math.min(0.24, peakEnergy * 0.16)
    if (state.coreC) state.coreC.intensity = (3.9 + bass * 2.3 + state.beatPulse * 1.2 + state.eventPulse * 1.45) * glowLimiter
    if (state.coreV) state.coreV.intensity = (3.2 + bass * 1.9 + state.beatPulse * 0.9 + state.eventPulse * 0.85) * glowLimiter
    if (state.ember) state.ember.intensity = (1.9 + bass * 1.3 + state.eventPulse * 0.62) * glowLimiter
    state.driftLights.forEach((light, i) => {
      light.userData.angle += deltaTime * light.userData.speed * (1 + mids * 0.4)
      light.position.x = Math.cos(light.userData.angle) * light.userData.radius
      light.position.z = Math.sin(light.userData.angle) * light.userData.radius
      light.position.y = 22 + Math.sin(state.time * 0.35 + light.userData.phase + i) * 58
      light.intensity = (0.46 + bass * 0.36 + highs * 0.14 + Math.sin(state.time * 0.8 + i) * 0.1) * glowLimiter
    })
    if (state.scene?.fog) state.scene.fog.density = 0.0017 + bass * 0.0008 + Math.sin(state.time * 0.07) * 0.0002

    // -- POST FX ---------------------------------------------------------------
    state.postFx.bloomStrength        = Math.min(1.58, 0.88 + bass * 0.56 + highs * 0.2 + state.eventPulse * 0.28)
    state.postFx.bloomRadius          = Math.min(0.86, 0.56 + highs * 0.11)
    state.postFx.bloomThreshold       = Math.max(0.62, 0.76 - bass * 0.08)
    state.postFx.noiseAmount          = Math.min(0.095, 0.026 + highs * 0.026 + state.eventPulse * 0.022)
    state.postFx.vignetteStrength     = Math.min(0.70, 0.48 + mids * 0.12)
    state.postFx.saturation           = Math.max(0.80, 0.92 - highs * 0.07 + bass * 0.04)
    state.postFx.chromaticAberration  = 0.0009 + highs * 0.001 + state.eventPulse * 0.0016
    const targetExposure = 0.92 + state.beatPulse * 0.025 + bass * 0.018 + state.eventPulse * 0.02
    state.exposureSmoothed += (targetExposure - state.exposureSmoothed) * Math.min(1, deltaTime * 2.1)
    state.postFx.exposure = Math.min(0.99, state.exposureSmoothed)
  },

  disposeScene(state) {
    if (!state) return
    state.trackedObjects?.forEach((obj) => {
      if (!obj) return
      if (obj.parent) obj.parent.remove(obj)
      obj.geometry?.dispose?.()
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m?.dispose?.())
        else obj.material.dispose?.()
      }
    })
    state.runeTextures?.forEach(t => t?.dispose?.())
  },
}
