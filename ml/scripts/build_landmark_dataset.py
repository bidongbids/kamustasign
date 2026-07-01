"""
Week 2 milestone: batch-extract hand landmarks from the ASL Alphabet dataset,
saving results to a labeled CSV ready for training.

For each image in ml/data/asl_alphabet_train/asl_alphabet_train/<LETTER>/*.jpg:
  1. Run MediaPipe hand landmark detection (same model as the webcam script).
  2. If a hand is detected, flatten all 21 landmarks (x, y, z each) into one
     63-value row.
  3. Save that row + the letter label to a CSV.

Images with no detected hand are skipped and counted (some datasets have a
few bad/blank images - this is normal, not a bug).

NOTE: 87,000 images is a lot. This script processes a configurable subset
per class by default (see SAMPLES_PER_CLASS below) so your first run finishes
in minutes, not hours, and you can sanity-check the output before committing
to a full run. Bump it up once you've confirmed the pipeline works.

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/build_landmark_dataset.py
"""

import os
import csv
import time
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

# ---- Config ----------------------------------------------------------
DATA_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data",
    "asl_alphabet_train", "asl_alphabet_train"
)
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "hand_landmarker.task")
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "landmarks_dataset.csv")

# Start small to verify the pipeline works before running the full 87,000.
# Each class folder has ~3,000 images; set to None to process ALL of them.
SAMPLES_PER_CLASS = None
# -----------------------------------------------------------------------


def build_header():
    header = ["label"]
    for i in range(21):
        header += [f"x{i}", f"y{i}", f"z{i}"]
    return header


def main():
    if not os.path.exists(MODEL_PATH):
        print(f"ERROR: model file not found at {MODEL_PATH}")
        print("Run scripts/extract_landmarks.py once first - it downloads the model.")
        return

    if not os.path.isdir(DATA_DIR):
        print(f"ERROR: dataset folder not found at {DATA_DIR}")
        print("Check that you extracted the Kaggle zip into ml/data/ correctly.")
        return

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = vision.HandLandmarkerOptions(
        base_options=base_options,
        num_hands=1,  # dataset images are single-hand, single-sign shots
        min_hand_detection_confidence=0.4,
        min_hand_presence_confidence=0.4,
    )
    detector = vision.HandLandmarker.create_from_options(options)

    class_folders = sorted(
        d for d in os.listdir(DATA_DIR) if os.path.isdir(os.path.join(DATA_DIR, d))
    )
    print(f"Found {len(class_folders)} classes: {class_folders}\n")

    rows = []
    total_processed = 0
    total_skipped = 0
    start_time = time.time()

    for class_name in class_folders:
        class_path = os.path.join(DATA_DIR, class_name)
        image_files = sorted(os.listdir(class_path))
        if SAMPLES_PER_CLASS is not None:
            image_files = image_files[:SAMPLES_PER_CLASS]

        class_detected = 0
        for fname in image_files:
            fpath = os.path.join(class_path, fname)
            image = cv2.imread(fpath)
            if image is None:
                total_skipped += 1
                continue

            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_image)
            result = detector.detect(mp_image)

            if not result.hand_landmarks:
                total_skipped += 1
                continue

            landmarks = result.hand_landmarks[0]
            row = [class_name]
            for lm in landmarks:
                row += [lm.x, lm.y, lm.z]
            rows.append(row)
            class_detected += 1
            total_processed += 1

        print(f"  {class_name}: {class_detected}/{len(image_files)} images -> landmarks detected")

    elapsed = time.time() - start_time
    print(f"\nDone in {elapsed:.1f}s")
    print(f"Total rows written: {total_processed}")
    print(f"Total skipped (no hand detected / bad image): {total_skipped}")

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(build_header())
        writer.writerows(rows)

    print(f"\nSaved to: {OUTPUT_CSV}")
    print("This CSV is your training data - next step is training a CNN/classifier on it.")


if __name__ == "__main__":
    main()
