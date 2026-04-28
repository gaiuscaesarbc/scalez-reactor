import { useEffect, useRef, useState } from 'react'

function getAudioContextClass() {
  return window.AudioContext || window.webkitAudioContext || null
}

async function requestMicrophoneStream() {
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }

  const legacyGetUserMedia =
    navigator.getUserMedia ||
    navigator.webkitGetUserMedia ||
    navigator.mozGetUserMedia ||
    navigator.msGetUserMedia

  if (!legacyGetUserMedia) {
    throw new Error('Microphone API unavailable in this window')
  }

  return new Promise((resolve, reject) => {
    legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject)
  })
}

export function useAudioAnalysis({ sensitivity = 1, smoothing = 0.8, eqGains = { low: 1, mid: 1, high: 1 } }) {
  const [bassLevel, setBassLevel] = useState(0)
  const [spectrumLevels, setSpectrumLevels] = useState({
    full: 0,
    low: 0,
    mid: 0,
    high: 0,
  })
  const [isActive, setIsActive] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [audioError, setAudioError] = useState('')

  const audioContextRef = useRef(null)
  const analyzerRef = useRef(null)
  const micStreamRef = useRef(null)
  const micSourceRef = useRef(null)
  const dataArrayRef = useRef(null)
  const animFrameRef = useRef(null)
  const uiPublishTimerRef = useRef(0)
  const perfWindowStartRef = useRef(0)
  const perfInternalFramesRef = useRef(0)
  const perfUiPublishesRef = useRef(0)
  const smoothedBassRef = useRef(0)
  const smoothedSpectrumRef = useRef({ full: 0, low: 0, mid: 0, high: 0 })
  const eqGainsRef = useRef(eqGains)
  const isAnalyzingRef = useRef(false)

  const PERFORMANCE_MODE = true
  const UI_PUBLISH_FPS = PERFORMANCE_MODE ? 24 : 30
  const UI_PUBLISH_INTERVAL_MS = 1000 / UI_PUBLISH_FPS

  useEffect(() => {
    eqGainsRef.current = eqGains
  }, [eqGains])

  function stopAnalysisLoop() {
    isAnalyzingRef.current = false
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }

  const startAudio = async () => {
    try {
      setPermissionDenied(false)
      setAudioError('')

      stopAnalysisLoop()

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
      }

      if (micSourceRef.current) {
        micSourceRef.current.disconnect()
        micSourceRef.current = null
      }

      if (!audioContextRef.current) {
        const AudioContextClass = getAudioContextClass()
        if (!AudioContextClass) {
          throw new Error('Web Audio API unavailable in this window')
        }
        audioContextRef.current = new AudioContextClass()
      }

      const audioContext = audioContextRef.current
      const stream = await requestMicrophoneStream()

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      micStreamRef.current = stream
      const micSource = audioContext.createMediaStreamSource(stream)
      micSourceRef.current = micSource

      if (!analyzerRef.current) {
        const analyzer = audioContext.createAnalyser()
        analyzer.fftSize = PERFORMANCE_MODE ? 128 : 256
        analyzer.smoothingTimeConstant = 0.85
        analyzerRef.current = analyzer
      }

      micSource.connect(analyzerRef.current)

      if (!dataArrayRef.current || dataArrayRef.current.length !== analyzerRef.current.frequencyBinCount) {
        dataArrayRef.current = new Uint8Array(analyzerRef.current.frequencyBinCount)
      }

      uiPublishTimerRef.current = 0
      perfWindowStartRef.current = 0
      perfInternalFramesRef.current = 0
      perfUiPublishesRef.current = 0

      setIsActive(true)
      startAnalysis()
    } catch (error) {
      const errorName = error?.name || 'Error'
      if (import.meta.env.DEV) {
        console.error('[audio:start] failed', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          hasMediaDevices: Boolean(navigator.mediaDevices),
          hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
          hasAudioContext: Boolean(getAudioContextClass()),
        })
      }
      const errorMap = {
        NotAllowedError: 'Microphone permission denied. Allow mic access for this app in Windows Privacy settings.',
        NotFoundError: 'No microphone input device was found.',
        NotReadableError: 'Microphone is in use by another app or unavailable.',
        SecurityError: 'Microphone request blocked by app security settings.',
        TypeError: 'Microphone API unavailable in this window.',
      }
      const friendlyMessage = errorMap[errorName] || error?.message || `Audio input error: ${errorName}`
      setPermissionDenied(errorName === 'NotAllowedError')
      setAudioError(friendlyMessage)
      setIsActive(false)
    }
  }

  const stopAudio = async () => {
    stopAnalysisLoop()

    if (micSourceRef.current) {
      micSourceRef.current.disconnect()
      micSourceRef.current = null
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    if (audioContextRef.current?.state === 'running') {
      try {
        await audioContextRef.current.suspend()
      } catch {
        // Ignore suspend failures in teardown paths.
      }
    }

    setBassLevel(0)
    setSpectrumLevels({ full: 0, low: 0, mid: 0, high: 0 })
    smoothedBassRef.current = 0
    smoothedSpectrumRef.current = { full: 0, low: 0, mid: 0, high: 0 }
    setAudioError('')
    setIsActive(false)
  }

  function startAnalysis() {
    if (isAnalyzingRef.current) {
      return
    }

    isAnalyzingRef.current = true

    function analyze() {
      if (!isAnalyzingRef.current || !analyzerRef.current || !dataArrayRef.current) {
        return
      }

      analyzerRef.current.getByteFrequencyData(dataArrayRef.current)

      const dataArray = dataArrayRef.current
      const lastIndex = dataArray.length - 1
      const lowEnd = Math.max(1, Math.floor(lastIndex * 0.15))
      const midStart = lowEnd + 1
      const midEnd = Math.max(midStart, Math.floor(lastIndex * 0.45))
      const highStart = midEnd + 1
      const highEnd = Math.max(highStart, Math.floor(lastIndex * 0.9))

      const averageRange = (start, end) => {
        const safeStart = Math.max(0, start)
        const safeEnd = Math.max(safeStart, Math.min(end, lastIndex))
        let sum = 0
        let count = 0
        for (let index = safeStart; index <= safeEnd; index += 1) {
          sum += dataArray[index]
          count += 1
        }
        return count > 0 ? sum / count / 255 : 0
      }

      const rawLow = averageRange(0, lowEnd)
      const rawMid = averageRange(midStart, midEnd)
      const rawHigh = averageRange(highStart, highEnd)
      const rawFull = averageRange(0, highEnd)

      // Keep low-level input responsive: use sub-linear curves plus modest gain.
      const weightedLow =
        Math.min(1, Math.pow(rawLow, 0.9) * sensitivity * 1.7 * eqGainsRef.current.low)
      const weightedMid =
        Math.min(1, Math.pow(rawMid, 0.9) * sensitivity * 1.4 * eqGainsRef.current.mid)
      const weightedHigh =
        Math.min(1, Math.pow(rawHigh, 0.9) * sensitivity * 1.2 * eqGainsRef.current.high)
      const weightedFull = (weightedLow + weightedMid + weightedHigh + rawFull) / 4

      const rawBass = weightedLow
      smoothedBassRef.current = smoothedBassRef.current * smoothing + rawBass * (1 - smoothing)
      const final = Math.min(1, smoothedBassRef.current)

      const nextSpectrum = {
        low: Math.min(1, smoothedSpectrumRef.current.low * smoothing + weightedLow * (1 - smoothing)),
        mid: Math.min(1, smoothedSpectrumRef.current.mid * smoothing + weightedMid * (1 - smoothing)),
        high: Math.min(1, smoothedSpectrumRef.current.high * smoothing + weightedHigh * (1 - smoothing)),
        full: Math.min(1, smoothedSpectrumRef.current.full * smoothing + weightedFull * (1 - smoothing)),
      }
      smoothedSpectrumRef.current = nextSpectrum

      perfInternalFramesRef.current += 1

      const now = performance.now()
      if (uiPublishTimerRef.current === 0 || now - uiPublishTimerRef.current >= UI_PUBLISH_INTERVAL_MS) {
        uiPublishTimerRef.current = now
        perfUiPublishesRef.current += 1
        setBassLevel(final)
        setSpectrumLevels(nextSpectrum)
      }

      if (import.meta.env.DEV) {
        if (perfWindowStartRef.current === 0) {
          perfWindowStartRef.current = now
        }
        const perfElapsed = now - perfWindowStartRef.current
        if (perfElapsed >= 5000) {
          const internalFps = (perfInternalFramesRef.current * 1000) / perfElapsed
          const uiFps = (perfUiPublishesRef.current * 1000) / perfElapsed
          console.info(
            `[audio:perf] mode=${PERFORMANCE_MODE ? 'performance' : 'quality'} internal=${internalFps.toFixed(1)}fps ui=${uiFps.toFixed(1)}fps`,
          )
          perfWindowStartRef.current = now
          perfInternalFramesRef.current = 0
          perfUiPublishesRef.current = 0
        }
      }

      animFrameRef.current = requestAnimationFrame(analyze)
    }

    animFrameRef.current = requestAnimationFrame(analyze)
  }

  useEffect(() => {
    return () => {
      stopAnalysisLoop()

      if (micSourceRef.current) {
        micSourceRef.current.disconnect()
        micSourceRef.current = null
      }

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop())
        micStreamRef.current = null
      }

      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {
          // Ignore close failures during unmount.
        })
      }
    }
  }, [])

  return {
    bassLevel,
    spectrumLevels,
    isActive,
    permissionDenied,
    audioError,
    startAudio,
    stopAudio,
  }
}
