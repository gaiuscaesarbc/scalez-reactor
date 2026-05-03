import { useEffect, useRef, useState } from 'react'

export function usePerformanceMode() {
  const [performanceModeEnabled, setPerformanceModeEnabled] = useState(false)

  return {
    performanceModeEnabled,
    setPerformanceModeEnabled,
    // Performance Mode adjustments
    getAudioPublishFps: () => (performanceModeEnabled ? 16 : 24),
    getSpectrumBinCount: () => (performanceModeEnabled ? 32 : 64),
    shouldDisableShake: () => performanceModeEnabled,
    shouldCapGlow: () => performanceModeEnabled ? 0.5 : 1.0,
    shouldDisableStrobe: () => performanceModeEnabled,
    shouldPauseUnusedThumbnails: () => performanceModeEnabled,
  }
}
