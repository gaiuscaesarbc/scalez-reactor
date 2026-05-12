import { memo } from 'react'

const ASPECT_PRESETS = [
  { id: '16-9', label: '16:9', ratio: 16 / 9 },
  { id: '21-9', label: '21:9', ratio: 21 / 9 },
  { id: '9-16', label: '9:16', ratio: 9 / 16 },
  { id: '4-3', label: '4:3', ratio: 4 / 3 },
  { id: '1-1', label: '1:1', ratio: 1 },
  { id: 'full', label: 'Full', ratio: null },
]

export default memo(function OutputPresetPanel({ activePreset, onPresetChange }) {
  return (
    <div className="output-preset-panel">
      {ASPECT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`output-preset${activePreset === preset.id ? ' is-active' : ''}`}
          onClick={() => onPresetChange(preset.id, preset.ratio)}
          title={`Switch to ${preset.label} aspect ratio`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
})
