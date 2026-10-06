"""
Word-level dataset, step 3: merge the per-video landmark cache (produced by
extract_word_landmarks.py) into a single training-ready .npz file, using the
train/val/test split assigned in word_manifest.csv.

Vocabulary filtering:
  A full 2000-class training run scored test accuracy = 0.05% (random
  chance), because most words only have ~4-5 training clips - nowhere near
  enough for a 2000-way classifier to generalize from. Diagnostic runs on
  filtered subsets showed accuracy climbs substantially with more examples
  per class (133 words w/ 10+ examples -> ~10% top-1 / ~30% top-5 test
  accuracy, vs. 0.75% chance). So this script only includes words with at
  least MIN_EXAMPLES total clips, trading vocabulary size for a model that
  actually learns something. Adjust MIN_EXAMPLES to change that tradeoff if
  you revisit this later (e.g. after collecting more clips per word, or for
  an FSL dataset).

Run this after extract_word_landmarks.py has finished (or been stopped -
it will just consolidate whatever is currently cached; you can re-run this
any time to refresh the .npz with newly cached videos).

Output:
  ml/data/word_landmarks.npz
    X_train, y_train, X_val, y_val, X_test, y_test   (float32 / int32 arrays)
  ml/data/word_classes.json
    ordered list of word labels (only words with >= MIN_EXAMPLES clips),
    index i corresponds to label i in y_*

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/consolidate_word_landmarks.py
"""

import os
import csv
import json
import numpy as np
from collections import Counter

import extract_word_landmarks as ex

MANIFEST_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "word_manifest.csv")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "word_landmarks_cache")
OUTPUT_NPZ = os.path.join(os.path.dirname(__file__), "..", "data", "word_landmarks.npz")
OUTPUT_CLASSES = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes.json")

# Only keep words with at least this many total clips (train+val+test combined).
# See docstring above - the full 2000-word vocabulary failed outright; this
# cutoff is what made diagnostic runs actually learn above chance.
MIN_EXAMPLES = 10

# Vocabulary lock - keep True to stay at the current word_classes.json
# vocabulary (currently 133 words) even if newly-ingested clips (e.g. from
# ingest_asl_citizen_clips.py, which copies ALL of ASL Citizen's ~2,700
# glosses, not just our 133) would qualify additional words under
# MIN_EXAMPLES. Locked runs still benefit from ASL Citizen: any of our
# existing 133 words that got more clips still get counted normally, this
# only stops brand-new words from entering the vocabulary.
#
# To expand later: set this to False and rerun this script + train_word_
# classifier.py. No new ingestion needed - the extra clips are already on
# disk under word_videos/dataset/SL from having ingested everything.
LOCK_TO_CURRENT_VOCAB = True


def main():
    if not os.path.exists(MANIFEST_CSV):
        print(f"ERROR: manifest not found at {MANIFEST_CSV}")
        print("Run scripts/build_word_video_manifest.py first.")
        return
    if not os.path.isdir(CACHE_DIR) or not os.listdir(CACHE_DIR):
        print(f"ERROR: no cached landmarks found in {CACHE_DIR}")
        print("Run scripts/extract_word_landmarks.py first.")
        return

    with open(MANIFEST_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    locked_vocab = None
    if LOCK_TO_CURRENT_VOCAB and os.path.exists(OUTPUT_CLASSES):
        locked_vocab = set(json.load(open(OUTPUT_CLASSES, encoding="utf-8")))
        print(f"Vocabulary LOCKED to the existing {len(locked_vocab)} words in "
              f"{OUTPUT_CLASSES} (LOCK_TO_CURRENT_VOCAB=True in this script).")

    counts = Counter(r["word"] for r in rows)
    words = sorted(w for w, c in counts.items() if c >= MIN_EXAMPLES)

    print(f"\n{len(counts)} words total in manifest.")
    print(f"{len(words)} words have >= {MIN_EXAMPLES} examples.")

    if locked_vocab is not None:
        excluded = sorted(w for w in words if w not in locked_vocab)
        words = [w for w in words if w in locked_vocab]
        missing_from_data = sorted(w for w in locked_vocab if w not in set(words))
        if excluded:
            print(f"{len(excluded)} additional words cleared MIN_EXAMPLES but are "
                  "held back by the vocabulary lock (their clips are already on "
                  "disk - set LOCK_TO_CURRENT_VOCAB=False later to include them):")
            print(f"  {excluded[:20]}{' ...' if len(excluded) > 20 else ''}")
        if missing_from_data:
            print(f"WARNING: {len(missing_from_data)} locked words no longer clear "
                  f"MIN_EXAMPLES and will DROP OUT of this run: {missing_from_data}")

    print(f"\nFinal vocabulary for this run: {len(words)} words.")

    word_to_idx = {w: i for i, w in enumerate(words)}
    qualifying_set = set(words)

    buckets = {"train": ([], []), "val": ([], []), "test": ([], [])}
    missing = 0

    for row in rows:
        if row["word"] not in qualifying_set:
            continue
        cache_path = os.path.join(CACHE_DIR, f"{row['video_id']}.npy")
        if not os.path.exists(cache_path):
            missing += 1
            continue
        seq = ex.normalize_sequence(np.load(cache_path))
        split = row["split"]
        X_list, y_list = buckets[split]
        X_list.append(seq)
        y_list.append(word_to_idx[row["word"]])

    if missing:
        print(f"Note: {missing} qualifying-word videos have no cached landmarks yet "
              f"(extract_word_landmarks.py hasn't reached them / they failed to read). "
              f"They're excluded from this .npz - re-run this script after extraction "
              f"progresses further.")

    out = {}
    for split in ("train", "val", "test"):
        X_list, y_list = buckets[split]
        if X_list:
            out[f"X_{split}"] = np.stack(X_list).astype("float32")
            out[f"y_{split}"] = np.array(y_list, dtype="int32")
        else:
            out[f"X_{split}"] = np.zeros(
                (0, 40, ex.MODEL_FEATURES_PER_FRAME), dtype="float32"
            )
            out[f"y_{split}"] = np.zeros((0,), dtype="int32")
        print(f"{split}: {out[f'X_{split}'].shape[0]} sequences")

    os.makedirs(os.path.dirname(OUTPUT_NPZ), exist_ok=True)
    np.savez_compressed(OUTPUT_NPZ, **out)
    with open(OUTPUT_CLASSES, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=2)

    print(f"\nSaved dataset to: {OUTPUT_NPZ}")
    print(f"Saved {len(words)} class labels to: {OUTPUT_CLASSES}")
    print("Next step: train the sequence model (train_word_classifier.py)")


if __name__ == "__main__":
    main()
