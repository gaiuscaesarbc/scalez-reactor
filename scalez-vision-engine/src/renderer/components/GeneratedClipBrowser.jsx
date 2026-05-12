import React, { useState, memo } from 'react'
import { GENERATED_CLIP_PRESETS, getGeneratedClipById } from '../generatedClips/generatedClipPresets'
import { GeneratedClipRenderer } from '../generatedClips/GeneratedClipRenderer'
import './GeneratedClipBrowser.css'

export const GeneratedClipBrowser = memo(function GeneratedClipBrowser({
  isOpen,
  onClose,
  layerIndex,
  activeSlotIndex,
  layers,
  onAssignClip,
  onLoadPackToLayer,
  onLoadPackToAllLayers,
}) {
  const [previewClipId, setPreviewClipId] = useState(null)
  const previewClip = previewClipId ? getGeneratedClipById(previewClipId) : null

  const handleAssignToSlot = (generatedClip) => {
    if (typeof activeSlotIndex === 'number') {
      onAssignClip(layerIndex, activeSlotIndex, generatedClip)
    }
  }

  const handleTriggerNow = (generatedClip) => {
    if (typeof activeSlotIndex === 'number') {
      onAssignClip(layerIndex, activeSlotIndex, generatedClip)
    }
  }

  if (!isOpen) {
    return null
  }

  const demoSpectrumLevels = {
    bass: 0.6,
    mids: 0.4,
    highs: 0.3,
    full: 0.5,
    sub: 0.7,
    lowMid: 0.5,
    presence: 0.3,
  }

  return (
    <div className="generated-clip-browser-overlay" onClick={onClose}>
      <div className="generated-clip-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="generated-clip-browser-header">
          <h2>Generated Clips Library</h2>
          <button className="close-button" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="generated-clip-browser-body">
          <div className="generated-clip-browser-grid">
            {GENERATED_CLIP_PRESETS.map((clip) => (
              <div
                key={clip.id}
                className={`generated-clip-card${previewClipId === clip.id ? ' active' : ''}`}
                onClick={() => setPreviewClipId(clip.id)}
              >
                <div className="clip-card-preview">
                  {previewClipId === clip.id ? (
                    <GeneratedClipRenderer
                      clip={clip}
                      isActive={true}
                      opacity={1}
                      blendMode="normal"
                      spectrumLevels={demoSpectrumLevels}
                      qualityMode="safe"
                      maxFps={24}
                    />
                  ) : null}
                  <div className="clip-card-badge">GENERATED</div>
                </div>

                <div className="clip-card-meta">
                  <div className="clip-card-name">{clip.name}</div>
                  <div className="clip-card-intensity">
                    <span className="intensity-label">Intensity:</span>
                    <span className="intensity-value">{clip.intensity}/10</span>
                  </div>
                  <div className="clip-card-energy">
                    <span className="energy-label">Energy:</span>
                    <span
                      className={`energy-badge energy-${clip.energyProfile
                        .toLowerCase()
                        .replace(' ', '-')}`}
                    >
                      {clip.energyProfile}
                    </span>
                  </div>
                  {clip.tags && clip.tags.length > 0 && (
                    <div className="clip-card-tags">
                      {clip.tags.slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="clip-card-actions">
                  {typeof activeSlotIndex === 'number' ? (
                    <>
                      <button
                        className="action-button assign"
                        onClick={() => handleAssignToSlot(clip)}
                        title="Assign to active slot"
                        type="button"
                      >
                        Assign
                      </button>
                      <button
                        className="action-button trigger"
                        onClick={() => handleTriggerNow(clip)}
                        title="Load and trigger now"
                        type="button"
                      >
                        Trigger
                      </button>
                    </>
                  ) : (
                    <div className="action-hint">Select a slot first</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="generated-clip-browser-footer">
          <button
            className="batch-action-button primary"
            onClick={() => {
              onLoadPackToLayer(layerIndex)
              onClose()
            }}
            title="Load all 3 premium clips into slots 1-3 of this layer"
            type="button"
          >
            Load Pack to Layer {layerIndex + 1}
          </button>
          <button
            className="batch-action-button secondary"
            onClick={() => {
              onLoadPackToAllLayers()
              onClose()
            }}
            title="Load all 3 premium clips to all 3 layers"
            type="button"
          >
            Load Pack to All Layers
          </button>
          <button
            className="batch-action-button neutral"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
})

GeneratedClipBrowser.displayName = 'GeneratedClipBrowser'
