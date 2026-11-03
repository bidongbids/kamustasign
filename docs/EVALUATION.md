# LCSign — model evaluation

All figures are for the models **deployed in `public/`** (as of 2026-10-21; numbers and FSL letters 2026-10-28; ASL words 2026-11-02, v6 without 23 look-alike words; FSL words 2026-11-02, second retrain that day),
produced by the scripts named in each section. Re-run them after any retrain;
numbers here go stale otherwise.

| Model | Classes | Main test | Top-1 | Top-5 |
|---|---|---|---|---|
| ASL letters (since 2026-10-28) | 26 + del/space | **ASL-HG signers held out**, 2 per fold (25,983 photos) | **93.9%** | 100% (top-3) |
| ASL letters | | **105 WLASL webcam clips** of 21 letters | **64.8%** per clip | 56.0% per frame |
| *ASL letters before 2026-10-28* | | *10 ASL-HG signers / the same WLASL clips* | *71.5% / 34.3% per clip* | |
| ASL words (4-seed ensemble, v6 minus 23 look-alikes, 2026-11-02) | 321 | Test split + 2 held-out GISLR signers (8,766 clips, none trained on) | 62.6% | 84.1% |
| ASL words | | **Webcam clips of 5 ASL Citizen signers never seen in training** (1,366 clips, 229 words, see §2) | **84.6%** | 96.7% |
| *ASL words, v6 with all 344 words (2026-10-29)* | | *9,579 test / 1,435 webcam clips* | *58.8% / 82.4%* | *82.8% / 96.4%* |
| *ASL words, v5 (deployed earlier on 2026-10-29)* | | *The 9,170 / 809 of those clips neither model trained on* | *57.6% / 63.4% (v6: 58.0% / 79.9%)* | *82.5% / 87.6% (v6: 82.5% / 96.4%)* |
| FSL-105 words (4-seed ensemble, 2026-11-02 evening) | 95 (one–ten are in FSL numbers) | **Signer D, never seen in training** (484 clips) | **90.3%** | 99.4% |
| *FSL-105 words, 2026-11-02 morning / 2026-11-01 / 2026-10-06 models* | | *the same 484 clips and 95 words* | *86.8% / 81.8% / 75.6%* | *98.1% / 98.6% / 95.0%* |
| ASL numbers (2026-10-28) | 0–9 | **Webcam clips of ASL Citizen / WLASL / MS-ASL signers** (338 clips) | **97.9%** per clip | 83.1% per frame |
| ASL numbers | | ASL-HG, 2 signers held out per fold (10,000 photos) | 100% | |
| FSL numbers (2026-10-28) | 1–10 | **FSL-105, one signer held out per fold** (202 clips) | **97.0%** per clip | 90.6% per frame |
| FSL letters (2026-10-28) | 26 | Held-out photos, same dataset (10,765) | 98.9% | 99.6% (top-3) |

The bold rows are the ones to quote: they test people and cameras the model
never saw, which is how the app is actually used. Same-distribution test
accuracy (97.6% letters, 98.1% FSL "provided" split) mostly measures how well
the model memorises the training signers.

## 1. ASL letters

**Replaced 2026-10-28.** The model below (the original) was swapped for one
from `ml/scripts/train_handshape_classifier.py asl-letters`: the same
in-graph hand normalisation as the numbers models (section 3b), trained on
1,000 ASL Alphabet photos per class **plus** ASL-HG's A–Z from the other
signers. Measured on things neither model trained on:

| Test | Old model | New model |
|---|---|---|
| ASL-HG, 2 signers held out per fold (new model) / all 10 (old) | 71.5% | **93.9%** (folds 92.1–95.8%) |
| 105 WLASL webcam clips of 21 letters, per clip | 34.3% | **64.8%** |
| … reaching the 80% pass on the right letter at least once | 18.1% | **70.5%** |

How much is the normalisation and how much the extra signers: trained on the
ASL Alphabet photos only, the new features score 75.3% on the 10 ASL-HG
signers (old 71.5%). Most of the gain is the extra people. The single
ASL Alphabet signer makes N, T and D in a way new people don't (0–10% for
them before ASL-HG was added).

Still weak on webcam clips: **G, H, P, Q** (0 of 5 each, for both models:
sideways and downward handshapes), **J** (moves). On held-out ASL-HG
signers: J 72% (as I), N 78% (as M), I 80%, Z 83%. Per-letter figures:
`models/diagnostics/asl-letters_per_sign.csv`. The star reference for ASL
letters now comes from that file.

The rest of this section describes the original model, kept for the record.
`letter_model_diagnostics.py` still scores that one
(`models/asl_landmark_classifier.keras`, raw input).

