import { useEffect, useRef, useState } from 'react'

function getAudioContextClass() {
  return window.AudioContext || window.webkitAudioContext || null
}

function getAnalyzerSmoothingTimeConstant(smoothing) {
  return Math.min(0.8, Math.max(0.05, smoothing * 0.5))
}

function applyNoiseFloor(value, floor = 0.045) {
  const clamped = Math.min(1, Math.max(0, value))
  if (clamped <= floor) {
    return 0
  }
  return (clamped - floor) / (1 - floor)
}

function isAudioDebugEnabled() {
  if (!import.meta.env.DEV) {
    return false
  }
  try {
    const value = window.localStorage?.getItem('scalez-debug-audio')
    if (value == null) {
      return true
    }
    return value !== '0'
  } catch {
    return true
  }
}

const AUDIO_DEBUG = isAudioDebugEnabled()

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
  const [audioFrame, setAudioFrame] = useState({
    bassLevel: 0,
    spectrumLevels: {
      full: 0,
      sub: 0,
      low: 0,
      lowMid: 0,
      mid: 0,
      presence: 0,
      high: 0,
    },
    spectrumBins: [],
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
  const smoothedSpectrumRef = useRef({ full: 0, sub: 0, low: 0, lowMid: 0, mid: 0, presence: 0, high: 0 })
  const smoothedBinsRef = useRef(null)
  const lastPublishedAtRef = useRef(0)
  const eqGainsRef = useRef(eqGains)
  const isAnalyzingRef = useRef(false)
  const startInFlightRef = useRef(false)

  const PERFORMANCE_MODE = true
  const UI_PUBLISH_FPS = PERFORMANCE_MODE ? 24 : 30
  const UI_PUBLISH_INTERVAL_MS = 1000 / UI_PUBLISH_FPS
  const BIN_COUNT = PERFORMANCE_MODE ? 24 : 48

  const getFrequencyRangeAverage = (dataArray, sampleRate, fftSize, minFrequency, maxFrequency) => {
    if (!dataArray?.length || !sampleRate || !fftSize) {
      return 0
    }

    const nyquist = sampleRate / 2
    const binWidth = nyquist / dataArray.length
    const startIndex = Math.max(0, Math.floor(minFrequency / binWidth))
    const endIndex = Math.min(dataArray.length - 1, Math.max(startIndex, Math.floor(maxFrequency / binWidth)))

    let weightedSum = 0
    let weightTotal = 0
    for (let index = startIndex; index <= endIndex; index += 1) {
      const binCenter = (index + 0.5) * binWidth
      const closeness = 1 - Math.min(1, Math.abs((binCenter - minFrequency) / Math.max(1, maxFrequency - minFrequency)))
      const weight = 0.65 + Math.max(0, closeness) * 0.35
      weightedSum += (dataArray[index] || 0) * weight
      weightTotal += weight
    }

    return weightTotal > 0 ? weightedSum / weightTotal / 255 : 0
  }

  const downsampleBins = (bins, targetCount) => {
    if (!bins || bins.length === 0 || targetCount <= 0) {
      return []
    }
    if (bins.length <= targetCount) {
      return Array.from(bins)
    }

    const output = new Array(targetCount)
    const blockSize = bins.length / targetCount
    for (let block = 0; block < targetCount; block += 1) {
      const start = Math.floor(block * blockSize)
      const end = Math.min(bins.length - 1, Math.floor((block + 1) * blockSize) - 1)
      let sum = 0
      let count = 0
      for (let index = start; index <= end; index += 1) {
        sum += bins[index] || 0
        count += 1
      }
      output[block] = count > 0 ? sum / count : 0
    }
    return output
  }

  useEffect(() => {
    eqGainsRef.current = eqGains
  }, [eqGains])

  useEffect(() => {
    if (analyzerRef.current) {
      analyzerRef.current.smoothingTimeConstant = getAnalyzerSmoothingTimeConstant(smoothing)
    }
  }, [smoothing])

  function stopAnalysisLoop() {
    isAnalyzingRef.current = false
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
  }

  const startAudio = async () => {
    if (startInFlightRef.current) {
      return
    }
    startInFlightRef.current = true

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
        analyzer.smoothingTimeConstant = getAnalyzerSmoothingTimeConstant(smoothing)
        analyzerRef.current = analyzer
      }

      micSource.connect(analyzerRef.current)

      if (!dataArrayRef.current || dataArrayRef.current.length !== analyzerRef.current.frequencyBinCount) {
        dataArrayRef.current = new Uint8Array(analyzerRef.current.frequencyBinCount)
      }
      if (!smoothedBinsRef.current || smoothedBinsRef.current.length !== analyzerRef.current.frequencyBinCount) {
        smoothedBinsRef.current = new Float32Array(analyzerRef.current.frequencyBinCount)
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
    } finally {
      startInFlightRef.current = false
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

    setAudioFrame({
      bassLevel: 0,
      spectrumLevels: { full: 0, sub: 0, low: 0, lowMid: 0, mid: 0, presence: 0, high: 0 },
      spectrumBins: [],
    })
    smoothedBassRef.current = 0
    smoothedSpectrumRef.current = { full: 0, sub: 0, low: 0, lowMid: 0, mid: 0, presence: 0, high: 0 }
    smoothedBinsRef.current = null
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
      const sampleRate = analyzerRef.current.sampleRate || audioContextRef.current?.sampleRate || 44100
      const fftSize = analyzerRef.current.fftSize || 128
      const binWidth = (sampleRate / 2) / dataArray.length
      const lowEnd = Math.max(1, Math.floor(180 / binWidth))
      const midEnd = Math.max(lowEnd + 1, Math.floor(2000 / binWidth))

      const rawSub = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 20, 70)
      const rawLow = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 70, 180)
      const rawLowMid = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 180, 450)
      const rawMid = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 450, 2000)
      const rawPresence = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 2000, 6000)
      const rawHigh = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 6000, 14000)
      const rawFull = getFrequencyRangeAverage(dataArray, sampleRate, fftSize, 20, 14000)

      const gatedSub = applyNoiseFloor(rawSub, 0.055)
      const gatedLow = applyNoiseFloor(rawLow)
      const gatedLowMid = applyNoiseFloor(rawLowMid, 0.04)
      const gatedMid = applyNoiseFloor(rawMid)
      const gatedPresence = applyNoiseFloor(rawPresence, 0.035)
      const gatedHigh = applyNoiseFloor(rawHigh)
      const gatedFull = applyNoiseFloor(rawFull)

      // Use narrower, frequency-based bands so bass does not stay hot because of broad mix energy.
      const weightedSub =
        Math.min(1, Math.pow(gatedSub, 0.96) * sensitivity * 1.35 * eqGainsRef.current.low)
      const weightedLow =
        Math.min(1, Math.pow(gatedLow, 0.96) * sensitivity * 1.15 * eqGainsRef.current.low)
      const weightedLowMid =
        Math.min(1, Math.pow(gatedLowMid, 0.9) * sensitivity * 1.0 * eqGainsRef.current.mid)
      const weightedMid =
        Math.min(1, Math.pow(gatedMid, 0.9) * sensitivity * 1.1 * eqGainsRef.current.mid)
      const weightedPresence =
        Math.min(1, Math.pow(gatedPresence, 0.88) * sensitivity * 1.0 * eqGainsRef.current.high)
      const weightedHigh =
        Math.min(1, Math.pow(gatedHigh, 0.9) * sensitivity * 1.0 * eqGainsRef.current.high)
      const weightedFull = (
        weightedSub
        + weightedLow
        + weightedLowMid
        + weightedMid
        + weightedPresence
        + weightedHigh
        + gatedFull
      ) / 7

      const rawBass = Math.max(0, weightedSub * 0.72 + weightedLow * 0.48 - weightedLowMid * 0.28)

      // Asymmetric envelope: keep attack smooth, but release quickly so effects
      // stop almost immediately when the music drops or cuts out.
      const attackSmoothing = Math.min(0.95, Math.max(0.1, smoothing))
      const releaseSmoothing = Math.min(0.72, Math.max(0.03, smoothing * 0.24))
      const bassSmoothing = rawBass < smoothedBassRef.current ? releaseSmoothing : attackSmoothing
      smoothedBassRef.current = smoothedBassRef.current * bassSmoothing + rawBass * (1 - bassSmoothing)
      const final = Math.min(1, smoothedBassRef.current)

      const getEnvelopeSmoothed = (previous, next) => {
        const envelopeSmoothing = next < previous ? releaseSmoothing : attackSmoothing
        return previous * envelopeSmoothing + next * (1 - envelopeSmoothing)
      }

      const nextSpectrum = {
        sub: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.sub, weightedSub)),
        low: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.low, weightedLow)),
        lowMid: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.lowMid, weightedLowMid)),
        mid: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.mid, weightedMid)),
        presence: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.presence, weightedPresence)),
        high: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.high, weightedHigh)),
        full: Math.min(1, getEnvelopeSmoothed(smoothedSpectrumRef.current.full, weightedFull)),
      }
      smoothedSpectrumRef.current = nextSpectrum

      if (!smoothedBinsRef.current || smoothedBinsRef.current.length !== dataArray.length) {
        smoothedBinsRef.current = new Float32Array(dataArray.length)
      }
      const smoothedBins = smoothedBinsRef.current
      for (let index = 0; index < dataArray.length; index += 1) {
        const rawBin = dataArray[index] / 255
        const gatedBin = applyNoiseFloor(rawBin, 0.03)
        const eqGain = index <= lowEnd ? eqGainsRef.current.low : index <= midEnd ? eqGainsRef.current.mid : eqGainsRef.current.high
        const weightedBin = Math.min(1, Math.pow(gatedBin, 0.82) * sensitivity * eqGain)
        smoothedBins[index] = Math.min(1, getEnvelopeSmoothed(smoothedBins[index] || 0, weightedBin))
      }

      perfInternalFramesRef.current += 1

      const now = performance.now()
      if (uiPublishTimerRef.current === 0 || now - uiPublishTimerRef.current >= UI_PUBLISH_INTERVAL_MS) {
        uiPublishTimerRef.current = now
        perfUiPublishesRef.current += 1

        // Coalesce all audio UI state into one update to avoid render thrash.
        const sampledBins = downsampleBins(smoothedBinsRef.current || [], BIN_COUNT)
        if (now - lastPublishedAtRef.current >= UI_PUBLISH_INTERVAL_MS * 0.8) {
          setAudioFrame({
            bassLevel: final,
            spectrumLevels: nextSpectrum,
            spectrumBins: sampledBins,
          })
          lastPublishedAtRef.current = now
        }
      }

      if (AUDIO_DEBUG) {
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
    bassLevel: audioFrame.bassLevel,
    spectrumLevels: audioFrame.spectrumLevels,
    spectrumBins: audioFrame.spectrumBins,
    isActive,
    permissionDenied,
    audioError,
    startAudio,
    stopAudio,
  }
}
