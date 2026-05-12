import { useMemo, useState } from 'react'

const ADVANCE_MODES = [
  { value: 'clip-end', label: 'Clip End' },
  { value: 'beat', label: 'Beats' },
  { value: 'bar', label: 'Bars' },
]

function formatEntryDuration(entry) {
  if (!entry) return ''
  if (entry.advanceMode === 'clip-end') {
    return 'Auto at clip end'
  }
  const beats = Math.max(1, Number(entry.durationBeats) || 4)
  if (entry.advanceMode === 'bar') {
    return `${beats} bar${beats === 1 ? '' : 's'}`
  }
  return `${beats} beat${beats === 1 ? '' : 's'}`
}

export default function SequenceWorkspace({
  layers,
  sequences,
  selectedLayerIndex,
  onSelectLayer,
  onAddLayerEntry,
  onRemoveEntry,
  onUpdateEntry,
  onMoveEntry,
  onTogglePlay,
  onNextEntry,
  onPreviousEntry,
  onToggleLoop,
  onClearSequence,
  onAddSlotEntry,
}) {
  const selectedLayer = layers[selectedLayerIndex] || null
  const sequence = useMemo(
    () => sequences.find((entry) => entry.layerIndex === selectedLayerIndex) || null,
    [sequences, selectedLayerIndex],
  )
  const [draggingEntryId, setDraggingEntryId] = useState(null)

  if (!sequence) {
    return (
      <section className="sequence-workspace panel-glass">
        <h3>Clip Sequences</h3>
        <p>Select a layer to begin building a deterministic clip sequence.</p>
      </section>
    )
  }

  const loadedSlots = selectedLayer?.slots?.filter((slot) => slot.status === 'loaded') || []

  const handleDragStart = (event, entryId) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', entryId)
    setDraggingEntryId(entryId)
  }

  const handleDragEnd = () => {
    setDraggingEntryId(null)
  }

  const handleDropEntry = (event, targetEntryId) => {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain')
    if (!draggedId || draggedId === targetEntryId) {
      return
    }

    const fromIndex = sequence.entries.findIndex((entry) => entry.id === draggedId)
    const toIndex = sequence.entries.findIndex((entry) => entry.id === targetEntryId)
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
      onMoveEntry(selectedLayerIndex, fromIndex, toIndex)
    }
  }

  const handleAddCurrentClip = () => {
    if (!selectedLayer || typeof selectedLayer.activeSlotIndex !== 'number') {
      return
    }
    onAddLayerEntry(selectedLayerIndex, selectedLayer.activeSlotIndex)
  }

  return (
    <section className="sequence-workspace panel-glass">
      <div className="sequence-workspace__header">
        <div>
          <h3>Clip Sequences</h3>
          <p>Build deterministic per-layer clip flows alongside your existing cue/timeline automation.</p>
        </div>
        <div className="sequence-workspace__layer-tabs" role="tablist">
          {layers.map((layer) => (
            <button
              key={layer.layerIndex}
              type="button"
              className={`pill${selectedLayerIndex === layer.layerIndex ? ' is-active' : ''}`}
              role="tab"
              aria-selected={selectedLayerIndex === layer.layerIndex}
              onClick={() => onSelectLayer(layer.layerIndex)}
            >
              Layer {layer.layerIndex + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="sequence-workspace__transport">
        <button type="button" className="pill" onClick={() => onPreviousEntry(selectedLayerIndex)} disabled={sequence.entries.length === 0}>
          ◀ Prev Clip
        </button>
        <button type="button" className={`pill${sequence.isPlaying ? ' is-active' : ''}`} onClick={() => onTogglePlay(selectedLayerIndex)}>
          {sequence.isPlaying ? 'Pause Sequence' : 'Play Sequence'}
        </button>
        <button type="button" className="pill" onClick={() => onNextEntry(selectedLayerIndex)} disabled={sequence.entries.length === 0}>
          Next Clip ▶
        </button>
        <button type="button" className={`pill${sequence.loopSection ? ' is-active' : ''}`} onClick={() => onToggleLoop(selectedLayerIndex)}>
          Loop
        </button>
        <button type="button" className="pill ghost" onClick={() => onClearSequence(selectedLayerIndex)} disabled={sequence.entries.length === 0}>
          Clear Sequence
        </button>
      </div>

      <div className="sequence-workspace__body">
        <div className="sequence-workspace__list-section">
          <h4>Sequence Entries</h4>
          {sequence.entries.length === 0 ? (
            <p className="sequence-workspace__empty">No entries yet. Add a clip to start a sequence.</p>
          ) : (
            <div className="sequence-workspace__entries">
              {sequence.entries.map((entry, index) => (
                <div
                  key={entry.id}
                  className={`sequence-entry${index === sequence.currentEntryIndex ? ' is-current' : ''}`}
                  draggable
                  onDragStart={(event) => handleDragStart(event, entry.id)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => handleDropEntry(event, entry.id)}
                >
                  <div className="sequence-entry__main">
                    <div className="sequence-entry__title">
                      <span>{entry.clipName || `Slot ${entry.slotIndex + 1}`}</span>
                      <small>Slot {entry.slotIndex + 1}</small>
                    </div>
                    <div className="sequence-entry__meta">
                      <span>{formatEntryDuration(entry)}</span>
                    </div>
                  </div>
                  <div className="sequence-entry__controls">
                    <label>
                      Advance
                      <select
                        value={entry.advanceMode}
                        onChange={(event) => onUpdateEntry(selectedLayerIndex, entry.id, { advanceMode: event.target.value })}
                      >
                        {ADVANCE_MODES.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    {entry.advanceMode !== 'clip-end' && (
                      <label>
                        Length
                        <input
                          type="range"
                          min={1}
                          max={16}
                          value={entry.durationBeats}
                          onChange={(event) => onUpdateEntry(selectedLayerIndex, entry.id, { durationBeats: Number(event.target.value) })}
                        />
                        <span>{entry.durationBeats} {entry.advanceMode === 'bar' ? 'bars' : 'beats'}</span>
                      </label>
                    )}
                    <div className="sequence-entry__actions">
                      <button type="button" className="pill mini" onClick={() => onMoveEntry(selectedLayerIndex, index, Math.max(0, index - 1))} disabled={index === 0}>
                        ▲
                      </button>
                      <button type="button" className="pill mini" onClick={() => onMoveEntry(selectedLayerIndex, index, Math.min(sequence.entries.length - 1, index + 1))} disabled={index === sequence.entries.length - 1}>
                        ▼
                      </button>
                      <button type="button" className="pill mini danger" onClick={() => onRemoveEntry(selectedLayerIndex, entry.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="sequence-workspace__sidebar">
          <div className="sequence-workspace__sidebar-panel">
            <h4>Layer {selectedLayerIndex + 1} Clips</h4>
            <p>Drag a loaded clip into the sequence or add the current active clip.</p>
            <button type="button" className="pill" onClick={handleAddCurrentClip} disabled={!selectedLayer || typeof selectedLayer.activeSlotIndex !== 'number'}>
              Add Current Clip
            </button>
            <div className="sequence-workspace__slot-list">
              {loadedSlots.length === 0 ? (
                <p>No loaded clips available in this layer.</p>
              ) : (
                loadedSlots.map((slot, slotIndex) => (
                  <div key={slotIndex} className="sequence-slot-item">
                    <span>{slot.clipName || `Slot ${slotIndex + 1}`}</span>
                    <button type="button" className="pill mini" onClick={() => onAddSlotEntry(selectedLayerIndex, slotIndex)}>
                      Add
                    </button>
                  </div>
                )))}
              </div>
            </div>
          </aside>
        </div>
    </section>
  )
}
