# Training the numbers model from ASL-HG

> **Done (2026-10-28), differently from this plan.** The ASL numbers, FSL
> letters and FSL numbers models are built by
> `ml/scripts/extract_handshape_landmarks.py` + `ml/scripts/train_handshape_classifier.py`,
> which normalise the hand inside the model graph (the "bigger win" below) and
> train 0 on ASL-HG's O photos because its "0" is two-handed. Results:
> docs/EVALUATION.md section 3b. The rest of this guide is the original plan.

A separate fingerspelling model for the digits 0–9, to sit alongside the
existing letters model behind the Letters/Numbers toggle.

---

## Why a separate model, not 38 classes in one

Several ASL digits are the **same handshape** as a letter — not similar, identical:

```
  O ↔ 0        F ↔ 9        V ↔ 2        W ↔ 6
```

A single 38-class model would be asked to separate classes that are
indistinguishable in the data. It can't, so those classes sit near coin-flip
accuracy and the conflicting gradients waste capacity that should be learning
real distinctions. Two models means neither ever sees its own homomorph, and the
UI toggle supplies the context a human gets from knowing whether a word or a
number is being spelled.

The app side is already wired for this. `src/ml/modelLoader.ts` exposes
`loadAlphabet("letters" | "numbers")`, caching each separately, and
`FingerspellingScreen` swaps between them **without restarting the camera**.
The only thing missing is the model itself.

---

## What you need

- **Dataset:** ASL-HG raw images — https://data.mendeley.com/datasets/j4y5w2c8w9/1
  (download `ASL_Raw_Images.zip`, 836 MB — **not** the processed crops, see below)
- **Paper, for your manuscript citation:** https://www.sciencedirect.com/science/article/pii/S2352340926000454
- The `ml/venv` and `ml/venv-convert` environments you already have

### Why raw and not processed

The letter model consumes raw MediaPipe coordinates with no normalization:

```js
flat.push(lm.x, lm.y, lm.z);        // LiveTranslatorScreen
tf.tensor2d([flat], [1, 63]);
```

Those are normalized to the **frame**, not the hand. In a webcam view the hand
fills maybe a third of the picture, so x might span 0.35–0.60. On a tight hand
crop the same handshape spans 0.05–0.95. Train on crops, infer on full frames,
and every coordinate lands in the wrong place — a silent train/serve mismatch
that throws no error and just quietly degrades accuracy.

---

## Step 1 — Extract, separately

Do **not** unzip into the existing letters tree; filename collisions there are
unrecoverable.

```powershell
cd C:\Users\USER\Documents\kamustasign\ml\data
mkdir asl_hg
# extract ASL_Raw_Images.zip into asl_hg\
dir asl_hg -Recurse -Directory | Select-Object -First 45
```

That last line shows the folder layout — you need to know whether the digit
classes are named `0`..`9`, `zero`..`nine`, or something else before continuing.

## Step 2 — Verify the labels before you train

Non-negotiable, and cheap. Open 3–4 images from each digit folder and check the
handshape against a reference fingerspelling chart. ASL-HG was recorded by
volunteers in Dhaka; that's not a reason to distrust it, but any dataset can
carry label noise and finding it after training is expensive.

Pay particular attention to **0, 2, 6, 9** — these are the digits that share a
handshape with a letter, so if any are mislabelled you will see it as confusion
with the letters model later and misdiagnose it.

## Step 3 — Build the landmark dataset

`build_landmark_dataset.py` has `DATA_DIR` hardcoded to the letters folder. Copy
it rather than editing in place, so the letters pipeline keeps working:

```powershell
cd C:\Users\USER\Documents\kamustasign\ml
Copy-Item scripts\build_landmark_dataset.py scripts\build_number_dataset.py
```

In `build_number_dataset.py` change two constants:

```python
DATA_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data", "asl_hg", "<inner folder>")
OUTPUT_CSV = os.path.join(
    os.path.dirname(__file__), "..", "data", "numbers_dataset.csv")
```

Then restrict it to the ten digit folders — the simplest way is to filter the
class list it builds:

```python
DIGITS = {"0","1","2","3","4","5","6","7","8","9"}
class_folders = sorted(d for d in os.listdir(DATA_DIR)
                       if os.path.isdir(os.path.join(DATA_DIR, d)) and d in DIGITS)
```

Run it:

```powershell
.\venv\Scripts\python.exe scripts\build_number_dataset.py
```

Watch the skip count it prints at the end. MediaPipe failing to find a hand in a
meaningful fraction of images is itself a finding — it predicts how the model
will behave on a live camera, and it is worth writing down.

## Step 4 — Train

Copy `train_classifier.py` the same way, pointing it at `numbers_dataset.csv`
and writing to distinct output names so nothing overwrites the letters model:

```
models\number_classifier.keras
models\number_label_classes.json
```

Ten classes with ~1,000 images each is a comfortable problem — expect this to
train in minutes and score well. If it doesn't, the cause is upstream in the
data, not the model.

## Step 5 — Export and convert

Same two-venv dance as the word model:

```powershell
.\venv\Scripts\python.exe scripts\export_number_model_for_conversion.py
.\venv-convert\Scripts\python.exe -m tensorflowjs.converters.converter `
    --input_format=tf_saved_model `
    models\number_classifier_savedmodel models\number_tfjs_model
```

## Step 6 — Deploy

The app loads the numbers model from `/number-model/`:

```powershell
cd C:\Users\USER\Documents\kamustasign
mkdir public\number-model
Copy-Item ml\models\number_tfjs_model\*       public\number-model\ -Force
Copy-Item ml\models\number_label_classes.json public\number-model\label_classes.json -Force
```

**Copy into an empty folder, or clear it first.** `Copy-Item -Force` overwrites
matching filenames but leaves behind shards a newer conversion no longer
produces. That already bit the word models once — 88 orphaned `.bin` files,
555 MB of dead weight that nothing referenced.

Then reload, open Fingerspelling, and switch to Numbers.

---

## Measure honestly while you're here

Two things worth doing that cost one extra run each.

**Hold out a signer.** ASL-HG has 10 volunteers. If the filenames or folders
identify them, train on 8 and test on 2. That gives you a signer-independent
number — the one that predicts what happens when a panel member tries it. Your
current letters accuracy does not have this property and is probably flattering.

**Test the existing letters model against ASL-HG's A–Z before merging anything.**
Ten unseen signers, different cameras and lighting. Look at the **per-class**
breakdown, not just the average. If everything drops, that's the missing
normalization (see below). If only specific letters drop, that's a labelling or
orientation conflict for those classes.

## The bigger win, once numbers work

The letters model normalizes nothing — not position, not scale. It is partly
learning "hand at this spot in the frame = this letter" rather than pure
handshape, which is why standing somewhere different changes the answer.

The word model went from 52% to 73% when per-hand wrist-relative features were
added. The letters model has nothing at all, so the same fix likely has more
headroom here than more data does. Re-express the 21 landmarks relative to the
wrist and scale by palm length, exactly as `wrist_relative_hand()` does in
`ml/scripts/extract_word_landmarks.py`.

One caveat: that removes translation and scale but **not rotation**, so it won't
fully reconcile datasets that differ in hand orientation.

If you change it, change it in **both** places at once — `build_landmark_dataset.py`
and `LiveTranslatorScreen.tsx` — or you reintroduce the silent mismatch this
guide opened with.
