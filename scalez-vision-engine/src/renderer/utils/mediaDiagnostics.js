/**
 * Media Diagnostics System
 *
 * Provides real-time analysis of:
 * - Video codec, resolution, bitrate characteristics
 * - Playback state and frame advancement
 * - Decoder pressure indicators
 * - Performance classification
 *
 * For multi-stream VJ compositor optimization.
 */

export const CODEC_COMPLEXITY = {
  // Hardware-friendly, highly optimized
  'avc1': 1, // H.264 baseline/main profile
  'h264': 1,
  // Software decode, less optimized but lighter
  'vp8': 2,
  // Software decode, heavier compression, more CPU
  'vp9': 2,
  'av01': 3, // AV1 (very heavy, rare in VJ use)
  'hev1': 3, // H.265/HEVC (less common, high profile)
  'unknown': 2, // Assume moderate complexity
}

export const PERF_CLASSIFICATION = {
  SAFE: 'SAFE', // <720p, <5Mbps, low complexity
  MODERATE: 'MODERATE', // 720p-1080p, 5-15Mbps, moderate complexity
  HEAVY: 'HEAVY', // 1080p+, 15-30Mbps, high complexity
  EXTREME: 'EXTREME', // 4K+, >30Mbps, or complex codec
}

/**
 * Extract video codec from <video> element
 */
export function getVideoCodec(videoElement) {
  if (!videoElement) return { codec: 'unknown', profile: '', level: '' }

  try {
    // Attempt to read from src attribute
    const src = videoElement.src || videoElement.currentSrc
    if (src && src.includes('.webm')) {
      return { codec: 'vp8', profile: '', level: '' }
    }
    if (src && src.includes('.mp4')) {
      return { codec: 'h264', profile: '', level: '' }
    }

    // Try to inspect videoTracks (not always available)
    if (videoElement.videoTracks && videoElement.videoTracks.length > 0) {
      const track = videoElement.videoTracks[0]
      const codec = track.codec || 'unknown'
      return { codec, profile: '', level: '' }
    }

    // Fallback: check canPlayType results (heuristic)
    if (videoElement.canPlayType?.('video/webm; codecs="vp8"')) {
      return { codec: 'vp8', profile: '', level: '' }
    }
    if (videoElement.canPlayType?.('video/mp4; codecs="avc1.42E01E"')) {
      return { codec: 'avc1', profile: 'baseline', level: '' }
    }

    return { codec: 'unknown', profile: '', level: '' }
  } catch {
    return { codec: 'unknown', profile: '', level: '' }
  }
}

/**
 * Estimate video bitrate from metadata
 * Returns bitrate in Mbps
 */
export function estimateVideoBitrate(videoElement, fileSizeBytes = null) {
  if (!videoElement || !Number.isFinite(videoElement.duration) || videoElement.duration <= 0) {
    return null
  }

  // If we have file size, estimate bitrate
  if (fileSizeBytes && fileSizeBytes > 0) {
    const durationSeconds = videoElement.duration
    const bitrate = (fileSizeBytes * 8) / (durationSeconds * 1_000_000) // Convert to Mbps
    return Math.round(bitrate * 100) / 100
  }

  // Otherwise, heuristic based on resolution
  const width = videoElement.videoWidth || 1920
  const height = videoElement.videoHeight || 1080
  const fps = 24 // Assume 24fps
  
  // Rough estimates for H.264
  const pixelsPerFrame = width * height
  if (pixelsPerFrame <= 1280 * 720) return 4 // ~480p or less
  if (pixelsPerFrame <= 1920 * 1080) return 8 // 1080p
  if (pixelsPerFrame <= 3840 * 2160) return 20 // 4K
  return 40 // UltraHD+
}

/**
 * Classify video performance tier
 */
export function classifyVideoPerformance(codecComplexity = 2, resolutionPixels = 2073600, bitrateMbps = 10) {
  const complexityWeight = codecComplexity * 0.3
  const resolutionScore = Math.min(2, resolutionPixels / 2073600) * 0.5 // 1080p = 2073600px
  const bitrateScore = Math.min(2, bitrateMbps / 15) * 0.2

  const score = complexityWeight + resolutionScore + bitrateScore

  if (score < 1) return PERF_CLASSIFICATION.SAFE
  if (score < 2) return PERF_CLASSIFICATION.MODERATE
  if (score < 3) return PERF_CLASSIFICATION.HEAVY
  return PERF_CLASSIFICATION.EXTREME
}

/**
 * Real-time playback diagnostics
 */
export class PlaybackDiagnostics {
  constructor(videoElement, filePath = 'unknown') {
    this.video = videoElement
    this.filePath = filePath
    this.startTime = performance.now()
    
    // Frame advancement tracking
    this.frameHistory = [] // { timestamp, currentTime }
    this.maxHistoryLength = 120 // ~2 sec at 60fps
    
    // Stall tracking
    this.stallCount = 0
    this.lastStallAt = 0
    this.totalStalledMs = 0
    this.lastFrameAdvanceTime = performance.now()
    
    // Performance samples
    this.performanceSamples = []
  }

