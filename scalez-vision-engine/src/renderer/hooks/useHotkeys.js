import { useEffect, useRef } from 'react'

export function useHotkeys({
  onBlackoutToggle,
  onResetFx,
  onTriggerLayer1,
  onTriggerLayer2,
  onTriggerLayer3,
  onScrollClips,
}) {
  const keysHeldRef = useRef({})

  useEffect(() => {
    function handleKeyDown(event) {
      const key = event.code || event.key
      const isCtrl = event.ctrlKey || event.metaKey
      const isShift = event.shiftKey

      keysHeldRef.current[key] = true

      if (key === 'Space') {
        event.preventDefault()
        onBlackoutToggle?.()
        return
      }

      if (key === 'KeyR' && !isCtrl && !isShift) {
        event.preventDefault()
        onResetFx?.()
        return
      }

      if (key === 'ArrowLeft') {
        event.preventDefault()
        onScrollClips?.(-1)
        return
      }

      if (key === 'ArrowRight') {
        event.preventDefault()
        onScrollClips?.(1)
        return
      }

      const numMatch = key.match(/^Digit(\d)$/)
      if (numMatch) {
        const slotIndex = parseInt(numMatch[1], 10) - 1

        if (isCtrl) {
          event.preventDefault()
          onTriggerLayer3?.(slotIndex)
        } else if (isShift) {
          event.preventDefault()
          onTriggerLayer2?.(slotIndex)
        } else {
          event.preventDefault()
          onTriggerLayer1?.(slotIndex)
        }
      }
    }

    function handleKeyUp(event) {
      const key = event.code || event.key
      keysHeldRef.current[key] = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [onBlackoutToggle, onResetFx, onTriggerLayer1, onTriggerLayer2, onTriggerLayer3, onScrollClips])
}
