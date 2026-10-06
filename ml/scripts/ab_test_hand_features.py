"""
Controlled A/B: do wrist-relative hand features actually help?

Background. The 258-feature pipeline normalises every landmark - hands
included - against shoulder width. A finger's displacement from its own wrist
is 1-2% of shoulder width, so handshape reaches the model only as small
perturbations on much larger arm-position values. The measured symptom was
that the classifier confused sign pairs sharing location and movement but
differing in handshape: pink/sweet, work/appointment, yes/no, bad/hot.

The change adds, per hand, the 21 landmarks re-expressed relative to that
hand's own wrist and scaled by palm length (258 -> 384 features).

This script trains both variants under *identical* conditions - same seed,
same architecture, same epoch budget, same clips in the same splits - so the
only difference is the feature set. Anything else would confound the result.

It checkpoints after every chunk and resumes where it left off, because it
was written to run in an environment with a hard per-invocation time limit.
Re-run the same command until it prints DONE.

Usage:
    python ab_test_hand_features.py --variant 258 --epochs 30
    python ab_test_hand_features.py --variant 384 --epochs 30
    python ab_test_hand_features.py --report
"""

import argparse
import json
import os
import time

import numpy as np

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

HERE = os.path.dirname(os.path.abspath(__file__))
ML_ROOT = os.path.dirname(HERE)
DATA_DIR = os.path.join(ML_ROOT, "data")
WORK_DIR = os.path.join(ML_ROOT, "ab_test")

# 384 is the live dataset; 258 is the pre-change dataset kept for comparison.
NPZ = {
    "384": os.path.join(DATA_DIR, "word_landmarks.npz"),
    "258": os.path.join(DATA_DIR, "word_landmarks_258_backup.npz"),
}

# Mirrors train_word_classifier.py so the comparison reflects the real model.
BATCH_SIZE = 32
L2_WEIGHT = 1e-4
SPATIAL_NOISE_STD = 0.025
SCALE_JITTER = 0.10
TRANSLATE_JITTER = 0.05


