"""
Copies ASL Citizen clips into the same folder structure the rest of the
pipeline already expects:

  ml/data/word_videos/dataset/SL/<word>/citizen_<video_id>.mp4

Unlike the first version of this script, this copies EVERY gloss ASL
Citizen has clips for - not just the ones already in word_classes.json -
because build_word_video_manifest.py and consolidate_word_landmarks.py
already scan/filter the whole word_videos/dataset/SL tree on their own
(consolidate_word_landmarks.py keeps whatever clears MIN_EXAMPLES, new
words included). That's how vocabulary expansion actually happens in this
pipeline: drop more labeled clips in, rerun the same 4 steps, and whichever
words now have enough examples show up in the regenerated word_classes.json
automatically. No separate "expanded vocab" file needed.

This only COPIES files already on disk (no downloading/re-encoding) - the
slow part (downloading ASL Citizen) is already done, so this should be
quick. Only copies rows whose file is actually present under
ASL_Citizen/videos/ (see check_asl_citizen_overlap.py for how much of the
download is currently present vs. still missing).

Run check_asl_citizen_overlap.py first if you haven't - it shows what this
is about to do before it does it, including how many brand-new words would
become viable at various clip-count thresholds.

Setup: same as check_asl_citizen_overlap.py (ASL_Citizen.zip extracted
under ml/data/ASL_Citizen/).

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/ingest_asl_citizen_clips.py
"""

import os
import csv
import shutil
from collections import defaultdict

CITIZEN_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ASL_Citizen")
SPLITS_DIR = os.path.join(CITIZEN_DIR, "splits")
VIDEOS_DIR = os.path.join(CITIZEN_DIR, "videos")
OUTPUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "word_videos", "dataset", "SL")

GLOSS_COL = "Gloss"
FILE_COL = "Video file"


def normalize(word):
    return word.strip().lower()


def load_rows():
    rows = []
    for split in ("train", "val", "test"):
        path = os.path.join(SPLITS_DIR, f"{split}.csv")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            rows.extend(csv.DictReader(f))
    return rows


def main():
    if not os.path.isdir(CITIZEN_DIR):
        print(f"ERROR: {CITIZEN_DIR} not found. Extract ASL_Citizen.zip there first.")
        return
    if not os.path.isdir(VIDEOS_DIR):
        print(f"ERROR: {VIDEOS_DIR} not found.")
        return

    print("Reading train/val/test split CSVs...")
    rows = load_rows()
    print(f"{len(rows)} total rows across all splits.")

    print("Listing videos/ (one flat directory, should be fast even at 80k+ files)...")
    present_files = set(os.listdir(VIDEOS_DIR))
    print(f"{len(present_files)} video files currently present on disk.")

    os.makedirs(OUTPUT_ROOT, exist_ok=True)

    copied = 0
    skipped_existing = 0
    missing_on_disk = 0
    per_word_new = defaultdict(int)

    for row in rows:
        word = normalize(row.get(GLOSS_COL, ""))
        fname = row.get(FILE_COL, "").strip()
        if not word or not fname:
            continue
        if fname not in present_files:
            missing_on_disk += 1
            continue

        word_dir = os.path.join(OUTPUT_ROOT, word)
        video_id = os.path.splitext(fname)[0]
        out_path = os.path.join(word_dir, f"citizen_{video_id}.mp4")

        if os.path.exists(out_path):
            skipped_existing += 1
            continue

        os.makedirs(word_dir, exist_ok=True)
        shutil.copy2(os.path.join(VIDEOS_DIR, fname), out_path)
        copied += 1
        per_word_new[word] += 1

    print("\n=== Done ===")
    print(f"Clips copied: {copied}   already existed: {skipped_existing}   "
          f"in CSV but not yet downloaded: {missing_on_disk}")
    print(f"Distinct words touched: {len(per_word_new)}")
    print("\nTop 15 words by new clips added:")
    for word, n in sorted(per_word_new.items(), key=lambda x: -x[1])[:15]:
        print(f"  {word}: +{n}")
    if missing_on_disk:
        pct = missing_on_disk / len(rows) * 100 if rows else 0
        print(f"\n{missing_on_disk} rows ({pct:.0f}%) reference files not yet on disk - "
              "if this is large, your ASL Citizen download/extraction is still "
              "incomplete. Re-run this script after it finishes; already-copied "
              "clips are skipped automatically so it's safe to rerun.")
    print("\nNext step: rerun build_word_video_manifest.py -> extract_word_landmarks.py "
          "-> consolidate_word_landmarks.py -> train_word_classifier.py. "
          "consolidate_word_landmarks.py will automatically pick up every word "
          "(old and new) that now clears MIN_EXAMPLES and regenerate "
          "word_classes.json to match - that's the new, expanded vocabulary.")


if __name__ == "__main__":
    main()
