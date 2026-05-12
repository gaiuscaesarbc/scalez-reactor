import { useMemo } from 'react'
import {
  getTransitionTypeLabel,
  normalizeTransition,
  TRANSITION_EASING_OPTIONS,
  TRANSITION_QUANTIZE_OPTIONS,
  TRANSITION_TYPE_OPTIONS,
} from '../utils/transitionPresets'
import SequenceWorkspace from './SequenceWorkspace'

const ENERGY_ORDER = ['calm', 'build', 'drop', 'peak']

function formatBeats(durationBeats) {
  const beats = Math.max(1, Math.round(Number(durationBeats) || 1))
  return `${beats} beat${beats === 1 ? '' : 's'}`
}

export default function AutomationWorkspace({
  scenes,
  selectedSceneId,
  onSelectScene,
  onCaptureCue,
  onTriggerCueNow,
  onBlockDurationChange,
  onBlockTransitionChange,
  onPreviewTransition,
  quantizeBeats,
  onQuantizeBeatsChange,
  autoTransitionEnabled,
  onAutoTransitionChange,
  onEmergencyBlackout,
  transitionState,
  transport,
  layers,
  layerSequences,
  selectedSequenceLayerIndex,
  onSelectSequenceLayer,
  onAddSequenceEntry,
  onAddSlotSequenceEntry,
  onRemoveSequenceEntry,
  onUpdateSequenceEntry,
  onMoveSequenceEntry,
  onToggleSequencePlay,
  onAdvanceSequenceEntry,
  onRewindSequenceEntry,
  onToggleSequenceLoop,
  onClearSequence,
}) {
  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) || scenes[0] || null,
    [scenes, selectedSceneId],
  )

  if (!selectedScene) {
    return (
      <section className="automation-workspace panel-glass">
        <h2>Automation Workspace</h2>
        <p>No automation scenes found.</p>
      </section>
    )
  }

  return (
    <section className="automation-workspace panel-glass">
      <header className="automation-workspace__header">
        <div>
          <h2>Automation Workspace</h2>
          <p>
            Live set flow engine: cue snapshots, modular timeline blocks, and performance-safe override.
          </p>
        </div>
        <div className="automation-transport">
          <button type="button" className="pill" onClick={transport.previousBlock}>◀ Prev Cue</button>
          <button
            type="button"
            className={`pill${transport.isPlaying ? ' is-active' : ''}`}
            onClick={transport.isPlaying ? transport.pause : transport.play}
          >
            {transport.isPlaying ? 'Pause Automation' : 'Play Automation'}
          </button>
          <button type="button" className="pill" onClick={transport.nextBlock}>Next Cue ▶</button>
          <button
            type="button"
            className={`pill${transport.loopSection ? ' is-active' : ''}`}
            onClick={() => transport.setLoopSection((current) => !current)}
          >
            Loop Set
          </button>
          <button
            type="button"
            className={`pill${transport.manualOverride ? ' is-active' : ''}`}
            onClick={transport.manualOverride ? transport.resumeFromManualOverride : transport.enterManualOverride}
            title="Manual override always wins over automation playback"
          >
            {transport.manualOverride ? 'Resume Timeline' : 'Hold Manual Override'}
          </button>
          <button type="button" className="danger-pill" onClick={onEmergencyBlackout}>Emergency Blackout</button>
        </div>
      </header>

      <div className="automation-workspace__controls">
        <label>
          Quantize
          <select value={quantizeBeats} onChange={(event) => onQuantizeBeatsChange(Number(event.target.value))}>
            <option value={1}>1 Beat</option>
            <option value={2}>2 Beats</option>
            <option value={4}>4 Beats</option>
            <option value={8}>8 Beats</option>
          </select>
        </label>
        <label>
          Auto-Transition
          <input
            type="checkbox"
            checked={autoTransitionEnabled}
            onChange={(event) => onAutoTransitionChange(event.target.checked)}
          />
        </label>
        {transitionState && (
          <div className="automation-transition-live-chip" title="Active transition">
            {getTransitionTypeLabel(transitionState.type)} · {Math.round(transitionState.durationMs)}ms
          </div>
        )}
      </div>

      <div className="automation-scene-switcher" role="tablist" aria-label="Automation scenes">
        {scenes.map((scene) => (
          <button
            key={scene.id}
            type="button"
            className={`automation-scene-tab${selectedScene.id === scene.id ? ' is-active' : ''}`}
            role="tab"
            aria-selected={selectedScene.id === scene.id}
            onClick={() => onSelectScene(scene.id)}
            style={{ '--scene-color': scene.color }}
          >
            {scene.name}
          </button>
        ))}
      </div>

      <div className="automation-workspace__body">
        <aside className="automation-cue-list">
          <div className="automation-cue-list__header">
            <h3>{selectedScene.name}</h3>
            <button type="button" className="pill" onClick={() => onCaptureCue(selectedScene.id)}>
              Capture Current State
            </button>
          </div>
          <div className="automation-cards">
            {selectedScene.cues.map((cue) => (
              <article key={cue.id} className="automation-cue-card">
                <div className="automation-cue-card__top">
                  <strong>{cue.name}</strong>
                  <span className={`automation-energy-chip is-${cue.energyState || 'calm'}`}>
                    {(cue.energyState || 'calm').toUpperCase()}
                  </span>
                </div>
                <div className="automation-cue-card__meta">
                  <span>Intensity {(cue.energyIntensity ?? 0).toFixed(2)}</span>
                  <span>{getTransitionTypeLabel(cue.transition?.type || 'crossfade')}</span>
                </div>
                <div className="automation-cue-card__actions">
                  <button type="button" className="pill" onClick={() => onTriggerCueNow(cue.id)}>
                    Fire Cue
                  </button>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <div className="automation-timeline">
          <div className="automation-timeline__header">
            <h3>Performance Timeline Blocks</h3>
            <div className="automation-timeline__status">
              <span className="overlay-chip">Block {transport.currentBlockIndex + 1}/{transport.timelineBlocks.length}</span>
              {transport.currentCue && <span className="overlay-chip">Live Cue: {transport.currentCue.name}</span>}
              {transport.manualOverride && <span className="overlay-chip danger">Manual Override Active</span>}
            </div>
          </div>

          <div className="automation-blocks">
            {selectedScene.blocks.map((block) => {
              const cue = selectedScene.cues.find((entry) => entry.id === block.cueId)
              const blockTransition = normalizeTransition(block.transition)
              const globalIndex = transport.timelineBlocks.findIndex(
                (entry) => entry.sceneId === selectedScene.id && entry.id === block.id,
              )
              const isCurrent = globalIndex === transport.currentBlockIndex
              return (
                <div
                  key={block.id}
                  className={`automation-block${isCurrent ? ' is-current' : ''}`}
                  style={{ '--block-span': Math.max(1, Number(block.durationBeats) || 1), '--scene-color': selectedScene.color }}
                >
                  <button
                    type="button"
                    className="automation-block__jump"
                    onClick={() => transport.jumpToBlock(globalIndex, 'timeline-jump')}
                  >
                    <span className="automation-block__title">{cue?.name || 'Unknown Cue'}</span>
                    <span className={`automation-block__energy is-${cue?.energyState || 'calm'}`}>
                      {(cue?.energyState || 'calm').toUpperCase()}
                    </span>
                  </button>
                  <div className="automation-block__footer">
                    <label>
                      Duration
                      <input
                        type="range"
                        min={4}
                        max={64}
                        step={4}
                        value={block.durationBeats}
                        onChange={(event) => onBlockDurationChange(selectedScene.id, block.id, Number(event.target.value))}
                      />
                    </label>
                    <span>{formatBeats(block.durationBeats)}</span>
                  </div>
                  <div className="automation-block__transition-grid">
                    <label>
                      Transition
                      <select
                        value={blockTransition.type}
                        onChange={(event) => onBlockTransitionChange(selectedScene.id, block.id, { type: event.target.value })}
                      >
                        {TRANSITION_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Duration
                      <select
                        value={blockTransition.durationMs}
                        onChange={(event) => onBlockTransitionChange(selectedScene.id, block.id, { durationMs: Number(event.target.value) })}
                      >
                        <option value={120}>120ms</option>
                        <option value={180}>180ms</option>
                        <option value={240}>240ms</option>
                        <option value={360}>360ms</option>
                        <option value={520}>520ms</option>
                        <option value={720}>720ms</option>
                        <option value={960}>960ms</option>
                        <option value={1200}>1200ms</option>
                      </select>
                    </label>
                    <label>
                      Quantize
                      <select
                        value={blockTransition.quantize}
                        onChange={(event) => onBlockTransitionChange(selectedScene.id, block.id, { quantize: event.target.value })}
                      >
                        {TRANSITION_QUANTIZE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Easing
                      <select
                        value={blockTransition.easing}
                        onChange={(event) => onBlockTransitionChange(selectedScene.id, block.id, { easing: event.target.value })}
                      >
                        {TRANSITION_EASING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Intensity
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={blockTransition.intensity}
                        onChange={(event) => onBlockTransitionChange(selectedScene.id, block.id, { intensity: Number(event.target.value) })}
                      />
                    </label>
                    <button
                      type="button"
                      className="pill"
                      onClick={() => onPreviewTransition(selectedScene.id, block.id)}
                    >
                      Preview
                    </button>
                  </div>
                  <div className="automation-block__transition-meta">
                    <span>{getTransitionTypeLabel(blockTransition.type)}</span>
                    <span>FX {(blockTransition.intensity ?? 0).toFixed(2)}</span>
                    <span>Energy {(cue?.energyState || 'calm').toUpperCase()} {(cue?.energyIntensity ?? 0).toFixed(2)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <SequenceWorkspace
            layers={layers}
            sequences={layerSequences}
            selectedLayerIndex={selectedSequenceLayerIndex}
            onSelectLayer={onSelectSequenceLayer}
            onAddLayerEntry={onAddSequenceEntry}
            onAddSlotEntry={onAddSlotSequenceEntry}
            onRemoveEntry={onRemoveSequenceEntry}
            onUpdateEntry={onUpdateSequenceEntry}
            onMoveEntry={onMoveSequenceEntry}
            onTogglePlay={onToggleSequencePlay}
            onNextEntry={onAdvanceSequenceEntry}
            onPreviousEntry={onRewindSequenceEntry}
            onToggleLoop={onToggleSequenceLoop}
            onClearSequence={onClearSequence}
          />

          <div className="automation-guidance">
            <h4>Live Override Priority</h4>
            <ul>
              <li>Manual clip trigger immediately pauses automation flow.</li>
              <li>Cue jump, previous, and next are BPM-quantized for musical timing.</li>
              <li>Emergency blackout always bypasses timeline state.</li>
            </ul>
          </div>
        </div>
      </div>

      <footer className="automation-footer">
        <span>Energy lanes: {ENERGY_ORDER.map((s) => s.toUpperCase()).join(' / ')}</span>
        <button type="button" className="pill" onClick={transport.triggerCurrentCue}>Re-fire Current Cue</button>
      </footer>
    </section>
  )
}
