"""
Word-level dataset, step 4: train a sequence classifier on the landmark
sequences produced by consolidate_word_landmarks.py.

Architecture note - why a Bidirectional GRU stack, not the dense MLP used
for the alphabet classifier:
  The alphabet model classifies a single static hand shape (63 numbers, no
  time dimension), so a small dense network was the right, standard choice.
  Word-level signs are defined by *movement over time* (a (40, 258) sequence:
  40 resampled frames x pose+both-hands landmarks per frame), so the model
  needs to learn temporal patterns, not just a fixed pose. A Bidirectional
  GRU reads the sequence forward and backward and is a standard, well-
  precedented choice for this exact problem (the same family of approach
  used in Montefalcon et al., 2023 for FSL, cited in the manuscript).

Why on-the-fly augmentation, not pre-generated augmented copies on disk:
  With as few as 2-17 examples per word across up to ~2,000 classes, this is
  a genuine few-shot problem - training on the raw examples alone will
  overfit fast. Augmentation is applied fresh, randomly, every epoch
  (spatial jitter, small scale/translation, temporal resampling jitter)
  instead of writing fixed augmented copies to disk, so the model never
  sees the exact same input twice.

Why top-5 accuracy is reported alongside top-1:
  With up to ~2,000 classes (versus 26 for the alphabet model), top-1
  accuracy alone is a harsh, easy-to-misread number. Reporting top-5 too
  (a standard practice in large-vocabulary sign language literature, e.g.
  the WLASL benchmark) gives a more honest picture of whether the model is
  "close" on the signs it misses outright.

Class imbalance:
  Some words have far more training clips than others (2 vs 17). This script
  computes per-class weights so rare classes aren't drowned out by common
  ones; see USE_CLASS_WEIGHTS below.

Vocabulary size:
  A full 2000-class run of this architecture scored 0.05% test accuracy -
  random chance - because most words only had ~4-5 training clips. This is
  why consolidate_word_landmarks.py now filters to words with >= 10 clips
  (see MIN_EXAMPLES there) before this script ever sees the data: diagnostic
  runs showed that cutoff gets meaningfully above chance (~10% top-1 / ~30%
  top-5 test accuracy on 133 words, vs 0.75% chance). The augmentation and
  L2 regularization settings below were also tuned on that diagnostic run.

Ensembling:
  Pass a seed number as an argument to train an additional model for an
  ensemble (averaging several models' predictions is a well-established,
  low-effort way to gain a few extra points of accuracy - each model makes
  slightly different mistakes, and averaging smooths them out). Seed 0 (no
  argument) is the "main" model and always saves as word_sequence_classifier
  .keras; any other seed saves as word_sequence_classifier_seed{N}.keras.
  After training a few, run scripts/test_ensemble.py to see the combined
  accuracy vs. any single model.

Run this with your venv active (after steps 1-3 have produced word_landmarks.npz):
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/train_word_classifier.py          (main model, seed 0)
  python scripts/train_word_classifier.py 1        (extra model for ensemble)
  python scripts/train_word_classifier.py 2        (another one)
"""

