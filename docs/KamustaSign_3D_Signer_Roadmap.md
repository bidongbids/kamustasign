# KamustaSign: Text-to-Sign 3D Avatar — Build Roadmap

Scope change under consideration: drop the Student/Teacher/Admin classroom module, keep Translator (Letters + Words) and Video Call, add a new feature — type text, a 3D avatar signs it. This document lays out what that actually takes, in the order it should be tackled.

The core idea underneath all of this: KamustaSign already has MediaPipe Holistic landmark sequences for its signed-word vocabulary, captured while building the Words recognition model — currently 133 words, backed by 5,743 video clips and 17,274 cached per-clip landmark files (`ml/data/word_landmarks_cache/`). *(Correction from an earlier draft of this doc: that figure was quoted as "~2000 words" from memory of an earlier, more ambitious target. Checking the actual current data — `ml/data/word_classes.json` and `ml/DATASET_UPDATE.md` — shows the team deliberately capped the trained vocabulary at 133 words rather than expanding further. That's good news for this plan, not bad: 133 already sits inside a reasonable curated demo range, so there's less vocabulary-trimming work than assumed.)* That dataset is reusable as animation source data either way — the project isn't starting a signing-avatar build from zero, it's starting from an already-labeled motion library.

## What this will and won't be

Worth stating plainly, including in the manuscript: this will be a **gloss-based lookup avatar**, not true sign language generation. Type a sentence, split it into words, play each word's recorded sign back on a 3D character, fingerspell anything not in the vocabulary. That's a real, working, demoable system, and it's how most real signing-avatar products work today (see Prior Art below). What it is *not* is a model that understands ASL grammar — non-manual markers, classifiers, topic-comment structure, spatial referencing are all out of scope. Scoping it honestly up front avoids overclaiming in the defense.

## Phase 0 — Before writing code

1. **Get adviser sign-off on the scope change.** The current manuscript documents Student/Teacher/Admin dashboards as approved scope. Cutting a whole module and replacing it with a harder, more novel feature changes objectives and scope-and-limitations — that's a conversation to have before time is sunk into the build, not after.
2. **Decide the target vocabulary size.** The current 133-word vocabulary is already a reasonable curated size for a defensible demo — no trimming needed. Worth checking `ml/data/word_manifest.csv` for which of those 133 are actually useful demo words (greetings, question words, pronouns, common vocabulary) versus words that were only relevant to the recognition-training task.
3. **Decide what happens to Auth.** If the classroom module goes, does login still serve a purpose? Video Call likely still needs some identity/pairing mechanism — worth deciding whether Auth stays (simplified) or whether Translator + Signer + Video Call become mostly account-free, closer to how the Translator already works today.

## Phase 1 — Prove the hard part first (spike, 1–2 weeks)

This is the highest-risk piece of the whole feature and should be validated before anything else is built on top of it. If it doesn't work convincingly, the rest of the plan needs to change. Below is the concrete, step-by-step version — grounded in the actual files already in `ml/`, not a generic description.

