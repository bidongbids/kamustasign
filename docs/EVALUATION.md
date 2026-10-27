# LCSign — model evaluation

All figures are for the models **deployed in `public/`** (as of 2026-10-21),
produced by the scripts named in each section. Re-run them after any retrain;
numbers here go stale otherwise.

| Model | Classes | Main test | Top-1 | Top-5 |
|---|---|---|---|---|
| ASL letters (1 model) | 26 + del/space | Held-out photos, same dataset | 97.6% | 99.5% (top-3) |
| ASL letters | | **10 other signers** (5,197 photos) | **71.5%** | 82.8% (top-3) |
| ASL words (4-seed ensemble) | 344 | Test split + 2 held-out GISLR signers (9,579 clips) | 58.6% | 82.7% |
| ASL words | | **Held-out webcam clips** (3,113) | **31.5%** | 53.4% |
| FSL-105 words (4-seed ensemble) | 105 | **Signer D, never seen in training** (534 clips) | **75.3%** | 94.9% |

The bold rows are the ones to quote: they test people and cameras the model
never saw, which is how the app is actually used. Same-distribution test
accuracy (97.6% letters, 98.1% FSL "provided" split) mostly measures how well
the model memorises the training signers.

## 1. ASL letters

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

| Metric | Value |
|---|---|
| Test clips | 9,579 |
| Top-1 / top-5 | 58.6% / 82.7% |
| Macro top-1 / macro F1 | 62.1% / 0.597 |
| Words at 100% / ≥ 80% / < 50% / 0% | 30 / 99 / 101 / 6 |
| Shown at the app's 40% gate | 65.0% of clips |
| Precision when shown | 76.4% |
| Mean confidence when right / wrong | 0.69 / 0.36 |
| **Held-out webcam clips** (ASL Citizen / WLASL / MS-ASL, trimmed like the app) | 3,113 clips, **31.5%** top-1, 53.4% top-5 |

The test split is mostly Google Isolated SLR (GISLR) portrait phone clips,
which flatters the 211 words learned mainly from that dataset. The webcam
check is the closer match to a student at a laptop, and it is much lower: the
remaining gap is cross-signer / cross-camera domain shift, and more webcam
clips of those words is the real fix.

Most-confused pairs (true → predicted, clips): awake→wake 21, tongue→duck 19,
my/mine→please 18, ride→chair 17, milk→car 16, lips→say 16, because→ear 16,
pen→pencil 15. Several are near-identical signs or share a handshape and
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

## 4. Out-of-vocabulary rejection

`ml/scripts/oov_rejection_eval.py` → `ml/models/diagnostics/oov_rejection.json`

Test accuracy only covers signs the model knows. In a video call people sign
anything, so the reader has to **stay quiet** for signs outside its 344
words. This test uses 250 ASL Citizen webcam clips of glosses that are
*not* in the vocabulary (nor aliases of one), and for comparison 234 held-out
clips of in-vocabulary words (one clip per gloss, trimmed like the app).

| Gate (min. confidence) | False accept (OOV shown as a word) ↓ | In-vocab shown | In-vocab shown **and right** ↑ |
|---|---|---|---|
| 0.30 | 73.2% | 85.5% | 39.3% |
| **0.40 (Words translator)** | **52.8%** | 72.2% | 37.2% |
| 0.50 | 38.8% | 62.0% | 35.0% |
| **0.60 (video call, since 2026-10-21)** | **25.6%** | 53.4% | **33.3%** |
| 0.70 | 17.6% | 44.4% | 30.8% |
| 0.80 | 9.6% | 35.0% | 26.5% |

Mean top confidence is 0.46 on OOV clips versus 0.63 on in-vocab clips.
In-vocab top-1 on this set is 41.5%.

**Reading it:** at a 40% gate, about half of unknown signs get
captioned as *some* word. Raising the gate cuts false captions much faster
than it loses right ones. At 0.6, false accepts halve (52.8% → 25.6%) while
correct captions drop only 37.2% → 33.3%. A softmax classifier has no
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