# --- Windows Application Control workaround ---
# This machine's Application Control policy blocks loading a compiled TFLite
# telemetry file, which crashes even a plain `import tensorflow` (TF's own
# __init__ eagerly walks through compat.v1.lite.experimental.authoring on
# load). That module is pure conversion-telemetry plumbing, never touched by
# anything in this script, so a dummy stand-in is safe - registering it in
# sys.modules before tensorflow imports makes Python use the stub instead of
# loading the real (blocked) file.
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
import sys
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 0
tf.random.set_seed(SEED)
np.random.seed(SEED)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NPZ_PATH = os.path.join(DATA_DIR, "word_landmarks.npz")
CLASSES_PATH = os.path.join(DATA_DIR, "word_classes.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
MODEL_SUFFIX = "" if SEED == 0 else f"_seed{SEED}"
MODEL_PATH = os.path.join(MODEL_DIR, f"word_sequence_classifier{MODEL_SUFFIX}.keras")
LABELS_PATH = os.path.join(MODEL_DIR, "word_label_classes.json")

SEQUENCE_LENGTH = 40
# Read from the data rather than hardcoded: consolidate_word_landmarks.py
# decides the feature width (258 body-normalised values plus the two
# wrist-relative hand blocks = 384), and a stale constant here would fail
# confusingly at the first batch instead of clearly at load time.
FEATURES_PER_FRAME = None  # set in main() from X_train.shape[-1]
BATCH_SIZE = 32
EPOCHS = 100
USE_CLASS_WEIGHTS = True

# Augmentation strength - conservative defaults, tune once you see results.
SPATIAL_NOISE_STD = 0.025    # gaussian jitter added to x,y,z,(visibility)
SCALE_JITTER = 0.10          # +/- 10% random scale
TRANSLATE_JITTER = 0.05      # +/- small random shift in x,y
L2_WEIGHT = 1e-4             # weight decay on GRU/dense layers


def augment_batch(X, training):
    """Apply light random augmentation to a batch of (B, 40, 258) sequences.
    Only used during training; validation/test data passes through unchanged."""
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
    # unroll=True: SEQUENCE_LENGTH is a small fixed 40, so we can afford to
    # have Keras compile the recurrence into a static, fully-unrolled chain
    # of ops instead of a tf.while_loop. This avoids a whole family of TF.js
    # converter/runtime issues with dynamic control-flow graphs (the
    # "dynamic op 'Exit'" predict() crash, "Tensor is disposed" races when
    # running executeAsync() on multiple models, and "Cannot compute the
    # outputs [Identity]" errors) - all three turned out to be different
    # symptoms of the same root cause.
    x = keras.layers.Bidirectional(
        keras.layers.GRU(128, return_sequences=True, unroll=True,
                          kernel_regularizer=reg, recurrent_regularizer=reg)
    )(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Bidirectional(
        keras.layers.GRU(64, unroll=True, kernel_regularizer=reg, recurrent_regularizer=reg)
    )(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Dense(128, activation="relu", kernel_regularizer=reg)(x)
    x = keras.layers.Dropout(0.4)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)
    return keras.Model(inputs, outputs)


def compute_class_weights(y, num_classes):
    counts = np.bincount(y, minlength=num_classes).astype("float32")
    counts[counts == 0] = 1  # avoid div by zero for classes with no train examples
    weights = counts.sum() / (num_classes * counts)
    return {i: float(w) for i, w in enumerate(weights)}


def main():
    if not os.path.exists(NPZ_PATH):
        print(f"ERROR: {NPZ_PATH} not found.")
        print("Run build_word_video_manifest.py -> extract_word_landmarks.py -> "
              "consolidate_word_landmarks.py first.")
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
        print("ERROR: no training data. Did extraction/consolidation actually run?")
        return

    global FEATURES_PER_FRAME
    FEATURES_PER_FRAME = int(X_train.shape[-1])
    print(f"Features per frame: {FEATURES_PER_FRAME}")

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

    print("\nTraining...")
    model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=EPOCHS,
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=2,
    )

    if len(X_test) > 0:
        print("\nEvaluating on held-out test set...")
        results = model.evaluate(X_test, y_test, verbose=0, return_dict=True)
        print(f"Test top-1 accuracy: {results['accuracy']:.4f}")
        print(f"Test top-5 accuracy: {results['top5_accuracy']:.4f}")
        print(f"Test loss: {results['loss']:.4f}")
    else:
        print("\nNo test examples available (every class had <5 examples) - "
              "skipping held-out evaluation. Rely on validation metrics above.")

    os.makedirs(MODEL_DIR, exist_ok=True)
    model.save(MODEL_PATH)
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2)

    print(f"\nModel saved to: {MODEL_PATH}")
    print(f"Label mapping saved to: {LABELS_PATH}")
    print("Next step: export_word_model_for_conversion.py, then convert to TF.js, "
          "same as the alphabet model.")


if __name__ == "__main__":
    main()
