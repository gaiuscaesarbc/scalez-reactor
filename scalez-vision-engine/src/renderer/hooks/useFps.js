import { useEffect, useRef, useState } from 'react'

export function useFps() {
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastSampleRef = useRef(0)
  const smoothedFpsRef = useRef(60)

  useEffect(() => {
    lastSampleRef.current = performance.now()
  }, [])

  useEffect(() => {
    let frameHandle = null
    const SAMPLE_MS = 1000
    const EMA_ALPHA = 0.28

    const loop = (now) => {
      frameCountRef.current += 1
      const elapsed = now - lastSampleRef.current
      if (elapsed >= SAMPLE_MS) {
        const instantFps = (frameCountRef.current * 1000) / elapsed
        const nextSmoothed =
          smoothedFpsRef.current * (1 - EMA_ALPHA) + instantFps * EMA_ALPHA
        smoothedFpsRef.current = nextSmoothed
        setFps(Math.round(nextSmoothed))
        frameCountRef.current = 0
        lastSampleRef.current = now
      }
      frameHandle = requestAnimationFrame(loop)
    }

    frameHandle = requestAnimationFrame(loop)
    return () => {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle)
      }
    }
  }, [])

  return fps
}