def build_model(num_classes, features, keras):
    reg = keras.regularizers.l2(L2_WEIGHT)
    inputs = keras.Input(shape=(40, features))
    x = keras.layers.BatchNormalization()(inputs)
    x = keras.layers.Bidirectional(
        keras.layers.GRU(128, return_sequences=True, unroll=True,
                         kernel_regularizer=reg, recurrent_regularizer=reg))(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Bidirectional(
        keras.layers.GRU(64, unroll=True,
                         kernel_regularizer=reg, recurrent_regularizer=reg))(x)
    x = keras.layers.Dropout(0.4)(x)
    x = keras.layers.Dense(128, activation="relu", kernel_regularizer=reg)(x)
    x = keras.layers.Dropout(0.4)(x)
    outputs = keras.layers.Dense(num_classes, activation="softmax")(x)
    return keras.Model(inputs, outputs)


def augment(X, tf):
    batch = tf.shape(X)[0]
    noise = tf.random.normal(tf.shape(X), stddev=SPATIAL_NOISE_STD)
    scale = 1.0 + tf.random.uniform([batch, 1, 1], -SCALE_JITTER, SCALE_JITTER)
    shift = tf.random.uniform([batch, 1, 1], -TRANSLATE_JITTER, TRANSLATE_JITTER)
    return X * scale + shift + noise


def class_weights(y, num_classes):
    counts = np.bincount(y, minlength=num_classes).astype("float32")
    counts[counts == 0] = 1
    w = counts.sum() / (num_classes * counts)
    return {i: float(v) for i, v in enumerate(w)}


def evaluate(model, X, y):
    probs = model.predict(X, verbose=0)
    top1 = float((probs.argmax(1) == y).mean())
    order = np.argsort(probs, axis=1)[:, -5:]
    top5 = float(np.mean([y[i] in order[i] for i in range(len(y))]))
    return top1, top5, probs


def run(variant, target_epochs, seed, budget_s):
    import tensorflow as tf
    import keras

    tf.random.set_seed(seed)
    np.random.seed(seed)

    os.makedirs(WORK_DIR, exist_ok=True)
    ckpt = os.path.join(WORK_DIR, f"model_{variant}_seed{seed}.keras")
    state_path = os.path.join(WORK_DIR, f"state_{variant}_seed{seed}.json")

    data = np.load(NPZ[variant])
    classes = json.load(open(os.path.join(DATA_DIR, "word_classes.json"), encoding="utf-8"))
    X_tr, y_tr = data["X_train"], data["y_train"]
    X_va, y_va = data["X_val"], data["y_val"]
    X_te, y_te = data["X_test"], data["y_test"]
    features = X_tr.shape[-1]
    assert features == int(variant), f"{NPZ[variant]} has {features} features, expected {variant}"

    state = json.load(open(state_path)) if os.path.exists(state_path) else {"epochs_done": 0}
    done = state["epochs_done"]

    if done and os.path.exists(ckpt):
        model = keras.models.load_model(ckpt)
    else:
        model = build_model(len(classes), features, keras)
        model.compile(optimizer="adam", loss="sparse_categorical_crossentropy",
                      metrics=["accuracy"])

    ds = tf.data.Dataset.from_tensor_slices((X_tr, y_tr))
    ds = ds.shuffle(len(X_tr), seed=seed).batch(BATCH_SIZE)
    ds = ds.map(lambda x, y: (augment(x, tf), y), num_parallel_calls=tf.data.AUTOTUNE)
    ds = ds.prefetch(tf.data.AUTOTUNE)
    val_ds = tf.data.Dataset.from_tensor_slices((X_va, y_va)).batch(BATCH_SIZE)
    weights = class_weights(y_tr, len(classes))

    started = time.time()
    while done < target_epochs and time.time() - started < budget_s:
        model.fit(ds, validation_data=val_ds, epochs=1, verbose=0, class_weight=weights)
        done += 1
        model.save(ckpt)
        json.dump({"epochs_done": done}, open(state_path, "w"))
        print(f"  [{variant}] epoch {done}/{target_epochs}"
              f"  ({time.time() - started:.0f}s this call)", flush=True)

    if done >= target_epochs:
        top1, top5, probs = evaluate(model, X_te, y_te)
        np.save(os.path.join(WORK_DIR, f"probs_{variant}_seed{seed}.npy"), probs)
        result = {"variant": variant, "features": features, "seed": seed,
                  "epochs": done, "test_top1": top1, "test_top5": top5}
        json.dump(result, open(os.path.join(WORK_DIR, f"result_{variant}_seed{seed}.json"), "w"), indent=2)
        print(f"DONE {variant}: top-1 {top1*100:.1f}%  top-5 {top5*100:.1f}%")
    else:
        print(f"PARTIAL {variant}: {done}/{target_epochs} epochs - run again to continue")


def report(seed):
    rows = []
    for variant in ("258", "384"):
        p = os.path.join(WORK_DIR, f"result_{variant}_seed{seed}.json")
        if os.path.exists(p):
            rows.append(json.load(open(p)))
    if len(rows) < 2:
        print("Need both variants finished before reporting.")
        return
    base, new = rows[0], rows[1]
    print(f"{'variant':>10}  {'features':>9}  {'top-1':>7}  {'top-5':>7}")
    for r in rows:
        print(f"{r['variant']:>10}  {r['features']:>9}  {r['test_top1']*100:6.1f}%  {r['test_top5']*100:6.1f}%")
    print(f"\ndelta: top-1 {(new['test_top1']-base['test_top1'])*100:+.1f} pts"
          f"   top-5 {(new['test_top5']-base['test_top5'])*100:+.1f} pts"
          f"   (both at {base['epochs']} epochs, seed {seed})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", choices=["258", "384"])
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--budget", type=float, default=135, help="seconds of training per invocation")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    if args.report:
        report(args.seed)
    else:
        run(args.variant, args.epochs, args.seed, args.budget)
