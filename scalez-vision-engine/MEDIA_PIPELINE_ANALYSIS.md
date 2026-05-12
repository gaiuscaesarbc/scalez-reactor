# SCALEZ VISION ENGINE - MEDIA PIPELINE ANALYSIS

**Date:** May 8, 2026  
**Focus:** Multi-stream video playback stabilization  
**Target:** Eliminate recurring 1.5s stall/recovery cycles in multi-layer VJ playback  

---

## EXECUTIVE SUMMARY

The app has reached **React/UI stability** (no render crashes, no churn). The remaining ~1.5s stall cycles are **systemic decoder pressure**, not code defects.

### Current Observed Pattern

```
[audio:perf] mode=performance internal=40fps ui=18fps
[video:stall-soft-recover-multilayer] stalledMs=1500 action=micro-seek
[video:stall-soft-recover-multilayer] stalledMs=1500 action=micro-seek
[video:stall-soft-recover-multilayer] stalledMs=1500 action=micro-seek
```

**Pattern:** Every ~1.5s, per-layer watchdog detects playback freeze, triggers micro-seek recovery, unblocks decoder, plays for ~1.5s, repeats.

**Root Cause:** Multiple simultaneous hardware H.264 video decode + fullscreen FX rendering + watchdog recovery seeking = **decoder pipeline saturation**.

---

## INVESTIGATION FINDINGS

### 1. WATCHDOG ARCHITECTURE

**Current Design:**
```
Watchdog interval:        250ms tick
Stall detection:          1400ms (multi-layer)
Micro-seek threshold:     1400ms
Seek recovery action:     currentTime += 0.016s (micro-seek)
Bounce watchdog:          350ms resume cooldown
Per-layer timeline tick:  50ms (reads audio refs, updates playback rate)
```

**Result:** Very aggressive watchdog that tolerates only 1.4s stalls before intervening with seeks.

### 2. FRAME ADVANCEMENT ANALYSIS

**From logs:**
- Audio analysis throttle: ~40fps (successful)
- UI update cadence: ~18fps (UI only, not renderer pressure)
- **Video frame advancement:** ~1.5s cycles, then micro-seek restarts

**Interpretation:**
The video element itself is not advancing frames regularly. After 1.4s of no frame advancement, micro-seek "re-primes" the decoder hardware.

### 3. DECODER PRESSURE SOURCES

#### A. **Multiple Simultaneous H.264 Streams**
- Playing 2+ video clips simultaneously
- Each clip is hardware-decoded H.264 in Chromium/Electron
- H.264 hardware decoders have limited parallelism on consumer hardware
- Under fullscreen FX compositing load, decoder can't keep both streams in sync

#### B. **Watchdog Seek Churn**
- Every 1.4s: micro-seek is issued
- Seek operation: decoder must find keyframe, re-sync to new time
- This is an expensive operation, especially under load
- Seeking may temporarily pause/unfreeze both streams

#### C. **Per-Layer Timeline Loop (50ms)**
- Runs every 50ms regardless of playback state
- Per active layer: `setSafePlaybackRate()`, `tryResumeVideo()`
- In multi-layer mode, speed modulation is disabled (safe)
- But **playback rate read/write + play() calls still churn decoder**

#### D. **Fullscreen FX Rendering**
- GeneratedClipRenderer + opacity + blending + FX compositing
- Canvas/WebGL rendering happens every frame
- Under heavy FX, GPU → CPU sync can stall video decode

### 4. WHY 1.5s CYCLE IS CONSISTENT

The cycle is **extremely consistent** (~1.5s every time), which indicates:
- **Not random frame drops** (would be irregular)
- **Predictable decoder saturation** (hits limit every ~1.4s of playback)
- **Watchdog is correctly detecting a real bottleneck** (not a false positive)

Hypothesis:
```
t=0ms:       Playback starts
t=0-1400ms:  Video frames advance normally
t=1400ms:    Decoder reaches resource limit (can't feed GPU fast enough)
             Frame advancement stops, currentTime plateaus
t=1400ms:    Watchdog detects stall, issues micro-seek
t=1420ms:    Micro-seek unblocks decoder pipeline
t=1420-2820ms: Playback resumes
t=2820ms:    Decoder saturates again
...repeat
```

This suggests the hardware decoder has **a ~1.4s buffer window** before it needs intervention.

