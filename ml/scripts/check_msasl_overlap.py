"""
Checks how useful the MS-ASL dataset would be for this project before
committing to a full download+extraction run:

  1. Loads MS-ASL's class list and compares it against our own
     word_classes.json vocabulary to find overlapping words.
  2. For the overlapping words, counts how many MS-ASL clips exist.
  3. Samples a subset of those clips' YouTube URLs and checks whether
     they're still live (a meaningful fraction of a 2019 dataset's YouTube
     links will have rotted away by now).

This does NOT download any video - just the small annotation JSON files
(already unzipped from MS-ASL.zip) plus lightweight per-video existence
checks via yt-dlp.

Setup:
  1. Download https://download.microsoft.com/download/3/c/a/3ca92c78-1c4a-4a91-a7ee-6980c1d242ec/MS-ASL.zip
  2. Unzip it into ml/data/msasl/ (so this script can find the JSON files
     next to each other - adjust MSASL_DIR below if you put it elsewhere)
  3. pip install yt-dlp --break-system-packages   (if not already installed)

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/check_msasl_overlap.py
"""

import os
import json
import glob
import random
import subprocess

MSASL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "msasl")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes.json")
SAMPLE_SIZE = 40  # how many YouTube URLs to spot-check for link rot


def normalize(word):
    return word.strip().lower()


def find_msasl_files():
    """MS-ASL's zip layout has varied slightly across releases, so search
    for the classes file and any train/val/test annotation files rather
    than hardcoding exact names."""
    all_json = glob.glob(os.path.join(MSASL_DIR, "**", "*.json"), recursive=True)
    classes_file = None
    split_files = []
    for path in all_json:
        name = os.path.basename(path).lower()
        if "classes" in name:
            classes_file = path
        elif "train" in name or "val" in name or "test" in name:
            split_files.append(path)
    return classes_file, split_files, all_json


def main():
    if not os.path.exists(CLASSES_PATH):
        print(f"ERROR: {CLASSES_PATH} not found.")
        return

    our_words = json.load(open(CLASSES_PATH, encoding="utf-8"))
    our_words_norm = {normalize(w) for w in our_words}
    print(f"Our vocabulary: {len(our_words)} words")

    if not os.path.isdir(MSASL_DIR):
        print(f"\nERROR: {MSASL_DIR} not found.")
        print("Download and unzip MS-ASL.zip there first (see docstring).")
        return

    classes_file, split_files, all_json = find_msasl_files()
    if not classes_file or not split_files:
        print(f"\nCould not auto-detect MS-ASL's files in {MSASL_DIR}.")
        print(f"Found these JSON files instead: {[os.path.basename(p) for p in all_json]}")
        print("Paste this list back and I'll adjust the script to match the actual names.")
        return

    print(f"\nUsing classes file: {os.path.basename(classes_file)}")
    print(f"Using split files: {[os.path.basename(p) for p in split_files]}")

    msasl_classes = json.load(open(classes_file, encoding="utf-8"))
    msasl_words_norm = {normalize(w) for w in msasl_classes}
    print(f"MS-ASL vocabulary: {len(msasl_classes)} words")

    overlap = our_words_norm & msasl_words_norm
    print(f"\nOverlap: {len(overlap)} words in common")
    if len(overlap) == 0:
        print("No overlap found - check that MS-ASL's class list loaded correctly "
              "(print msasl_classes[:10] to sanity check word formatting).")
        return
    print("Overlapping words:", sorted(overlap))

    # Count clips available per overlapping word across all splits.
    clip_records = []
    for path in split_files:
        entries = json.load(open(path, encoding="utf-8"))
        for e in entries:
            label_word = normalize(e.get("clean_text") or e.get("text") or e.get("org_text") or "")
            if label_word in overlap:
                clip_records.append(e)

    print(f"\nTotal MS-ASL clips available for overlapping words: {len(clip_records)}")
    if len(clip_records) == 0:
        print("Found overlapping words but no matching clip records - the label "
              "field name in the JSON may differ from what this script expects. "
              "Paste one full JSON record (print(clip_records[0])) and I'll fix it.")
        return

    # Sample a subset and check whether the underlying YouTube video is
    # still available, to estimate real (not nominal) usable clip count.
    sample = random.sample(clip_records, min(SAMPLE_SIZE, len(clip_records)))
    print(f"\nSpot-checking {len(sample)} YouTube links for availability (this takes a minute)...")

    alive = 0
    dead = 0
    for e in sample:
        url = e.get("url") or e.get("file") or e.get("youtube_id") or ""
        if url and not url.startswith("http"):
            url = f"https://www.youtube.com/watch?v={url}"
        if not url:
            continue
        try:
            result = subprocess.run(
                ["yt-dlp", "--simulate", "--quiet", "--no-warnings", url],
                capture_output=True, timeout=20,
            )
            if result.returncode == 0:
                alive += 1
            else:
                dead += 1
        except Exception:
            dead += 1

    checked = alive + dead
    if checked > 0:
        alive_rate = alive / checked
        print(f"\n{alive}/{checked} sampled links still live ({alive_rate:.0%})")
        est_usable = int(len(clip_records) * alive_rate)
        print(f"Estimated usable clips for our overlapping words: ~{est_usable} "
              f"(out of {len(clip_records)} nominal)")
    else:
        print("Could not check any links - is yt-dlp installed? "
              "(pip install yt-dlp --break-system-packages)")


if __name__ == "__main__":
    main()
