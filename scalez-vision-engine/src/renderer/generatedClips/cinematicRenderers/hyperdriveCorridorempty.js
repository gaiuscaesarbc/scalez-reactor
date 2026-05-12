import * as THREE from 'three'

/**
 * HYPERDRIVE CORRIDOR
 * High-speed flight through geometric tunnel
 */

export const hyperdriveCorridoremptyRenderer = {
  setup({ scene, camera, renderer }) {
    const state = {
      tunnelSegments: [],
      cameraZ: 0,
      speed: 1.0,
    }

    // Create tunnel rings
    for (let i = 0; i < 20; i++) {
      const geometry = new THREE.TorusGeometry(5, 0.5, 16, 100)
      const material = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x00ffff : 0xff00ff,
        emissive: i % 2 === 0 ? 0x00ffff : 0xff00ff,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.2,
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.z = -i * 5
      mesh.rotation.x = Math.PI / 4
      scene.add(mesh)
      state.tunnelSegments.push(mesh)
    }

    camera.position.z = 0
    return state
  },

  animate({ deltaTime, currentTime, spectrumLevels }, state) {
    if (!state) return

    // Audio-reactive speed
    if (spectrumLevels) {
      const bass = spectrumLevels.sub ?? 0
      state.speed = 1.0 + bass * 2.0
    }

    // Move camera forward through tunnel
    state.cameraZ -= state.speed * deltaTime * 20

    // Reposition tunnel rings to create continuous effect
    state.tunnelSegments.forEach((segment, i) => {
      segment.position.z = state.cameraZ - i * 5

      // Audio-reactive rotation
      if (spectrumLevels) {
        const highs = spectrumLevels.presence ?? spectrumLevels.high ?? 0
        segment.rotation.z = highs * Math.PI * 2
      }

      // Reset far segments
      if (segment.position.z > 10) {
        segment.position.z -= 20 * 5
      }
    })

    if (state.camera) {
      state.camera.position.z = state.cameraZ
    }
  },
}
