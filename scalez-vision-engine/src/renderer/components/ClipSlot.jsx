export default function ClipSlot({ layerIndex, slot, isActive, onTrigger }) {
  const label = slot.clipName || 'Empty slot'

  return (
    <div className={`clip-slot ${isActive ? 'is-active' : ''}`}>
      <button
        type="button"
        className="clip-slot__trigger"
        onClick={() => onTrigger(layerIndex, slot.slotIndex)}
      >
        <div className="clip-slot__num">{slot.slotIndex + 1}</div>
        <div className="clip-slot__thumb">{slot.status === 'empty' ? 'LOAD' : 'CLIP'}</div>
        <div className="clip-slot__name" title={label}>
          {label}
        </div>
      </button>
    </div>
  )
}
