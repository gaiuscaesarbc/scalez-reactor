export default function ClipSlot({ layerIndex, slot, isActive, onTrigger, onLoad }) {
  const label = slot.clipName || 'Empty slot'
  const isMissing = slot.status === 'missing'
  const isLoaded = slot.status === 'loaded'

  return (
    <div className={`clip-slot ${isActive ? 'is-active' : ''} ${isMissing ? 'is-missing' : ''}`}>
      <button
        type="button"
        className="clip-slot__trigger"
        onClick={() => onTrigger(layerIndex, slot.slotIndex)}
      >
        <div className="clip-slot__num">{slot.slotIndex + 1}</div>
        <div className="clip-slot__thumb">
          {isMissing ? 'MISSING' : isLoaded ? 'VIDEO' : 'EMPTY'}
        </div>
        <div className="clip-slot__name" title={label}>
          {isMissing ? 'Missing file' : label}
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
