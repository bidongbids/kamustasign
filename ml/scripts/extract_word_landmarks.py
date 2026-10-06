"""
Word-level dataset, step 2: extract a landmark sequence from every video in
the manifest, using MediaPipe Holistic (pose + both hands) instead of the
single-frame Hand Landmarker used for the alphabet dataset.

Why Holistic and why a sequence, not a single frame:
  Alphabet signs are a static hand shape - one frame is enough. Word-level
  ASL signs involve movement through space over time (and often the arms/
  shoulders, not just the hand), so we need (a) landmarks across many frames,
  not one, and (b) pose landmarks in addition to hand landmarks, not just hands.

Per-frame feature vector (258 values):
  pose:        33 landmarks x (x, y, z, visibility)  = 132
  left hand:   21 landmarks x (x, y, z)               = 63
  right hand:  21 landmarks x (x, y, z)               = 63
  (face landmarks are deliberately excluded - not needed for sign
  classification and would triple the feature size for no benefit here.)
If a hand or pose is not detected in a given frame, that segment is filled
with zeros rather than dropping the frame, so every video produces a
same-length sequence.

Fixed sequence length:
  Clips vary in length (roughly 2-5 seconds, 24-30fps in this dataset).
  Each video is resampled to SEQUENCE_LENGTH frames using evenly spaced
  indices (numpy.linspace), so short and long clips both end up as a
  (SEQUENCE_LENGTH, 258) array - required for batching into a model.

THIS IS A LONG-RUNNING JOB. With ~12,500 videos, expect this to take
multiple hours depending on your CPU (Holistic is heavier than the
hand-only model used for the alphabet dataset). Because of that, this
script checkpoints per video:
  - Each video's extracted sequence is cached as its own .npy file under
    ml/data/word_landmarks_cache/<video_id>.npy the moment it's computed.
  - If you stop the script (Ctrl+C, laptop sleep, crash) and re-run it,
    already-cached videos are skipped, so you resume close to where you
    left off instead of starting over.
  - Run scripts/consolidate_word_landmarks.py afterward to merge the cache
    into one training-ready .npz file.

Quick-test mode:
  Set WORDS_LIMIT below to a small number (e.g. 20) for your first run, to
  confirm the pipeline works end to end in a couple of minutes before
  committing to the full multi-hour run overnight. Set it back to None to
  process everything.

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/extract_word_landmarks.py
"""

# --- Windows Application Control workaround ---
# This machine's Application Control policy blocks loading a compiled TFLite
# telemetry file, which crashes even a plain `import tensorflow` (TF's own
# __init__ eagerly walks through compat.v1.lite.experimental.authoring on
# load, and mediapipe triggers a full `import tensorflow` internally). That
# module is pure conversion-telemetry plumbing, never touched by anything in
# this script, so a dummy stand-in is safe - registering it in sys.modules
# before tensorflow imports makes Python use the stub instead of loading the
# real (blocked) file.
import sys
import types

_metrics_stub = types.ModuleType(
    "tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper"
)


class _DummyMetricsWrapper:
    def __init__(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        return lambda *args, **kwargs: None


_metrics_stub.MetricsWrapper = _DummyMetricsWrapper
sys.modules["tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper"] = _metrics_stub
# --- end workaround ---

import os
import csv
import time
import urllib.request
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ---- Config ----------------------------------------------------------
MANIFEST_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "word_manifest.csv")
VIDEO_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "word_videos")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "word_landmarks_cache")
MODEL_PATH = os.path.join(os.path.dirname(__file__), "holistic_landmarker.task")
MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task"
)

SEQUENCE_LENGTH = 40   # frames per video after resampling
NUM_POSE = 33
NUM_HAND = 21
FEATURES_PER_FRAME = NUM_POSE * 4 + NUM_HAND * 3 + NUM_HAND * 3  # 258

# Videos in this dataset come in mixed resolutions. The same Holistic
# detector is reused across every video (recreating one per video would be
# much slower), and its internal segmentation-mask smoothing keeps state
# between frames that assumes a constant frame size - so switching to a
# different-resolution video mid-run crashes it. Resizing every frame to one
# fixed size before detection avoids that entirely.
TARGET_WIDTH = 640
TARGET_HEIGHT = 480

# Set to a small int (e.g. 20) to test on a subset of WORDS first.
# Set to None to process every word in the manifest.
WORDS_LIMIT = None
# -----------------------------------------------------------------------


def ensure_model_downloaded():
    if os.path.exists(MODEL_PATH):
        return
    print(f"Model not found locally. Downloading from:\n  {MODEL_URL}")
    try:
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print("Download complete.")
    except Exception as e:
        print("Automatic download failed:", e)
        print(
            "Download it manually by pasting the URL above into your browser, "
            f"then save the file as '{MODEL_PATH}'."
        )
        raise SystemExit(1)