`ml/scripts/letter_model_diagnostics.py` → `ml/models/diagnostics/letters_summary.json`, `letters_per_class.csv`

| Test set | Photos | Top-1 | Top-3 | Pass rate* |
|---|---|---|---|---|
| Held out from the training dataset | 9,786 | 97.6% | 99.5% | 94.7% |
| 10 other signers (P1–P10) | 5,197 | 71.5% | 82.8% | 66.3% |

\* Pass rate: recognised as the right letter at ≥ 80% confidence, the
practice pass rule (`PASS_CONFIDENCE`).

- Per signer: 63.8% – 77.1% top-1. MediaPipe found a hand in 99.9% of photos,
  so the gap is the classifier, not hand detection.
- Weakest letters for new signers: **N** (read as S), **T** (as A), **D** (as
  X), **M** (as S), **C** (as O). These are closed-fist shapes that differ
  only in thumb position, which a single still frame of 21 landmarks barely
  separates.
- **J and Z involve motion**. A one-frame model can't read them; Z scores 0%
  for new signers. Practising them should rely on the reference video.

## 2. ASL words (321 since 2026-11-02; 344 before)

`ml/scripts/word_model_diagnostics.py asl` → `ml/models/diagnostics/asl_per_word.csv`, `summary.json`; PDF: `word_diagnostics_report.py`

**2026-11-02: 23 look-alike words removed (344 → 321), no retraining.** Each was
right under 50% of the time (v6 on the 9,579 test + 1,435 webcam clips) and
most of its misses went to one word whose sign looks alike on the reference
videos (the 2026-11-01 look-alike check), so the model can't learn them apart
with this data: animal (→ have), bee (→ close), cereal (→ pizza), cheek (→ eye),
chin (→ say), feet (→ down), finger (→ wait), flag (→ before), hear (→ ear),
jacket (→ bath), kiss (→ home), kitty (→ cat, the same sign), lips (→ say),
make (→ year), mouth (→ tooth), my/mine (→ please), pen (→ pencil), penny
(→ think), pretend (→ will), ride (→ chair), stay (→ same), tongue (→ duck),
wake (→ awake, the same sign). `ml/scripts/prune_asl_word_model.py` dropped
their columns from each seed's last layer, which is exactly v6's
probabilities with those words taken out and the rest renormalised (checked:
max |Δp| 1e-6 per seed); clips of removed words left the test and webcam sets.
`REMOVED_WORDS` in `consolidate_combined_words.py` keeps them out of any
retrain. v6 originals: `models/asl_combined_v6_person/` (with
`asl_per_word_v6.csv`) and `data/combined_word_landmarks_v6_344.npz`.

| On the clips of the 321 words | v6 (344 outputs) | 321 outputs |
|---|---|---|
| Test + webcam (10,132 clips) | 61.9%* | 65.6% |
| Test split (8,766) top-1 / top-5 | | **62.6% / 84.1%** |
| Webcam, 5 unseen people (1,366) top-1 / top-5 | | **84.6% / 96.7%** |
| Words under 50% (test + webcam) | 88 of 344 | 62 of 321 |

\* v6's 61.9% is on all 11,014 clips of 344 words. The look-alikes that stay
gain most: say 31% → 81%, awake 20% → 56%, have 66% → 78%, same 62% → 74%,
bath 72% → 85%, ear 84% → 92%, pencil 54% → 62%. TF.js parity of the new
`public/word-model/model0` against the Keras seeds: max |Δp| 5e-7, 100% top-1
agreement on 1,500 test clips. Not re-measured: the out-of-vocabulary
gate (§ OOV), whose "unknown" clips now include the removed words' signs.
think, read and mad stay although each has a look-alike (first, dance, wolf):
they are among the most common words. The figures below this point are v6's,
with all 344 words.

**Retrained again 2026-10-29 (v6): every webcam clip on disk, split by
person.** Only the ~8 clips per word that the reference picker tried had
ever had landmarks extracted; `extract_webcam_word_clips.py` extracted the
other 3,403 ASL Citizen / WLASL / MS-ASL clips. `consolidate_combined_words.py
--webcam-extra` now trains on every webcam clip except those of five ASL
Citizen test-split participants (P35, P9, P48, P15, P42; `HELDOUT_SIGNERS`
in `word_model_diagnostics.py`). Their clips are kept out completely,
including 474 that were in our own manifest's train/val split. Webcam
training clips went from 1,483 to 4,785 (plus the 197 YouTube segments, all
×2); the weakest words' median went from about 4 to 25. Before = v5 (below,
`models/asl_combined_v5_webcam`); after = `models/asl_combined_v6_person`.
`compare_word_models.py --skip models/asl_combined_v5_webcam/seen_clips.json`
scores both on clips **neither** trained on:

