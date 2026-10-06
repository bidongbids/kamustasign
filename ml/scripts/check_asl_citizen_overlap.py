"""
Reports what ASL Citizen can add to our word vocabulary - both to our
current word_classes.json words, and as brand-new words we don't have yet
(expansion candidates).

Reads all three of ASL Citizen's split CSVs (train/val/test - it ships
separate files, not one combined file) and cross-checks each row against
which video files are ACTUALLY present under ASL_Citizen/videos/, since a
partial/interrupted download can leave CSV rows pointing at files that
aren't there yet.

This does NOT copy any video - it only reads metadata + does one flat
directory listing, so it's safe/fast to rerun any time (e.g. after
resuming an interrupted download) to see updated numbers before running
ingest_asl_citizen_clips.py.

Setup:
  1. Download ASL_Citizen.zip from
     https://www.microsoft.com/en-us/download/details.aspx?id=105253
  2. Extract it into ml/data/ASL_Citizen/ so this script finds:
       ml/data/ASL_Citizen/splits/{train,val,test}.csv
       ml/data/ASL_Citizen/videos/*.mp4

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/check_asl_citizen_overlap.py
"""

import os
import csv
import json
from collections import Counter

CITIZEN_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "ASL_Citizen")
SPLITS_DIR = os.path.join(CITIZEN_DIR, "splits")
VIDEOS_DIR = os.path.join(CITIZEN_DIR, "videos")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes.json")
MANIFEST_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "word_manifest.csv")

# Confirmed real column names from the actual CSV header (not guessed):
# "Participant ID,Video file,Gloss,ASL-LEX Code". Kept as constants (rather
# than hardcoded inline) in case a future dataset version renames them.
GLOSS_COL = "Gloss"
FILE_COL = "Video file"

# consolidate_word_landmarks.py's own diagnostic finding: a full-vocabulary
# run scored 0.05% (chance) because most classes had ~4-5 examples; 133
# words with >=10 examples got to ~10% top-1 / ~30% top-5. That 10-example
# floor is the proven-working threshold, not an arbitrary guess - use it
# here too so this report reflects what would actually be trainable.
REPORT_THRESHOLDS = [1, 5, 10, 15, 20, 25, 30]


def normalize(word):
    return word.strip().lower()


def load_present_video_files():
    if not os.path.isdir(VIDEOS_DIR):
        return None
    return set(os.listdir(VIDEOS_DIR))


def load_gloss_counts():
    """Returns Counter of normalized gloss -> count of ACTUALLY present
    clips (i.e. the CSV row's file exists in videos/), summed across all
    three splits."""
    counts = Counter()
    nominal = Counter()
    present_files = load_present_video_files()
    if present_files is None:
        return counts, nominal, 0

    for split in ("train", "val", "test"):
        path = os.path.join(SPLITS_DIR, f"{split}.csv")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                gloss = normalize(row.get(GLOSS_COL, ""))
                fname = row.get(FILE_COL, "").strip()
                if not gloss:
                    continue
                nominal[gloss] += 1
                if fname in present_files:
                    counts[gloss] += 1
    return counts, nominal, len(present_files)


def existing_counts_per_word():
    if not os.path.exists(MANIFEST_PATH):
        return {}
    counts = Counter()
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            counts[normalize(row["word"])] += 1
    return counts


def main():
    if not os.path.exists(CLASSES_PATH):
        print(f"ERROR: {CLASSES_PATH} not found.")
        return
    our_words = json.load(open(CLASSES_PATH, encoding="utf-8"))
    our_words_norm = {normalize(w) for w in our_words}
    print(f"Our current vocabulary: {len(our_words)} words")

    if not os.path.isdir(CITIZEN_DIR):
        print(f"\nERROR: {CITIZEN_DIR} not found.")
        print("Extract ASL_Citizen.zip there first (see docstring).")
        return

    present_counts, nominal_counts, n_files_on_disk = load_gloss_counts()
    if n_files_on_disk == 0:
        print(f"\nERROR: no videos found under {VIDEOS_DIR}.")
        print("Extraction may not have finished, or the folder layout differs "
              "from what this script expects - paste `ls ASL_Citizen` back "
              "and I'll adjust it.")
        return

    total_nominal = sum(nominal_counts.values())
    total_present = sum(present_counts.values())
    pct = total_present / total_nominal * 100 if total_nominal else 0
    print(f"\nVideo files present on disk: {n_files_on_disk}")
    print(f"CSV rows (nominal, full dataset): {total_nominal}   "
          f"rows with a matching file present: {total_present} ({pct:.1f}%)")
    if pct < 90:
        print("^ This is well below 100% - the download/extraction is probably "
              "incomplete. Numbers below reflect only what's usable RIGHT NOW; "
              "finishing the download will raise every count roughly "
              f"{100/pct:.1f}x if the shortfall is spread evenly across words.")

    print(f"\nUnique glosses in ASL Citizen: {len(nominal_counts)}")

    # --- Part 1: benefit to our CURRENT 133 words ---
    overlap = {w: present_counts.get(w, 0) for w in our_words_norm if w in present_counts}
    existing = existing_counts_per_word()
    print(f"\n=== Part 1: our current {len(our_words)} words ===")
    print(f"{len(overlap)} of them appear in ASL Citizen with at least 1 present clip.")
    zero_before = sum(1 for w in overlap if existing.get(w, 0) == 0)
    print(f"{zero_before} of those currently have ZERO clips in word_manifest.csv "
          "- they'd benefit most.")

    # --- Part 2: brand-new words (expansion candidates) ---
    candidates = [(g, c) for g, c in present_counts.items()
                  if g not in our_words_norm and c > 0]
    candidates.sort(key=lambda x: -x[1])
    print(f"\n=== Part 2: expansion candidates (new words, not in current 133) ===")
    print(f"{len(candidates)} new words have at least 1 present clip.")
    for t in REPORT_THRESHOLDS:
        n = sum(1 for _, c in candidates if c >= t)
        print(f"  >= {t:>2} present clips: {n:>5} new words  "
              f"(-> vocabulary would grow to {len(our_words) + n})")

    print("\nTop 20 new-word candidates by clip count:")
    for g, c in candidates[:20]:
        print(f"  {g}: {c}")

    print("\nNote: consolidate_word_landmarks.py's MIN_EXAMPLES=10 is the "
          "threshold that was empirically proven to beat chance (a full "
          "~2000-class run at lower counts scored 0.05% - random). Whatever "
          "you use here, keep it at least that high unless you enjoy "
          "retraining from scratch.")
    print("\nNext step: python scripts/ingest_asl_citizen_clips.py")


if __name__ == "__main__":
    main()
