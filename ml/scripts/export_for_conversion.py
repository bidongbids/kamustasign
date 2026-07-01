"""
Re-saves the trained model in .h5 format, which the tensorflowjs converter
tool expects. Run this in your MAIN venv (the one with tensorflow installed),
NOT the conversion venv.
"""

import os
from tensorflow import keras

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
KERAS_PATH = os.path.join(MODEL_DIR, "asl_landmark_classifier.keras")
H5_PATH = os.path.join(MODEL_DIR, "asl_landmark_classifier.h5")


def main():
    if not os.path.exists(KERAS_PATH):
        print(f"ERROR: trained model not found at {KERAS_PATH}")
        print("Run scripts/train_classifier.py first.")
        return

    print(f"Loading {KERAS_PATH} ...")
    model = keras.models.load_model(KERAS_PATH)

    print(f"Saving as {H5_PATH} ...")
    model.save(H5_PATH)

    print("\nDone. This .h5 file is what the tensorflowjs converter needs next.")


if __name__ == "__main__":
    main()
