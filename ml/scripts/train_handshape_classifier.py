"""
Still-handshape classifiers for the fingerspelling groups that had no model:
ASL numbers, FSL letters and FSL numbers. (The ASL letters model is older; see
train_classifier.py.)

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\train_handshape_classifier.py asl-numbers
  .\\venv\\Scripts\\python.exe scripts\\train_handshape_classifier.py fsl-letters
  .\\venv\\Scripts\\python.exe scripts\\train_handshape_classifier.py fsl-numbers

Each run (1) measures accuracy on people the model never saw, by cross-
validation over signers (or, for FSL letters, over photos - see below), then
(2) trains the deployable model on everything, (3) writes a SavedModel for the
tensorflowjs converter. Landmarks come from extract_handshape_landmarks.py.
--eval-only stops after (1): the diagnostics without touching the deployed
model's files.

Input the app gives the model
-----------------------------
The ASL letters model takes raw MediaPipe coordinates, which are fractions of
the frame's width and height. That ties it to the camera: a hand filling a
square photo crop and the same hand a third of the way across a 640x480 webcam
frame give completely different numbers, and x and y are in different units
whenever the frame isn't square. These photo datasets are crops, so that
input would not transfer to a webcam at all.

So these models take the same 63 numbers but with x and z multiplied by the
frame's width/height (x and y then share one unit; MediaPipe's z is on x's
scale), and do the rest INSIDE the graph (HandNormalize below): centre on
the wrist, divide by the palm's size, and add every pairwise distance between
the 21 points. Position in the frame and distance from the camera no longer
matter; only the handshape and its orientation do. The app's half of the
contract is in src/ml/handshapeInput.ts, and the model folder's meta.json
says which input the model wants, so the old letters model keeps its raw one.

Handedness: the app's models are trained on a right hand as the camera sees
it (unmirrored); HandednessPicker mirrors a left-handed signer to match. The
photo sets mix hands, so each signer (or, with no signer ids, each photo) is
mirrored to the right hand by MediaPipe's handedness label (RIGHT_LABEL). The
ASL-HG signers are all right-handed as-is (letters_summary.json), and 99% of
their photos get that label.

Datasets
--------
asl-numbers  ASL-HG digits, 10 signers. ASL-HG's "0" is an O handshape held
             against the other palm - a two-handed variant, and the app tracks
             one hand - so 0 is trained on ASL-HG's "O" photos instead: the ASL
             0 is the O handshape (see docs/NUMBERS_MODEL_GUIDE.md). Measured by
             5-fold cross-validation, two held-out signers per fold.
fsl-letters  Kaggle "FSL dataset" (japorton), 450 photos per letter, about a
             third of them Roboflow augmentations of the others. No signer ids,
             so cross-validation is over ORIGINAL photos (an original and its
             augmented copies stay on one side). Several people appear, so the
             same person can be on both sides: this number is optimistic.
             J and Z move; a still model sees only their hand shape.
fsl-numbers  FSL-105 number words one..ten, still frames from the middle of
             each clip, 4 signers. Leave-one-signer-out. There is no zero.
"""

import sys
import types

# The TF Lite metrics DLL is blocked by Windows application control on this
# machine; nothing here needs it (same stub as export_word_model_for_conversion.py).
_stub = types.ModuleType("tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper")


class _Dummy:
    def __init__(self, *a, **k):
        pass

    def __getattr__(self, name):
        return lambda *a, **k: None


_stub.MetricsWrapper = _Dummy
sys.modules["tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper"] = _stub

import csv
import json
import os

import numpy as np
import tensorflow as tf
from tensorflow import keras

HERE = os.path.dirname(os.path.abspath(__file__))
LM_DIR = os.path.join(HERE, "..", "data", "handshape_landmarks")
KAGGLE_CSV = os.path.join(HERE, "..", "data", "landmarks_dataset.csv")
MODEL_DIR = os.path.join(HERE, "..", "models")
DIAG_DIR = os.path.join(MODEL_DIR, "diagnostics")

PASS_CONFIDENCE = 0.8  # curriculum.ts
DIGITS = [str(d) for d in range(10)]
LETTERS = [chr(c) for c in range(ord("A"), ord("Z") + 1)]