# MediaPipe Pose landmark indices for the shoulders - used as a body-
# centered reference frame in normalize_sequence() below.
LEFT_SHOULDER_IDX = 11
RIGHT_SHOULDER_IDX = 12

# MediaPipe hand landmark indices. 0 is the wrist; 9 is the middle-finger
# knuckle, whose distance from the wrist is the standard palm-length proxy.
HAND_WRIST_IDX = 0
HAND_MIDDLE_MCP_IDX = 9

# What normalize_sequence() emits, and therefore what the model consumes:
# the original 258 body-normalised values plus one wrist-relative block per
# hand. The cache on disk still holds raw 258-value frames.
MODEL_FEATURES_PER_FRAME = FEATURES_PER_FRAME + 2 * NUM_HAND * 3  # 384


def wrist_relative_hand(seq, base):
    """Re-express one hand's 21 landmarks relative to that hand's own wrist.

    Why this exists: the body normalisation below divides every landmark,
    hands included, by shoulder width. A finger's displacement from its wrist
    is only 1-2% of shoulder width, so handshape survives only as tiny
    perturbations riding on top of much larger arm-position values. Measured
    consequence: the classifier confused sign pairs that share location and
    movement but differ in handshape - pink/sweet, work/appointment, yes/no,
    bad/hot. Re-centring each hand on its own wrist and scaling by palm length
    puts handshape on its own footing, at a magnitude the model can actually
    use.

    Must be fed RAW landmarks. An undetected hand is all zeros in the cache,
    and that has to stay zero here; after the shoulder normalisation it would
    have become a spurious non-zero position instead.

    (T, 258) slice at `base` -> (T, 63) float32.
    """
    frames = seq.shape[0]
    pts = seq[:, base:base + NUM_HAND * 3].reshape(frames, NUM_HAND, 3)
    wrist = pts[:, HAND_WRIST_IDX, :]
    palm = np.linalg.norm(pts[:, HAND_MIDDLE_MCP_IDX, :] - wrist, axis=1)

    detected = palm > 1e-6
    rel = pts - wrist[:, None, :]
    rel = rel / np.where(detected, palm, 1.0)[:, None, None]
    rel[~detected] = 0.0
    return rel.reshape(frames, -1).astype("float32")


def normalize_sequence(seq):
    """Center every frame on the shoulder midpoint and scale by shoulder
    width, so the features are invariant to where you stand and how far
    you are from the camera - two identical signs performed at different
    distances/positions should produce nearly the same feature values.
    Then append the per-hand wrist-relative blocks described above.
    Input: (T, FEATURES_PER_FRAME). Output: (T, MODEL_FEATURES_PER_FRAME)."""
    seq = seq.copy().astype("float32")

    # Derived from the raw values, before the rescaling below.
    left_rel = wrist_relative_hand(seq, NUM_POSE * 4)
    right_rel = wrist_relative_hand(seq, NUM_POSE * 4 + NUM_HAND * 3)

    ls_base = LEFT_SHOULDER_IDX * 4
    rs_base = RIGHT_SHOULDER_IDX * 4
    left_shoulder = seq[:, ls_base:ls_base + 3]
    right_shoulder = seq[:, rs_base:rs_base + 3]
    origin = (left_shoulder + right_shoulder) / 2.0
    scale = np.linalg.norm(left_shoulder - right_shoulder, axis=1, keepdims=True)
    scale = np.where(scale < 1e-6, 1.0, scale)  # avoid divide-by-zero if pose undetected

    for i in range(NUM_POSE):
        base = i * 4
        seq[:, base:base + 3] = (seq[:, base:base + 3] - origin) / scale

    for i in range(NUM_HAND):
        base = NUM_POSE * 4 + i * 3
        seq[:, base:base + 3] = (seq[:, base:base + 3] - origin) / scale

    for i in range(NUM_HAND):
        base = NUM_POSE * 4 + NUM_HAND * 3 + i * 3
        seq[:, base:base + 3] = (seq[:, base:base + 3] - origin) / scale

    return np.concatenate([seq, left_rel, right_rel], axis=1)


