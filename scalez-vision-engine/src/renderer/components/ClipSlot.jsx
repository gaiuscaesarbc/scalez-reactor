export default function ClipSlot({ layerIndex, slot, isActive, onTrigger, onLoad }) {
  const label = slot.clipName || 'Empty slot'
  const isMissing = slot.status === 'missing'
  const isFailed = slot.status === 'failed'
  const isLoaded = slot.status === 'loaded'
  const hasError = isMissing || isFailed

  return (
    <div className={`clip-slot ${isActive ? 'is-active' : ''} ${hasError ? 'is-error' : ''}`}>
      <button
        type="button"
        className="clip-slot__trigger"
        onClick={() => onTrigger(layerIndex, slot.slotIndex)}
        title={isFailed ? `Error: ${slot.errorMessage}` : undefined}
      >
        <div className="clip-slot__num">{slot.slotIndex + 1}</div>
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
        Load
      </button>
    </div>
  )
}