# Palm landmarks: wrist, then the MCP joint of each finger.
WRIST, PALM = 0, [5, 9, 13, 17]
# MediaPipe's handedness label for a right hand as the app's camera sees it:
# 99% of ASL-HG photos (all ten signers right-handed as-is) get this one.
RIGHT_LABEL = "Right"
PAIRS = np.array([(i, j) for i in range(21) for j in range(i + 1, 21)], dtype=np.int32)


# ---- data ----------------------------------------------------------------------

def load(source):
    d = np.load(os.path.join(LM_DIR, f"{source}.npz"))
    return {k: d[k] for k in d.files}


def to_input(pts, wh):
    """Raw MediaPipe (N,21,3) + image (w,h) -> the app's input: x and z times w/h."""
    out = pts.astype(np.float32).copy()
    aspect = (wh[:, 0] / wh[:, 1]).astype(np.float32)[:, None]
    out[:, :, 0] *= aspect
    out[:, :, 2] *= aspect
    return out


def mirror(pts):
    """As mirrorFlatLandmarks: x -> 1 - x on the RAW coordinates."""
    out = pts.copy()
    out[:, :, 0] = 1.0 - out[:, :, 0]
    return out


def canonical_hands(d, right_label, by_signer):
    """Mirror whatever isn't the canonical right hand. Per signer when known
    (one person signs with one hand), else per photo."""
    pts = d["pts"].copy()
    flip = d["hand"] != right_label
    if by_signer:
        for s in np.unique(d["signer"]):
            m = d["signer"] == s
            flip[m] = (d["hand"][m] != right_label).mean() > 0.5
    pts[flip] = mirror(pts[flip])
    return pts, flip


def dataset(name):
    """-> X (N,21,3 app input), y (N,), classes, groups for CV, description."""
    right = RIGHT_LABEL
    if name == "asl-numbers":
        d = load("aslhg")
        keep = np.isin(d["label"], DIGITS[1:] + ["O"])
        d = {k: v[keep] for k, v in d.items()}
        d["label"] = np.where(d["label"] == "O", "0", d["label"])
        pts, flip = canonical_hands(d, right, by_signer=True)
        classes, groups = DIGITS, d["signer"]
    elif name == "asl-letters":
        # The deployed letters model's photos (one signer, ASL Alphabet, 200x200,
        # landmarks_dataset.csv) - 1,000 per class - plus ASL-HG's ten signers.
        import pandas as pd
        kag = pd.read_csv(KAGGLE_CSV)
        kag = kag[kag["label"] != "nothing"].groupby("label", group_keys=False).apply(
            lambda g: g.sample(min(len(g), 1000), random_state=0))
        n = len(kag)
        k = {"pts": kag.drop(columns=["label"]).values.astype(np.float32).reshape(n, 21, 3),
             "label": kag["label"].values.astype(str), "signer": np.array(["kaggle"] * n),
             "group": np.array([f"kaggle/{i}" for i in range(n)]), "path": np.array([""] * n),
             "hand": np.array([right] * n), "score": np.ones(n, np.float32),
             "wh": np.tile([[200, 200]], (n, 1)).astype(np.int32)}
        h = load("aslhg")
        keep = np.isin(h["label"], LETTERS)
        d = {key: np.concatenate([k[key], h[key][keep]]) for key in k}
        pts, flip = canonical_hands(d, right, by_signer=True)
        classes, groups = LETTERS + ["del", "space"], d["signer"]
    elif name == "fsl-letters":
        d = load("japorton")
        pts, flip = canonical_hands(d, right, by_signer=False)
        classes, groups = LETTERS, d["group"]
    elif name == "fsl-numbers":
        d = load("fsl105")
        pts, flip = canonical_hands(d, right, by_signer=True)
        classes = [str(n) for n in range(1, 11)]
        groups = d["signer"]
    else:
        sys.exit(f"unknown model {name}")
    index = {c: i for i, c in enumerate(classes)}
    y = np.array([index[l] for l in d["label"]])
    print(f"{name}: {len(y)} samples, {len(classes)} classes, mirrored {flip.mean():.1%} to the right hand")
    return to_input(pts, d["wh"]), y, classes, groups, d


# ---- augmentation (on the app input, before normalisation) -------------------------