  /**
   * Tick: sample current playback state
   */
  tick(now = performance.now()) {
    if (!this.video || this.video.readyState < 2) {
      return
    }

    const currentTime = this.video.currentTime
    const frameEntry = { timestamp: now, currentTime }
    this.frameHistory.push(frameEntry)
    if (this.frameHistory.length > this.maxHistoryLength) {
      this.frameHistory.shift()
    }

    // Detect frame advancement
    const lastEntry = this.frameHistory[this.frameHistory.length - 2]
    if (lastEntry && Math.abs(currentTime - lastEntry.currentTime) >= 0.002) {
      this.lastFrameAdvanceTime = now
    } else if (now - this.lastFrameAdvanceTime > 1400) {
      // Frame hasn't advanced for 1.4+ seconds
      this.stallCount++
      this.totalStalledMs += now - this.lastStallAt
      this.lastStallAt = now
    }
  }

  /**
   * Get frame drop rate estimate (frames not advancing per second)
   */
  getFrameDropRate() {
    if (this.frameHistory.length < 2) return 0
    
    const timeWindow = 1000 // ms
    const now = performance.now()
    const recentFrames = this.frameHistory.filter(f => now - f.timestamp < timeWindow)
    
    if (recentFrames.length < 2) return 0
    
    // Count unique currentTime values
    const uniqueTimes = new Set(recentFrames.map(f => Math.round(f.currentTime * 1000)))
    const expectedFrames = (timeWindow / 1000) * (this.video?.videoWidth ? 24 : 30) // Rough estimate
    const droppedFrames = expectedFrames - uniqueTimes.size
    
    return Math.max(0, droppedFrames / expectedFrames)
  }

  /**
   * Is currently stalled?
   */
  isCurrentlyStalled(stallThresholdMs = 1400) {
    return performance.now() - this.lastFrameAdvanceTime >= stallThresholdMs
  }

  /**
   * Get diagnostic summary
   */
  getSummary() {
    const { codec, profile } = getVideoCodec(this.video)
    const width = this.video?.videoWidth || 0
    const height = this.video?.videoHeight || 0
    const duration = this.video?.duration || 0
    const fps = 24 // Assumed; accurate value requires probe
    const bitrate = estimateVideoBitrate(this.video) || null
    
    const codecComplexity = CODEC_COMPLEXITY[codec] || 2
    const classification = classifyVideoPerformance(
      codecComplexity,
      width * height,
      bitrate || 10,
    )
    
    const uptime = performance.now() - this.startTime
    const avgStallIntervalMs = this.stallCount > 0 ? uptime / this.stallCount : null
    
    return {
      filePath: this.filePath,
      codec,
      profile,
      resolution: { width, height },
      fps,
      duration,
      bitrate,
      classification,
      
      // Playback state
      paused: this.video?.paused || true,
      playbackRate: this.video?.playbackRate || 1,
      currentTime: this.video?.currentTime || 0,
      buffered: this.video?.buffered?.length || 0,
      
      // Performance metrics
      stallCount,
      totalStalledMs: this.totalStalledMs,
      avgStallIntervalMs,
      frameDropRate: this.getFrameDropRate(),
      isCurrentlyStalled: this.isCurrentlyStalled(),
      
      // Raw stats
      uptime,
    }
  }

  /**
   * Format for UI display
   */
  toDisplayString() {
    const summary = this.getSummary()
    const lines = [
      `${summary.filePath.split('/').pop() || 'unknown'}`,
      `${summary.resolution.width}x${summary.resolution.height} @ ${summary.fps}fps`,
      `Codec: ${summary.codec.toUpperCase()} | Class: ${summary.classification}`,
      `Stalls: ${summary.stallCount} | Dropped: ${(summary.frameDropRate * 100).toFixed(1)}%`,
    ]
    if (summary.isCurrentlyStalled) {
      lines.push('⚠️ STALLED')
    }
    return lines.join('\n')
  }
}

/**
 * Aggregate diagnostics for multiple clips
 */
export class ClipPoolDiagnostics {
  constructor() {
    this.clips = new Map() // videoElement -> PlaybackDiagnostics
  }

  register(videoElement, filePath) {
    const diag = new PlaybackDiagnostics(videoElement, filePath)
    this.clips.set(videoElement, diag)
    return diag
  }

  tick(now = performance.now()) {
    for (const diag of this.clips.values()) {
      diag.tick(now)
    }
  }

  /**
   * Decoder pressure estimate:
   * - SAFE: 0-30% of clips stalling
   * - MODERATE: 30-60% stalling
   * - CRITICAL: >60% stalling
   */
  getDecoderPressure() {
    const summaries = Array.from(this.clips.values()).map(d => d.getSummary())
    const totalClips = summaries.length
    const stalledClips = summaries.filter(s => s.isCurrentlyStalled).length
    
    const pressureRatio = totalClips > 0 ? stalledClips / totalClips : 0
    
    if (pressureRatio < 0.3) return { level: 'SAFE', ratio: pressureRatio }
    if (pressureRatio < 0.6) return { level: 'MODERATE', ratio: pressureRatio }
    return { level: 'CRITICAL', ratio: pressureRatio }
  }

  /**
   * Identify problematic clips
   */
  getProblematicClips() {
    return Array.from(this.clips.values())
      .map(d => d.getSummary())
      .filter(s => s.stallCount > 0 || s.frameDropRate > 0.1)
      .sort((a, b) => b.stallCount - a.stallCount)
  }

  /**
   * Get summary for all clips
   */
  getAllSummaries() {
    return Array.from(this.clips.values()).map(d => d.getSummary())
  }
}

export default PlaybackDiagnostics
