"""
FSL-105, step 3: merge data/fsl_landmarks_cache/ into data/fsl_landmarks.npz.

Per clip: trim to the hand-active span, resample to 40 frames, then
ex.normalize_sequence() -> (40, 384), same features as the ASL word model.

Trim to the hand-active span:
  Each FSL-105 clip is 4 s, and the signer's hands sit below the frame for
  roughly the first and last 1.5 s. Keeping that idle time would squash the
  sign into ~10 of the 40 frames. So each clip is cut to the frames from the
  first to the last one with any hand detected, plus TRIM_MARGIN frames on
  each side, then resampled to 40. The app applies the same trim
  (trimToHandSpan in src/ml/wordLandmarks.ts) to the FSL buffer before
  classifying, so live input and training data are on the same timescale.
  A clip with no hand in any frame is kept whole and reported.

Unlike consolidate_word_landmarks.py this writes every clip with its
metadata rather than baking in one split, because the FSL model is evaluated
under more than one split (see train_fsl_classifier.py):
  X (N, 40, 384) float32, y (N,) int32,
  signer, video_id, split, provided_split  (N,) str

No vocabulary lock or MIN_EXAMPLES filter: all 105 classes have 18-22 clips.

Run (venv active):
  python scripts/consolidate_fsl_landmarks.py
"""

import os
import csv
import json
import numpy as np

import extract_word_landmarks as ex

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
MANIFEST_CSV = os.path.join(DATA_DIR, "fsl_manifest.csv")
CACHE_DIR = os.path.join(DATA_DIR, "fsl_landmarks_cache")
OUTPUT_NPZ = os.path.join(DATA_DIR, "fsl_landmarks.npz")
OUTPUT_CLASSES = os.path.join(DATA_DIR, "fsl_classes.json")
OUTPUT_STATS = os.path.join(DATA_DIR, "fsl_extraction_stats.json")

TRIM_MARGIN = 3  # frames (~0.1 s at the 30 fps the cache is sampled at)
HANDS = slice(ex.NUM_POSE * 4, ex.FEATURES_PER_FRAME)
POSE = slice(0, ex.NUM_POSE * 4)


def hand_span(raw, margin=TRIM_MARGIN):
    """(start, end) of the hand-active span of a raw (T, 258) sequence, or
    the whole sequence if no hand is ever detected."""
    active = np.flatnonzero(raw[:, HANDS].any(axis=1))
    if active.size == 0:
        return 0, len(raw)
    return max(0, active[0] - margin), min(len(raw), active[-1] + 1 + margin)


def resample(seq, n=ex.SEQUENCE_LENGTH):
    return seq[np.linspace(0, len(seq) - 1, n).round().astype(int)]


def main():
    with open(MANIFEST_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    words = sorted({r["word"] for r in rows})
    word_to_idx = {w: i for i, w in enumerate(words)}

    X, y, meta = [], [], {k: [] for k in ("signer", "video_id", "split", "provided_split")}
    missing, no_hand, no_pose, span_lens = [], [], [], []
    for r in rows:
        path = os.path.join(CACHE_DIR, f"{r['video_id']}.npy")
        if not os.path.exists(path):
            missing.append(r["video_id"])
            continue
        raw = np.load(path)
        if not raw[:, HANDS].any():
            no_hand.append(r["video_id"])
        if not raw[:, POSE].any():
            no_pose.append(r["video_id"])
        a, b = hand_span(raw)
        span_lens.append(b - a)
        X.append(ex.normalize_sequence(resample(raw[a:b])))
        y.append(word_to_idx[r["word"]])
        for k in meta:
            meta[k].append(r[k])

    np.savez_compressed(
        OUTPUT_NPZ,
        X=np.stack(X).astype("float32"), y=np.array(y, dtype="int32"),
        **{k: np.array(v) for k, v in meta.items()},
    )
    with open(OUTPUT_CLASSES, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=2)

    stats = {
        "clips": len(rows), "consolidated": len(X), "missing_from_cache": missing,
        "no_hand_any_frame": no_hand, "no_pose_any_frame": no_pose,
        "hand_span_frames": {"min": int(np.min(span_lens)), "median": float(np.median(span_lens)),
                             "max": int(np.max(span_lens))},
    }
    with open(OUTPUT_STATS, "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2)

    print(f"X {np.stack(X).shape}, {len(words)} classes -> {OUTPUT_NPZ}")
    print(f"missing from cache: {len(missing)}   no hand in any frame: {len(no_hand)}   "
          f"no pose in any frame: {len(no_pose)}")
    print(f"hand-active span (frames @30fps): {stats['hand_span_frames']}")
    if no_hand:
        print(f"  no-hand clips: {no_hand}")


if __name__ == "__main__":
    main()