| Metric | v5 | v6 |
|---|---|---|
| Test split, clips neither trained on (9,170) top-1 / top-5 | 57.6% / 82.5% | 58.0% / 82.5% |
| … macro top-1 / macro F1 | 62.0% / 0.598 | 61.1% / 0.591 |
| … words at 100% / ≥ 80% / < 50% / 0% | 48 / 94 / 103 / 8 | 44 / 89 / 113 / 11 |
| … shown at the app's 40% gate / precision when shown | 62.3% / 76.0% | 62.1% / 76.8% |
| **Webcam clips of the five held-out people**, neither trained on (809) top-1 / top-5 | 63.4% / 87.6% | **79.9% / 96.4%** |
| … the 180 clips of words v5 read worst (≤ 25% in its webcam check) | 20.6% / 66.1% | 59.4% / 91.1% |
| … the other 629 | 75.7% / 93.8% | 85.7% / 97.9% |
| … shown **and** right at the video call's 60% gate | 38.9% | 60.4% |

v6 alone, on everything it never trained on:

- **All 1,435 webcam clips of the five people (242 words): 82.4% top-1,
  96.4% top-5**, shown and right at 60%: 62.6%. v5 trained on 626 of these
  clips, so it has no comparable figure.
- Full test split (9,579): 58.8% / 82.8%, macro top-1 61.7%, macro F1
  0.602. 24 / 92 / 106 / 6 words at 100% / ≥ 80% / < 50% / 0%. At the 40%
  gate it shows a word for 62.9% of clips, and 77.3% of those are right.
  Mean confidence is 0.67 when right and 0.34 when wrong.

**Reading it:** the webcam figure is the first one here from people the
model never saw (v5's webcam rows below were mostly same-signer). It is
still ASL Citizen footage (adults, one recording app, mostly plain rooms),
so it speaks to new *people* more than to new cameras, lighting or children.
The five people sign 242 of the 344 words; the other 102 have no webcam
figure. The phone-clip test split did not move (top-1 +0.4, macro −0.9
points: noise, at a few clips per word).

Most-confused pairs now (all 9,579 test clips): my/mine→please 23,
awake→wake 17, because→ear 17, pen→pencil 16, finger→wait 16, ride→chair 15,
penny→think 15.

Reference videos were re-picked with v6 (321 of 332 confirmed by the model).
**"wake" lost its video:** its only clips are filed as "wake up", which v6
reads as "awake" (a near-identical sign), and a clip found only under
another gloss needs the model's confirmation.

### v5 (deployed and replaced on 2026-10-29)

**Retrained 2026-10-29** with webcam-domain data (`consolidate_combined_words.py
--webcam-extra`, then a hash split): half of each word's held-out webcam clips (1,483, split by
clip hash) plus 197 verified YouTube dictionary segments moved into training.
Before = the ensemble deployed 2026-10-20 (`models/asl_combined_v3_flip`);
after = `models/asl_combined_v5_webcam`. `compare_word_models.py` scores both on
the same clips:

