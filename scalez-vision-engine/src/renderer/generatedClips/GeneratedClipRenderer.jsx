import React, { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { neonMegacityCanyonRenderer } from './cinematicRenderers/neonMegacityCanyon'
import { blackHoleCathedralRenderer } from './cinematicRenderers/blackHoleCathedral'
import { fractalReactorChamberRenderer } from './cinematicRenderers/fractalReactorChamber'
import { infiniteHexTerrainRenderer } from './cinematicRenderers/infiniteHexTerrain'

// Cinematic renderers registry
const CINEMATIC_RENDERERS = {
  neonMegacityCanyon: neonMegacityCanyonRenderer,
  blackHoleCathedral: blackHoleCathedralRenderer,
  fractalReactorChamber: fractalReactorChamberRenderer,
  infiniteHexTerrain: infiniteHexTerrainRenderer,
}

const CINEMATIC_GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uNoiseAmount: { value: 0.04 },
    uVignetteStrength: { value: 0.45 },
    uSaturation: { value: 0.88 },
    uChromaticAberration: { value: 0.0008 },
    uExposure: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uNoiseAmount;
    uniform float uVignetteStrength;
    uniform float uSaturation;
    uniform float uChromaticAberration;
    uniform float uExposure;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 centerDir = vUv - vec2(0.5);
      vec2 caOffset = centerDir * uChromaticAberration;
      float r = texture2D(tDiffuse, vUv + caOffset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - caOffset).b;
      vec3 color = vec3(r, g, b) * uExposure;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);

      float grain = hash(vUv + uTime * 0.021) - 0.5;
      color += grain * uNoiseAmount;

      float d = distance(vUv, vec2(0.5));
      float edge = smoothstep(0.35, 0.78, d);
      color *= (1.0 - edge * uVignetteStrength);
      color *= vec3(0.95, 0.97, 1.0);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

const QUALITY_PRESETS = {
  safe: {
    pixelRatio: 0.35,
    bloomRadius: 0.35,
    bloomStrength: 0.35,
    grainAmount: 0.025,
    vignette: 0.35,
  },
  performance: {
    pixelRatio: 0.5,
    bloomRadius: 0.5,
    bloomStrength: 0.55,
    grainAmount: 0.03,
    vignette: 0.38,
  },
  ultra: {
    pixelRatio: 0.75,
    bloomRadius: 0.8,
    bloomStrength: 0.9,
    grainAmount: 0.04,
    vignette: 0.42,
  },
}

// Determine if a clip is cinematic (WebGL) or legacy (2D canvas)
function isCinematicClip(generatorType) {
  return generatorType in CINEMATIC_RENDERERS
}

