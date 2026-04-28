export default function ClipSlot({
  layerIndex,
  slot,
  isActive,
  isMidiFlash,
  isCued,
  cueMode,
  onTrigger,
  onLoad,
}) {
  const label = slot.clipName || 'Empty slot'
  const isMissing = slot.status === 'missing'
  const isFailed = slot.status === 'failed'
  const isLoaded = slot.status === 'loaded'
  const hasError = isMissing || isFailed

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
        title={isFailed ? `Error: ${slot.errorMessage}` : undefined}
      >
        <div className="clip-slot__num">
          {slot.slotIndex + 1}
          {isMidiFlash && <span className="clip-slot__midi-badge">MIDI</span>}
          {isCued && !isMidiFlash && <span className="clip-slot__cue-badge">CUE</span>}
        </div>
        <div className="clip-slot__thumb">
          {isFailed ? '⚠️ ERROR' : isMissing ? 'MISSING' : isLoaded ? 'VIDEO' : 'EMPTY'}
        </div>
        <div className="clip-slot__name" title={label}>
          {isFailed ? `Error: ${slot.errorMessage.slice(0, 20)}...` : isMissing ? 'Missing file' : label}
        </div>
      </button>

      <button
        type="button"
        className="clip-slot__load"
        onClick={() => onLoad(layerIndex, slot.slotIndex)}
      >
        {cueMode && isLoaded ? 'Cue' : 'Load'}
      </button>
    </div>
  )
}