| Metric | Before | After |
|---|---|---|
| Test clips, without the 408 moved into training (9,171) top-1 / top-5 | 57.8% / 82.3% | 57.6% / 82.5% |
| *All 9,579 test clips (408 of them trained on by the new model)* | *58.6% / 82.7%* | *59.2% / 83.2%* |
| Macro top-1 / macro F1 *(all 9,579; the new model's are flattered by the 408)* | 62.1% / 0.597 | 65.1% / 0.633 |
| Words at 100% / ≥ 80% / < 50% / 0% *(all 9,579; the new model's are flattered by the 408)* | 30 / 99 / 101 / 6 | 47 / 113 / 90 / 3 |
| Shown at the app's 40% gate / precision when shown *(all 9,579; the new model's are flattered by the 408)* | 65.0% / 76.4% | 63.6% / 77.3% |
| Mean confidence when right / wrong *(all 9,579; the new model's are flattered by the 408)* | 0.69 / 0.36 | 0.68 / 0.35 |
| **Held-out webcam clips** (the half kept out, 1,630, trimmed like the app) top-1 / top-5 | 30.9% / 53.1% | **61.5% / 85.6%** |
| … the 976 clips of words the old model read worst (≤ 25%) | 4.9% / 30.0% | 47.4% / 80.1% |
| … the other 654 | 69.6% / 87.5% | 82.4% / 93.7% |
| … **signer-disjoint** clips only (21) | 33.3% / 61.9% | **66.7%** / 81.0% |

**Caveat for the webcam rows:** the two webcam halves were split by clip, not
by person, so 1,609 of the 1,630 held-out clips are by a signer who also has
clips in training (WLASL `signer_id` / ASL Citizen participant). That
inflates the gain. Only 21 held-out clips are by someone the model never
saw. They improve the same way (weak words 0/8 → 6/8), but 21 clips is too
few to quote a number from. A live webcam test with new people is the
honest check.

The test split is mostly Google Isolated SLR (GISLR) portrait phone clips,
which flatters the 211 words learned mainly from that dataset. It did not
move (57.8% → 57.6%), so the extra webcam data neither cost nor gained
accuracy there. **Correction (2026-10-29):** `--webcam-extra` drew its
clips from every webcam clip not used for training, which included 408 of
the 865 webcam clips in the test split itself; the first figure published
for the new model (59.2%) counted them. The rows above leave them out. The
webcam rows were never affected (they skip every moved clip).

v5's most-confused pairs (true → predicted, clips): awake→wake 21, milk→car 20,
my/mine→please 20, lips→say 17, cheek→eye 16, pen→pencil 16, because→ear 16,
finger→wait 16. Several are near-identical signs or share a handshape and
location.

## 3. FSL-105 words

`ml/scripts/word_model_diagnostics.py fsl` → `fsl-105_per_word.csv`

Since 2026-11-02 the word model has **95 words**: FSL-105's number words
one–ten are left out (`consolidate_fsl_landmarks.py`), because the app
teaches and recognises 1–10 with the FSL numbers model (§3b), which still
reads those clips from the manifest. The earlier models are scored here on
the same 95 words, their number outputs dropped.

| Metric | Since 2026-11-02 evening | 2026-11-02 morning | 2026-11-01 model | 2026-10-06 model |
|---|---|---|---|---|
| Test | every clip from signer D of the 95 words (484), never seen in training | same | same | same |
| Top-1 / top-5 | **90.3% / 99.4%** | 86.8% / 98.1% | 81.8% / 98.6% | 75.6% / 95.0% |
| Macro F1 | 0.886 | 0.850 | 0.799 | 0.727 |
| Shown at 40% gate / precision when shown | 99.4% / 90.6% | 98.1% / 87.8% | 94.8% / 85.0% | 86.4% / 82.8% |
| Words at 100% / 0% / below 50% | 80 / 5 / 8 | 68 / 6 / 8 | 64 / 7 / 15 | 58 / 11 / 22 |

(With all 105 words, as reported on 2026-11-01: 82.0% / 98.7% for the
2026-11-01 model, 75.3% / 94.9% for the 2026-10-06 one, on 534 clips.)

### 2026-11-03: ASL clips for COLD and HELLO, tried and not deployed

95 ASL videos had been copied into the FSL COLD (59) and HELLO (36) folders,
from ASL Citizen, WLASL and MS-ASL. In the reference videos the two languages'
COLD signs look alike, and FSL-105's HELLO is the same forehead salute as
WLASL's (most ASL Citizen HELLOs are a wave). They were trained in as
training-only clips (signer "asl"). The 13 signed mainly with the left hand
were flipped, since the model expects right-handed signing. This was a
4-seed GPU run on otherwise identical data.

| On signer D (484 clips) | Deployed (2026-11-02 evening) | With the ASL clips |
|---|---|---|
| Ensemble top-1 / top-5 | **90.3% / 99.4%** | 89.5% / 98.8% |
| Seeds | 86.8 / 85.7 / 87.6 / 88.6% | 88.2 / 88.2 / 89.5 / 87.0% |
| HELLO (kumusta) | 1/5 (as pinsan) | 2/5 (as pinsan) |
| Other words read as COLD | 0 | 5: CRAB 5/5 -> 1/5, CORRECT 2/6 -> 0/6 |

Each seed scored higher on its own, but the ensemble scored lower. The ASL
COLD clips widened "cold" into CRAB and CORRECT, and FSL COLD was already
5/5. **Not deployed.** `INCLUDE_BORROWED_ASL = False` in
`build_fsl_manifest.py` keeps them out of the manifest; the code and the flip
list stay. The run is in `ml/models/fsl_experiments_2026-11-03_asl_clips/`,
and the deployed model's files are also archived in
`ml/models/fsl_v4_2026-11-02b/`. The better fix for HELLO is FSL recordings:
the team hasn't recorded it.

Later on 2026-11-03 the ASL files were deleted from the FSL COLD and HELLO
folders: the 95 videos, plus 390 GISLR .parquet and 4 .npy landmark files in
HELLO that were never used. Their landmark caches were deleted too. Every
file was a byte-identical copy of one in `ml/data/ASL_word_dataset/cold` or
`/hello`; the 12 numbered COLD videos are the `wlasl_` files there. To try
again, copy the videos back and set the flag.

### 2026-11-02 evening: 29 more words from our recorders

ivan, paul and ry recorded 29 more words on 2026-11-02 (1,189 clips): the
twelve months (APRIL 16, FEBRUARY 15 and JUNE/JULY 30 clips; the rest 45-46),
blue, green, yellow, orange, pink, good morning/afternoon/evening, I'm fine,
nice to meet you, see you tomorrow, understand, don't understand, auntie,
correct, blind and deaf blind. That makes 51 of the 95 words recorded in
the team's room. Trained on the GPU (WSL, RTX 4050) with the same recipe.

- **Not mirrored.** On one clip per word and recorder (87), the morning
  model got 44 right as recorded and 0 flipped.
- **Who recorded what.** All clips are named by recording time. Every word
  has the same order, paul, ry, ivan (matched by face across the two
  sessions: months in the morning in the 2026-11-01 shirts, the rest in the
  afternoon in different ones), but not always 15 takes each: APRIL 5/6/5,
  FEBRUARY 5/5/5, GREEN 6/4/6, JUNE and JULY 10/10/10, SEE YOU TOMORROW
  15/16/14, AUGUST and UNDERSTAND 15/15/16 (`TAKE_BLOCKS` in
  `build_fsl_manifest.py`, read off contact sheets and confirmed by cutting
  each word into three blocks by shirt colour).
- **Signer D:** all 95 words 86.8% → **90.3%** (top-5 98.1% → 99.4%). Every
  new seed beats every morning seed on its own (85.7–88.6% against
  82.0–84.7%). The 29 newly recorded words 71.3% → 75.3% (150 clips); the
  22 recorded earlier 92.0% → 95.6%; the 44 never recorded 94.6% → 97.7%.
  17 words improved, 4 got worse. Gains: **magandang gabi 0/6 → 5/6**,
  Disyembre 3 → 5, tama 0/6 → 2/6, tita 0/5 → 2/5, kumusta 0 → 1, and one
  clip each for several others. Losses: **Agosto 3/6 → 0/6 and Setyembre
  2/5 → 0/5, both now read as Abril**, **rosas 3/5 → 0/5 (read as pula)**,
  Lunes 5 → 4. Still 0: asul (read as alam) and Marso (read as Nobyembre),
  both recorded in this batch.
- **Not measured this time:** the one-recorder-left-out runs (stopped for
  low memory on the PC) and a control without the batch.

### 2026-11-02 morning: 20 more words from our recorders

ivan, paul and ry recorded 20 more words, 15 takes each (901 clips): how are
you, you're welcome, know, don't know, no, wrong, slow, fast, tomorrow,
uncle, boy, girl, woman, deaf, red, chicken, hot, milk, coffee, no sugar.
With TUESDAY and WEDNESDAY that is 22 words from the same room and camera.

- **Not mirrored this time.** On 60 sampled clips the 2026-11-01 model got
  29 right as recorded and 3 flipped (mostly read as *madilim*), so only the
  TUESDAY/WEDNESDAY batch is flipped now (`build_fsl_manifest.py`
  MIRRORED_CLASSES). Twelve of the words are saved under recording-time
  names (`2026-11-01_23-36-33.mp4`); the recorder comes from recording
  order (paul, ry, ivan, 15 each, `TIMESTAMP_BATCHES`), checked against
  shirt colour in every class. ASL Citizen / WLASL / MS-ASL clips found in
  the BLUE, WHITE and COLD folders are not used (never were).
- **Signer D:** all 95 words 81.8% → **86.8%**; the 22 recorded words
  81.4% → **92.0%** (113 clips; 62.8% for the 2026-10-06 model). 17 words
  improved, 9 got worse. Gains include mabagal 0/6 → 6/6, Abril 0/5 → 5/5,
  Oktubre 0/5 → 4/5, Mayo 1/5 → 5/5, Biyernes and Lunes 2/5 → 5/5. Losses:
  **tama 2/6 → 0/6 (all read as kape**, one of the recorded words),
  **magandang gabi 3/6 → 0/6** (read as magandang hapon), and months shuffled
  the other way: Setyembre 5 → 2, Pebrero and Disyembre 5 → 3.
- **Is the gain the new clips?** A control with today's code and 95 words but
  without this batch (seeds 0–1) scores 80.4% on signer D, against 86.2%
  for the new seeds 0–1. Leaving the numbers out on its own changes little
  (the 2026-11-01 model goes from 82.0% to 81.8% when scored on 95 words).
- **A recorder the model never saw** (seed 0, one left out each time), on the
  20 new words: ivan 95.6%, paul 84.2%, ry 97.3%, against 42.3%, 43.9% and
  40.7% for the 2026-11-01 model on the same clips. Paul's misses are mostly
  mabilis and hindi read as Martes (13 and 9 of 15); mabilis/Martes was
  already a look-alike pair for signer D. As on 2026-11-01, this is flattered
  by the shared room and camera; signer D is the stronger evidence.
- **Room shortcut:** before this batch, the 2026-11-01 model's most common
  wrong answer for the team's other words was Martes (e.g. hindi → Martes for
  all three), consistent with the room cue suspected on 2026-11-01. With 22
  words now recorded there, the room no longer points at one word.

### 2026-11-01: our own TUESDAY and WEDNESDAY recordings

(Figures in this subsection are for the 105-word models.)

Three of the team (ivan, paul, ry) recorded TUESDAY (46 clips) and WEDNESDAY
(46), both 0 of 5 for signer D before and both look-alikes (Martes→mabilis,
Miyerkules→anim). They train alongside signers A–C; signer D stays the only
test signer, so the numbers compare directly with the 2026-10-06 model.

- **The recordings were saved mirrored** (signing hand on the right of the
  picture, the opposite of FSL-105 and of the raw frame the app's camera
  gives). The old model read all 92 as *naka-wheelchair*, which is also what
  it reads for signer D's own clips when mirrored. The pipeline flips them
  before landmark extraction (`build_fsl_manifest.py` MIRRORED_CLASSES,
  `flip` column). Future recordings: turn mirroring off (the 2026-11-02 batch
  was), and check every batch.
- **Signer D:** Martes 0/5 → **5/5**, Miyerkules 0/5 → **5/5**; all words
  75.3% → 82.0%.
- **Is the gain the new data?** A control trained today without the new clips
  (seeds 0–1) scores 71.5% on signer D, against 73.2% for the old seeds 0–1
  and 81.5% for the new seeds 0–1. So it is the data, not a changed
  environment. 24 words improved and 7 got worse; the clearest loss is anim
  (six) 4/5 → 1/5, now read as pito (seven), not as Miyerkules. Abril, Agosto
  and Oktubre are now read as Setyembre (the control models do that too).
- **A recorder the model never saw** (seed 0, one of the three left out each
  time): 30–31 of 30–31 clips right for each, against 0 of 92 for the old
  model. This is flattered: all three filmed in the same room with the same
  camera. Signer D, a different person in a different setup, is the better
  evidence. Whether other words signed in that room are taken for
  Martes/Miyerkules: see the 2026-11-02 room-shortcut note above.

Models: `ml/models/fsl_sequence_classifier_seed{0-3}.keras` (deployed
2026-11-02 evening, 95 words); the 2026-11-02 morning seeds, fused model and
training data are kept in `ml/models/fsl_v3_2026-11-02/`, the 2026-11-01
ones in `ml/models/fsl_v2_2026-11-01/`, the 2026-10-06 ones in
`ml/models/fsl_v1_signerD/`; left-out and control runs in
`ml/models/fsl_experiments_2026-11-01/` and `fsl_experiments_2026-11-02/`.
TF.js parity of `public/fsl-model/model0` against the Keras ensemble: max
|Δp| 8e-7, 100% top-1 agreement on the 484 clips.

Leave-one-signer-out (single model, seed 0, the 2026-10-06 recipe without our
recordings) shows how much depends on who is held out:

| Held-out signer | A | B | C | D |
|---|---|---|---|---|
| Top-1 | 82.6% | 78.9% | 79.7% | 65.7% |
| Top-5 | 96.3% | 95.5% | 98.3% | 91.4% |

For contrast, the dataset's own split (signers mixed between train and test)
gives 98.1%. That is the number *not* to quote.

Most-confused since 2026-11-02 evening (by the Tagalog names the app
shows): Agosto→Abril (6 of 6), Setyembre→Abril and rosas→pula (5 of 5),
kumusta→pinsan, tama→kape, Marso→Nobyembre, asul→alam (4 each), tita→berde
(3). Still 0%: Agosto, Setyembre, rosas, asul, Marso. In the morning model:
magandang gabi→magandang hapon and tama→kape (6 of 6 each), kumusta→pinsan,
Marso→Pebrero, tita→berde (5 of 5 each), asul→alam (4). On 2026-11-01
(105 words): kumusta→pinsan, Abril/Agosto/Oktubre→Setyembre, Biyernes→siyam,
tita→berde, rosas→pula, magandang gabi→magandang hapon. Several FSL day
names are built on number handshapes (Biyernes→siyam is gone with the
numbers), and the months share one pattern on the other hand's finger.

## 3b. ASL numbers, FSL letters and FSL numbers (2026-10-28)

`ml/scripts/train_handshape_classifier.py <model>` → `ml/models/diagnostics/<model>_summary.json`, `<model>_per_sign.csv`.
Landmarks: `ml/scripts/extract_handshape_landmarks.py` (MediaPipe hand landmarker on every photo, or on every 2nd frame of the middle 60% of a clip).

These three groups said "soon" until now. They are still-handshape models like
ASL letters, with one difference that matters: the letters model reads raw
MediaPipe coordinates (fractions of the frame), so it is partly learning *where
in the frame* the hand is. These models are fed x and z scaled by the frame's
width/height and, inside the graph, centre the hand on its wrist, divide by the
palm's size and add all 210 point-to-point distances. Training adds small
rotations, aspect stretches and jitter. The app side is `src/ml/handshapeInput.ts`;
each model folder's `meta.json` says which input it takes.

| Model | Data | Test | Top-1 | Pass rate* |
|---|---|---|---|---|
| ASL numbers | ASL-HG digits, 10 signers (CC BY 4.0) | 5-fold, 2 signers held out | 100% | 100% |
| ASL numbers (deployed, trained on all 10) | | **338 webcam clips** of ZERO…NINE (ASL Citizen / WLASL / MS-ASL), never used for training | **97.9%** of clips (83.1% of frames) | 99.7% of clips reach 80% on the right digit |
| FSL numbers | FSL-105 ONE…TEN clips, 4 signers | leave one signer out (A 92.8%, B 84.2%, C 91.1%, D 93.4%) | 90.6% of frames, **97.0% of clips** | 84.6% of frames |
| FSL letters | FSL Dataset (J. G. Porton, CC0), 450 photos per letter | 5-fold over original photos | 98.9% | 98.5% |

* right **and** at least 80% confident (PASS_CONFIDENCE).

- **ASL 0.** ASL-HG's "0" is an O handshape held against the other palm; the
  app tracks one hand, so 0 is trained on ASL-HG's "O" photos (ASL's 0 is the
  O handshape). On the webcam clips ZERO scores 100%.
