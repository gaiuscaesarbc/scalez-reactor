# MULTI-LAYER STRESS TEST GUIDE

## Quick Start

### Enable Debug Logging

In DevTools console (F12), run:
```javascript
window.localStorage.setItem('scalez-debug-media', '1')
localStorage.setItem('scalez-debug-audio', '1')
```

Reload the app to activate debug output.

---

## Test Protocol

### Test 1: BASELINE MEASUREMENT (Before Phase 1/2)

**Duration:** 2 minutes  
**Measurement:** Current stall behavior

**Steps:**
1. Open app, go to output window fullscreen
2. Load 2 different video clips
3. Place them in layer 1 and layer 2
4. Play both simultaneously
5. Enable audio input (microphone or playback)
6. Run for 60 seconds with normal FX intensity
7. In console, look for log pattern:
   ```
   [video:stall-soft-recover-multilayer] layer=2 stalledMs=1498 action=micro-seek
   [video:stall-soft-recover-multilayer] layer=2 stalledMs=1500 action=micro-seek
   [video:stall-soft-recover-multilayer] layer=2 stalledMs=1502 action=micro-seek
   ```

**Record:**
- How often do you see `[video:stall-soft-recover-multilayer]` logs?
  - **Current expectation:** ~1 per second (60 in 60 seconds)
- Do clips visually stall/freeze? How often?
  - **Current expectation:** Occasional brief freezes every 1-2 seconds
- Do the freezes recover smoothly?
  - **Current expectation:** Yes, mostly smooth micro-seek recovery

---

### Test 2: POST-OPTIMIZATION VALIDATION (After Phase 1/2)

**Duration:** 2 minutes  
**Expected:** Improved playback smoothness

**Same setup as Test 1, but:**

1. Run for 60 seconds
2. In console, count `[video:stall-soft-recover-multilayer]` logs
   - **Target:** 20-30 total (50% reduction)
3. Look at `action` field:
   - **Before:** Mostly `action=micro-seek`
   - **After:** Mix of `action=pause-play` and `action=micro-seek`
4. Look for `attempt=N` field:
   - **Before:** Rarely shows attempt count (old code)
   - **After:** Shows attempt escalation (attempt=1, attempt=2, etc.)

**Compare:**
- Stall frequency: Fewer logs = good
- Recovery type: More pause-play, fewer seeks = good
- Visible freezes: Should be rarer or shorter = good

---

### Test 3: HEAVY LOAD STRESS TEST

**Duration:** 3 minutes  
**Goal:** Stress test with maximum load

**Setup:**
1. Load 2 clips
2. Fullscreen output
3. **Enable ALL FX:**
   - Bloom intensity: 100%
   - RGB split: 100%
   - Generated scene overlay: 50%
   - Transitions: rapid clip switching every 10-15s
4. Audio input active, reactive effects enabled
5. Run 180 seconds

**Measure:**
- Stall count: Should still stay <60 in 180s (better than 1/sec)
- Frame drop rate: Monitor via diagnostics panel (target <15%)
- Visible smoothness: Rate 1-10 (1=frozen, 10=smooth)

**Success Criteria:**
- ✅ Playback remains mostly smooth (<2 second total stall time)
- ✅ No crashes or console errors
- ✅ Clips remain visible (no prolonged black screens)
- ✅ Transitions work correctly

---

## Diagnostics Panel

### Enable Diagnostics Display

**Method 1: Manual toggle in component** (future feature)
- Key binding will be added for quick diagnostics panel
- Shows real-time decoder pressure gauge
- Lists all active clips with stall counts

**Method 2: Console monitoring**

Watch for these log lines:
```
[audio:perf] mode=performance internal=XXfps ui=YYfps
[video:stall-soft-recover-multilayer] layer=N slot=N stalledMs=XXXX action=pause-play attempt=1
[video:stall-soft-recover-multilayer] layer=N slot=N stalledMs=XXXX action=micro-seek attempt=2
```

**Interpret:**
- `internal=40fps` = audio analysis throttled correctly ✓
- `ui=18fps` = UI refresh rate (expected, lower is good)
- `stalledMs=2500+` = Stalls happening later than before ✓
- `attempt=1 action=pause-play` = Cheap recovery first ✓
- `attempt=2 attempt=3` = Only escalating if needed ✓

---

## Troubleshooting

### Symptom: Clips still freeze frequently
**Possible causes:**
1. Video clips are very high bitrate (>30Mbps)
2. Clips are 4K or very high resolution
3. GPU/system is heavily loaded (other apps)
4. Audio reactivity settings are too aggressive

