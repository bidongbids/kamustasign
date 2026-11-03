"""
FSL-105, step 2: extract a full-length (T, 258) Holistic landmark sequence
per clip into data/fsl_landmarks_cache/<video_id>.npy (T ~ 120).

Same features as extract_word_landmarks.py (imported from it, so the two
pipelines can't drift apart). Differences, all dataset-specific:

  - Letterbox, not stretch. FSL-105 clips are 640x360 (16:9). The ASL
    extractor resizes every frame to 640x480, which would stretch these
    vertically by 33% and distort hand geometry. Padding to 640x480 instead
    keeps the true proportions, and still gives Holistic the constant frame
    size it needs.
  - Every 2nd frame. Clips are 60 fps; the ASL clips and the live webcam are
    ~30 fps. Halving matches the motion-per-frame the tracker sees live, and
    halves the run time. Only 40 frames survive resampling anyway.
  - Full length, not resampled to 40 here. Each 4 s clip is mostly idle:
    hands start and end below the frame, and the sign itself fills ~25% of
    the clip. Resampling the whole clip would squash the sign into ~10 of
    the 40 frames, unlike a live recording where it fills most of the
    buffer. consolidate_fsl_landmarks.py trims to the span where a hand is
    visible and resamples that, which needs the untrimmed frames.
  - Sharding, for parallel runs: `python extract_fsl_landmarks.py 2 4` does
    the 3rd quarter. Each process owns its own detector and timestamps.

Resumable: cached video_ids are skipped.

Run (venv active), e.g. four shards in four terminals:
  python scripts/extract_fsl_landmarks.py 0 4
  python scripts/extract_fsl_landmarks.py 1 4   ...etc
"""

import os
import sys
import csv
import time
import numpy as np
import cv2

import extract_word_landmarks as ex  # installs the TF-Lite stub, imports mediapipe
mp = ex.mp
vision = ex.vision
mp_python = ex.mp_python

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
MANIFEST_CSV = os.path.join(DATA_DIR, "fsl_manifest.csv")
VIDEO_ROOT = os.path.join(
    DATA_DIR, "FSL-105 A dataset for recognizing 105 Filipino sign language videos"
)
CACHE_DIR = os.path.join(DATA_DIR, "fsl_landmarks_cache")

FRAME_STRIDE = 2


def letterbox(frame):
    h, w = frame.shape[:2]
    s = min(ex.TARGET_WIDTH / w, ex.TARGET_HEIGHT / h)
    nw, nh = round(w * s), round(h * s)
    frame = cv2.resize(frame, (nw, nh))
    top = (ex.TARGET_HEIGHT - nh) // 2
    left = (ex.TARGET_WIDTH - nw) // 2
    return cv2.copyMakeBorder(
        frame, top, ex.TARGET_HEIGHT - nh - top, left, ex.TARGET_WIDTH - nw - left,
        cv2.BORDER_REPLICATE,
    )


def extract_video_sequence(detector, video_path, start_timestamp_ms, flip=False):
    """As ex.extract_video_sequence, with letterboxing and frame stride, and
    NOT resampled: returns every kept frame, (T, 258). See module docstring."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None, start_timestamp_ms

    # FSL-105 is 60 fps (stride 2); our own recordings are 30 fps (stride 1).
    # Either way the cache ends up at the ~30 fps the live camera gives.
    fps = cap.get(cv2.CAP_PROP_FPS) or 60
    stride = max(1, round(fps / 30)) if fps else FRAME_STRIDE
    frame_vectors = []
    timestamp_ms = start_timestamp_ms
    frame_interval_ms = 1000 // 30
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        i += 1
        if (i - 1) % stride:
            continue
        if flip:  # a recording saved mirrored (manifest "flip" column)
            frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(letterbox(frame), cv2.COLOR_BGR2RGB)
        result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), timestamp_ms)
        frame_vectors.append(ex.landmarks_to_vector(result))
        timestamp_ms += frame_interval_ms
    cap.release()

    next_start = timestamp_ms + frame_interval_ms
    if not frame_vectors:
        return None, next_start
    return np.stack(frame_vectors), next_start


def main():
    shard = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    num_shards = int(sys.argv[2]) if len(sys.argv) > 2 else 1

    ex.ensure_model_downloaded()
    with open(MANIFEST_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))[shard::num_shards]
    os.makedirs(CACHE_DIR, exist_ok=True)

    options = vision.HolisticLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)

    processed = skipped = failed = 0
    start = time.time()
    next_ts = 0
    for i, row in enumerate(rows):
        cache_path = os.path.join(CACHE_DIR, f"{row['video_id']}.npy")
        if os.path.exists(cache_path):
            skipped += 1
            continue
        seq, next_ts = extract_video_sequence(detector, os.path.join(VIDEO_ROOT, row["path"]), next_ts,
                                              flip=row.get("flip") == "1")
        if seq is None:
            failed += 1
            print(f"  [skip] could not read video: {row['path']}", flush=True)
            continue
        np.save(cache_path, seq)
        processed += 1
        if processed % 25 == 0:
            rate = processed / (time.time() - start)
            eta = (len(rows) - i - 1) / rate / 60
            print(f"[shard {shard}] {i+1}/{len(rows)} processed={processed} "
                  f"failed={failed} ({rate:.2f}/s, ETA ~{eta:.0f} min)", flush=True)

    print(f"[shard {shard}] done in {(time.time()-start)/60:.1f} min. "
          f"processed={processed} cached={skipped} failed={failed}", flush=True)


if __name__ == "__main__":
    main()
