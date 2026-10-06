"""
Diagnostic step: consolidate a FILTERED subset of the word landmark cache -
only words with at least MIN_EXAMPLES clips - into a separate training-ready
.npz file. This exists purely to answer one question before committing to a
full retrain: can the current architecture learn ANYTHING above chance when
given enough examples per class, or is something deeper wrong?

The full 2000-class run scored test accuracy = 0.05% (exactly 1/2000, i.e.
random chance) because most words only have ~4-5 training clips, which isn't
enough for a 2000-way softmax classifier to generalize from. This script
restricts training to words with more examples per class (default: 10+),
which shrinks the vocabulary but should make the SAME architecture's job
much easier. If this also fails to beat chance, the problem is deeper than
"not enough examples per class" and the architecture itself needs to change
(e.g. a metric-learning/few-shot approach). If it succeeds, that confirms
the pipeline and architecture are sound, and the fix is just choosing how
many examples per class to require for the deployed vocabulary.

Uses the SAME cached landmarks in word_landmarks_cache/ - no re-extraction
needed, this runs in seconds.

Output:
  ml/data/word_landmarks_diagnostic.npz
  ml/data/word_classes_diagnostic.json

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/consolidate_word_landmarks_diagnostic.py
"""

import os
import csv
import json
import numpy as np
from collections import Counter

MANIFEST_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "word_manifest.csv")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "word_landmarks_cache")
OUTPUT_NPZ = os.path.join(os.path.dirname(__file__), "..", "data", "word_landmarks_diagnostic.npz")
OUTPUT_CLASSES = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes_diagnostic.json")

# Only keep words with at least this many total clips (train+val+test combined).
MIN_EXAMPLES = 10


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

    counts = Counter(r["word"] for r in rows)
    qualifying_words = sorted(w for w, c in counts.items() if c >= MIN_EXAMPLES)

    print(f"{len(counts)} words total in manifest.")
    print(f"{len(qualifying_words)} words have >= {MIN_EXAMPLES} examples - "
          f"using those for this diagnostic run.")
    if len(qualifying_words) < 20:
        print("WARNING: very few qualifying words. Consider lowering MIN_EXAMPLES and re-running.")

    word_to_idx = {w: i for i, w in enumerate(qualifying_words)}
    qualifying_set = set(qualifying_words)

    buckets = {"train": ([], []), "val": ([], []), "test": ([], [])}
    missing = 0

    for row in rows:
        if row["word"] not in qualifying_set:
            continue
        cache_path = os.path.join(CACHE_DIR, f"{row['video_id']}.npy")
        if not os.path.exists(cache_path):
            missing += 1
            continue
        seq = np.load(cache_path)
        split = row["split"]
        X_list, y_list = buckets[split]
        X_list.append(seq)
        y_list.append(word_to_idx[row["word"]])

    if missing:
        print(f"Note: {missing} qualifying-word videos have no cached landmarks yet - excluded.")

    out = {}
    for split in ("train", "val", "test"):
        X_list, y_list = buckets[split]
        if X_list:
            out[f"X_{split}"] = np.stack(X_list).astype("float32")
            out[f"y_{split}"] = np.array(y_list, dtype="int32")
        else:
            out[f"X_{split}"] = np.zeros((0, 40, 258), dtype="float32")
            out[f"y_{split}"] = np.zeros((0,), dtype="int32")
        print(f"{split}: {out[f'X_{split}'].shape[0]} sequences")

    os.makedirs(os.path.dirname(OUTPUT_NPZ), exist_ok=True)
    np.savez_compressed(OUTPUT_NPZ, **out)
    with open(OUTPUT_CLASSES, "w", encoding="utf-8") as f:
        json.dump(qualifying_words, f, indent=2)

    print(f"\nSaved diagnostic dataset to: {OUTPUT_NPZ}")
    print(f"Saved {len(qualifying_words)} class labels to: {OUTPUT_CLASSES}")
    print("Next step: python scripts/train_word_classifier_diagnostic.py")


if __name__ == "__main__":
    main()
