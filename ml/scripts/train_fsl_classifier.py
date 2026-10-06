"""
FSL-105, step 4: train the sequence classifier on data/fsl_landmarks.npz.

Same architecture and training setup as train_word_classifier.py (BiGRU(128)
-> BiGRU(64) -> Dense(128) -> softmax, unroll=True, class weights, L2,
dropout, early stopping, ReduceLROnPlateau). What's different is the split,
because FSL-105 has four signers and the point is to measure how the model
does on a signer it has never seen (see build_fsl_manifest.py):

  --split signer      (default) the manifest's split column: signer D held out
                      as test, one take per (class, signer) of A-C as val.
                      These are the models that get deployed.
                      -> models/fsl_sequence_classifier_seed{S}.keras
  --split loso:X      leave-one-signer-out fold: X is test, val is one take
                      per (class, signer) of the other three. Run A-D to get
                      the cross-validated headline number.
                      -> models/fsl_loso{X}_seed{S}.keras
  --split provided    the dataset's own train.csv/test.csv (signer-
                      DEPENDENT - every signer is in both), val carved from
                      train the same way. For comparison only.
                      -> models/fsl_provided_seed{S}.keras

Validation is always drawn from the training signers, never the test one, so
early stopping can't peek at the held-out signer.

Each run also writes models/fsl_results/<name>.npz (test probabilities,
labels, video ids) so test_fsl_ensemble.py can score ensembles and per-class
accuracy without reloading models.

Run (venv active):
  python scripts/train_fsl_classifier.py 0                  (seed 0, deployable)
  python scripts/train_fsl_classifier.py 1 --split loso:A
"""

# --- Windows Application Control workaround (see train_word_classifier.py) ---
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
import json
import argparse
import numpy as np
import tensorflow as tf
from tensorflow import keras

parser = argparse.ArgumentParser()
parser.add_argument("seed", type=int, nargs="?", default=0)
parser.add_argument("--split", default="signer")
parser.add_argument("--no-time-jitter", action="store_true")
ARGS = parser.parse_args()

