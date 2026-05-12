import * as THREE from 'three'

/**
 * ALIEN MONOLITH TEMPLE
 * Vast alien landscape with towering monoliths
 */

export const alienMonolithTempleRenderer = {
  setup({ scene, camera, renderer }) {
    const state = {
      monoliths: [],
      cameraTime: 0,
    }

    // Create terrain (simple plane for now)
    const terrainGeometry = new THREE.PlaneGeometry(100, 100)
    const terrainMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a1a4a,
      emissive: 0x1a0a2a,
      roughness: 0.9,
    })
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial)
    terrain.rotation.x = -Math.PI / 2
    terrain.position.y = -5
    scene.add(terrain)

    // Create monoliths
    for (let i = 0; i < 8; i++) {
      const geometry = new THREE.BoxGeometry(2, 20, 1)
      const material = new THREE.MeshStandardMaterial({
        color: 0x4a3a6a,
        emissive: 0x6a5a8a,
        emissiveIntensity: 0.4,
        metalness: 0.3,
      })
      const monolith = new THREE.Mesh(geometry, material)

      const angle = (i / 8) * Math.PI * 2
      monolith.position.x = Math.cos(angle) * 30
      monolith.position.z = Math.sin(angle) * 30
      monolith.position.y = 0

      scene.add(monolith)
      state.monoliths.push(monolith)
    }

    // Lights
    const pointLight = new THREE.PointLight(0xffaa00, 1)
    pointLight.position.set(50, 50, 50)
    scene.add(pointLight)

    scene.fog = new THREE.Fog(0x0a0e1a, 30, 150)
    camera.position.y = 8
    camera.position.z = 50

    return state
  },

  animate({ deltaTime, currentTime, spectrumLevels }, state) {
    if (!state) return

    // Drift camera slowly
    state.cameraTime += deltaTime * 0.2
    const driftX = Math.sin(state.cameraTime * 0.3) * 20
    const driftZ = Math.cos(state.cameraTime * 0.2) * 20

    if (state.camera) {
      state.camera.position.x = driftX
      state.camera.position.z = 50 + driftZ
      state.camera.lookAt(0, 5, 0)
    }

    // Animate monoliths
    state.monoliths.forEach((monolith, i) => {
      monolith.rotation.y += deltaTime * 0.05 * (i % 2 ? 1 : -1)

      if (spectrumLevels) {
        const lightPulse = 0.3 + (spectrumLevels.low ?? 0) * 0.7
        monolith.material.emissiveIntensity = lightPulse
      }
    })
  },
}