- **ASL numbers' weakest** on webcam clips: 6 (89%, read as 3/4/5) and 8 (92%, as 5).
- **FSL numbers' weakest:** 7 (72% of frames, read as 4), 4 (as 5). There is no
  FSL zero in FSL-105, so the group is 1–10. TEN moves; a still frame sees its handshape.
- **FSL letters: read the 98.9% with care.** The dataset has no signer ids, so
  the same people are on both sides of the split (an original photo and its
  Roboflow copies are kept together). As a check on new people, the model was
  run on ASL-HG's A–Z photos (10 signers it never saw). ASL and FSL share most
  fingerspelling handshapes: B F I L O Q U V W Z agree 100%, Y 96%, A 91%,
  N 90%, C 78%. G H J K P T never agree. That fits those letters being made
  differently in FSL, but can't separate that from model error; FSL photos of
  other people are what's missing.
- **In the app:** with a fake camera playing an ASL Citizen SEVEN clip, an
  FSL-105 THREE clip and an FSL L photo, the translator read 7, 3 and L
  (production build, headless Chrome).

## 4. Out-of-vocabulary rejection

`ml/scripts/oov_rejection_eval.py` → `ml/models/diagnostics/oov_rejection.json`

Test accuracy only covers signs the model knows. In a video call people sign
anything, so the reader has to **stay quiet** for signs outside its 344
words. This test uses 250 ASL Citizen webcam clips of glosses that are
*not* in the vocabulary (nor aliases of one), and for comparison 214 held-out
clips of in-vocabulary words (one clip per gloss, trimmed like the app). No
in-vocab clip was trained on by either v5 or v6 (`--skip
models/asl_combined_v5_webcam/seen_clips.json`); 183 of the 214 are by the
five people v6 never saw (§2).