def augment(X, rng, copies):
    """Rotate in the image plane, stretch x (cameras and crops differ in
    aspect), jitter z (MediaPipe's depth is the noisiest axis) and every point."""
    out = [X]
    for _ in range(copies):
        a = X.copy()
        n = len(a)
        theta = rng.uniform(-0.3, 0.3, n)  # +-17 degrees
        c, s = np.cos(theta)[:, None], np.sin(theta)[:, None]
        wx, wy = a[:, :1, 0], a[:, :1, 1]
        x, y = a[:, :, 0] - wx, a[:, :, 1] - wy
        a[:, :, 0] = wx + c * x - s * y
        a[:, :, 1] = wy + s * x + c * y
        a[:, :, 0] = wx + (a[:, :, 0] - wx) * rng.uniform(0.85, 1.18, (n, 1))
        a[:, :, 2] *= rng.uniform(0.6, 1.4, (n, 1))
        span = np.ptp(a[:, :, 1], axis=1)[:, None, None]
        a += rng.normal(0, 0.012, a.shape) * span
        out.append(a.astype(np.float32))
    return np.concatenate(out)


# ---- model -----------------------------------------------------------------------

@keras.utils.register_keras_serializable(package="lcsign")
class HandNormalize(keras.layers.Layer):
    """(N, 63) app input -> wrist-centred, palm-scaled coordinates (63) and all
    210 pairwise distances. Lives in the graph so the app can't drift from it."""

    def call(self, x):
        p = tf.reshape(x, (-1, 21, 3))
        p = p - p[:, WRIST:WRIST + 1, :]
        palm = tf.reduce_mean(tf.norm(tf.gather(p[:, :, :2], PALM, axis=1), axis=-1), axis=1)
        p = p / tf.maximum(palm, 1e-6)[:, None, None]
        a = tf.gather(p, PAIRS[:, 0], axis=1)
        b = tf.gather(p, PAIRS[:, 1], axis=1)
        dist = tf.sqrt(tf.reduce_sum(tf.square(a - b), axis=-1) + 1e-8)
        return tf.concat([tf.reshape(p, (-1, 63)), dist], axis=1)


def build(num_classes):
    inp = keras.layers.Input(shape=(63,), name="landmarks")
    h = HandNormalize()(inp)
    h = keras.layers.Dense(256, activation="relu")(h)
    h = keras.layers.Dropout(0.3)(h)
    h = keras.layers.Dense(128, activation="relu")(h)
    h = keras.layers.Dropout(0.2)(h)
    out = keras.layers.Dense(num_classes, activation="softmax")(h)
    model = keras.Model(inp, out)
    model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def fit(X, y, num_classes, seed, epochs=40):
    rng = np.random.default_rng(seed)
    tf.keras.utils.set_random_seed(seed)
    Xa = augment(X, rng, copies=4).reshape(-1, 63)
    ya = np.tile(y, 5)
    # Balance classes: frames per clip and photos per class differ.
    counts = np.bincount(ya, minlength=num_classes).astype(np.float32)
    weights = {i: float(counts.sum() / (num_classes * max(c, 1))) for i, c in enumerate(counts)}
    model = build(num_classes)
    model.fit(Xa, ya, epochs=epochs, batch_size=256, verbose=0, class_weight=weights, shuffle=True,
              callbacks=[keras.callbacks.ReduceLROnPlateau("loss", factor=0.5, patience=4)])
    return model


# ---- evaluation ----------------------------------------------------------------

def folds_for(name, groups):
    uniq = sorted(set(groups.tolist()))
    if name in ("asl-numbers", "asl-letters"):  # 2 ASL-HG signers per fold
        order = sorted((s for s in uniq if s.startswith("P")), key=lambda s: int(s[1:]))
        return [order[i:i + 2] for i in range(0, len(order), 2)]
    if name == "fsl-numbers":  # leave one signer out
        return [[s] for s in uniq]
    rng = np.random.default_rng(0)  # fsl-letters: 5 folds of original photos
    perm = rng.permutation(uniq)
    return [list(perm[i::5]) for i in range(5)]


