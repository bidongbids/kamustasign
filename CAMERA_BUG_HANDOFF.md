# Handoff: camera panel goes black after switching Translator tabs

**Goal for whoever picks this up:** confirm whether the webcam feed actually works in
the Translator, and if it doesn't, fix it. You can run the dev server and drive a real
browser; the previous session could not, which is why this is still open.

---

## 1. The symptom, precisely

Dev server on `http://localhost:8081`, Chrome, desktop layout.

1. Open the app, go to Translator. It lands on the **Letters** tab. The camera works —
   live feed visible.
2. Switch to the **Words** tab. Camera panel is solid black. No visible error.
3. Switch back to **Letters**. Now that one is black too, having worked seconds earlier.

It breaks on the **first** switch, not gradually. Once black, it stays black until a full
page reload. A reload restores whichever tab loads first, and the cycle repeats.

Not yet confirmed either way: whether the Words tab has *ever* shown a feed, or whether
it has always been black and the Letters breakage is collateral.

## 2. Running it

```powershell
cd C:\Users\USER\Documents\kamustasign
npm run web
```

Expo/Metro, React Native Web, React 19. The Translator lives at
`src/screens/TranslatorHubScreen.tsx`, which switches between three tabs by mounting and
unmounting one screen at a time:

```tsx
{mode === "alphabet" && <LiveTranslatorScreen targetLanguage={targetLanguage} />}
{mode === "word"     && <WordTranslatorScreen targetLanguage={targetLanguage} />}
{mode === "signer"   && <SignerScreen />}
```

So every tab switch is a genuine unmount/remount, and each screen acquires its own
`getUserMedia` stream and its own MediaPipe landmarker in a `useEffect` with `[]` deps.

## 3. Already ruled out — please don't re-litigate these

Four hypotheses were investigated and are **not** the cause. Each was tested, and two led
to real fixes that are now in the codebase but did **not** resolve the symptom.

**a) Model download blocking the camera.** `WordTranslatorScreen.setup()` used to
`await loadWordModels()` *before* calling `getUserMedia`. The word models total ~326 MB
(4 × ~82 MB), so the camera genuinely could not appear until they finished parsing.
**Fixed** — models now load in the background and the camera starts immediately. This was
a real bug and worth keeping, but the panel is still black, so it was not *the* bug.

**b) Leaked MediaPipe WebGL contexts.** Neither screen called `.close()` on its
`HandLandmarker` / `HolisticLandmarker`, so each tab switch leaked a WebGL context.
**Fixed** — both screens now close theirs on unmount, with an orphan guard for unmounting
mid-load. Still black. This theory was also weak on its own evidence: the failure happens
on the *first* switch, and Chrome tolerates ~16 live contexts, so two would not exhaust it.

**c) Two `<video>` elements sharing one ref.** Both screens reference `<CameraDevice>`
twice. Checked: they are in mutually exclusive desktop/mobile `return` branches, so only
one mounts. Not the cause.

**d) The MediaPipe CDN loader failing to re-resolve on remount.**
`loadMediapipeHolisticFromCDN()` injects a `<script type="module">` and waits on a window
event, which would deadlock on a second mount if the module didn't re-execute. Checked:
it has a `if (window.__mpVisionHolistic) resolve(...)` short-circuit at the top. Not the cause.

## 4. Instrumentation already in place

`src/screens/WordTranslatorScreen.tsx` has a `TRACE_CAMERA` flag (currently `true`) and a
`trace()` helper logging under the `[words-cam]` prefix. It marks every await boundary in
`setup()`:

```
[words-cam] MOUNT
[words-cam] setup() start; videoRef present? true
[words-cam] awaiting CDN bundle...
[words-cam] CDN bundle ready
[words-cam] landmarker created
[words-cam] awaiting getUserMedia...
[words-cam] getUserMedia resolved; tracks: ["video/live/HP TrueVision HD"]
[words-cam] attaching stream to <video>
[words-cam] play() resolved; size=640x480 readyState=4 paused=false
[words-cam] 1s later: size=640x480 readyState=4 paused=false track=live
[words-cam] UNMOUNT - stopping stream, closing landmarker
```

**Where it stops tells you which failure mode you have:**

| Last line seen | Meaning |
|---|---|
| `awaiting CDN bundle...` | MediaPipe promise never resolves on remount |
| `awaiting getUserMedia...` | Chrome won't re-grant the camera after the prior screen released it |
| `play() resolved` with `size=0x0` | Stream attached but delivering no frames |
| `play() resolved` at real size, `1s later` healthy | **Camera is fine — the bug is CSS/layout, not capture** |
| `setup() THREW: ...` | Read the error; it is now surfaced in the status line too |

`LiveTranslatorScreen.tsx` is **not** instrumented. If the trace shows Words is healthy,
add the same tracing there, since Letters breaking on return is the more diagnostic half
of the symptom.

## 5. Code map