**Action:**
- Check clip specs (resolution, bitrate)
- Try single-layer playback (should be smooth)
- Check if issue is 2-layer or 3+ layer specific
- Try with less intense FX
- Report with clip filenames to diagnostics

### Symptom: Recovery actions show mostly `action=micro-seek`
**Meaning:**
- Pause/play recovery (attempt 1-2) isn't working
- System requires seeking to unblock decoder
- Suggests heavier decoder pressure

**Action:**
- This is normal for heavy content
- Measure if frequency is still lower than before
- Continue to Phase 3 (adaptive quality) if needed

### Symptom: More stalls after optimization
**Meaning:**
- Something unexpected happened (rare)
- Need to revert to previous constants

**Action:**
- In OutputPreview.jsx, change back:
  ```
  STALL_DETECT_MULTILAYER_MS = 1400  // revert to original
  STALL_WATCHDOG_INTERVAL_MS = 250   // revert to original
  ```
- Rebuild and confirm original behavior returns

---

## Data Collection

### If Issues Arise

Collect this information:
```
1. Video clip filenames:
   - C:\path\to\clip1.mp4
   - C:\path\to\clip2.mp4

2. Clip specifications (right-click → Properties):
   - Resolution (e.g., 1920x1080)
   - Duration
   - Codec (H.264, VP8, etc.)
   - Bitrate (if shown)
   - File size (MB)

3. Console output (select all, copy):
   - [audio:perf] lines
   - [video:stall-soft-recover-multilayer] lines
   - Any error messages

4. System specs:
   - CPU model
   - GPU model
   - RAM (GB)
   - Windows version
```

### Success Log Example

```
[devtools:control-shell-ready] Object
[video:src] active layer=1 slot=1 path=...clip1.mp4
[video:src] active layer=2 slot=1 path=...clip2.mp4
[video:canplay] layer=1 slot=1
[video:canplay] layer=2 slot=1
[audio:perf] mode=performance internal=40.8fps ui=19.3fps
[audio:perf] mode=performance internal=39.5fps ui=18.1fps
[video:stall-soft-recover-multilayer] layer=1 slot=1 stalledMs=2504 action=pause-play attempt=1
[audio:perf] mode=performance internal=41.2fps ui=18.6fps
[video:stall-soft-recover-multilayer] layer=2 slot=1 stalledMs=2487 action=pause-play attempt=1
[audio:perf] mode=performance internal=40.1fps ui=17.8fps
[video:stall-soft-recover-multilayer] layer=1 slot=1 stalledMs=2501 action=pause-play attempt=1
```

**Good signs:**
- Stall times around 2500ms+ (not 1500ms)
- Mostly `action=pause-play` (not always micro-seek)
- Audio FPS around 40fps (not 100+)
- Infrequent recovery logs (<1 per second)

---

## Regression Testing

**Before deploying further changes:**

1. Verify original bug is gone:
   - No "Maximum update depth exceeded" crashes ✓
   - Multi-layer clips play without crashing ✓

2. Verify audio reactivity works:
   - Play with high audio (bass)
   - Verify clips respond to audio (opacity changes) ✓
   - Single-layer playback smooth ✓

3. Verify UI is responsive:
   - Slider adjustments feel snappy
   - Clip switching doesn't hang UI
   - Panel transitions smooth

---

## Phase 1+2 Success Criteria

| Metric | Before | Target | Status |
|--------|--------|--------|--------|
| Stall frequency | ~1/second | <0.5/second | ? |
| Avg recovery latency | ~500ms | ~1000ms | ? |
| Frame drop rate | 20-30% | <15% | ? |
| Visible freeze duration | 0.5-1s | <0.5s or rare | ? |
| Main-thread churn | High | 50% reduced | ? |
| Decoder API calls | High | 40-50% reduced | ? |
| Build stability | Stable | Stable ✓ | ✓ |

---

## Next Phase (3+) Triggers

**When to consider Phase 3 (Adaptive Performance):**
- Stalls still frequent after Phase 1+2
- Multiple reports of heavy 4K clip issues
- Need for graceful degradation under load
- User prefers "always smooth" over "full quality"

**When Phase 1+2 is enough:**
- Stalls reduced by 50%+ ✓
- Smooth playback for typical VJ use
- Frame drops minimal
- No crashes or instability

---

## Contact / Debugging

If issues arise during testing:
1. Enable debug logging (see top section)
2. Reproduce with simple 2-clip scenario
3. Collect logs and system specs
4. Report with video clip info and console output

Timeline for Phase 1+2: Deploy immediately, test for 1-2 hours minimum.
