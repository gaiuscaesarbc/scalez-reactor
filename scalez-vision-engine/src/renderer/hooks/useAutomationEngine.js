import { useMemo, useRef, useState, useEffect, useCallback } from 'react'

function clampBeats(value, fallback = 4) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.max(1, Math.round(numeric))
}

function buildTimelineBlocks(scenes) {
  return (scenes || []).flatMap((scene) =>
    (scene.blocks || []).map((block, blockIndex) => ({
      ...block,
      sceneId: scene.id,
      sceneName: scene.name,
      sceneColor: scene.color,
      blockIndex,
    })),
  )
}

function findCueByBlock(block, scenes) {
  const scene = (scenes || []).find((entry) => entry.id === block.sceneId)
  if (!scene) {
    return null
  }
  return scene.cues?.find((cue) => cue.id === block.cueId) || null
}

export function useAutomationEngine({
  scenes = [],
  bpm = 140,
  quantizeBeats = 1,
  enabled = true,
  onCueTrigger,
}) {
  const timelineBlocks = useMemo(() => buildTimelineBlocks(scenes), [scenes])
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0)
  const [blockElapsedMs, setBlockElapsedMs] = useState(0)
  const [loopSection, setLoopSection] = useState(false)
  const [manualOverride, setManualOverride] = useState(false)

  const tickTimerRef = useRef(null)
  const quantizeTimerRef = useRef(null)

  const beatMs = 60000 / Math.max(20, bpm || 140)
  const quantizeStepMs = beatMs * Math.max(1, quantizeBeats || 1)

  const clearTimers = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current)
      tickTimerRef.current = null
    }
    if (quantizeTimerRef.current) {
      clearTimeout(quantizeTimerRef.current)
      quantizeTimerRef.current = null
    }
  }, [])

  const triggerBlock = useCallback((blockIndex, reason = 'jump') => {
    const block = timelineBlocks[blockIndex]
    if (!block) {
      return
    }
    const cue = findCueByBlock(block, scenes)
    if (!cue) {
      return
    }
    onCueTrigger?.(cue, {
      reason,
      block,
      blockIndex,
    })
  }, [timelineBlocks, scenes, onCueTrigger])

  const jumpToBlock = useCallback((blockIndex, reason = 'jump') => {
    if (!timelineBlocks.length) {
      return
    }
    const boundedIndex = Math.min(Math.max(0, blockIndex), timelineBlocks.length - 1)
    setCurrentBlockIndex(boundedIndex)
    setBlockElapsedMs(0)
    triggerBlock(boundedIndex, reason)
  }, [timelineBlocks, triggerBlock])

  const scheduleQuantizedJump = useCallback((nextIndex, reason) => {
    if (!enabled || manualOverride) {
      jumpToBlock(nextIndex, reason)
      return
    }

    const step = Math.max(1, quantizeStepMs)
    const delay = step - (blockElapsedMs % step)
    const safeDelay = delay < 24 ? 0 : delay

    if (quantizeTimerRef.current) {
      clearTimeout(quantizeTimerRef.current)
      quantizeTimerRef.current = null
    }

    quantizeTimerRef.current = setTimeout(() => {
      quantizeTimerRef.current = null
      jumpToBlock(nextIndex, reason)
    }, safeDelay)
  }, [enabled, manualOverride, blockElapsedMs, quantizeStepMs, jumpToBlock])

  const nextBlock = useCallback((reason = 'next') => {
    if (!timelineBlocks.length) {
      return
    }
    const atEnd = currentBlockIndex >= timelineBlocks.length - 1
    if (atEnd) {
      if (loopSection) {
        scheduleQuantizedJump(0, 'loop')
      } else {
        setIsPlaying(false)
      }
      return
    }
    scheduleQuantizedJump(currentBlockIndex + 1, reason)
  }, [timelineBlocks, currentBlockIndex, loopSection, scheduleQuantizedJump])

  const previousBlock = useCallback(() => {
    if (!timelineBlocks.length) {
      return
    }
    const prevIndex = Math.max(0, currentBlockIndex - 1)
    scheduleQuantizedJump(prevIndex, 'previous')
  }, [timelineBlocks, currentBlockIndex, scheduleQuantizedJump])

  const play = useCallback(() => {
    if (!enabled || !timelineBlocks.length) {
      return
    }
    setIsPlaying(true)
    setManualOverride(false)
  }, [enabled, timelineBlocks.length])

  const pause = useCallback(() => {
    setIsPlaying(false)
  }, [])

  const enterManualOverride = useCallback(() => {
    setManualOverride(true)
    setIsPlaying(false)
  }, [])

  const resumeFromManualOverride = useCallback(() => {
    setManualOverride(false)
    setIsPlaying(true)
  }, [])

  useEffect(() => {
    if (!isPlaying || manualOverride || !timelineBlocks.length) {
      clearTimers()
      return
    }

    tickTimerRef.current = setInterval(() => {
      setBlockElapsedMs((current) => {
        const block = timelineBlocks[currentBlockIndex]
        if (!block) {
          return current
        }

        const durationMs = beatMs * clampBeats(block.durationBeats, 16)
        const nextElapsed = current + 50

        if (nextElapsed >= durationMs) {
          queueMicrotask(() => {
            nextBlock('auto')
          })
          return 0
        }

        return nextElapsed
      })
    }, 50)

    return () => {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current)
        tickTimerRef.current = null
      }
    }
  }, [isPlaying, manualOverride, timelineBlocks, currentBlockIndex, beatMs, nextBlock, clearTimers])

  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  const currentBlock = timelineBlocks[currentBlockIndex] || null
  const currentCue = currentBlock ? findCueByBlock(currentBlock, scenes) : null

  return {
    isPlaying,
    manualOverride,
    currentBlockIndex,
    currentBlock,
    currentCue,
    timelineBlocks,
    loopSection,
    blockElapsedMs,
    play,
    pause,
    setLoopSection,
    jumpToBlock,
    nextBlock,
    previousBlock,
    enterManualOverride,
    resumeFromManualOverride,
    triggerCurrentCue: () => triggerBlock(currentBlockIndex, 'manual-fire'),
  }
}