def evaluate(name, X, y, classes, groups, d):
    k = len(classes)
    probs = np.zeros((len(y), k), dtype=np.float32)
    per_fold = []
    for i, held in enumerate(folds_for(name, groups)):
        test = np.isin(groups, held)
        model = fit(X[~test], y[~test], k, seed=i)
        probs[test] = model.predict(X[test].reshape(-1, 63), verbose=0, batch_size=1024)
        acc = float((probs[test].argmax(1) == y[test]).mean())
        label = ",".join(held) if name != "fsl-letters" else f"fold {i + 1}"
        per_fold.append({"held_out": label, "n": int(test.sum()), "top1": acc})
        print(f"  {label}: {acc:.1%} ({test.sum()})", flush=True)

    tested = probs.sum(1) > 0  # asl-letters: the ASL Alphabet photos are never held out
    probs, y, groups = probs[tested], y[tested], groups[tested]
    d = {key: v[tested] for key, v in d.items()}
    pred = probs.argmax(1)
    ok = pred == y
    conf = probs.max(1)
    rows = []
    for c in range(k):
        m = y == c
        if not m.any():
            continue
        wrong = np.bincount(pred[m & ~ok], minlength=k)
        rows.append({
            "sign": classes[c], "n": int(m.sum()), "top1": float(ok[m].mean()),
            "pass_rate": float((ok & (conf >= PASS_CONFIDENCE))[m].mean()),
            "most_confused_with": classes[int(wrong.argmax())] if wrong.any() else "",
            "mean_conf_when_right": float(conf[m & ok].mean()) if (m & ok).any() else float("nan"),
        })
    summary = {
        "model": name, "classes": classes, "samples": int(len(y)),
        "top1": float(ok.mean()), "top3": float((np.argsort(-probs, 1)[:, :3] == y[:, None]).any(1).mean()),
        "pass_rate": float((ok & (conf >= PASS_CONFIDENCE)).mean()), "folds": per_fold, "per_sign": rows,
    }
    if name == "fsl-numbers":
        # Per clip: what the app would settle on while the sign is held.
        clips = d["group"]
        votes = {}
        for c in np.unique(clips):
            m = clips == c
            votes[c] = (probs[m].mean(0).argmax() == y[m][0])
        summary["clip_top1"] = float(np.mean(list(votes.values())))
    return summary


# ---- export ----------------------------------------------------------------------

def export(model, name, classes):
    stem = name.replace("-", "_")
    out_dir = os.path.join(MODEL_DIR, f"{stem}_savedmodel")
    module = tf.Module()
    module.model = model
    module.serve = tf.function(lambda x: {"probs": model(x, training=False)},
                               input_signature=[tf.TensorSpec([1, 63], tf.float32, name="landmarks")])
    tf.saved_model.save(module, out_dir, signatures={"serving_default": module.serve})
    model.save(os.path.join(MODEL_DIR, f"{stem}.keras"))
    with open(os.path.join(MODEL_DIR, f"{stem}_label_classes.json"), "w") as f:
        json.dump(classes, f, indent=2)
    print(f"saved {out_dir}")


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else ""
    X, y, classes, groups, d = dataset(name)
    if "--no-eval" not in sys.argv:
        summary = evaluate(name, X, y, classes, groups, d)
        os.makedirs(DIAG_DIR, exist_ok=True)
        with open(os.path.join(DIAG_DIR, f"{name}_summary.json"), "w") as f:
            json.dump(summary, f, indent=1)
        # Per sign, for export_star_reference.py and the evaluation doc.
        with open(os.path.join(DIAG_DIR, f"{name}_per_sign.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(summary["per_sign"][0]))
            w.writeheader()
            w.writerows(summary["per_sign"])
        print(f"{name}: top-1 {summary['top1']:.1%}, top-3 {summary['top3']:.1%}, "
              f"pass rate {summary['pass_rate']:.1%}" +
              (f", per clip {summary['clip_top1']:.1%}" if "clip_top1" in summary else ""))
        weakest = sorted(summary["per_sign"], key=lambda r: r["top1"])[:6]
        print("  weakest: " + ", ".join(f"{r['sign']} {r['top1']:.0%} (as {r['most_confused_with']})" for r in weakest))
    if "--eval-only" in sys.argv:
        return
    model = fit(X, y, len(classes), seed=100)
    export(model, name, classes)


if __name__ == "__main__":
    main()
