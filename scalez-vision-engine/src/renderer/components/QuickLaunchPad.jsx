import { memo, useEffect, useRef, useState } from 'react'

function toMediaUrl(filePath) {
  if (!filePath) return null
  if (window.scalezApi?.toMediaUrl) return window.scalezApi.toMediaUrl(filePath)
  const normalized = filePath.replace(/\\/g, '/')
  return `scalez-media://localhost/${encodeURIComponent(normalized)}`
}

function useThumb(filePath, isLoaded) {
  const [thumb, setThumb] = useState(null)
  const prevPath = useRef(null)

  useEffect(() => {
    if (!isLoaded || !filePath || filePath === prevPath.current) return
    prevPath.current = filePath
    setThumb(null)

    const src = toMediaUrl(filePath)
    if (!src) return

    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    const cleanup = () => { video.src = ''; video.remove() }

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 160
      canvas.height = video.videoHeight || 90
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try { setThumb(canvas.toDataURL('image/jpeg', 0.65)) } catch (_) { /* cross-origin */ }
      cleanup()
    }, { once: true })

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1.5, (video.duration || 0) * 0.1)
    }, { once: true })

    video.addEventListener('error', cleanup, { once: true })
    video.load()
    return cleanup
  }, [filePath, isLoaded])

  return thumb
}

function QuickBtn({ slot, layerIndex, isActive, onTrigger }) {
  const isLoaded = slot.status === 'loaded'
  const isMissing = slot.status === 'missing'
  const isFailed = slot.status === 'failed'
  const isUnsupported = slot.status === 'unsupported'
  const isEmpty = !isLoaded && !isMissing && !isFailed && !isUnsupported
  const hasError = isMissing || isFailed || isUnsupported

  const thumb = useThumb(slot.filePath, isLoaded)

  const cls = [
    'qlp-btn',
    isActive   ? 'qlp-btn--active'   : '',
    hasError   ? 'qlp-btn--error'    : '',
    isEmpty    ? 'qlp-btn--empty'    : '',
    isLoaded && !isActive ? 'qlp-btn--loaded' : '',
  ].filter(Boolean).join(' ')

  const label = slot.clipName
    ? slot.clipName.replace(/\.[^.]+$/, '').slice(0, 16)
    : `${slot.slotIndex + 1}`

  return (
    <button
      type="button"
      className={cls}
      disabled={isEmpty || hasError || typeof onTrigger !== 'function'}
      onClick={() => !isEmpty && !hasError && onTrigger?.(layerIndex, slot.slotIndex)}
      title={slot.clipName || (isEmpty ? 'Empty' : 'Error')}
    >
      {thumb
        ? <img className="qlp-btn__thumb" src={thumb} alt="" />
        : (
          <span className="qlp-btn__fallback">
            {isMissing ? '✕' : isFailed ? '!' : isUnsupported ? '⊘' : isEmpty ? '' : '▶'}
          </span>
        )
      }
      <span className="qlp-btn__num">{slot.slotIndex + 1}</span>
      {isLoaded && (
        <span className="qlp-btn__label">{label}</span>
      )}
    </button>
  )
}

const QuickBtnMemo = memo(QuickBtn)

export default memo(function QuickLaunchPad({ layer, onTrigger }) {
  const slots = layer.slots.slice(0, 9)
  const activeIndex = layer.activeSlotIndex

  return (
    <div className="qlp">
      <div className="qlp__title">Quick Launch</div>
      <div className="qlp__grid">
        {slots.map((slot) => (
          <QuickBtnMemo
            key={slot.slotIndex}
            slot={slot}
            layerIndex={layer.layerIndex}
            isActive={activeIndex === slot.slotIndex}
            onTrigger={onTrigger}
          />
        ))}
      </div>
    </div>
  )
})
