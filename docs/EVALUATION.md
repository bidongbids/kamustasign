# LCSign — model evaluation

All figures are for the models **deployed in `public/`** (as of 2026-10-21; numbers and FSL letters 2026-10-28; ASL words 2026-10-29),
produced by the scripts named in each section. Re-run them after any retrain;
numbers here go stale otherwise.

| Model | Classes | Main test | Top-1 | Top-5 |
|---|---|---|---|---|
| ASL letters (since 2026-10-28) | 26 + del/space | **ASL-HG signers held out**, 2 per fold (25,983 photos) | **93.9%** | 100% (top-3) |
| ASL letters | | **105 WLASL webcam clips** of 21 letters | **64.8%** per clip | 56.0% per frame |
| *ASL letters before 2026-10-28* | | *10 ASL-HG signers / the same WLASL clips* | *71.5% / 34.3% per clip* | |
| ASL words (4-seed ensemble, 2026-10-29) | 344 | Test split + 2 held-out GISLR signers (9,171 clips not trained on, see §2) | 57.6% | 82.5% |
| ASL words | | **Held-out webcam clips** (1,630; mostly signers also in training, see §2) | **61.5%** | 85.6% |
| *ASL words before 2026-10-29* | | *Same 9,171 / same 1,630 clips* | *57.8% / 30.9%* | *82.3% / 53.1%* |
| FSL-105 words (4-seed ensemble) | 105 | **Signer D, never seen in training** (534 clips) | **75.3%** | 94.9% |
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

## 2. ASL words (344)

`ml/scripts/word_model_diagnostics.py asl` → `ml/models/diagnostics/asl_per_word.csv`, `summary.json`; PDF: `word_diagnostics_report.py`

**Retrained 2026-10-29** with webcam-domain data (`consolidate_combined_words.py
--webcam-extra`): half of each word's held-out webcam clips (1,483, split by
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

Most-confused pairs now (true → predicted, clips): awake→wake 21, milk→car 20,
my/mine→please 20, lips→say 17, cheek→eye 16, pen→pencil 16, because→ear 16,
finger→wait 16. Several are near-identical signs or share a handshape and
location.

## 3. FSL-105 words

`ml/scripts/word_model_diagnostics.py fsl` → `fsl-105_per_word.csv`

| Metric | Value |
|---|---|
| Test | every clip from signer D (534), never seen in training |
| Top-1 / top-5 | 75.3% / 94.9% |
| Macro F1 | 0.717 |
| Shown at 40% gate / precision when shown | 86.1% / 82.2% |
| Words at 100% / 0% | 64 / 13 |

Leave-one-signer-out (single model, seed 0) shows how much depends on who is
held out:

| Held-out signer | A | B | C | D |
|---|---|---|---|---|
| Top-1 | 82.6% | 78.9% | 79.7% | 65.7% |
| Top-5 | 96.3% | 95.5% | 98.3% | 91.4% |

For contrast, the dataset's own split (signers mixed between train and test)
gives 98.1%. That is the number *not* to quote.

Most-confused: good evening→good afternoon, two→one, wednesday→six,
friday→nine, pink→red, october→september. Several FSL day names are built on
number handshapes.

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
clips of in-vocabulary words (one clip per gloss, trimmed like the app; none
used in training, including the webcam clips the 2026-10-29 retrain added).

Deployed model (2026-10-29), `oov_rejection.json`:

| Gate (min. confidence) | False accept (OOV shown as a word) ↓ | In-vocab shown | In-vocab shown **and right** ↑ |
|---|---|---|---|
| 0.30 | 68.8% | 84.1% | 63.6% |
| **0.40 (Words translator)** | **49.2%** | 74.8% | 58.9% |
| 0.50 | 34.0% | 62.6% | 52.8% |
| **0.60 (video call, since 2026-10-21)** | **21.6%** | 53.7% | **47.7%** |
| 0.70 | 14.8% | 46.3% | 42.1% |
| 0.80 | 8.0% | 36.0% | 33.2% |

Mean top confidence is 0.43 on OOV clips versus 0.63 on in-vocab clips.
In-vocab top-1 on this set is 68.7% (the model before the retrain: 36.4%,
`oov_rejection_v3.json`; its rows were 52.8% / 32.2% shown and right at 0.4,
25.6% / 28.0% at 0.6). Most in-vocab clips share a signer with the webcam
clips added to training, as in §2.

The tables in the rest of this section were measured on the model before
the retrain (and 234 in-vocab clips).

**Reading it:** at a 40% gate, about half of unknown signs get
captioned as *some* word. Raising the gate cuts false captions much faster
than it loses right ones. At 0.6 (old model), false accepts halve (52.8% → 25.6%) while
correct captions drop only 37.2% → 33.3%; the retrained model keeps the
same shape (49.2% → 21.6%, 58.9% → 47.7%), so the gate stays. A softmax classifier has no
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
