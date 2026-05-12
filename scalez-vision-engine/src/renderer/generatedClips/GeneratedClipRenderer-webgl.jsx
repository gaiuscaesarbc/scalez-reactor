import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

// Cinematic renderer imports (to be created)
const CINEMATIC_RENDERERS = {
  neonMegacityCanyon: null, // Import from './cinemaRenderers/neonMegacityCanyon.js'
  fractalReactorChamber: null,
  hyperdriveCorridorempty: null,
  alienMonolithTemple: null,
  infiniteHexTerrain: null,
  blackHoleCathedral: null,
}

// Quality modes
const QUALITY_PRESETS = {
  safe: {
    pixelRatio: 0.5,
    shadowMapSize: 512,
    antialiasing: false,
    bloomEnabled: true,
  },
  performance: {
    pixelRatio: 0.75,
    shadowMapSize: 1024,
    antialiasing: false,
    bloomEnabled: true,
  },
  ultra: {
    pixelRatio: 1.0,
    shadowMapSize: 2048,
    antialiasing: true,
    bloomEnabled: true,
  },
}

export const GeneratedClipRenderer = React.memo(
  ({
    clip,
    isActive,
    opacity = 1,
    blendMode = 'normal',
    spectrumLevels,
  }) => {
    const canvasRef = useRef(null)
    const sceneRef = useRef(null)
    const cameraRef = useRef(null)
    const rendererRef = useRef(null)
    const composerRef = useRef(null)
    const rafRef = useRef(null)
    const lastTimeRef = useRef(0)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
    const [qualityMode, setQualityMode] = useState('auto')

    // Determine if this clip needs WebGL or can use 2D canvas
    const isWebGLClip = clip?.generatorType && CINEMATIC_RENDERERS[clip.generatorType] !== undefined

    // Initialize Three.js scene
    useEffect(() => {
      if (!isWebGLClip || !isActive || !canvasRef.current) return

      try {
        const canvas = canvasRef.current
        const width = dimensions.width
        const height = dimensions.height

        // Determine quality mode
        let quality = qualityMode
        if (quality === 'auto') {
          quality = 'performance' // Default safe choice
        }
        const preset = QUALITY_PRESETS[quality] || QUALITY_PRESETS.performance

        // Create scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x000000)
        sceneRef.current = scene

        // Create camera
        const camera = new THREE.PerspectiveCamera(
          75,
          width / height,
          0.1,
          10000
        )
        camera.position.z = 5
        cameraRef.current = camera

        // Create WebGL renderer
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: preset.antialiasing,
          alpha: true,
          powerPreference: 'high-performance',
        })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio))
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFShadowShadowMap
        renderer.shadowMap.mapSize.width = preset.shadowMapSize
        renderer.shadowMap.mapSize.height = preset.shadowMapSize
        rendererRef.current = renderer

        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
        scene.add(ambientLight)

        // Directional light for shadows
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(10, 20, 10)
        directionalLight.castShadow = true
        directionalLight.shadow.mapSize.width = preset.shadowMapSize
        directionalLight.shadow.mapSize.height = preset.shadowMapSize
        directionalLight.shadow.camera.far = 200
        scene.add(directionalLight)

        // Initialize renderer-specific setup via callback
        if (clip.setupScene) {
          clip.setupScene({ scene, camera, renderer, preset })
        }
      } catch (err) {
        console.error('[GeneratedClipRenderer] WebGL init error:', err)
      }

      return () => {
        // Cleanup
        if (rendererRef.current) {
          rendererRef.current.dispose()
          rendererRef.current = null
        }
        if (sceneRef.current) {
          sceneRef.current.clear()
          sceneRef.current = null
        }
      }
    }, [isWebGLClip, isActive, dimensions, qualityMode, clip])

    // Handle canvas resize
    useEffect(() => {
      const handleResize = () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const width = Math.max(100, Math.floor(rect.width))
        const height = Math.max(100, Math.floor(rect.height))

        if (width !== dimensions.width || height !== dimensions.height) {
          setDimensions({ width, height })

          // Update WebGL renderer size if it exists
          if (rendererRef.current && cameraRef.current) {
            rendererRef.current.setSize(width, height)
            cameraRef.current.aspect = width / height
            cameraRef.current.updateProjectionMatrix()
          }
        }
      }

      window.addEventListener('resize', handleResize)
      handleResize()

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }, [dimensions])

    // Animation loop
    useEffect(() => {
      if (!isWebGLClip || !isActive) {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        return
      }

      const animate = (currentTime) => {
        if (!lastTimeRef.current) {
          lastTimeRef.current = currentTime
        }

        const deltaTime = (currentTime - lastTimeRef.current) / 1000
        lastTimeRef.current = currentTime

        // Render scene
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          try {
            // Call renderer-specific animate callback
            if (clip.animateFrame) {
              clip.animateFrame({
                scene: sceneRef.current,
                camera: cameraRef.current,
                renderer: rendererRef.current,
                deltaTime,
                currentTime,
                spectrumLevels,
              })
            }

            rendererRef.current.render(sceneRef.current, cameraRef.current)
          } catch (err) {
            console.error('[GeneratedClipRenderer] Render error:', err)
          }
        }

        rafRef.current = requestAnimationFrame(animate)
      }

      rafRef.current = requestAnimationFrame(animate)

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
        lastTimeRef.current = 0
      }
    }, [isWebGLClip, isActive, clip, spectrumLevels])

    return (
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          opacity,
          mixBlendMode: blendMode,
          imageRendering: 'auto',
          display: isActive ? 'block' : 'none',
          background: '#000000',
        }}
      />
    )
  },
)

GeneratedClipRenderer.displayName = 'GeneratedClipRenderer'
