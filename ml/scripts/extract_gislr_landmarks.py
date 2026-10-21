"""
Converts the Google Isolated Sign Language Recognition dataset (Kaggle
"asl-signs": data/train.csv + data/train_landmark_files/**.parquet, 250
signs, ~94k clips from 21 signers) into this project's raw word-frame layout,
so it can be trained alongside our own clips (consolidate_combined_words.py).

Why it fits without re-running MediaPipe:
  The parquet files are already MediaPipe Holistic output - face (468),
  pose (33), left_hand (21), right_hand (21) per frame, x/y/z normalised to
  the image like ours. The videos are NOT mirrored, same as our clips
  (left shoulder, pose 11, sits on the image's right in both), so
  left_hand/right_hand mean the same hand in both datasets.

The one gap: no pose visibility.
  Our layout stores pose as (x, y, z, visibility). These files have no
  visibility, so it's written as 0 here, and the model trained on the
  combined data never sees visibility at all - consolidate_combined_words.py
  zeroes it for every clip and the app does the same before inference
  (normalizeSequence(..., { dropVisibility: true }) in src/ml/wordLandmarks.ts).

Missing hands come through as NaN rows and become zeros - the same "not
detected" encoding extract_word_landmarks.py uses. Each clip is resampled to
SEQUENCE_LENGTH frames with the same nearest-index linspace as extraction.

Output: data/gislr_raw.npz
  X            (N, 40, 258) float16  raw frames (NOT normalised)
  sign         (N,) str              dataset label, e.g. "callonphone"
  participant  (N,) int32
  sequence_id  (N,) int64
  n_frames     (N,) int32            original length before resampling

Run with the main venv (needs pyarrow):
  cd ml
  .\\venv\\Scripts\\Activate.ps1
  python scripts/extract_gislr_landmarks.py
"""
import csv
import os
import sys
import time
from multiprocessing import Pool

import numpy as np
import pyarrow.parquet as pq

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
TRAIN_CSV = os.path.join(DATA_DIR, "train.csv")
OUTPUT_NPZ = os.path.join(DATA_DIR, "gislr_raw.npz")

# Mirrors extract_word_landmarks.py (not imported: that module pulls in
# mediapipe/cv2 at import time, which every worker process would pay for).
SEQUENCE_LENGTH = 40
NUM_POSE = 33
NUM_HAND = 21
FEATURES_PER_FRAME = NUM_POSE * 4 + NUM_HAND * 3 + NUM_HAND * 3  # 258
LEFT_BASE = NUM_POSE * 4
RIGHT_BASE = NUM_POSE * 4 + NUM_HAND * 3

WORKERS = max(1, (os.cpu_count() or 4) - 2)


def load_clip(rel_path):
    table = pq.read_table(
        os.path.join(DATA_DIR, rel_path),
        columns=["frame", "type", "landmark_index", "x", "y", "z"],
        filters=[("type", "in", ["pose", "left_hand", "right_hand"])],
    )
    frame = table.column("frame").to_numpy()
    kind = table.column("type").to_numpy(zero_copy_only=False)
    lm = table.column("landmark_index").to_numpy().astype(np.int64)
    xyz = np.stack(
        [table.column(c).to_numpy(zero_copy_only=False) for c in ("x", "y", "z")], axis=1
    ).astype(np.float32)
    xyz = np.nan_to_num(xyz, nan=0.0)

    frames = np.unique(frame)
    row = np.searchsorted(frames, frame)
    out = np.zeros((len(frames), FEATURES_PER_FRAME), dtype=np.float32)

    base = np.where(kind == "pose", lm * 4, np.where(kind == "left_hand", LEFT_BASE + lm * 3, RIGHT_BASE + lm * 3))
    for k in range(3):
        out[row, base + k] = xyz[:, k]
    # pose visibility (base + 3) stays 0 - not in this dataset.

    n = len(frames)
    if n == 0:
        return None, 0
    idx = np.linspace(0, n - 1, SEQUENCE_LENGTH).round().astype(int)
    return out[idx].astype(np.float16), n


def work(item):
    i, rel_path = item
    try:
        seq, n = load_clip(rel_path)
        return i, seq, n, None
    except Exception as e:  # a corrupt file shouldn't kill a 94k-file run
        return i, None, 0, f"{rel_path}: {e}"


def main():
    with open(TRAIN_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else None
    if limit:
        rows = rows[:limit]
    print(f"{len(rows)} clips, {WORKERS} workers")

    X = np.zeros((len(rows), SEQUENCE_LENGTH, FEATURES_PER_FRAME), dtype=np.float16)
    n_frames = np.zeros(len(rows), dtype=np.int32)
    ok = np.zeros(len(rows), dtype=bool)
    errors = []
    t0 = time.time()
    with Pool(WORKERS) as pool:
        for done, (i, seq, n, err) in enumerate(
            pool.imap_unordered(work, enumerate(r["path"] for r in rows), chunksize=64), 1
        ):
            if seq is not None:
                X[i] = seq
                n_frames[i] = n
                ok[i] = True
            elif err:
                errors.append(err)
            if done % 5000 == 0 or done == len(rows):
                rate = done / (time.time() - t0)
                print(f"  {done}/{len(rows)}  ({rate:.0f} clips/s, ~{(len(rows) - done) / rate / 60:.1f} min left)", flush=True)

    if errors:
        print(f"{len(errors)} clips failed, e.g. {errors[:3]}")
    keep = np.flatnonzero(ok)
    np.savez(
        OUTPUT_NPZ,
        X=X[keep],
        sign=np.array([rows[i]["sign"] for i in keep]),
        participant=np.array([int(rows[i]["participant_id"]) for i in keep], dtype=np.int32),
        sequence_id=np.array([int(rows[i]["sequence_id"]) for i in keep], dtype=np.int64),
        n_frames=n_frames[keep],
    )
    print(f"Saved {len(keep)} clips to {OUTPUT_NPZ} in {(time.time() - t0) / 60:.1f} min")
    print("Next: consolidate_combined_words.py")


if __name__ == "__main__":
    main()
