"""
Live webcam test for the trained word classifier - sign a word in front of
your camera and see the model's top-5 predictions.

How it works: the model was trained on whole-clip sequences resampled to 40
frames (not a continuous sliding window), so this uses a manual start/stop
recording flow that mirrors how the training clips were captured - press
SPACE to start recording a sign, sign it, press SPACE again to stop, and it
classifies exactly that clip (resampled to 40 frames, same as training).

This is NOT the same as the continuous "always watching" inference the app
will eventually need for a real product - that requires separate sign-
segmentation logic (automatically detecting where a sign starts/ends in a
live stream), which is a bigger design question for the app integration
step, not this quick test.

Controls:
  SPACE - start / stop recording a sign
  Q     - quit

Run this with your MAIN venv active (not venv-convert):
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/test_webcam.py
"""

import os
import sys
import glob
import json
import time
import numpy as np
import cv2
import mediapipe as mp
from tensorflow import keras

sys.path.insert(0, os.path.dirname(__file__))
import extract_word_landmarks as ex
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CLASSES_PATH = os.path.join(DATA_DIR, "word_classes.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

SEQUENCE_LENGTH = 40
TOP_K = 5


def main():
    model_paths = sorted(
        p for p in glob.glob(os.path.join(MODEL_DIR, "word_sequence_classifier*.keras"))
        if "diagnostic" not in os.path.basename(p)
    )
    if not model_paths:
        print(f"ERROR: no trained models found in {MODEL_DIR}")
        print("Run scripts/train_word_classifier.py first.")
        return

    print(f"Loading {len(model_paths)} model(s) for ensemble inference:")
    models = []
    for p in model_paths:
        print(f"  {os.path.basename(p)}")
        models.append(keras.models.load_model(p))
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))

    ex.ensure_model_downloaded()
    base_options = mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH)
    options = vision.HolisticLandmarkerOptions(
        base_options=base_options,
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: could not open webcam (index 0). If you have multiple "
              "cameras, edit this script to try cv2.VideoCapture(1), etc.")
        return

    recording = False
    frames = []
    timestamp_ms = 0
    frame_interval_ms = 1000 // 30
    last_result_text = []
    result_display_until = 0

    print("\nControls: SPACE = start/stop recording a sign, Q = quit\n")

    while True:
        ok, frame = cap.read()
        if not ok:
            print("ERROR: lost webcam feed.")
            break
        # Only mirror the PREVIEW, not the frame fed to the model - the
        # training videos were recorded normally (not selfie-mirrored), so
        # feeding a flipped frame into the detector would be a real
        # train/inference mismatch, not just a cosmetic choice.
        display = cv2.flip(frame, 1)

        proc = cv2.resize(frame, (ex.TARGET_WIDTH, ex.TARGET_HEIGHT))
        rgb = cv2.cvtColor(proc, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = detector.detect_for_video(mp_image, timestamp_ms)
        timestamp_ms += frame_interval_ms

        if recording:
            vec = ex.landmarks_to_vector(result)
            frames.append(vec)
            cv2.circle(display, (30, 30), 12, (0, 0, 255), -1)
            cv2.putText(display, f"REC {len(frames)} frames", (50, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
        else:
            cv2.putText(display, "SPACE = record sign, Q = quit", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        if time.time() < result_display_until:
            for i, line in enumerate(last_result_text):
                cv2.putText(display, line, (20, 90 + i * 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        cv2.imshow("KamustaSign - word model test", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q'):
            break
        elif key == ord(' '):
            if not recording:
                recording = True
                frames = []
                print("Recording... press SPACE again to stop.")
            else:
                recording = False
                print(f"Stopped. Captured {len(frames)} frames.")
                if len(frames) < 3:
                    print("Too few frames, try again.")
                    last_result_text = ["Too few frames - try again"]
                    result_display_until = time.time() + 3
                else:
                    seq = np.stack(frames)
                    idx = np.linspace(0, len(seq) - 1, SEQUENCE_LENGTH).round().astype(int)
                    seq = seq[idx]
                    seq = ex.normalize_sequence(seq)
                    batch = np.expand_dims(seq, 0)
                    probs = np.mean([m.predict(batch, verbose=0)[0] for m in models], axis=0)
                    top_idx = np.argsort(-probs)[:TOP_K]
                    print("Top predictions:")
                    last_result_text = []
                    for j in top_idx:
                        line = f"{classes[j]}: {probs[j]:.1%}"
                        print(f"  {line}")
                        last_result_text.append(line)
                    result_display_until = time.time() + 6

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
