import * as THREE from 'three'

/**
 * FRACTAL REACTOR CHAMBER
 * Mirrored sci-fi chamber with recursive gate architecture and pulsing reactor.
 */

export const fractalReactorChamberRenderer = {
  createScene({ scene, camera, qualityPreset }) {
    const pr = qualityPreset?.pixelRatio ?? 0.5
    const gateCount = pr <= 0.35 ? 10 : pr <= 0.5 ? 14 : 18
    const ribPairs = pr <= 0.35 ? 8 : pr <= 0.5 ? 10 : 14
    const panelCount = pr <= 0.35 ? 20 : pr <= 0.5 ? 28 : 36
    const particleCount = pr <= 0.35 ? 120 : pr <= 0.5 ? 180 : 260

    const state = {
      coreOuter: null,
      coreInner: null,
      rings: [],
      gates: [],
      ribs: [],
      panels: [],
      particles: null,
      particlesArray: null,
      keyLight: null,
      fillLight: null,
      time: 0,
      dolly: 0,
      chamberDepth: gateCount * 20,
      lookTarget: new THREE.Vector3(),
    }

    scene.background = new THREE.Color(0x05070f)
    scene.fog = new THREE.FogExp2(0x0b101b, 0.018)

    const outerGeo = new THREE.IcosahedronGeometry(2.7, 3)
    const outerMat = new THREE.MeshStandardMaterial({
      color: 0x8dc8ff,
      emissive: 0x54b8ff,
      emissiveIntensity: 1.8,
      metalness: 0.85,
      roughness: 0.22,
    })
    state.coreOuter = new THREE.Mesh(outerGeo, outerMat)
    scene.add(state.coreOuter)

    state.coreInner = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 22, 22),
      new THREE.MeshBasicMaterial({ color: 0x7dffff, transparent: true, opacity: 0.5 })
    )
    scene.add(state.coreInner)

    for (let i = 0; i < 4; i += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(7 + i * 2.7, 0.28 + i * 0.07, 16, 68),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x1d2338 : 0x291a34,
          emissive: i % 2 ? 0x6a9fff : 0xff4f9a,
          emissiveIntensity: 0.42,
          metalness: 0.85,
          roughness: 0.24,
        })
      )
      ring.rotation.x = Math.PI * (0.24 + i * 0.11)
      ring.position.z = -12 - i * 5
      scene.add(ring)
      state.rings.push(ring)
    }

    for (let i = 0; i < gateCount; i += 1) {
      const gate = new THREE.Mesh(
        new THREE.TorusGeometry(10 + (i % 2) * 2.2, 0.35, 10, 8),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? 0x111a2c : 0x1c1325,
          emissive: i % 2 ? 0x3eaaff : 0xff4c85,
          emissiveIntensity: 0.32,
          metalness: 0.72,
          roughness: 0.28,
        })
      )
      gate.position.z = -i * 20
      gate.rotation.x = Math.PI * 0.5
      scene.add(gate)
      state.gates.push(gate)
    }

    for (let i = 0; i < ribPairs; i += 1) {
      const z = -8 - i * (state.chamberDepth / ribPairs)
      for (const side of [-1, 1]) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 16 + (i % 3) * 4, 2.8),
          new THREE.MeshStandardMaterial({
            color: 0x10182a,
            emissive: side < 0 ? 0x3764b4 : 0x9f3e7a,
            emissiveIntensity: 0.24,
            metalness: 0.7,
            roughness: 0.3,
          })
        )
        rib.position.set(side * (12 + (i % 2) * 2.2), 3, z)
        rib.rotation.z = side * 0.07
        scene.add(rib)
        state.ribs.push(rib)
      }
    }

    for (let i = 0; i < panelCount; i += 1) {
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 5.2 + (i % 4) * 1.5, 0.45),
        new THREE.MeshStandardMaterial({
          color: 0x111a2b,
          emissive: i % 2 ? 0x46adff : 0xff548e,
          emissiveIntensity: 0.24,
          metalness: 0.64,
          roughness: 0.33,
        })
      )
      const angle = (i / panelCount) * Math.PI * 2
      const radius = 8 + (i % 5)
      panel.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.8) * 4, -6 - (i % gateCount) * 18)
      panel.lookAt(0, 0, panel.position.z)
      panel.userData = { angle, radius, zBase: panel.position.z, phase: Math.random() * Math.PI * 2 }
      scene.add(panel)
      state.panels.push(panel)
    }

    const pGeo = new THREE.BufferGeometry()
    const p = new Float32Array(particleCount * 3)
    for (let i = 0; i < particleCount; i += 1) {
      const idx = i * 3
      p[idx] = (Math.random() - 0.5) * 34
      p[idx + 1] = (Math.random() - 0.5) * 22
      p[idx + 2] = -Math.random() * (state.chamberDepth + 60)
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(p, 3))
    state.particlesArray = p
    state.particles = new THREE.Points(
      pGeo,
      new THREE.PointsMaterial({
        color: 0x8bb8ff,
        size: 0.1,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
    scene.add(state.particles)

    state.keyLight = new THREE.PointLight(0x65d8ff, 1.1, 100, 2)
    state.keyLight.position.set(0, 3.5, -10)
    scene.add(state.keyLight)

    state.fillLight = new THREE.PointLight(0xff63a8, 0.6, 110, 2)
    state.fillLight.position.set(0, 1.6, -36)
    scene.add(state.fillLight)

    camera.position.set(0, 6, 18)
    camera.lookAt(0, 0, -26)
    return state
  },

  updateScene({ deltaTime, currentTime, spectrumLevels }, state) {
    if (!state) return

    state.time += deltaTime
    const bass = spectrumLevels?.sub ?? spectrumLevels?.low ?? 0
    const mids = spectrumLevels?.lowMid ?? spectrumLevels?.mid ?? 0
    const highs = spectrumLevels?.presence ?? spectrumLevels?.high ?? 0

    const coreScale = 1 + bass * 0.42
    state.coreOuter.scale.setScalar(coreScale)
    state.coreOuter.rotation.x += deltaTime * (0.35 + mids * 0.42)
    state.coreOuter.rotation.y += deltaTime * (0.6 + mids * 0.65)
    state.coreOuter.material.emissiveIntensity = 1.2 + bass * 2.6
    state.coreInner.scale.setScalar(0.9 + bass * 0.62)
    state.coreInner.material.opacity = 0.3 + bass * 0.5

    state.rings.forEach((ring, i) => {
      ring.rotation.z += deltaTime * (0.1 + mids * 0.65) * (i % 2 ? -1 : 1)
      ring.rotation.y += deltaTime * 0.05 * (i % 2 ? 1 : -1)
      ring.material.emissiveIntensity = 0.3 + bass * 0.92
    })

    state.gates.forEach((gate, i) => {
      gate.rotation.z += deltaTime * (0.05 + mids * 0.22) * (i % 2 ? 1 : -1)
      gate.material.emissiveIntensity = 0.22 + Math.max(0, Math.sin(state.time * 0.9 + i * 0.35)) * 0.4 + highs * 0.35
    })

    state.ribs.forEach((rib, i) => {
      rib.material.emissiveIntensity = 0.2 + bass * 0.48 + Math.sin(state.time * 0.7 + i * 0.6) * 0.05
      rib.position.y = 2.5 + Math.sin(state.time * 0.8 + i * 0.35) * 0.9
    })

    state.panels.forEach((panel, i) => {
      const u = panel.userData
      const pulse = Math.sin(state.time * (1.0 + mids * 1.5) + u.phase)
      panel.rotation.y += deltaTime * (0.24 + mids * 0.7)
      panel.position.x = Math.cos(u.angle + state.time * 0.1) * u.radius
      panel.position.y = Math.sin(state.time * 0.6 + u.phase) * (2.0 + bass * 1.9)
      panel.position.z = u.zBase + Math.sin(state.time * 0.35 + i * 0.18) * 1.6
      panel.material.emissiveIntensity = 0.18 + Math.max(0, pulse) * 0.52 + highs * 0.38
    })

    if (state.particles && state.particlesArray) {
      const pAttr = state.particles.geometry.getAttribute('position')
      for (let i = 0; i < state.particlesArray.length; i += 3) {
        state.particlesArray[i + 2] += deltaTime * (6 + mids * 10)
        if (state.particlesArray[i + 2] > 18) {
          state.particlesArray[i + 2] = -state.chamberDepth - Math.random() * 40
          state.particlesArray[i] = (Math.random() - 0.5) * 34
          state.particlesArray[i + 1] = (Math.random() - 0.5) * 20
        }
      }
      pAttr.needsUpdate = true
    }

    const flash = highs > 0.72 ? 2.3 : 1.0
    state.keyLight.intensity = (0.8 + bass * 2.7) * flash
    state.fillLight.intensity = 0.35 + highs * 1.4

    const speed = 8 + mids * 9
    state.dolly += deltaTime * speed
    const camZ = 14 - (state.dolly % (state.chamberDepth * 0.6))
    const camX = Math.sin(state.time * 0.28) * (2.2 + mids * 2.2)
    const camY = 5 + Math.sin(state.time * 0.21) * 1.7

    if (state.camera) {
      state.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.06)
      state.lookTarget.set(
        Math.sin(state.time * 0.18) * 1.5,
        0.4 + bass * 1.5,
        camZ - 48
      )
      state.camera.lookAt(state.lookTarget)
      state.camera.rotation.z = Math.sin(state.time * 0.24) * 0.02
    }
  },

  disposeScene(state) {
    state?.coreOuter?.geometry?.dispose?.()
    state?.coreOuter?.material?.dispose?.()
    state?.coreInner?.geometry?.dispose?.()
    state?.coreInner?.material?.dispose?.()
    state?.rings?.forEach((mesh) => {
      mesh.geometry?.dispose?.()
      mesh.material?.dispose?.()
    })
    state?.gates?.forEach((mesh) => {
      mesh.geometry?.dispose?.()
      mesh.material?.dispose?.()
    })
    state?.ribs?.forEach((mesh) => {
      mesh.geometry?.dispose?.()
      mesh.material?.dispose?.()
    })
    state?.panels?.forEach((mesh) => {
      mesh.geometry?.dispose?.()
      mesh.material?.dispose?.()
    })
    if (state?.particles) {
      state.particles.geometry?.dispose?.()
      state.particles.material?.dispose?.()
    }
  },
}