Deployed model (v6, 2026-10-29), `oov_rejection.json`; v5 on the same clips
in `oov_rejection_v5.json`:

| Gate (min. confidence) | False accept (OOV shown as a word) ↓ v5 → v6 | In-vocab shown v5 → v6 | In-vocab shown **and right** ↑ v5 → v6 |
|---|---|---|---|
| 0.30 | 68.8% → 62.8% | 85.0% → 90.7% | 62.6% → 76.6% |
| **0.40 (Words translator)** | 49.2% → **46.0%** | 75.2% → 84.1% | 57.0% → **73.4%** |
| 0.50 | 34.0% → 34.8% | 61.7% → 73.4% | 50.9% → 66.4% |
| **0.60 (video call, since 2026-10-21)** | 21.6% → **23.2%** | 53.3% → 65.0% | 46.3% → **59.8%** |
| 0.70 | 14.8% → 15.2% | 45.3% → 54.7% | 40.2% → 52.3% |
| 0.80 | 8.0% → 8.0% | 34.6% → 43.9% | 31.3% → 42.5% |

v6 shows the right word much more often at every gate, and its false
captions on unknown signs are about the same (at 0.6, +1.6 points: 4 of 250
clips). Mean top confidence is 0.43 on OOV clips versus 0.69 on in-vocab
clips (v5: 0.43 / 0.63). In-vocab top-1 on this set is 81.3% (v5 67.8%; the
model before v5: 36.4% on an earlier version of the set,
`oov_rejection_v3.json`). At **0.7**, v6 would beat v5-at-0.6 on both
counts (15.2% false accept, 52.3% shown and right); the gate stays at 0.6
for now, as a product decision rather than a measurement.

