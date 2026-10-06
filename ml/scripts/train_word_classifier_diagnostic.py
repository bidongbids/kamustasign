"""
Diagnostic run of the SAME sequence-classifier architecture/training setup
used in train_word_classifier.py, but on the filtered, higher-examples-per-
class subset produced by consolidate_word_landmarks_diagnostic.py.

Purpose: the full 2000-class run scored test accuracy = 0.05% (= random
chance for 2000 classes), because most words only have ~4-5 training clips.
This run keeps everything else identical (architecture, augmentation, class
weighting, callbacks) and just tests whether the same setup can learn
ANYTHING above chance when given more examples per class.

  - If YES (test accuracy clearly above the printed chance baseline): the
    pipeline and architecture are sound. The fix for the full run is
    choosing the right vocabulary size / examples-per-class cutoff.
  - If NO (still at/near chance): the architecture itself needs to change
    (e.g. a metric-learning / few-shot approach), not just the class count.

Run this with your venv active (after consolidate_word_landmarks_diagnostic.py):
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/train_word_classifier_diagnostic.py
"""

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NPZ_PATH = os.path.join(DATA_DIR, "word_landmarks_diagnostic.npz")
CLASSES_PATH = os.path.join(DATA_DIR, "word_classes_diagnostic.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_PATH = os.path.join(MODEL_DIR, "word_sequence_classifier_diagnostic.keras")
LABELS_PATH = os.path.join(MODEL_DIR, "word_label_classes_diagnostic.json")

SEQUENCE_LENGTH = 40
FEATURES_PER_FRAME = 258
BATCH_SIZE = 32
EPOCHS = 100
USE_CLASS_WEIGHTS = True

SPATIAL_NOISE_STD = 0.025
SCALE_JITTER = 0.10
TRANSLATE_JITTER = 0.05
L2_WEIGHT = 1e-4


def augment_batch(X, training):
    if not training:
        return X
    B = tf.shape(X)[0]
    noise = tf.random.normal(tf.shape(X), stddev=SPATIAL_NOISE_STD)
    scale = 1.0 + tf.random.uniform([B, 1, 1], -SCALE_JITTER, SCALE_JITTER)
    shift = tf.random.uniform([B, 1, 1], -TRANSLATE_JITTER, TRANSLATE_JITTER)
    return X * scale + shift + noise


def build_model(num_classes):
    reg = keras.regularizers.l2(L2_WEIGHT)
    inputs = keras.Input(shape=(SEQUENCE_LENGTH, FEATURES_PER_FRAME))
    x = keras.layers.BatchNormalization()(inputs)
    x = keras.layers.Bidirectional(
        keras.layers.GRU(128, return_sequences=True, kernel_regularizer=reg, recurrent_regularizer=reg)
    )(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Bidirectional(
        keras.layers.GRU(64, kernel_regularizer=reg, recurrent_regularizer=reg)
    )(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Dense(128, activation="relu", kernel_regularizer=reg)(x)
    x = keras.layers.Dropout(0.4)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)
    return keras.Model(inputs, outputs)


def compute_class_weights(y, num_classes):
    counts = np.bincount(y, minlength=num_classes).astype("float32")
    counts[counts == 0] = 1
    weights = counts.sum() / (num_classes * counts)
    return {i: float(w) for i, w in enumerate(weights)}


def main():
    if not os.path.exists(NPZ_PATH):
        print(f"ERROR: {NPZ_PATH} not found.")
        print("Run scripts/consolidate_word_landmarks_diagnostic.py first.")
        return

    data = np.load(NPZ_PATH)
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    num_classes = len(classes)

    X_train, y_train = data["X_train"], data["y_train"]
    X_val, y_val = data["X_val"], data["y_val"]
    X_test, y_test = data["X_test"], data["y_test"]

    print(f"Classes: {num_classes}")
    print(f"Train: {X_train.shape}   Val: {X_val.shape}   Test: {X_test.shape}")

    if X_train.shape[0] == 0:
        print("ERROR: no training data.")
        return

    model = build_model(num_classes)
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=[
            "accuracy",
            keras.metrics.SparseTopKCategoricalAccuracy(k=5, name="top5_accuracy"),
        ],
    )
    model.summary()

    class_weight = compute_class_weights(y_train, num_classes) if USE_CLASS_WEIGHTS else None

    train_ds = tf.data.Dataset.from_tensor_slices((X_train, y_train))
    train_ds = train_ds.shuffle(len(X_train)).batch(BATCH_SIZE)
    train_ds = train_ds.map(lambda x, y: (augment_batch(x, training=True), y),
                             num_parallel_calls=tf.data.AUTOTUNE)
    train_ds = train_ds.prefetch(tf.data.AUTOTUNE)

    val_ds = None
    if len(X_val) > 0:
        val_ds = tf.data.Dataset.from_tensor_slices((X_val, y_val)).batch(BATCH_SIZE)

    callbacks = [
        keras.callbacks.EarlyStopping(
            monitor="val_loss" if val_ds is not None else "loss",
            patience=12, restore_best_weights=True,
        ),
        keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss" if val_ds is not None else "loss",
            factor=0.5, patience=6,
        ),
    ]

    print("\nTraining (diagnostic run)...")
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=2,
    )

    chance = 1.0 / num_classes
    if len(X_test) > 0:
        print("\nEvaluating on held-out test set...")
        results = model.evaluate(X_test, y_test, verbose=0, return_dict=True)
        print(f"Test top-1 accuracy: {results['accuracy']:.4f}")
        print(f"Test top-5 accuracy: {results['top5_accuracy']:.4f}")
        print(f"Test loss: {results['loss']:.4f}")
        print(f"(Random chance for {num_classes} classes: {chance:.4f})")
    else:
        print(f"\nNo test examples available - skipping held-out evaluation. "
              f"(Random chance for {num_classes} classes: {chance:.4f})")

    os.makedirs(MODEL_DIR, exist_ok=True)
    model.save(MODEL_PATH)
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2)

    print(f"\nDiagnostic model saved to: {MODEL_PATH}")
    print(f"Label mapping saved to: {LABELS_PATH}")


if __name__ == "__main__":
    main()
