"""
Quick sanity-check script: load the trained word classifier and run it
against the held-out test set, showing per-example top-5 predictions next
to the true word so you can see how it actually performs on real clips,
not just the aggregate accuracy number.

Optionally pass a video file path as an argument to test a single video
directly (e.g. a brand new clip you record yourself, not in the dataset):
  python scripts/test_word_classifier.py path\to\video.mp4

Run this with your MAIN venv active (not venv-convert):
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/test_word_classifier.py
"""

import os
import sys
import json
import numpy as np
from tensorflow import keras

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NPZ_PATH = os.path.join(DATA_DIR, "word_landmarks.npz")
CLASSES_PATH = os.path.join(DATA_DIR, "word_classes.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "word_sequence_classifier.keras")

TOP_K = 5


def predict_topk(model, classes, X):
    probs = model.predict(X, verbose=0)
    topk_idx = np.argsort(-probs, axis=1)[:, :TOP_K]
    results = []
    for i in range(len(X)):
        preds = [(classes[j], float(probs[i, j])) for j in topk_idx[i]]
        results.append(preds)
    return results


def test_on_held_out_set():
    if not os.path.exists(NPZ_PATH):
        print(f"ERROR: {NPZ_PATH} not found. Run consolidate_word_landmarks.py first.")
        return
    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: {MODEL_PATH} not found. Run train_word_classifier.py first.")
        return

    data = np.load(NPZ_PATH)
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    X_test, y_test = data["X_test"], data["y_test"]

    if len(X_test) == 0:
        print("No test examples available.")
        return

    print(f"Loading model from {MODEL_PATH} ...")
    model = keras.models.load_model(MODEL_PATH)
    print(f"Running inference on {len(X_test)} held-out test clips...\n")
    preds = predict_topk(model, classes, X_test)

    correct_top1 = 0
    correct_top5 = 0
    print(f"{'':<4}{'TRUE WORD':<20} TOP-5 PREDICTIONS (word: confidence)")
    print("-" * 100)
    for i, true_idx in enumerate(y_test):
        true_word = classes[true_idx]
        pred_words = [w for w, _ in preds[i]]
        top1_hit = pred_words[0] == true_word
        top5_hit = true_word in pred_words
        correct_top1 += top1_hit
        correct_top5 += top5_hit
        mark = "OK  " if top1_hit else ("~5  " if top5_hit else "X   ")
        pred_str = ", ".join(f"{w} ({p:.2f})" for w, p in preds[i])
        print(f"{mark}{true_word:<20} {pred_str}")

    n = len(y_test)
    print("-" * 100)
    print(f"Top-1 accuracy: {correct_top1}/{n} = {correct_top1/n:.2%}")
    print(f"Top-5 accuracy: {correct_top5}/{n} = {correct_top5/n:.2%}")


def test_on_video(video_path):
    if not os.path.exists(video_path):
        print(f"ERROR: video not found at {video_path}")
        return

    sys.path.insert(0, os.path.dirname(__file__))
    import extract_word_landmarks as ex
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    ex.ensure_model_downloaded()
    base_options = mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH)
    options = vision.HolisticLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)

    seq, _ = ex.extract_video_sequence(detector, video_path, 0)
    if seq is None:
        print(f"ERROR: could not read frames from {video_path}")
        return
    seq = ex.normalize_sequence(seq)

    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    model = keras.models.load_model(MODEL_PATH)
    preds = predict_topk(model, classes, np.expand_dims(seq, axis=0))[0]

    print(f"\nPredictions for {video_path}:")
    for w, p in preds:
        print(f"  {w:<20} {p:.2%}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_on_video(sys.argv[1])
    else:
        test_on_held_out_set()