The tables in the rest of this section were measured on the model before
v5 (and 234 in-vocab clips).

**Reading it:** at a 40% gate, about half of unknown signs get
captioned as *some* word. Raising the gate cuts false captions much faster
than it loses right ones. At 0.6 (old model), false accepts halve (52.8% → 25.6%) while
correct captions drop only 37.2% → 33.3%; v6 keeps the
same shape (46.0% → 23.2%, 73.4% → 59.8%), so the gate stays. A softmax classifier has no
"none of these" class, so a confidence gate is the only lever without
retraining. The stronger fix is training with an explicit *unknown* class
built from out-of-vocabulary clips (the 2,473 OOV ASL Citizen glosses are
already on disk).

The gate is `WORD_MIN_PCT` in `src/hooks/useCallSignReader.ts` (video call)
and `MIN_CONFIDENCE` in `src/screens/WordTranslatorScreen.tsx` (translator).
They don't have to match: a call caption that is wrong misleads the other
person, while the translator shows its top-5 alternatives anyway.

**Decision (2026-10-21):** the video-call reader now uses **60%**, halving
false captions on unknown signs for a small loss of correct ones. The
Words translator stays at 40%: it shows its top-5 alternatives, so a wrong
top guess there is visible as one. The 60% figure was measured on the ASL
model. The call reader uses the same gate for FSL, whose unknown-sign
behaviour hasn't been measured (FSL-105 has no out-of-vocabulary clips on
disk).

