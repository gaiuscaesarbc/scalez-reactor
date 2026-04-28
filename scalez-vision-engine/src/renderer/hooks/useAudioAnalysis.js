import { useEffect, useRef, useState } from 'react'

export function useAudioAnalysis({ sensitivity = 1, smoothing = 0.8 }) {
  const [bassLevel, setBassLevel] = useState(0)
  const [isActive, setIsActive] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const audioContextRef = useRef(null)
  const analyzerRef = useRef(null)
  const micStreamRef = useRef(null)
  const dataArrayRef = useRef(null)
  const animFrameRef = useRef(null)
  const smoothedBassRef = useRef(0)

  const startAudio = async () => {
    try {
      setPermissionDenied(false)

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      }

      const audioContext = audioContextRef.current
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      micStreamRef.current = stream
      const micSource = audioContext.createMediaStreamAudioSource(stream)

      const analyzer = audioContext.createAnalyser()
      analyzer.fftSize = 256
      analyzer.smoothingTimeConstant = 0.85

      micSource.connect(analyzer)
      analyzerRef.current = analyzer
      dataArrayRef.current = new Uint8Array(analyzer.frequencyBinCount)

      setIsActive(true)
      startAnalysis()
    } catch (error) {
      setPermissionDenied(true)
      setIsActive(false)
    }
  }

  const stopAudio = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    setBassLevel(0)
    smoothedBassRef.current = 0
    setIsActive(false)
  }

  function startAnalysis() {
    function analyze() {
      if (!analyzerRef.current || !dataArrayRef.current) {
        return
      }

      analyzerRef.current.getByteFrequencyData(dataArrayRef.current)

      const dataArray = dataArrayRef.current
      const nyquistIdx = Math.floor(dataArray.length * 0.15)
      let sum = 0
      for (let i = 0; i < nyquistIdx; i++) {
        sum += dataArray[i]
      }
      const avgBass = sum / nyquistIdx / 255

      const rawBass = Math.pow(avgBass, 1.2) * sensitivity
      smoothedBassRef.current = smoothedBassRef.current * smoothing + rawBass * (1 - smoothing)
      const final = Math.min(1, smoothedBassRef.current)

      setBassLevel(final)
      animFrameRef.current = requestAnimationFrame(analyze)
    }

    animFrameRef.current = requestAnimationFrame(analyze)
  }

  useEffect(() => {
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  return {
    bassLevel,
    isActive,
    permissionDenied,
    startAudio,
    stopAudio,
  }
}