SEED = ARGS.seed
tf.random.set_seed(SEED)
np.random.seed(SEED)

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NPZ_PATH = os.path.join(DATA_DIR, "fsl_landmarks.npz")
CLASSES_PATH = os.path.join(DATA_DIR, "fsl_classes.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
RESULTS_DIR = os.path.join(MODEL_DIR, "fsl_results")
LABELS_PATH = os.path.join(MODEL_DIR, "fsl_label_classes.json")

SEQUENCE_LENGTH = 40
FEATURES_PER_FRAME = None  # set in main() from the data
BATCH_SIZE = 32
EPOCHS = 150
USE_CLASS_WEIGHTS = True

SPATIAL_NOISE_STD = 0.025
SCALE_JITTER = 0.10
TRANSLATE_JITTER = 0.05
L2_WEIGHT = 1e-4
# Temporal augmentation: each epoch, re-sample the 40 frames from a random
# sub-window (start in [0, TIME_CROP], end in [39 - TIME_CROP, 39]). Covers
# the live trim landing a few frames early or late, and signing speed.
TIME_JITTER = not ARGS.no_time_jitter
TIME_CROP = 6.0


def run_name():
    if ARGS.split == "signer":
        return f"fsl_sequence_classifier_seed{SEED}"
    if ARGS.split.startswith("loso:"):
        return f"fsl_loso{ARGS.split[5:]}_seed{SEED}"
    if ARGS.split == "provided":
        return f"fsl_provided_seed{SEED}"
    raise SystemExit(f"unknown --split {ARGS.split}")


def one_take_per_group(mask, groups, rng):
    """Boolean mask selecting one random member of each group within mask."""
    out = np.zeros(len(mask), bool)
    for g in np.unique(groups[mask]):
        idx = np.flatnonzero(mask & (groups == g))
        out[rng.choice(idx)] = True
    return out


def make_split(d):
    """-> (train_mask, val_mask, test_mask)"""
    if ARGS.split == "signer":
        s = d["split"]
        return s == "train", s == "val", s == "test"
    rng = np.random.default_rng(0)  # split is fixed across seeds
    groups = np.char.add(d["y"].astype(str), np.char.add("_", d["signer"]))
    if ARGS.split.startswith("loso:"):
        test = d["signer"] == ARGS.split[5:]
        if not test.any():
            raise SystemExit(f"no clips for signer {ARGS.split[5:]}")
    else:
        test = d["provided_split"] == "test"
    val = one_take_per_group(~test, groups, rng)
    return ~test & ~val, val, test


def augment_batch(X):
    B = tf.shape(X)[0]
    if TIME_JITTER:
        start = tf.random.uniform([B, 1], 0.0, TIME_CROP)
        end = tf.random.uniform([B, 1], SEQUENCE_LENGTH - 1 - TIME_CROP, SEQUENCE_LENGTH - 1.0)
        t = tf.linspace(0.0, 1.0, SEQUENCE_LENGTH)[None, :]
        idx = tf.cast(tf.round(start + (end - start) * t), tf.int32)
        X = tf.gather(X, idx, batch_dims=1)
    noise = tf.random.normal(tf.shape(X), stddev=SPATIAL_NOISE_STD)
    scale = 1.0 + tf.random.uniform([B, 1, 1], -SCALE_JITTER, SCALE_JITTER)
    shift = tf.random.uniform([B, 1, 1], -TRANSLATE_JITTER, TRANSLATE_JITTER)
    return X * scale + shift + noise


def build_model(num_classes):
    reg = keras.regularizers.l2(L2_WEIGHT)
    inputs = keras.Input(shape=(SEQUENCE_LENGTH, FEATURES_PER_FRAME))
    x = keras.layers.BatchNormalization()(inputs)
    # unroll=True keeps the TF.js graph free of dynamic control flow - see
    # train_word_classifier.py for the three runtime bugs that avoids.
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
    counts[counts == 0] = 1
    weights = counts.sum() / (num_classes * counts)
    return {i: float(w) for i, w in enumerate(weights)}


def main():
    d = dict(np.load(NPZ_PATH))
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    num_classes = len(classes)
    tr, va, te = make_split(d)
    X, y = d["X"], d["y"]
    X_train, y_train, X_val, y_val, X_test, y_test = X[tr], y[tr], X[va], y[va], X[te], y[te]

    name = run_name()
    print(f"Run: {name}   split={ARGS.split}   time_jitter={TIME_JITTER}")
    print(f"Classes: {num_classes}")
    print(f"Train: {X_train.shape}   Val: {X_val.shape}   Test: {X_test.shape}")
    print(f"Test signers: {sorted(set(d['signer'][te]))}   "
          f"train signers: {sorted(set(d['signer'][tr]))}")

    global FEATURES_PER_FRAME
    FEATURES_PER_FRAME = int(X_train.shape[-1])

    model = build_model(num_classes)
    model.compile(
        optimizer="adam",
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy",
                 keras.metrics.SparseTopKCategoricalAccuracy(k=5, name="top5_accuracy")],
    )

    train_ds = (tf.data.Dataset.from_tensor_slices((X_train, y_train))
                .shuffle(len(X_train), seed=SEED).batch(BATCH_SIZE)
                .map(lambda a, b: (augment_batch(a), b), num_parallel_calls=tf.data.AUTOTUNE)
                .prefetch(tf.data.AUTOTUNE))
    val_ds = tf.data.Dataset.from_tensor_slices((X_val, y_val)).batch(BATCH_SIZE)

    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=15, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=6),
    ]
    hist = model.fit(
        train_ds, validation_data=val_ds, epochs=EPOCHS,
        class_weight=compute_class_weights(y_train, num_classes) if USE_CLASS_WEIGHTS else None,
        callbacks=callbacks, verbose=2,
    )

    best = int(np.argmin(hist.history["val_loss"]))
    train_eval = model.evaluate(X_train, y_train, verbose=0, return_dict=True)
    results = model.evaluate(X_test, y_test, verbose=0, return_dict=True)
    summary = {
        "name": name, "split": ARGS.split, "seed": SEED, "time_jitter": TIME_JITTER,
        "best_epoch": best + 1,
        "train_top1": train_eval["accuracy"],
        "val_top1": hist.history["val_accuracy"][best],
        "test_top1": results["accuracy"], "test_top5": results["top5_accuracy"],
    }
    print("\n" + json.dumps(summary, indent=2))

    os.makedirs(RESULTS_DIR, exist_ok=True)
    np.savez(os.path.join(RESULTS_DIR, f"{name}.npz"),
             probs=model.predict(X_test, verbose=0), y=y_test, video_id=d["video_id"][te],
             signer=d["signer"][te])
    with open(os.path.join(RESULTS_DIR, f"{name}.json"), "w") as f:
        json.dump(summary, f, indent=2)

    model.save(os.path.join(MODEL_DIR, f"{name}.keras"))
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2)
    print(f"Saved models/{name}.keras")


if __name__ == "__main__":
    main()