def landmarks_to_vector(result):
    """Flatten one HolisticLandmarkerResult into a fixed 258-value vector,
    zero-filling any component that wasn't detected in this frame."""
    vec = np.zeros(FEATURES_PER_FRAME, dtype=np.float32)
    offset = 0

    if result.pose_landmarks:
        pose = result.pose_landmarks[0] if isinstance(result.pose_landmarks[0], list) else result.pose_landmarks
        for i, lm in enumerate(pose[:NUM_POSE]):
            vec[offset + i * 4: offset + i * 4 + 4] = [lm.x, lm.y, lm.z, lm.visibility]
    offset += NUM_POSE * 4

    if result.left_hand_landmarks:
        hand = result.left_hand_landmarks[0] if isinstance(result.left_hand_landmarks[0], list) else result.left_hand_landmarks
        for i, lm in enumerate(hand[:NUM_HAND]):
            vec[offset + i * 3: offset + i * 3 + 3] = [lm.x, lm.y, lm.z]
    offset += NUM_HAND * 3

    if result.right_hand_landmarks:
        hand = result.right_hand_landmarks[0] if isinstance(result.right_hand_landmarks[0], list) else result.right_hand_landmarks
        for i, lm in enumerate(hand[:NUM_HAND]):
            vec[offset + i * 3: offset + i * 3 + 3] = [lm.x, lm.y, lm.z]

    return vec


def extract_video_sequence(detector, video_path, start_timestamp_ms):
    """Read a video, run Holistic on every frame, resample to
    SEQUENCE_LENGTH frames. Returns (sequence, next_timestamp_ms), where
    sequence is a (SEQUENCE_LENGTH, 258) float32 array, or None if the video
    couldn't be opened / had zero readable frames.

    The same detector instance is reused across every video in the manifest
    (creating a fresh one per video would be slow), and MediaPipe's VIDEO
    running mode requires strictly increasing timestamps for the lifetime of
    the detector - not just within a single video. So timestamps are NOT
    reset to 0 for each video; the caller passes in where the previous video
    left off, and this returns where this video ended so the next call can
    continue from there."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None, start_timestamp_ms

    frame_vectors = []
    timestamp_ms = start_timestamp_ms
    frame_interval_ms = 1000 // 25  # nominal; VIDEO mode just needs increasing timestamps

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.resize(frame, (TARGET_WIDTH, TARGET_HEIGHT))
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        result = detector.detect_for_video(mp_image, timestamp_ms)
        frame_vectors.append(landmarks_to_vector(result))
        timestamp_ms += frame_interval_ms

    cap.release()

    # Next video starts strictly after where this one left off.
    next_start = timestamp_ms + frame_interval_ms

    if len(frame_vectors) == 0:
        return None, next_start

    frame_vectors = np.stack(frame_vectors)  # (n_frames, 258)
    n_frames = frame_vectors.shape[0]

    # Resample to a fixed length via nearest-index sampling.
    if n_frames == SEQUENCE_LENGTH:
        return frame_vectors, next_start
    idx = np.linspace(0, n_frames - 1, SEQUENCE_LENGTH).round().astype(int)
    return frame_vectors[idx], next_start


def main():
    ensure_model_downloaded()

    if not os.path.exists(MANIFEST_CSV):
        print(f"ERROR: manifest not found at {MANIFEST_CSV}")
        print("Run scripts/build_word_video_manifest.py first.")
        return

    with open(MANIFEST_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    if WORDS_LIMIT is not None:
        allowed_words = sorted({r["word"] for r in rows})[:WORDS_LIMIT]
        rows = [r for r in rows if r["word"] in allowed_words]
        print(f"WORDS_LIMIT set: processing only {len(allowed_words)} words "
              f"({len(rows)} videos) for this test run.")

    os.makedirs(CACHE_DIR, exist_ok=True)

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.HolisticLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)

    total = len(rows)
    skipped_cached = 0
    processed = 0
    failed = 0
    start = time.time()
    next_ts = 0  # monotonically increasing across the WHOLE run, not per-video

    for i, row in enumerate(rows):
        video_id = row["video_id"]
        cache_path = os.path.join(CACHE_DIR, f"{video_id}.npy")
        if os.path.exists(cache_path):
            skipped_cached += 1
            continue

        video_path = os.path.join(VIDEO_ROOT, row["path"])
        seq, next_ts = extract_video_sequence(detector, video_path, next_ts)
        if seq is None:
            failed += 1
            print(f"  [skip] could not read video: {video_path}")
            continue

        np.save(cache_path, seq)
        processed += 1

        if processed % 50 == 0:
            elapsed = time.time() - start
            rate = processed / elapsed
            remaining = total - i - 1
            eta_min = (remaining / rate) / 60 if rate > 0 else float("inf")
            print(f"[{i+1}/{total}] processed={processed} cached_skipped={skipped_cached} "
                  f"failed={failed}  ({rate:.2f} videos/sec, ETA ~{eta_min:.0f} min)")

    elapsed = time.time() - start
    print(f"\nDone in {elapsed/60:.1f} min this run.")
    print(f"Newly processed: {processed}   Already cached (skipped): {skipped_cached}   Failed: {failed}")
    print(f"\nCache now has {len(os.listdir(CACHE_DIR))} files in: {CACHE_DIR}")
    print("Next step: run scripts/consolidate_word_landmarks.py to merge the cache into one .npz")


if __name__ == "__main__":
    main()
