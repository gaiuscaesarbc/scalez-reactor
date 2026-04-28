# SCALEZ Vision Engine

Desktop workspace scaffolded for Electron + React + Vite (JavaScript) with a split architecture:

- Electron process code in src/main
- React renderer code in src/renderer

## Scripts

- npm run dev: starts Vite and Electron together
- npm run build: builds the renderer into dist
- npm run preview: previews the renderer build
- npm run electron: launches Electron directly

## Structure

src/
- main/
	- main.cjs
	- preload.cjs
- renderer/
	- main.jsx
	- App.jsx
	- styles.css

## Notes for Windows

- The dev server is pinned to 127.0.0.1:5173 in Vite config for predictable Electron startup.
- Electron loads query-based window modes to support separate control and output window surfaces.

## Live Testing Checklist

### Pre-Show Setup
- [ ] Load saved show file (or manual clip loading)
- [ ] Test audio input: click "Start Audio" in audio panel, verify bass meter responds
- [ ] Test Safe Mode toggle: ensure strobe disables, glow/shake cap at 50%
- [ ] Verify fallback screen displays when no clips are active (output window)

### Performance & Reliability
- [ ] Monitor FPS in control window overlay (target: 30+ FPS)
- [ ] Check "Sync" status in overlay (should show "synced")
- [ ] Trigger multiple rapid clips on same layer (verify preload reduces flashing)
- [ ] Switch layers rapidly (test layer visibility toggle)
- [ ] Run 🧪 Test > Stress Test for 30 seconds (randomize clips, bass, layers)
- [ ] Verify error indicators appear for missing/failed clips (orange badge ⚠️)

### Audio Reactivity
- [ ] Adjust sensitivity slider (0.5–2.0) and observe bass detection change
- [ ] Adjust smoothing slider (0.7–0.95) and confirm response smoothness
- [ ] Bass pulses should add 35% glow boost automatically
- [ ] In Safe Mode, glow boost caps at 50% of total value

### Session Stability
- [ ] Check session timer in header (format: HH:MM:SS)
- [ ] Run for 10+ minutes, verify no memory leaks (Task Manager)
- [ ] Force video load error, verify error state shows and prevents re-trigger
- [ ] Clear all clips, verify fallback screen appears in output

### FX & Hotkeys
- [ ] Space key toggles blackout (output goes black)
- [ ] R key resets all FX to defaults
- [ ] 1–9 keys trigger Layer 1 slots 0–8
- [ ] Shift+1–9 trigger Layer 2
- [ ] Ctrl+1–9 trigger Layer 3
- [ ] Arrow Left/Right scroll clip grids smoothly

### Output Window
- [ ] Verify output window stays fullscreen (even when switching in control)
- [ ] Confirm output shows live FX changes (glow, strobe, shake, brightness)
- [ ] Check sync status indicator changes color (green=synced, orange=out-of-sync)
- [ ] Verify video count in overlay matches active layers

### Save/Load (When Implemented)
- [ ] Save current show layout with a name
- [ ] Close app, reopen, load saved show
- [ ] Verify all clips, layer visibility, blend modes, opacity restored