**Unknown-class retrain (2026-10-22):** a 4-seed ensemble trained with an
explicit `__unknown__` class (1,956 OOV ASL Citizen clips, `--unknown`) was
scored on the same 250 + 234 clips (`oov_rejection_unk.json`). A top
prediction of `__unknown__` counts as rejected.

| Gate | False accept: current → unknown-class | Shown and right: current → unknown-class |
|---|---|---|
| 0.40 | 52.8% → 51.6% | 37.2% → 35.9% |
| 0.60 | 25.6% → 24.0% | 33.3% → 30.3% |

It cuts false captions by only 1–2 points and loses 1–3 points of correct
ones. At an equal false-accept rate, raising the gate on the current model
does slightly better, so the app **keeps the current model**. The unknown
class most likely fails to generalise to unknown signs it never saw in
training.

## 5. Speed

The camera status line shows the **measured** rate of new camera frames the
recognizer processed (`src/hooks/useFpsMeter.ts`). Before, it was a
hard-coded "30 FPS". Measure on the actual defense laptop with a real webcam
and record it here. Reference points from this development machine:

| Setup | Letters | Words |
|---|---|---|
| Production build, headless Chrome, 20 fps fake camera | ~20 FPS (keeps up) | ~20 FPS (keeps up) |
| Camera ready after opening the translator | 1.1–2.5 s (production) | |
| Same, on the dev server (`npm run web`) | ~50 s (Metro serves large files slowly) | |

## 6. Limits to state in the manuscript

- **Signers.** Every word test signer is an adult from a public dataset; none
  are children or Liloan students. Child hands and signing speed are untested.
  A small recorded set of real users (even 5 people × 20 signs) would be the
  single most convincing addition.
- **Passes are graded on the device.** The model runs in the browser, so the
  pass/fail result is reported by the client. The database enforces one
  counted pass per sign per 10 minutes (migrations 0007 and 0010), but can't
  verify that the sign was actually made.
- **Licences.** Several training/reference datasets are research-only (see
  `public/reference/CREDITS.txt`).