export const GeneratedClipRenderer = React.memo(
  ({
    clip,
    isActive,
    opacity = 1,
    blendMode = 'normal',
    transform = 'none',
    spectrumLevels,
    qualityMode: qualityModeProp = 'performance',
    maxFps = 60,
  }) => {
    const canvasRef = useRef(null)
    const sceneRef = useRef(null)
    const cameraRef = useRef(null)
    const rendererRef = useRef(null)
    const composerRef = useRef(null)
    const bloomPassRef = useRef(null)
    const gradePassRef = useRef(null)
    const rafRef = useRef(null)
    const lastTimeRef = useRef(0)
    const lastRenderTimeRef = useRef(0)
    const spectrumLevelsRef = useRef(spectrumLevels)
    const rendererObjectRef = useRef(null)
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
    const qualityMode = qualityModeProp || 'performance'

    const isCinematic = isCinematicClip(clip?.generatorType)

    // Keep latest audio data without restarting animation loop on every update.
    useEffect(() => {
      spectrumLevelsRef.current = spectrumLevels
    }, [spectrumLevels])

    // Initialize WebGL scene for cinematic clips
    useEffect(() => {
      if (!isCinematic || !isActive || !canvasRef.current) {
        return
      }

      try {
        const canvas = canvasRef.current
        const width = dimensions.width
        const height = dimensions.height
        const qualityPreset = QUALITY_PRESETS[qualityMode] || QUALITY_PRESETS.performance

        // Create scene
        const scene = new THREE.Scene()
        scene.background = null
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
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        })
        renderer.setSize(width, height)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityPreset.pixelRatio))
        renderer.setClearColor(0x000000, 0)
        renderer.autoClear = true
        renderer.shadowMap.enabled = false
        renderer.outputColorSpace = THREE.SRGBColorSpace
        rendererRef.current = renderer

        // Create post-processing composer
        const composer = new EffectComposer(renderer)
        const renderPass = new RenderPass(scene, camera)
        composer.addPass(renderPass)

        // Add bloom effect
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(width, height),
          qualityPreset.bloomStrength,
          qualityPreset.bloomRadius,
          0.85
        )
        composer.addPass(bloomPass)
        bloomPassRef.current = bloomPass

        // Add cinematic grade/noise pass for filmic finish.
        const gradePass = new ShaderPass(CINEMATIC_GRADE_SHADER)
        gradePass.uniforms.uNoiseAmount.value = qualityPreset.grainAmount ?? 0.04
        gradePass.uniforms.uVignetteStrength.value = qualityPreset.vignette ?? 0.45
        composer.addPass(gradePass)
        gradePassRef.current = gradePass

        composerRef.current = composer

        // Add lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(10, 20, 10)
        directionalLight.castShadow = true
        scene.add(directionalLight)

        // Initialize renderer-specific scene
        const rendererFn = CINEMATIC_RENDERERS[clip.generatorType]
        if (rendererFn) {
          const createScene = rendererFn.createScene || rendererFn.setup
          const updateScene = rendererFn.updateScene || rendererFn.animate
          const disposeScene = rendererFn.disposeScene || null
          const resizeScene = rendererFn.resizeScene || null

          if (createScene && updateScene) {
            const state = createScene({ scene, camera, renderer, qualityPreset, clip }) || {}
            if (!state?.keepOpaqueBackground) {
              scene.background = null
            }
            state.camera = camera
            rendererObjectRef.current = { state, updateScene, disposeScene, resizeScene }
          }
        }
      } catch (err) {
        console.error('[GeneratedClipRenderer] WebGL init error:', err)
      }

      return () => {
        // Cleanup
        if (rendererObjectRef.current?.disposeScene) {
          try {
            rendererObjectRef.current.disposeScene(rendererObjectRef.current.state)
          } catch (disposeError) {
            console.warn('[GeneratedClipRenderer] Scene dispose warning:', disposeError)
          }
        }
        if (composerRef.current) {
          composerRef.current.dispose()
          composerRef.current = null
        }
        bloomPassRef.current = null
        gradePassRef.current = null
        if (rendererRef.current) {
          rendererRef.current.dispose()
          rendererRef.current = null
        }
        if (sceneRef.current) {
          sceneRef.current.traverse((obj) => {
            if (obj.geometry) {
              obj.geometry.dispose?.()
            }
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((mat) => mat?.dispose?.())
              } else {
                obj.material.dispose?.()
              }
            }
          })
          sceneRef.current.clear()
          sceneRef.current = null
        }
        rendererObjectRef.current = null
      }
    }, [isCinematic, isActive, dimensions, qualityMode, clip?.generatorType])

    // Handle canvas resize
    useEffect(() => {
      const handleResize = () => {
        const canvas = canvasRef.current
        if (!canvas) return

        const targetEl = canvas.parentElement || canvas
        const rect = targetEl.getBoundingClientRect()
        const width = Math.max(100, Math.floor(rect.width))
        const height = Math.max(100, Math.floor(rect.height))

        if (width !== dimensions.width || height !== dimensions.height) {
          setDimensions({ width, height })

          if (rendererRef.current && cameraRef.current) {
            rendererRef.current.setSize(width, height)
            composerRef.current?.setSize(width, height)
            cameraRef.current.aspect = width / height
            cameraRef.current.updateProjectionMatrix()

            if (rendererObjectRef.current?.resizeScene) {
              rendererObjectRef.current.resizeScene(rendererObjectRef.current.state, {
                width,
                height,
                aspect: width / height,
              })
            }
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
      if (!isCinematic || !isActive) {
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

        const frameBudgetMs = 1000 / Math.max(1, maxFps)
        if (currentTime - lastRenderTimeRef.current < frameBudgetMs) {
          rafRef.current = requestAnimationFrame(animate)
          return
        }
        lastRenderTimeRef.current = currentTime

        const deltaTime = Math.min(0.05, (currentTime - lastTimeRef.current) / 1000)
        lastTimeRef.current = currentTime

        // Render scene with post-processing
        if (composerRef.current && rendererObjectRef.current) {
          try {
            const { state, updateScene } = rendererObjectRef.current
            if (updateScene) {
              updateScene(
                { deltaTime, currentTime, spectrumLevels: spectrumLevelsRef.current },
                state
              )
            }

            if (gradePassRef.current) {
              gradePassRef.current.uniforms.uTime.value = currentTime * 0.001
              const highs = spectrumLevelsRef.current?.presence ?? spectrumLevelsRef.current?.high ?? 0
              const baseNoise = (QUALITY_PRESETS[qualityMode]?.grainAmount ?? 0.04)
              gradePassRef.current.uniforms.uNoiseAmount.value = Math.min(0.09, baseNoise + highs * 0.02)
            }

            const postFx = state?.postFx
            if (postFx && bloomPassRef.current) {
              if (typeof postFx.bloomStrength === 'number') {
                bloomPassRef.current.strength = postFx.bloomStrength
              }
              if (typeof postFx.bloomRadius === 'number') {
                bloomPassRef.current.radius = postFx.bloomRadius
              }
              if (typeof postFx.bloomThreshold === 'number') {
                bloomPassRef.current.threshold = postFx.bloomThreshold
              }
              if (gradePassRef.current) {
                if (typeof postFx.noiseAmount === 'number') {
                  gradePassRef.current.uniforms.uNoiseAmount.value = postFx.noiseAmount
                }
                if (typeof postFx.vignetteStrength === 'number') {
                  gradePassRef.current.uniforms.uVignetteStrength.value = postFx.vignetteStrength
                }
                if (typeof postFx.saturation === 'number') {
                  gradePassRef.current.uniforms.uSaturation.value = postFx.saturation
                }
                if (typeof postFx.chromaticAberration === 'number') {
                  gradePassRef.current.uniforms.uChromaticAberration.value = postFx.chromaticAberration
                }
                if (typeof postFx.exposure === 'number') {
                  gradePassRef.current.uniforms.uExposure.value = postFx.exposure
                }
              }
            }

            composerRef.current.render()
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
        lastRenderTimeRef.current = 0
      }
    }, [isCinematic, isActive, clip?.generatorType, maxFps, qualityMode])

    return (
      <canvas
        ref={canvasRef}
        className="preview-layer-video"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity,
          mixBlendMode: blendMode,
          transform,
          imageRendering: 'auto',
          display: isActive ? 'block' : 'none',
          background: 'transparent',
        }}
      />
    )
  },
)

GeneratedClipRenderer.displayName = 'GeneratedClipRenderer'