> **Status (2026-09-20): the spike is working, via the SignAvatars path.** Steps 3–5 below are done for one word, and the retargeting problem that Step 4 was written to solve turned out not to exist on this path — the SMPL-X clips are already joint rotations on a known skeleton, so they drive a rig directly. What now exists:
>
> - `ml/scripts/signavatars_to_rotations.py` — converts a word2motion `.pkl` into Three.js quaternion tracks (53 joints: pelvis, 21 body, 15 per hand, jaw). Runs without torch, a GPU, or the licensed SMPL-X model files, none of which turned out to be necessary.
> - `src/lib/smplxSkeleton.ts` — the SMPL-X kinematic tree and rest offsets. The tree is exact; the offsets are hand-set approximations, since true template offsets need the licensed model file. Only limb proportions are affected, not joint angles.
> - `src/components/SignerAvatar.tsx` — React Three Fiber viewer that builds the skeleton procedurally and plays a clip. **No Mixamo/Ready Player Me download needed**: rendering onto the SMPL-X skeleton itself means zero retargeting and zero bone-name mapping. Swapping in a skinned humanoid later becomes a separate, isolated problem.
> - `src/screens/SignerScreen.tsx` — a third "Signer" tab in the Translator hub, with play/pause and speed.
> - `ml/scripts/verify_rig.ts` + `ml/scripts/check_rig_against_source.py` — a regression check that runs a clip through the real Three.js rig and correlates the resulting wrist trajectories against the 2D keypoints inside the original `.pkl` (independent ground truth from the dataset authors' pipeline). Currently **r = 0.98** on both wrist height and hand separation, with fingers confirmed articulating. Worth re-running after any change to the skeleton or the converter.
>
> Deps added: `three`, `@react-three/fiber`, `@types/three`.
>
> What this does *not* yet cover: Step 6 (the other words), the typed-text → clip-queue path (Phase 3), and the MediaPipe-landmark retargeting path, which is still needed for the ~126 vocabulary words SignAvatars doesn't cover.

### Step 1 — Pick example words and find their data

Good first words (already have 56+ clean clips each, confirmed in `ml/data/word_manifest.csv`): **yes, no, help, family, good**.

- Manifest: `ml/data/word_manifest.csv` — columns `path, word, video_id, split`, maps every clip to its word.
- Source videos: still on disk at `ml/data/word_videos/dataset/SL/<word>/<clip>.mp4`.
- Existing landmark cache: `ml/data/word_landmarks_cache/<video_id>.npy` — one file per clip, shape `(40, 258)`. That's 40 resampled frames × 258 features per frame, where 258 = 33 pose points × (x, y, z, visibility) + 21 left-hand points × (x, y, z) + 21 right-hand points × (x, y, z). `ml/scripts/extract_word_landmarks.py` is the script that produced these. You're adapting an existing script here, not writing an extractor from scratch.

### Step 2 — Decide: reuse the cached vectors, or re-extract with world landmarks

The cached `.npy` files store MediaPipe's *normalized image-space* landmarks (`result.pose_landmarks`), not `result.pose_world_landmarks` (true metric 3D). Image-space was the right choice for the classifier (scale-consistent regardless of distance from camera); for animation retargeting, world landmarks hold up better since they're real 3D and don't distort with camera perspective.

Practical call: for the hands, the cached normalized landmarks are fine to reuse directly — finger joint angles are relative geometry within the hand and survive reasonably well. For the arm/shoulder pose, re-extract with `pose_world_landmarks` included, since arm position is what places the sign correctly in space.

Concretely: copy `extract_word_landmarks.py` to `extract_word_landmarks_for_animation.py`, and in the per-frame vector builder also read `result.pose_world_landmarks` alongside the existing `result.pose_landmarks` — the `HolisticLandmarker` result already exposes both, so this is a small addition to an existing function, not a new pipeline. Run it against just the 5 example words first.

### Step 3 — Get a rigged 3D avatar into the app

Don't model a character — use a free rigged humanoid export (Mixamo or Ready Player Me, glTF/`.glb` format; Mixamo's auto-rig includes per-finger bones, which you'll need). Load it with `@react-three/fiber` + `@react-three/drei`'s `useGLTF` — the standard way to get a rigged glTF model into a React Three Fiber scene.

Get *something* moving first — even just confirming you can drive one arm bone's rotation from code — before wiring in real retargeted data. That isolates "is the Three.js setup right" from "is the retargeting math right" as two separate things to debug.

### Step 4 — Write the retargeting function

Input: one `(40, 258)` landmark sequence (or the enriched version from Step 2). Output: per-frame rotations for the rig's arm/hand bones.

Core technique: for each pair of connected joints (shoulder→elbow, elbow→wrist, each finger's knuckle→tip chain), compute the direction vector between the two landmark positions, then compute the rotation that aligns the bone's rest-pose direction to that vector — a quaternion "from-to rotation," a standard technique, not something to derive from scratch. Do this per frame across all 40 frames to build an animation clip.

Start with **one word, one arm, no fingers yet** — get a recognizable arm-position motion working before adding finger detail, which is fiddlier (more joints, noisier landmark data during fast finger motion).

### Step 5 — Play it back and compare

Load the retargeted clip onto the avatar and watch it next to the source clip for the same word. The bar is "does a person recognize this as the same sign," not a numeric score. If the arm motion looks right, add fingers next. If it doesn't, the likely culprits are the rotation math (wrong reference axis or rest-pose assumption) or a landmark-ordering mismatch — double-check against the 33/21/21 layout in Step 1.

### Step 6 — Repeat for the other 4 words

Once one word looks right, the other 4 should mostly be the same code against a different input file. If each new word needs hand-tuning to look right, that's a sign the retargeting approach needs to generalize better before scaling to the full 133-word vocabulary — exactly what this spike exists to catch early, before that work is repeated 133 times.

Don't move to Phase 2 until this looks right for all 5 words. Once it does, the Phase 2 step-by-step (playback engine, animation storage format) is worth writing next — it depends on exactly what format Step 4 ends up producing, so it's better written after this spike than guessed at now.

### Datasets worth pulling in before/during the spike

- **[SignAvatars](https://signavatars.github.io/)** (ECCV 2024) — the strongest lead for shortcutting Step 4. First large-scale 3D *mesh* dataset for sign language: 8.34M frames, SMPL-X body + MANO hand parameters, not flat landmarks. Its ASL subset is built from How2Sign — 30,000+ motion sequences with text labels. Free for non-commercial research; request access via [this form](https://docs.google.com/forms/d/e/1FAIpQLSc6xQJJMf_R4xJ1sIwDL6FBIYw4HbVVv_HUgCqeiguWX5XGPg/viewform) — submit early, approval isn't instant. SMPL-X params are much closer to "ready to drive a rig" than the raw MediaPipe landmarks already in `ml/data/word_landmarks_cache/` — worth checking before sinking time into hand-rolled retargeting math.
  - The [GitHub repo](https://github.com/ZhengdiYu/SignAvatars) is tooling (a viewer, generic SMPL-X/MANO body-model templates), not a downloadable pretrained model — the actual motion data only comes via the form above.
  - The motion+text label `.pkl` files come straight from that form — **no need to separately download How2Sign's video corpus** unless you want the motion overlaid on the original footage.
  - Ask specifically about the **Word2Motion** subset — isolated single-word signs labeled via WLASL's word-level text, a closer match to this project's isolated-word use case than the sentence-level How2Sign (Language2Motion) subset.
  - **If access comes through and the vocabulary overlaps**: this changes Step 4. SignAvatars' `.pkl` files store SMPL-X `body_pose`/hand-pose parameters, which are already *joint rotations* on a standard, documented skeleton — not raw positions like the MediaPipe landmarks. That turns Step 4 from "derive rotations from landmark positions" into "remap already-existing rotations from SMPL-X's skeleton onto the chosen rig" — a better-understood problem. Verify with `python vis.py --pkl_file_path <path>` (renders straight from the `.pkl`, no video needed) before committing to this path; keep the MediaPipe-based Step 4 as the default/fallback either way.
  - **Status (2026-09-20)**: repo cloned (`ml/SignAvatars/`, merged alongside the already-downloaded dataset via `robocopy`) and the Word2Motion `.pkl` subset — 1,000 files, ~214 MB, at `ml/SignAvatars/dataset/word2motion/wlasl_pkls_cropFalse_defult_shape/` — is in place. Inspected one file's internal structure directly (Python's `pickletools`, static — didn't need `torch` installed): each holds ~21 frames of `smplx` pose parameters plus an `unsmooth_smplx` pre-smoothing version, 2D keypoint predictions (`pred_2d`, 21 frames × 106 points × x/y), left/right-hand validity masks, and camera parameters (`focal`, `princpt`, `bb2img_trans`) — matches the SMPL-X motion-capture format the repo describes.
  - **Vocabulary overlap, checked against the actual data (2026-09-20)**: the repo clone includes WLASL's own id→gloss file (`ml/SignAvatars/datasets/word2motion/WLASL_v0.3.json`, 21,083 labeled clips across ~2,000 words), so this was cross-checked directly rather than guessed. All 1,000 downloaded `.pkl` files matched a gloss. But the video IDs in this batch only run 295–4304, out of a full range up to 70,379 — this download is an **alphabetical slice covering only "a" through "available" (124 words)**, not the full Word2Motion set. None of the 5 planned spike words (yes, no, help, family, good) are in it — they exist in WLASL (16–22 clips each) but at much higher video IDs, meaning they're almost certainly in a different, not-yet-downloaded part of the same Drive folder. 7 words *do* overlap with the project's 133-word vocabulary and are ready to use right now: **accident** (17 clips), **add** (8), **alone** (10), **animal** (10), **apple** (11), **appointment** (9), **argue** (13). Practical takeaway: either go back to the Drive folder for additional Word2Motion parts covering later IDs (to get yes/no/help/family/good specifically), or swap one of these 7 already-downloaded words in as a bonus 6th spike word to test the SMPL-X-remapping path immediately without waiting on another download.
- **[How2Sign](https://how2sign.github.io/)** — source of SignAvatars' ASL data. 80+ hours of *continuous* ASL (full sentences, not isolated words) with English transcripts; a 3-hour subset has true multi-view 3D pose (Panoptic Studio). Useful later for smoothing transitions between signed words, beyond this spike's scope.
- **[WLASL](https://github.com/dxli94/WLASL)** — another isolated-word ASL video dataset, 2,000 words / ~21,000 clips, same C-UDA academic license family as ASL Citizen/MS-ASL already in use. Not 3D, so doesn't help retargeting directly — relevant only if more clips per word or a larger vocabulary becomes worth revisiting.

## Phase 2 — Playback engine

- Build the avatar viewer as a React Three Fiber (Three.js) component — the standard, well-supported choice for a rigged, animated 3D character in a browser, and it slots into the existing React/Expo-web stack without a new framework.
- Settle on a storage format for retargeted animations per word — glTF animation clips are the standard choice and play natively in Three.js; a custom JSON keyframe format also works if simpler to generate from the retargeting script.
- Build the sequencer: given an ordered list of words, load and play each word's clip in sequence, with a short blend/transition between clips so the avatar doesn't visibly snap between end-of-sign and start-of-next-sign poses.
- Batch-run the retargeting script from Phase 1 across the full target vocabulary chosen in Phase 0.

## Phase 3 — Text input → sign sequence

- Tokenizer: lowercase, strip punctuation, split into words.
- Look each word up against the vocabulary; a hit queues that word's clip.
- A miss (out-of-vocabulary word) falls back to fingerspelling it — this can reuse the existing letter-recognition handshape data/visuals, just run in reverse (render a handshape instead of recognizing one).
- Optional, and genuinely improves perceived quality without pretending to solve real ASL grammar: a small rule-based cleanup pass that drops words ASL typically omits (articles like "the"/"a", copulas like "is"/"am") before lookup. Cheap to build, meaningfully less awkward output.

## Phase 4 — UI/UX

This is where a design pass (Claude Design or otherwise) actually fits — it's a visual/interaction design problem, not a motion-generation one.

- New screen: text input, a "Sign it" trigger, the avatar viewer.
- Playback controls: replay, per-word scrubbing, speed.
- Clear feedback on which typed words were signed vs. fingerspelled vs. dropped, so the limitation is visible rather than silently papered over.
- Decide where this lives in navigation — a third Translator mode alongside Letters/Words, or its own top-level flow from Role Select.

## Phase 5 — Remove the classroom module

- Remove Student/Teacher/Admin dashboard screens and their routes.
- Simplify or remove the role-based Auth flow per the Phase 0 decision.
- Rework Role Select (or replace it) now that "which role are you" no longer branches into three dashboards.

## Phase 6 — Manuscript & documentation

- Rewrite objectives, scope and limitations, and system architecture to describe the new module honestly (gloss-based lookup + fingerspelling fallback, not generative SLP).
- Add related-systems citations: MMS-Player (open-source, Blender-based sign avatar synthesis) and sign.mt's real-time avatar are both directly comparable prior art.
- New architecture/DFD diagrams covering the retargeting pipeline and the playback engine.

## Phase 7 — Evaluation

Signing-avatar output can't be evaluated the way letter/word recognition accuracy was. Worth planning early, since it drives what data to collect during testing:

- Intelligibility review by Deaf/HoH users or an ASL instructor — rate whether each played-back sign is recognizable. This is the strongest, most defensible evaluation method for a thesis panel.
- Side-by-side comparison against the source recording as a cheaper proxy if reviewer access is limited.
- A basic comprehension check (show avatar output, ask viewers what word/phrase was signed) as a supplement.

## Prior art worth citing

- **MMS-Player** — open-source (GPL-3.0), Blender-based sign language avatar synthesis from a gloss-based representation. Closest existing system to what's proposed here. https://arxiv.org/html/2507.16463
- **sign.mt** — real-time, in-browser signing avatar. https://sign.mt
- Gloss-based text-to-sign is an established pipeline in the sign language production literature (text → gloss → pose → avatar); framing the project this way, explicitly, is both accurate and gives it a clear place in that literature for Chapter II.

## Suggested order of operations

Phase 1 (prove retargeting works) → Phase 0 decisions finalized in parallel → Phase 2 (playback engine) → Phase 3 (text/gloss) → Phase 5 (cut classroom module) → Phase 4 (UI polish) → Phase 6 (manuscript) → Phase 7 (evaluation, planned early, executed once the build is stable).

Phase 1 goes first even though it's numbered after Phase 0 above — the adviser conversation and the technical spike can and should happen at the same time, since the spike's result (does retargeting actually look good?) is itself useful evidence for that conversation.
