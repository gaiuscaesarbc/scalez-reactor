import { useEffect, useRef, useState } from 'react'

export function useFps() {
  const [fps, setFps] = useState(0)
  const frameCountRef = useRef(0)
  const lastSampleRef = useRef(performance.now())

  useEffect(() => {
    let frameHandle = null

    const loop = (now) => {
      frameCountRef.current += 1
      const elapsed = now - lastSampleRef.current
      if (elapsed >= 500) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed))
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
