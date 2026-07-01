"""
Week 2/3 milestone: train a first-pass classifier on extracted hand landmarks.

Input: ml/data/landmarks_dataset.csv (produced by build_landmark_dataset.py)
Output:
  - ml/models/asl_landmark_classifier.keras  (the trained model)
  - ml/models/label_classes.json             (maps class index -> letter, needed later
                                               for the app to decode predictions)

Architecture note: since MediaPipe already reduces each image to 21 landmark
coordinates (63 numbers total) instead of raw pixels, we use a small dense
neural network (MLP), not a CNN. CNNs are built for spatial pixel grids;
a landmark vector doesn't have that structure, so a dense network is the
correct, standard choice here - it also trains much faster and needs far
less data than an image-based CNN would.

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/train_classifier.py
"""

import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import tensorflow as tf
from tensorflow import keras

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "landmarks_dataset.csv")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "asl_landmark_classifier.keras")
LABELS_PATH = os.path.join(MODEL_DIR, "label_classes.json")


def main():
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: dataset CSV not found at {CSV_PATH}")
        print("Run scripts/build_landmark_dataset.py first.")
        return

    print(f"Loading {CSV_PATH} ...")
    df = pd.read_csv(CSV_PATH)
    df = df[df["label"] != "nothing"]
    print(f"Loaded {len(df)} rows, {df['label'].nunique()} classes.")
    print("Class counts:\n", df["label"].value_counts().sort_index())

    # Features = all columns except 'label' (63 columns: x0,y0,z0 ... x20,y20,z20)
    X = df.drop(columns=["label"]).values.astype("float32")
    y_raw = df["label"].values

    # Encode string labels (A, B, C...) to integers for training
    encoder = LabelEncoder()
    y = encoder.fit_transform(y_raw)
    num_classes = len(encoder.classes_)
    print(f"\nEncoded {num_classes} classes: {list(encoder.classes_)}")

    # Split: 70% train, 15% validation, 15% test
    X_train, X_temp, y_train, y_temp = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    X_val, X_test, y_val, y_test = train_test_split(
        X_temp, y_temp, test_size=0.5, random_state=42, stratify=y_temp
    )
    print(f"\nTrain: {len(X_train)}  Val: {len(X_val)}  Test: {len(X_test)}")

    # Build the model: small dense network, appropriate for 63-value landmark input
    model = keras.Sequential([
        keras.layers.Input(shape=(63,)),
        keras.layers.Dense(128, activation="relu"),
        keras.layers.Dropout(0.3),
        keras.layers.Dense(64, activation="relu"),
        keras.layers.Dropout(0.2),
        keras.layers.Dense(num_classes, activation="softmax"),
    ])

    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.summary()

    print("\nTraining...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=40,
        batch_size=32,
        verbose=2,
    )

    print("\nEvaluating on held-out test set...")
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"Test accuracy: {test_acc:.4f}  Test loss: {test_loss:.4f}")

    # Save model + label mapping
    os.makedirs(MODEL_DIR, exist_ok=True)
    model.save(MODEL_PATH)
    with open(LABELS_PATH, "w") as f:
        json.dump(list(encoder.classes_), f, indent=2)

    print(f"\nModel saved to: {MODEL_PATH}")
    print(f"Label mapping saved to: {LABELS_PATH}")
    print("\nThis is a first-pass model on a small sample (200 images/class).")
    print("Once you're happy with the pipeline, re-run build_landmark_dataset.py")
    print("with SAMPLES_PER_CLASS = None for the full dataset, then re-train.")


if __name__ == "__main__":
    main()
