import { useMemo, useRef, useState } from 'react'

export default function ShowManager({
  savedShows,
  defaultScenes = [],
  onSaveShow,
  onLoadShow,
  onLoadDefaultScene,
  onDeleteShow,
  onRefreshShows,
}) {
  const formatShowTimestamp = (timestamp) => {
    const parsed = Date.parse(timestamp || '')
    if (!Number.isFinite(parsed)) {
      return 'Unknown save time'
    }
    const date = new Date(parsed)
    return `${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`
  }

  const [isOpen, setIsOpen] = useState(false)
  const [showName, setShowName] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const nameInputRef = useRef(null)

  const handleSave = () => {
    const normalizedShowName = showName.trim()
    if (!normalizedShowName) {
      alert('Please enter a show name')
      return
    }

    const existingShow = savedShows.find((s) => s.name?.trim() === normalizedShowName)
    if (existingShow) {
      const confirmed = window.confirm(
        `Show "${normalizedShowName}" already exists. Overwrite it?`,
      )
      if (!confirmed) return
    }

    onSaveShow(normalizedShowName)
    setShowName('')
    setIsOpen(false)
  }

  const handleLoad = (show) => {
    const confirmed = window.confirm(
      `Load show "${show.name}"? Current unsaved changes will be lost.`,
    )
    if (confirmed) {
      onLoadShow(show.name)
      setIsOpen(false)
    }
  }

  const handleLoadDefault = (scene) => {
    const confirmed = window.confirm(
      `Load default scene "${scene.name}"? Current unsaved changes will be lost.`,
    )
    if (confirmed) {
      onLoadDefaultScene?.(scene.id)
      setIsOpen(false)
    }
  }

  const handleDelete = (show) => {
    setDeleteConfirm(show)
  }

  const confirmDelete = () => {
    if (deleteConfirm) {
      onDeleteShow(deleteConfirm.name)
      setDeleteConfirm(null)
      setIsOpen(false)
    }
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
  }

  const groupedDefaultScenes = useMemo(() => {
    const order = ['Calm', 'Build', 'Drop', 'Peak']
    const buckets = order.map((energyProfile) => ({ energyProfile, scenes: [] }))

    defaultScenes.forEach((scene) => {
      const match = buckets.find((bucket) => bucket.energyProfile === scene.energyProfile)
      if (match) {
        match.scenes.push(scene)
      } else {
        buckets.push({ energyProfile: scene.energyProfile || 'Other', scenes: [scene] })
      }
    })

    return buckets.filter((bucket) => bucket.scenes.length > 0)
  }, [defaultScenes])

  return (
    <div className="show-manager">
      <button
        type="button"
        className="show-manager__toggle pill"
        onClick={() => {
          const nextOpen = !isOpen
          setIsOpen(nextOpen)
          if (nextOpen) {
            onRefreshShows?.()
            setTimeout(() => nameInputRef.current?.focus(), 0)
          }
        }}
      >
        💾 Shows
      </button>

      {isOpen && (
        <div className="show-manager__panel panel-glass">
          <div className="show-manager__header">
            <h3>Show Manager</h3>
            <button
              type="button"
              className="show-manager__close"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="show-manager__content">
            {/* Save Section */}
            <section className="show-section">
              <h4>Save Show</h4>
              <div className="show-input-group">
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="Show name..."
                  value={showName}
                  onChange={(e) => setShowName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                  }}
                  className="show-input"
                />
                <button
                  type="button"
                  className="show-btn show-btn--save"
                  onClick={handleSave}
                >
                  Save
                </button>
              </div>
            </section>

            {/* Saved Shows */}
            <section className="show-section">
              <h4>Saved Shows</h4>
              {savedShows.length === 0 ? (
                <p className="show-empty">No saved shows yet</p>
              ) : (
                <div className="show-list">
                  {savedShows.map((show) => (
                    <div key={show.name} className="show-item">
                      <div className="show-item__info">
                        <div className="show-item__name">{show.name}</div>
                        <div className="show-item__time">
                          {formatShowTimestamp(show.timestamp)}
                        </div>
                      </div>
                      <div className="show-item__actions">
                        <button
                          type="button"
                          className="show-btn show-btn--load"
                          onClick={() => handleLoad(show)}
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          className="show-btn show-btn--delete"
                          onClick={() => handleDelete(show)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Delete Confirmation */}
          {deleteConfirm && (
            <div className="show-confirmation">
              <div className="show-confirmation__content">
                <p>
                  Delete show <strong>"{deleteConfirm.name}"</strong>?
                </p>
                <div className="show-confirmation__actions">
                  <button
                    type="button"
                    className="show-btn show-btn--confirm"
                    onClick={confirmDelete}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="show-btn show-btn--cancel"
                    onClick={cancelDelete}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
