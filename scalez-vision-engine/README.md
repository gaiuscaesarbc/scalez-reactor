# SCALEZ Vision Engine

A live-performance VJ application built with Electron + React + Vite. Features multi-layer video playback with forward/reverse bounce, full audio reactivity, MIDI control, show save/load, and a full-spectrum EQ visualizer.

---

## Requirements

| Tool | Version |
|---|---|
| Node.js | 18 or later |
| npm | 9 or later |
| Windows | 10 or 11 (64-bit) |
| FFmpeg | Required for bounce reverse playback |

---

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/GaiusCaesarBC/Scalez-Reactor.git
cd Scalez-Reactor/scalez-vision-engine
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install FFmpeg (required for bounce playback)

FFmpeg is used to pre-render reversed clip files for the bounce feature.

**Recommended — WinGet (Windows 10/11):**

```powershell
winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
```

After install, restart your terminal. The app auto-detects the WinGet-installed FFmpeg at runtime — no manual PATH setup required.

**Alternative — Manual:**

Download a full build from [ffmpeg.org/download.html](https://ffmpeg.org/download.html) and extract it anywhere. The app will fall back to PATH resolution if the WinGet package is not found.

---

## Running in Development

```bash
npm run dev
```

This starts the Vite dev server and launches Electron concurrently. Two windows open:
- **Control Window** — full UI, layers, audio panel, FX
- **Output Window** — clean full-screen video output (for OBS capture or projector)

---

## Building

```bash
npm run build
```

Outputs the compiled renderer to `dist/`. Run Electron against the build with:

```bash
npm run electron
```

---

## Project Structure

```
src/
  main/
    main.cjs          Electron main process, IPC, FFmpeg integration
    preload.cjs       Secure context bridge to renderer
  renderer/
    App.jsx           Control shell, audio reactivity, MIDI command dispatch
    styles.css        Full UI theme
    components/
      OutputPreview   Video playback surface, bounce logic, FX overlays
      LayerStrip      Per-layer controls, audio link, video motion, bounce
      MasterFxPanel   Master FX sliders, audio panel, EQ
      AudioMeter      Live level meters + full-spectrum EQ visualizer
      MidiPanel       MIDI device selection and learn mode
      ShowManager     Save / load named shows
      ClipSlot        Individual clip slot UI
    hooks/
      useClipStore    Layer + slot state, show persistence
      useAudioAnalysis  Mic analysis, FFT spectrum, smoothing
      useMidiController  Web MIDI access, learn, auto-reconnect
      useFps          FPS readout with EMA smoothing
      useTapTempo     BPM tap tempo
      useOutputSync   IPC state bridge to output window
      useSessionTimer Session clock
```

---

## Key Features

- **Multi-layer video** — 3 layers, 50 slots each, instant trigger
- **Bounce playback** — FFmpeg-rendered reverse companion clips for true fwd/rev looping
- **Audio reactivity** — Mic input drives glow, strobe, shake, brightness, and per-layer opacity
- **Full-spectrum EQ display** — Live bar graph across all FFT bins
- **MIDI control** — Learn mode, auto-reconnect, mappings for all major actions
- **Show save/load** — Persists clips, MIDI mappings, all audio settings, FX, video motion
- **Cue mode** — Stage clips before launching live
- **Safe mode** — Caps strobe/shake for seizure safety
- **OBS-ready output** — Output window is a clean capture target with no UI chrome

---

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

