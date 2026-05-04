import { useEffect, useRef, useState, memo } from 'react'

function toMediaUrl(filePath) {
  if (!filePath) return null
  if (window.scalezApi?.toMediaUrl) return window.scalezApi.toMediaUrl(filePath)
  const normalized = filePath.replace(/\\/g, '/')
  return `scalez-media://localhost/${encodeURIComponent(normalized)}`
}

function useThumbnail(filePath, isLoaded) {
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

    const cleanup = () => {
      video.src = ''
      video.remove()
    }

    const capture = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 320
      canvas.height = video.videoHeight || 180
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      try {
        setThumb(canvas.toDataURL('image/jpeg', 0.7))
      } catch (_) {
        // cross-origin guard — leave thumb null
      }
      cleanup()
    }

    video.addEventListener('seeked', capture, { once: true })
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = Math.min(1.5, (video.duration || 0) * 0.1)
    }, { once: true })
    video.addEventListener('error', cleanup, { once: true })

    video.load()
    return cleanup
  }, [filePath, isLoaded])

  return thumb
}

function ClipSlot({
  layerIndex,
  slot,
  isActive,
  isMidiFlash,
  isCued,
  cueMode,
  onTrigger,
  onLoad,
  onDelete,
  onSetClipBpm,
}) {
  const label = slot.clipName || 'Empty slot'
  const isMissing = slot.status === 'missing'
  const isFailed = slot.status === 'failed'
  const isUnsupported = slot.status === 'unsupported'
  const isLoaded = slot.status === 'loaded'
  const hasError = isMissing || isFailed || isUnsupported
  const hasCompatibilityWarning = isLoaded && Boolean(slot.errorMessage)
  const thumb = useThumbnail(slot.filePath, isLoaded)

  const slotTitle = isUnsupported
    ? `Unsupported format: ${slot.errorMessage}`
    : isFailed
      ? `Error: ${slot.errorMessage}`
      : hasCompatibilityWarning
        ? slot.errorMessage
        : undefined

  const classes = [
    'clip-slot',
    isActive ? 'is-active' : '',
    isLoaded ? 'is-loaded' : '',
    !isLoaded && !hasError ? 'is-empty' : '',
    hasError ? 'is-error' : '',
    isMidiFlash ? 'is-midi-flash' : '',
    isCued ? 'is-cued' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <button
        type="button"
        className="clip-slot__trigger"
        onClick={() => onTrigger(layerIndex, slot.slotIndex)}
        title={slotTitle}
      >
        <div className="clip-slot__num">
          {slot.slotIndex + 1}
          {isMidiFlash && <span className="clip-slot__midi-badge">MIDI</span>}
          {isCued && !isMidiFlash && <span className="clip-slot__cue-badge">CUE</span>}
        </div>
        <div className="clip-slot__thumb">
          {thumb
            ? <img src={thumb} alt="" className="clip-slot__thumb-img" />
            : isUnsupported
              ? 'UNSUPPORTED'
              : isFailed
                ? 'ERROR'
                : isMissing
                  ? 'MISSING'
                  : isLoaded
                    ? 'VIDEO'
                    : 'EMPTY'}
        </div>
        <div className="clip-slot__name" title={label}>
          {isUnsupported
            ? 'Unsupported format'
            : isFailed
              ? `Error: ${slot.errorMessage.slice(0, 28)}...`
              : isMissing
                ? 'Missing file'
                : label}
        </div>
      </button>

      <div className="clip-slot__actions">
        <button
          type="button"
          className="clip-slot__load"
          onClick={() => onLoad(layerIndex, slot.slotIndex)}
        >
          {cueMode && isLoaded ? 'Cue' : 'Load'}
        </button>
        <button
          type="button"
          className="clip-slot__delete"
          onClick={() => onDelete?.(layerIndex, slot.slotIndex)}
          disabled={!isLoaded && !hasError}
          title={isLoaded || hasError ? 'Delete clip from this slot' : 'Slot is already empty'}
        >
          Del
        </button>
      </div>
      {isLoaded && (
        <div className="clip-slot__bpm-row">
          <label className="clip-slot__bpm-label" title="Clip BPM — set to the tempo of this video clip">
            BPM
          </label>
          <input
            type="number"
            className="clip-slot__bpm-input"
            min="20"
            max="300"
            step="1"
            value={slot.clipBpm ?? 140}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (Number.isFinite(val) && val >= 20 && val <= 300) {
                onSetClipBpm?.(layerIndex, slot.slotIndex, val)
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

export default memo(ClipSlot)