| What | Where |
|---|---|
| Tab switching / mount-unmount | `src/screens/TranslatorHubScreen.tsx` |
| Words camera setup | `src/screens/WordTranslatorScreen.tsx` → `setup()` inside the `useEffect` |
| Letters camera setup | `src/screens/LiveTranslatorScreen.tsx` → `setup()` inside the `useEffect` |
| The actual `<video>` element | `src/components/CameraDevice.tsx` |

Both `setup()` functions follow the same shape: load models → load MediaPipe from CDN →
create landmarker → `getUserMedia` → attach to `videoRef` → `play()` → start rAF loop.
Cleanup sets `stopped = true`, cancels the rAF, stops the stream tracks, closes the landmarker.

## 6. Open hypotheses, ranked

**H1 — Camera re-acquisition race.** Letters' cleanup calls `track.stop()` and Words'
`getUserMedia` fires immediately after. On Windows, a device released and re-acquired in
the same tick can return a stream whose track is `ended`, or hang. Test: check the trace's
`tracks:` line for `live` vs `ended`, and whether `getUserMedia` resolves at all. If this
is it, the fix is to await actual release, or better, **hoist the camera stream to a shared
owner** (a hook or context in `TranslatorHubScreen`) so it is acquired once and shared by
both screens rather than torn down and rebuilt on every tab switch. That is the structurally
correct fix regardless.

**H2 — It's layout, not capture.** `CameraDevice`'s `screen` container has
`backgroundColor: "#000"`, so "black panel" is literally that container with nothing drawn
over it. The `<video>` is `width:100%; height:100%`, and on desktop the container is
`flex: 1` with `height: undefined`. If the parent's height resolves to 0 after a remount,
you get a full-size black box and a 0-height video. Test: inspect the `<video>` in DevTools
and read its computed box. If the trace says `size=640x480 readyState=4` but you see black,
this is your answer.

**H3 — `videoRef.current` null at attach time.** Previously this was skipped silently and
`setup()` carried on to "Ready", producing exactly a black panel with no error. There is
now a bounded wait (2s) and a thrown error, so if this is happening you will see
`camera element never mounted` in the status line rather than silence.

**H4 — React 19 double-invoked effects in dev.** Effects mount → unmount → remount in
StrictMode. The `stopped` guards look correct, but a second `setup()` can be in flight
while the first's cleanup runs. Test: count `MOUNT` / `UNMOUNT` lines in the trace. Two
MOUNTs for one tab switch confirms it.

## 7. Constraints — do not change these

- **Do not dispose the cached TF.js word models on unmount.** There's a long comment in
  `WordTranslatorScreen`'s cleanup explaining why: they're shared at module level by
  `loadWordModels()`, and disposing them poisoned the cache so the next mount crashed in
  the WebGL backend. The MediaPipe landmarkers are the opposite case (per-mount, must be
  closed). Keep that distinction.
- **The video is mirrored via CSS only** (`transform: scaleX(-1)` in `CameraDevice`'s
  `videoStyle`). MediaPipe reads unmirrored frames, which matches how the training data was
  captured. Don't "fix" the mirroring by flipping the source.
- **Feature pipeline is 384-wide and must stay in lockstep** between
  `src/ml/wordLandmarks.ts` and `ml/scripts/extract_word_landmarks.py`. If you touch either,
  run `ml/scripts/check_feature_parity.py` (instructions in its docstring). A mismatch does
  not throw; it silently degrades predictions.

## 8. Definition of done

1. Letters → Words → Letters → Words, twice through, camera live in both every time.
2. Recording a sign in Words returns a sensible top-5. Good test words: **animal, walk,
   year, cold** (highest per-class accuracy). Compare against the reference clips in
   `ml\data\word_videos\dataset\SL\<word>\` — ASL has regional variants and signing one
   the model never saw is not a bug.
3. No leaked streams: Chrome's camera indicator goes dark when you leave the Translator.
4. Set `TRACE_CAMERA = false` in `WordTranslatorScreen.tsx` once fixed, or strip the
   tracing entirely.
5. `npx tsc --noEmit` shows no *new* errors. There are 18 pre-existing ones in
   `src/ml/modelLoader.ts`, `src/screens/TestModelScreen.tsx`, and
   `src/screens/auth/AuthScreenShell.tsx` — those are unrelated and predate this work.

## 9. Useful background

- The word model was retrained recently; the deployed 4-model ensemble scores **73.0%
  top-1 / 89.3% top-5** on held-out test data. If predictions seem mediocre but the camera
  works, that's the model's real accuracy, not a bug.
- The `public/word-model/` folder is ~326 MB and loads on first visit to Words. It's
  cached after, but the first load is slow and is *expected*. Quantizing to float16 during
  conversion would roughly halve it.
- `THREE.WebGLRenderer: Context Lost` in the console is normal React Three Fiber teardown
  when leaving the Signer tab. Not related.
