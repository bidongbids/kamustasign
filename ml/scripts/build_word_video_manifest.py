"""
Word-level dataset, step 1: scan the extracted video dataset and build a
labeled manifest CSV (one row per video) with a train/val/test split assigned
per word.

Expects the dataset extracted to:
  ml/data/word_videos/dataset/SL/<word>/<video_id>.mp4

(That's the structure inside the Kaggle zip you downloaded - one folder per
word/gloss, a handful of .mp4 clips in each.)

Why a custom split strategy instead of sklearn's train_test_split:
  Alphabet classes had ~3,000 images each, so a random 70/15/15 split just
  worked. Word classes here have as few as 2 examples and rarely more than
  17, so a *random* split can easily leave a class with zero test examples
  in one split and all of them in another. Instead we split deterministically
  per class based on how many examples it has:
    - 2 examples:  1 train, 1 val,  0 test   (too little data to hold out a test clip)
    - 3-4 examples: keep 1 for val, 1 for test, rest train
    - 5+ examples:  ~70/15/15 rounded, at least 1 val and 1 test
  This is recorded per-row in the CSV so nothing is silently dropped - you
  can see exactly how many classes have no test coverage.

Output: ml/data/word_manifest.csv with columns:
  path, word, video_id, split

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/build_word_video_manifest.py
"""

import os
import csv
import json
import random

random.seed(42)

DATA_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data", "word_videos", "dataset", "SL"
)
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "word_manifest.csv")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes.json")

# Vocabulary lock - keep True to build the manifest from only the current
# word_classes.json vocabulary (currently 133 words), even though
# word_videos/dataset/SL now also holds folders for every ASL Citizen gloss
# (ingest_asl_citizen_clips.py copies all ~2,700, not just our 133) and the
# full ~2,000-word WLASL extraction. Locking HERE (not just in
# consolidate_word_landmarks.py) matters because extract_word_landmarks.py
# is a multi-hour job - there's no reason to spend that time on MediaPipe
# extraction for thousands of clips belonging to words we're not training
# on yet.
#
# To expand later: set this to False (and LOCK_TO_CURRENT_VOCAB in
# consolidate_word_landmarks.py) and rerun the pipeline from this script
# onward. No new ingestion needed.
LOCK_TO_CURRENT_VOCAB = True


def assign_splits(n):
    """Return a list of n split labels ('train'/'val'/'test') for a class
    with n examples, using the tiered rule described in the module docstring."""
    if n <= 0:
        return []
    if n == 1:
        return ["train"]
    if n == 2:
        return ["train", "val"]
    if n in (3, 4):
        splits = ["train"] * (n - 2) + ["val", "test"]
        return splits
    # 5+: round to ~70/15/15, guaranteeing at least 1 val and 1 test
    n_test = max(1, round(n * 0.15))
    n_val = max(1, round(n * 0.15))
    n_train = n - n_test - n_val
    if n_train < 1:
        n_train = 1
        n_val = max(1, (n - n_train) // 2)
        n_test = n - n_train - n_val
    return ["train"] * n_train + ["val"] * n_val + ["test"] * n_test


def main():
    if not os.path.isdir(DATA_DIR):
        print(f"ERROR: dataset folder not found at {DATA_DIR}")
        print("Extract the Kaggle zip so videos live at ml/data/word_videos/dataset/SL/<word>/*.mp4")
        return

    word_folders = sorted(
        d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))
    )
    print(f"Found {len(word_folders)} word folders on disk.")

    if LOCK_TO_CURRENT_VOCAB and os.path.exists(CLASSES_PATH):
        locked_vocab = set(json.load(open(CLASSES_PATH, encoding="utf-8")))
        held_back = len(word_folders) - sum(1 for w in word_folders if w in locked_vocab)
        word_folders = [w for w in word_folders if w in locked_vocab]
        print(f"Vocabulary LOCKED to {len(locked_vocab)} words from {CLASSES_PATH} "
              f"(LOCK_TO_CURRENT_VOCAB=True) - {len(word_folders)} of those have a "
              f"folder here. {held_back} other folders on disk are being skipped for "
              "now (their clips stay on disk, ready for when you expand later).")

    rows = []
    counts = []
    zero_test_classes = 0

    for word in word_folders:
        word_path = os.path.join(DATA_DIR, word)
        video_files = sorted(
            f for f in os.listdir(word_path) if f.lower().endswith(".mp4")
        )
        n = len(video_files)
        counts.append(n)
        if n == 0:
            continue

        # Shuffle deterministically so which specific clips land in
        # train/val/test is reproducible but not just "alphabetical order".
        shuffled = video_files[:]
        random.shuffle(shuffled)

        splits = assign_splits(n)
        if "test" not in splits:
            zero_test_classes += 1

        for fname, split in zip(shuffled, splits):
            video_id = os.path.splitext(fname)[0]
            rel_path = os.path.join("dataset", "SL", word, fname)
            rows.append([rel_path, word, video_id, split])

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["path", "word", "video_id", "split"])
        writer.writerows(rows)

    n_train = sum(1 for r in rows if r[3] == "train")
    n_val = sum(1 for r in rows if r[3] == "val")
    n_test = sum(1 for r in rows if r[3] == "test")

    print(f"\nTotal videos in manifest: {len(rows)}")
    print(f"  train: {n_train}   val: {n_val}   test: {n_test}")
    print(f"Examples per word - min: {min(counts)}  max: {max(counts)}  "
          f"avg: {sum(counts)/len(counts):.2f}")
    print(f"Classes with NO held-out test clip (too few examples): {zero_test_classes} "
          f"of {len(word_folders)}")
    print(f"\nSaved manifest to: {OUTPUT_CSV}")
    print("Next step: run scripts/extract_word_landmarks.py")


if __name__ == "__main__":
    main()
