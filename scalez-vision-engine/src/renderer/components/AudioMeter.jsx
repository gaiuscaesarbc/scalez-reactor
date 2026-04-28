export default function AudioMeter({ bassLevel }) {
  return (
    <div className="audio-meter" aria-label="Bass level meter">
      <div className="audio-meter__label">BASS</div>
      <div className="audio-meter__track">
        <div className="audio-meter__fill" style={{ width: `${Math.round(bassLevel * 100)}%` }} />
      </div>
      <div className="audio-meter__value">{bassLevel.toFixed(2)}</div>
    </div>
  )
}