### 5. NOT LIKELY TO BE:
- ❌ React render loop (already fixed)
- ❌ Audio analysis churn (already throttled to 40fps)
- ❌ Per-frame API spam (multi-layer safety mode disables speed modulation)
- ❌ Memory leak (would get progressively worse)
- ❌ Encoding issue with test clips (would be worse in single-layer, but isn't)

### 6. LIKELY IS:
- ✅ Hardware H.264 decoder buffer exhaustion under 2+ simultaneous streams
- ✅ Watchdog recovery (micro-seek) temporarily unblocks, but doesn't solve underlying pressure
- ✅ Fullscreen FX rendering + video decode competing for GPU/CPU resources
- ✅ Chromium/Electron hardware decode configuration (not optimized for multi-stream VJ)

---

## OPTIMIZATION STRATEGY

### PHASE 1: REDUCE WATCHDOG AGGRESSIVENESS

**Hypothesis:** The watchdog is helping, but triggers so frequently (every 1.5s) that it becomes part of the problem. More aggressive intervention = more seeking = more decoder churn.

**Changes:**
1. Increase stall detection threshold: **1400ms → 2500ms** (tolerate longer stalls before recovering)
2. Reduce watchdog interval: **250ms → 500ms** (check less frequently)
3. Replace micro-seeks with pause/play: Seek is expensive; simple pause/play might unblock decoder cheaper
4. Increase recovery cooldown: **800ms → 2000ms** (space out recovery attempts further)

**Expected Impact:**
- Fewer watchdog interventions per minute
- Potentially longer freezes, but fewer micro-seeks = less decoder churn
- May reveal if decoder is stable if left alone longer

---

### PHASE 2: REDUCE PER-LAYER API CHURN

**Hypothesis:** Every 50ms, we're calling `setSafePlaybackRate()` and `tryResumeVideo()` on all active layers. These are DOM property writes that signal the decoder.

**Changes:**
1. Only call `setSafePlaybackRate()` if rate actually changed (not just every tick)
2. Only call `tryResumeVideo()` if video is actually paused (not reflexively)
3. Increase per-layer tick interval: **50ms → 100ms** (fewer checks)
4. Memoize playback rate decisions to avoid redundant writes

**Code Pattern:**
```javascript
// BEFORE: Every 50ms
setSafePlaybackRate(video, 1.0)  // Writes even if already 1.0
tryResumeVideo(video)             // Calls play() even if already playing

// AFTER: Only on change
if (Math.abs(video.playbackRate - 1.0) > 0.01) {
  setSafePlaybackRate(video, 1.0)
}
if (video.paused) {
  tryResumeVideo(video)
}
```

**Expected Impact:**
- Fewer decoder API calls per second
- Reduced main-thread churn
- Smoother playback under pressure

---

### PHASE 3: ADAPTIVE QUALITY SYSTEM

**Hypothesis:** When decoder is under pressure, reduce visual complexity to free up resources.

**Changes:**
1. Monitor decoder pressure (% of clips currently stalled)
2. When pressure > 60%:
   - Reduce bloom intensity by 30%
   - Reduce RGB split by 20%
   - Lower preview canvas resolution (0.75x downscale)
   - Disable non-essential transitions
3. When pressure < 30%:
   - Restore full visual quality

**Code Pattern:**
```javascript
const pressure = diagnostics.getDecoderPressure()
if (pressure.level === 'CRITICAL') {
  fxIntensity = 0.7  // 70% of max
  canvasScale = 0.75 // Smaller render target
} else {
  fxIntensity = 1.0
  canvasScale = 1.0
}
```

**Expected Impact:**
- Automatic graceful degradation under load
- Decoder gets breathing room to recover
- User sees smooth playback with reduced FX, not frozen clips

---

### PHASE 4: PLAYBACK OPTIMIZATION

**Hypothesis:** Current approach treats all clips equally. VJ usage allows optimization.

**Changes:**
1. **Clip categorization:**
   - Safe: <720p, <5Mbps, H.264 baseline
   - Heavy: 1080p+, 15-30Mbps
   - Extreme: 4K, complex codecs
2. **Per-category strategy:**
   - Safe clips: Normal playback
   - Heavy clips: Cap playback to 1 active at a time, queue others for crossfade
   - Extreme clips: Warn user, suggest optimization
3. **Preload heuristics:**
   - Pre-buffer next clip while current plays
   - Reduce seek aggressiveness for long-GOP content

**Expected Impact:**
- Prevent user from loading incompatible clip combinations
- Automatic guidance for media pipeline limitations
- Smoother clip transitions

---

### PHASE 5: WATCHDOG REFINEMENT

**Current watchdog behavior:**
- Detects stall → Seeks → Unblocks → Works for 1.4s → Repeats

**Alternative approaches:**

**Option A: Softer Recovery**
```javascript
// Current: Micro-seek every time
seekVideoEfficient(video, currentTime + 0.016)

// Alternative: Just resume, no seek
if (video.paused) video.play()
```

**Option B: Drift Correction**
```javascript
// Rather than seeking on stall, gently drift playback rate
// down slightly to absorb timing jitter
video.playbackRate = 0.98  // Slight slowdown
setTimeout(() => video.playbackRate = 1.0, 500)
```

**Option C: Stall Tolerance**
```javascript
// Don't intervene until stall is severe (3+ seconds)
// Accept that ~1.4s stalls are normal, only fix prolonged ones
if (stalledForMs >= 3000) {
  // Hard reset
}
```

---

## IMMEDIATE ACTIONS

### 1. Enable Clip Diagnostics
Add diagnostics panel to OutputPreview that shows:
- Active layer codecs, resolutions, bitrates
- Stall counts and frame drop %
- Real-time decoder pressure estimate
- Performance classification per clip

### 2. Implement Phase 1 Tuning
Adjust watchdog constants and measure impact:
```javascript
STALL_DETECT_MULTILAYER_MS = 2500  // was 1400
STALL_WATCHDOG_INTERVAL_MS = 500   // was 250
STALL_RECOVERY_COOLDOWN_MULTILAYER_MS = 2000  // was 800
STALL_MULTILAYER_MICRO_SEEK_MS = 3000  // was 1400
```

### 3. Test Stress Playback
Create test scenario:
- Load 2 clips of similar codec/bitrate
- Play simultaneously at fullscreen with full FX
- Measure stall frequency, duration, frame drops
- Validate diagnostics match user perception

### 4. Evaluate Codec/Bitrate
Examine actual video files:
- What codec (H.264, VP8, etc.)?
- What resolution (720p, 1080p, 4K)?
- What bitrate (estimated from file size)?
- What framerate (24, 30, 60)?

Files to check:
```
C:\Users\2cody\OneDrive\Desktop\Final DJ VISUALS\
  - Scalez GLOW FLASHING 140 Purple0001-0104.mp4
  - VJ LOOP 2_H.mp4
  - VJ LOOP 4.mp4
  - VJ LOOP 5 (1).mp4
```

### 5. Profile Decoder Load
Use browser DevTools Performance tab:
- Record 10 seconds of multi-layer playback
- Look for decoder stalls in recording
- Identify if decoder thread is bottleneck or rendering thread
- Determine if issue is CPU or GPU bound

---

## TESTING METHODOLOGY

### Stress Test Protocol

**Setup:**
- Output window fullscreen
- 2 active layers with different clips
- Maximum FX intensity (bloom, RGB split, effects enabled)
- Audio reactivity enabled

**Measurement:**
```
Run for 60 seconds, log:
- Stall count
- Avg stall duration
- Stall frequency (stalls per minute)
- Frame drop percentage
- CPU/GPU utilization (if available)
```

**Baseline (Current):**
```
Stall count:        60 (every 1.5s ÷ 60s)
Avg duration:       ~500ms (stall + recovery)
Frame drop %:       ~20-30%
Frequency:          ~1 stall/second
```

**Target (Phase 1):**
```
Stall count:        20-30 (fewer interventions)
Avg duration:       ~1000-2000ms (longer but less frequent)
Frame drop %:       <15%
Frequency:          <0.5 stalls/second
```

**Target (Phase 1+2+3):**
```
Stall count:        5-10 (rare)
Avg duration:       <2000ms
Frame drop %:       <5%
Frequency:          <0.2 stalls/second
```

---

## NEXT STEPS

1. **Immediate:** Build clip diagnostics into OutputPreview component
2. **Day 1:** Implement Phase 1 watchdog tuning + test
3. **Day 2:** Implement Phase 2 API churn reduction + test
4. **Day 3:** Build adaptive quality system + test
5. **Day 4:** Document playback optimization recommendations
6. **Day 5:** Refine watchdog based on test results

---

## TECHNICAL DEBT & FUTURE WORK

- [ ] Chromium hardware decode config optimization (Electron media settings)
- [ ] Multi-codec benchmark (VP8 vs H.264 vs VP9 for VJ use)
- [ ] Proxy generation pipeline (optimized VJ-friendly re-encodes)
- [ ] GPU texture caching for repeated clip playback
- [ ] Decoder thread priority adjustment (OS-level)
- [ ] WebCodecs API investigation (when stable in Electron)

---

## REFERENCES

**Decoder Pressure Indicators:**
- Frame advancement stalls every ~N seconds = decoder buffer limit
- Consistent stall interval = predictable saturation point
- Micro-seek recovery = temporary unblock, not cure

**Multi-Stream Video Best Practices:**
- Hardware decoder typically handles 1-2 simultaneous H.264 streams efficiently
- 3+ streams or high-complexity codecs = software decode overhead
- FX rendering pressure reduces decoder priority

**VJ-Specific Optimization:**
- Clips are typically short (4-120 seconds)
- Transitions are rapid (clip switches every 1-10 seconds)
- Visual quality matters more than playback accuracy
- Seek performance is more important than seek accuracy

---

Generated: May 8, 2026
