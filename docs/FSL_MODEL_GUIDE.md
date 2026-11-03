# Handoff: train the FSL-105 word model

Build a Filipino Sign Language word recogniser using the same pipeline as the
existing ASL word model. The dataset is already on disk; nothing needs downloading.

This matters for the project beyond "another model": KamustaSign is a Philippine
capstone, and FSL is the language its actual users sign. An ASL-only translator
is a reasonable technical demonstration; an FSL model is the one that fits the
stated problem.

---

## 1. What you have

`ml/data/FSL-105 A dataset for recognizing 105 Filipino sign language videos/`

```
clips/        one folder per class, named by its label (clips/GOOD MORNING/<n>.MOV)
clips.zip     379 MB, 2,130 .MOV clips as clips/<id_label>/<n>.MOV
labels.csv    105 classes: id, label, category
train.csv     1,704 rows: vid_path, id_label, label, category
test.csv       426 rows: same columns
```

The class folders were the class number (`clips/0`, as in clips.zip and in
train.csv/test.csv's `vid_path`) until 2026-11-02, when they were renamed to
their labels so recorders can find a word. labels.csv maps one to the other.
`build_fsl_manifest.py` reads the folder names from labels.csv; video_ids keep
the number, so cached landmarks and earlier models still match. `clips/clips/`
is a byte-for-byte duplicate of the 2,130 original clips (left over from
unzipping); nothing reads it.

- **105 classes**, 18–22 clips each (median 20), well balanced
- **10 categories**: COLOR (13), CALENDAR (12), then GREETING, SURVIVAL, NUMBER,
  DAYS, FAMILY, RELATIONSHIPS, FOOD, DRINK (10 each)
- Clips are `.MOV`, not `.mp4`

Compared with the ASL word model: 105 classes vs 133, but only ~20 clips per
class against ASL's ~43. **Half the data per class.** Expect lower accuracy than
the ASL model's 73% top-1 and don't read that as a bug — it's the sample size.

## 2. Check this before training anything

**The provided train/test split is probably signer-dependent.** The filename stem
in `clips/<class>/<n>.MOV` runs 0–21 consistently across every class, which reads
like a performer index — roughly 22 people each signing each word once. Values
0–21 appear in **both** `train.csv` and `test.csv`, all 22 overlapping.

If that reading is right, the same signers are in both splits, and any accuracy
you measure is inflated — it says how well the model recognises *people it has
already seen*, not how it behaves when a panel member signs at it. The ASL word
model has exactly this flaw (random shuffle within each class, no signer column),
and it is why its measured 73% feels worse in live use.

So, first task: **confirm what `<n>` means.** Check the FSL-105 paper or dataset
README. Then:

- If `<n>` is a signer — build your own split holding out specific signer numbers
  entirely (e.g. train on 0–16, validate on 17–18, test on 19–21). Report that
  number as the headline. It will be lower than the provided split's and it will
  be the honest one.
- If `<n>` is just a take index with signers unidentifiable — use the provided
  split, and say plainly in the manuscript that signer-independence could not be
  established. That is a limitation, not a failure.

Either way, **the dataset ships no validation split** and `train_word_classifier.py`
expects `X_val`. Carve one out of train; don't validate on test.

## 3. Pipeline

Identical in shape to the ASL word model. Copy the scripts rather than editing
them in place, so the ASL pipeline keeps working — same convention as
`NUMBERS_MODEL_GUIDE.md`.

```
clips.zip
  → extract
  → build_fsl_manifest.py        → data/fsl_manifest.csv   (path, word, video_id, split)
  → extract_fsl_landmarks.py     → data/fsl_landmarks_cache/<video_id>.npy   (40, 258)
  → consolidate_fsl_landmarks.py → data/fsl_landmarks.npz  (40, 384)
  → train_fsl_classifier.py      → models/fsl_sequence_classifier_seed{0..3}.keras
  → export + tensorflowjs        → public/fsl-model/model{0..3}/
```

### Step 1 — Extract and build the manifest

Unzip `clips.zip` in place. Then write `build_fsl_manifest.py` producing the same
four columns `extract_word_landmarks.py` already expects:

```
path, word, video_id, split
```

- `path` — relative to wherever you point `DATA_DIR`
- `word` — use the `label` column from the CSVs (e.g. `GOOD MORNING`), lowercased
  for consistency with the ASL vocabulary
- `video_id` — must be unique across the whole dataset. `clips/CORRECT/6.MOV` and
  `clips/RED/6.MOV` both have stem `6`, so **use `<class id>_<n>`**, not the stem
  alone, or the landmark cache will overwrite itself and you will silently train
  on the wrong data.
- `split` — train/val/test per your decision in section 2

### Step 2 — Landmark extraction

Copy `ml/scripts/extract_word_landmarks.py` to `extract_fsl_landmarks.py` and
change the manifest path and `CACHE_DIR`. Everything else carries over: it
resamples each video to 40 frames and writes a `(40, 258)` array — 33 pose ×
(x, y, z, visibility) + 21 left-hand × (x, y, z) + 21 right-hand × (x, y, z).

Two things specific to this dataset:

- **`.MOV` files.** OpenCV normally reads QuickTime fine, but verify on a handful
  before launching a multi-hour run. If `cv2.VideoCapture` returns no frames,
  that's a codec problem, not a code problem.
- **Phone-shot video is often portrait.** The extractor resizes every frame to a
  fixed 640×480 before detection (it has to — Holistic keeps state that assumes
  constant frame size). A portrait clip squeezed into landscape distorts the
  hand geometry. Check the source aspect ratios; if they're portrait, letterbox
  rather than stretch.

Budget time: ~2,130 videos through Holistic is on the order of an hour or two.
It is resumable — it skips `video_id`s already cached.

### Step 3 — Consolidate

Copy `consolidate_word_landmarks.py`. It calls `ex.normalize_sequence()`, which
now returns **384** features, not 258: the original body-normalised values plus
the per-hand wrist-relative blocks.

Keep that. It is the single biggest win in this project's history — it took the
ASL word model from 52.2% to 73.0% top-1 by making handshape legible to the
model instead of burying it under arm position. The wins were largest exactly
where you'd expect: `pink` 22%→78%, `work` 12%→75%, `yes` 38%→88%.

Drop the ASL vocabulary lock (`LOCK_TO_CURRENT_VOCAB`) — it exists to pin the
133 ASL words and is meaningless here.

### Step 4 — Train

Copy `train_word_classifier.py`. The architecture needs no changes: BiGRU(128) →
BiGRU(64) → Dense(128) → softmax, `unroll=True`, class weights on, cosine LR,
early stopping. `FEATURES_PER_FRAME` already reads from the data.

Train four seeds (0–3); the app averages a 4-model ensemble, which beat any
single model by several points on ASL.

With ~20 clips per class, watch for overfitting harder than you would on ASL.
If the gap between train and validation accuracy is large, reach for more
augmentation before reaching for a bigger model.

On the GPU (WSL, the same environment as the ASL model), after consolidating
on Windows: `wsl -d Ubuntu -- bash /mnt/c/Users/USER/Documents/kamustasign/ml/train_fsl_seeds_gpu.sh 0 1 2 3`
(add `ivan paul ry` for the one-recorder-left-out runs). On the 2026-11-02
data (3,188 training clips) a seed took 6–7 minutes, no faster than the CPU:
the unrolled GRUs and small batches keep the GPU mostly idle. Run it from
your own terminal; Claude Code stops long background jobs when the PC runs low
on memory.

### Step 5 — Export, convert, deploy

Same two-venv dance:

```powershell
.\venv\Scripts\python.exe scripts\export_fsl_model_for_conversion.py 0   # and 1, 2, 3
.\venv-convert\Scripts\python.exe -m tensorflowjs.converters.converter `
    --input_format=tf_saved_model `
    models\fsl_sequence_classifier_savedmodel models\fsl_tfjs_model
```

**Add `--quantize_float16=*` this time.** The ASL models are ~83 MB each, 332 MB
for the ensemble, and the app stalls on first load because of it. Float16 roughly
halves that for negligible accuracy cost. Measure the accuracy delta before and
after so you can state it.

Deploy into an **empty** `public/fsl-model/model{0..3}/`. Do not `Copy-Item -Force`
into a folder that already has shards — that left 88 orphaned `.bin` files and
555 MB of dead weight in the ASL models, because `-Force` overwrites matching
names but never removes shards a newer conversion no longer produces.

## 4. Wiring it into the app

The Words tab should get an **ASL / FSL** toggle, mirroring the Letters/Numbers
toggle just added to Fingerspelling. The pattern is already there to copy:

- `src/ml/modelLoader.ts` — `loadAlphabet(alphabet)` caches per key and resolves
  a different web directory per key. Do the same for the word models: a
  `loadWordModels(language)` keyed `"asl" | "fsl"`, serving `/word-model/` and
  `/fsl-model/`.
- `src/screens/FingerspellingScreen.tsx` — a thin wrapper owning the toggle and
  passing it down, leaving the screen beneath untouched.

**Critical:** switching ASL↔FSL must not remount the camera or rebuild the
MediaPipe graph. Hold the models in refs and swap them in an effect keyed on the
language, exactly as `LiveTranslatorScreen` now does for `alphabet`. Rebuilding a
landmarker while the previous one is still tearing down deadlocks MediaPipe's
WASM runtime — see `useSharedLandmarkers.ts` for the full story and the
serialisation that fixes it.

## 5. Definition of done

1. `fsl_landmarks.npz` has shape `(N, 40, 384)` and 95 classes (105 with
   `consolidate_fsl_landmarks.py --keep-numbers`; since 2026-11-02 the number
   words one–ten are taught by the FSL numbers model instead).
2. Four seeds trained; ensemble top-1 and top-5 recorded on held-out test.
3. **The split used is documented**, and if it is signer-dependent, that is
   stated explicitly rather than quietly.
4. Per-class accuracy produced (copy `per_class_accuracy.py`) so there is a
   demo-safe word list. Note that at ~4 test clips per class the per-class
   numbers are very noisy — treat the top and bottom bands as signal and the
   exact ordering as mostly chance.
5. Models quantised, deployed to a clean folder, and the Words tab switches
   ASL↔FSL without the camera dropping.
6. `npx tsc --noEmit` shows no new errors. There are 12 pre-existing ones in
   `modelLoader.ts`, `TestModelScreen.tsx` and `AuthScreenShell.tsx` — unrelated.

## 6. What to report back

- Ensemble top-1 / top-5, and whether the split was signer-independent
- Clips that failed landmark extraction (no hand or no pose detected) — this
  number predicts live behaviour better than accuracy does
- Whether `.MOV` decoding or portrait aspect ratios caused trouble
- The float16 accuracy delta

---

## 7. Results (2026-10-06)

### Split: what `<n>` actually is

`<n>` is **not** a signer. FSL-105 has **four signers** (A, B: woman, man;
C, D: man, woman), recorded in contiguous blocks of ~5 takes, in the same
order in every class (A ≈ 0–4, B ≈ 5–9, C ≈ 10–14, D ≈ 15–19+). Boundaries
drift by a take or two per class. The dataset docs never state the signer
count; this was established by inspecting contact sheets of every class.
`build_fsl_manifest.py` recovers the signer per clip (4-way contiguous
segmentation of a head-crop appearance embedding); every class with an uneven
cut was checked by eye. The provided train/test split has all four signers in
both halves, so it is signer-dependent.

### Accuracy

| Split | top-1 | top-5 |
|---|---|---|
| **Deployed 4-seed ensemble since 2026-11-02**: 95 words (one–ten moved to FSL numbers), + our recordings of 22 words (see EVALUATION.md §3), signer D unseen (484 clips) | **86.8%** | **98.1%** |
| 2026-11-01 4-seed ensemble (TUESDAY/WEDNESDAY recordings), same 95 words / all 105 | 81.8% / 82.0% | 98.6% / 98.7% |
| 2026-10-06 4-seed ensemble, same 95 words / all 105 | 75.6% / 75.3% | 95.0% / 94.9% |
| Leave-one-signer-out, mean of 4 folds (1 seed each) | 76.7% (65.7–82.6) | 95.4% |
| Provided split (signer-dependent), 1 seed | 98.1% | 99.8% |

The 21-point gap between the provided split and held-out-signer accuracy is
the size of the signer-dependence inflation. **Report the signer-independent
numbers.** Signer D is the hardest fold, so the deployed models' 75% is near
the bottom of the LOSO range. With only four signers, a panel member is a
fifth signer; expect roughly the LOSO figure, not the provided-split one.

Validation (one take per class per training signer) reaches ~96%; the drop
to ~75% on an unseen signer is the generalisation gap, not overfitting to
takes.

### Pipeline deviations from sections 3–4, and why

- **Letterbox, not stretch.** All clips are landscape 640×360, 60 fps (no
  portrait, `.MOV` decodes fine). The ASL extractor's 640×480 resize would
  stretch them 33% vertically; the FSL extractor pads instead.
- **Every 2nd frame** (60 → 30 fps), matching webcam rate and halving runtime.
- **Trim to the hand-active span.** Clips are 4 s; hands rest below frame
  for ~1.5 s at each end, so the sign filled ~10 of 40 frames. The cache
  keeps full-length sequences; consolidation trims to first..last frame with
  a hand (±3 frames) before resampling. The app mirrors this
  (`trimToHandSpan`, FSL only).
- **Temporal augmentation** (random sub-window resample each epoch):
  +13 points on the held-out signer (72% vs 59%, two seeds each). Kept on.
- The ASL trainer uses ReduceLROnPlateau, not cosine LR (section 3 was
  wrong); kept as-is for parity.

### Other report-back items

- **Extraction failures:** 0 unreadable clips; 0 with no pose; **1** with no
  hand in any frame (`27_7`). Hands are detected only while signing, as
  expected for this framing.
- **float16:** 0 of 534 test predictions change; max probability shift
  1e-3; top-1/top-5 identical. Each model 42 MB (vs ~83 MB ASL), 168 MB for
  the ensemble, in a fresh `public/fsl-model/`.
- **Per-class:** 64 / 105 words at 100% on the held-out signer (~5 clips
  each - noisy). 13 words at 0%, including `hello`, `good evening`
  (→ good afternoon), `two` (→ one), `march` (→ february), `pink` (→ red),
  `girl`, `blue`, and several weekdays. Avoid those in a demo. Full table:
  `python scripts/test_fsl_ensemble.py --per-class`.
- **App:** Words tab has an ASL/FSL toggle (`WordsScreen` →
  `WordTranslatorScreen language=`). Verified headlessly with an FSL clip as
  the fake camera: switching ASL↔FSL↔ASL keeps the same live camera track
  and `<video>` element, and the FSL ensemble classifies (`good morning`
  69% top-1 on one take; another take had it 4th - live recording
  alignment matters). `tsc`: 5 errors, all pre-existing
  (`TestModelScreen`, `AuthScreenShell`); the 7 in `modelLoader.ts` went
  away with the per-language rewrite.

### Reproduce

```
python scripts/build_fsl_manifest.py
python scripts/extract_fsl_landmarks.py 0 2   # and 1 2 (parallel shards)
python scripts/consolidate_fsl_landmarks.py
python scripts/train_fsl_classifier.py 0      # 1, 2, 3; also --split loso:A..D, --split provided
python scripts/test_fsl_ensemble.py [loso|provided] [--per-class]
python scripts/fsl_float16_delta.py
python scripts/export_fsl_model_for_conversion.py 0   # 1, 2, 3, then convert with --quantize_float16=*
```
