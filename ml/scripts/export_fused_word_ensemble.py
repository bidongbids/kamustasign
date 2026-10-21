"""
Fuses a word-model ensemble (the 4 seeds of train_word_classifier.py or
train_fsl_classifier.py) into ONE small, fast TF SavedModel for the
tensorflowjs converter. Output = the seeds' averaged softmax, i.e. exactly
what WordTranslatorScreen used to compute by running each seed in turn.

Why not convert the Keras models directly: unroll=True (needed to keep
control flow out of the TF.js graph) makes Keras re-read every GRU weight at
every one of the 40 timesteps, and the converter freezes each read into its
own constant. Each seed came out as an 83 MB, ~5,200-op graph for a 550k-
parameter (2.2 MB) network - 330 MB to download per language and ~20,000
tiny WebGL dispatches per classification. Here the GRU recurrence is written
out by hand over weights read once, so the graph stays unrolled (still no
control flow) but each weight is a single constant, and:
  - BatchNormalization is folded into the first GRU's input kernel
  - all seeds x both directions run as one batched matmul per step
  - each layer's input projection is one matmul over all 40 timesteps
Result: ~9 MB and ~1,000 ops for the whole ensemble.

The fused graph is checked against the original Keras ensemble on the
held-out test set before anything is written.

Run with the main venv:
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/export_fused_word_ensemble.py asl
  python scripts/export_fused_word_ensemble.py fsl

Then convert (venv-convert) and deploy as the single model0 slot:
  python -m tensorflowjs.converters.converter --input_format=tf_saved_model ^
      models\\asl_fused_savedmodel ..\\public\\word-model\\model0
  (fsl: models\\fsl_fused_savedmodel -> ..\\public\\fsl-model\\model0)
"""

# Same Windows Application Control workaround as export_word_model_for_conversion.py
import sys
import types

_metrics_stub = types.ModuleType("tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper")


class _DummyMetricsWrapper:
    def __init__(self, *args, **kwargs):
        pass

    def __getattr__(self, name):
        return lambda *args, **kwargs: None


_metrics_stub.MetricsWrapper = _DummyMetricsWrapper
sys.modules["tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper"] = _metrics_stub

import os
import glob
import numpy as np
import tensorflow as tf
from tensorflow import keras

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
MODEL_DIR = os.path.join(ML_DIR, "models")
DATA_DIR = os.path.join(ML_DIR, "data")

SEEDS = {
    # Our clips + the Google Isolated SLR clips (train_word_classifier.py --combined).
    "asl": lambda: sorted(glob.glob(os.path.join(MODEL_DIR, "asl_combined_seed[0-9].keras"))),
    # Same plus the "__unknown__" class (train_word_classifier.py --combined --unknown).
    # Deploy with public/word-model/label_classes.json = asl_combined_unk_label_classes.json.
    "asl-unk": lambda: sorted(glob.glob(os.path.join(MODEL_DIR, "asl_combined_unk_seed[0-9].keras"))),
    # The 133-word model trained on our clips alone.
    "asl-legacy": lambda: sorted(p for p in glob.glob(os.path.join(MODEL_DIR, "word_sequence_classifier*.keras"))
                                 if "diagnostic" not in p),
    "fsl": lambda: sorted(glob.glob(os.path.join(MODEL_DIR, "fsl_sequence_classifier_seed*.keras"))),
}


# The combined ASL model was trained with pose visibility held at zero
# (DROP_COLS in consolidate_combined_words.py). Zeroing those columns of the
# folded BN scale below makes the deployed graph ignore whatever the app
# sends there - identical to feeding zeros, so the app needs no change.
DROP_VISIBILITY = {"asl", "asl-unk"}
DROP_COLS = [i * 4 + 3 for i in range(33)]


def test_set(lang):
    if lang in ("asl", "asl-unk"):
        d = np.load(os.path.join(DATA_DIR, "combined_word_landmarks.npz"))
        return d["X_test"].astype("float32"), d["y_test"]
    if lang == "asl-legacy":
        d = np.load(os.path.join(DATA_DIR, "word_landmarks.npz"))
        return d["X_test"], d["y_test"]
    d = np.load(os.path.join(DATA_DIR, "fsl_landmarks.npz"))
    m = d["split"] == "test"
    return d["X"][m], d["y"][m]


def layer_of(model, cls):
    return [l for l in model.layers if isinstance(l, cls)]


def gru_weights(bidir):
    """[(kernel, recurrent_kernel, input_bias, recurrent_bias)] for (forward, backward)."""
    out = []
    for gru in (bidir.forward_layer, bidir.backward_layer):
        assert gru.cell.reset_after, "fused GRU assumes reset_after=True (the Keras default)"
        k, rk, b = (w.numpy() for w in gru.cell.weights)
        out.append((k, rk, b[0], b[1]))
    return out


def collect(paths, drop_visibility=False):
    """Stack every seed's weights. Group axis is [fwd seed0..N-1, bwd seed0..N-1]."""
    L1, L2, dense = [], [], []
    for p in paths:
        m = keras.models.load_model(p, compile=False)
        bn = layer_of(m, keras.layers.BatchNormalization)[0]
        gamma, beta, mean, var = (w.numpy() for w in bn.weights)
        a = gamma / np.sqrt(var + bn.epsilon)
        c = beta - mean * a
        if drop_visibility:
            a = a.copy()
            a[DROP_COLS] = 0.0
        b1, b2 = layer_of(m, keras.layers.Bidirectional)
        l1 = gru_weights(b1)
        # Fold BN: (x*a + c) @ K + bi  ==  x @ (a[:,None]*K) + (c @ K + bi)
        L1.append([(a[:, None] * k, rk, c @ k + bi, br) for k, rk, bi, br in l1])
        L2.append(gru_weights(b2))
        d1, d2 = layer_of(m, keras.layers.Dense)
        dense.append([w.numpy() for w in d1.weights] + [w.numpy() for w in d2.weights])
    group = lambda per_seed: [np.stack([s[d][i] for d in (0, 1) for s in per_seed]) for i in range(4)]
    stackd = [np.stack([s[i] for s in dense]) for i in range(4)]
    return group(L1), group(L2), stackd


def make_fn(L1, L2, dense):
    n_seeds = dense[0].shape[0]
    consts = lambda arrs: [tf.constant(a, tf.float32) for a in arrs]
    L1, L2, dense = consts(L1), consts(L2), consts(dense)

    def dim(t, i):
        # Static when known (the exported batch-1 graph), dynamic otherwise
        # (the batched parity check), so the export folds to constants.
        return t.shape[i] if t.shape[i] is not None else tf.shape(t)[i]

    def bigru(x, w, return_sequences):
        """x: [G, B, T, F] (backward groups already time-reversed). Returns
        [G, B, T, H] per-step states, or the final [G, B, H] state."""
        k, rk, bi, br = w
        G, H = k.shape[0], rk.shape[1]
        # One matmul projects all timesteps; split gates once up front so the
        # 40-step loop has no slicing in it. Gate column order is z, r, h.
        B, T = dim(x, 1), x.shape[2]
        xp = tf.matmul(tf.reshape(x, [G, -1, x.shape[3]]), k) + bi[:, None, :]
        xp = tf.reshape(xp, [G, B, T, 3 * H])
        x_zr = tf.unstack(xp[..., : 2 * H], axis=2)
        x_h = tf.unstack(xp[..., 2 * H:], axis=2)
        rk_zr, rk_h = rk[..., : 2 * H], rk[..., 2 * H:]
        br_zr, br_h = br[:, None, : 2 * H], br[:, None, 2 * H:]
        h = tf.zeros([G, B, H])
        states = []
        for t in range(T):
            zr = tf.sigmoid(x_zr[t] + tf.matmul(h, rk_zr) + br_zr)
            z, r = tf.split(zr, 2, axis=-1)
            hh = tf.tanh(x_h[t] + r * (tf.matmul(h, rk_h) + br_h))
            h = hh + z * (h - hh)
            states.append(h)
        return tf.stack(states, axis=2) if return_sequences else h

    def both_dirs(x):
        """[S, B, T, F] -> [2S, B, T, F]: forward groups, then backward groups reversed in time."""
        return tf.concat([x, tf.reverse(x, axis=[2])], axis=0)

    def forward(x):  # x: [B, 40, 384] raw (un-normalised) features
        x = tf.broadcast_to(x[None], [n_seeds, dim(x, 0)] + list(x.shape[1:]))
        s1 = bigru(both_dirs(x), L1, True)                 # [2S, B, T, 128]
        fwd, bwd = s1[:n_seeds], tf.reverse(s1[n_seeds:], axis=[2])
        x2 = tf.concat([fwd, bwd], axis=-1)                # [S, B, T, 256]
        h2 = bigru(both_dirs(x2), L2, False)               # [2S, B, 64]
        feat = tf.concat([h2[:n_seeds], h2[n_seeds:]], axis=-1)  # [S, B, 128]
        d1k, d1b, d2k, d2b = dense
        hid = tf.nn.relu(tf.matmul(feat, d1k) + d1b[:, None, :])
        probs = tf.nn.softmax(tf.matmul(hid, d2k) + d2b[:, None, :])
        return tf.reduce_mean(probs, axis=0)               # [B, C]

    return forward


def main():
    lang = (sys.argv[1:] or [""])[0].lower()
    if lang not in SEEDS:
        print("usage: export_fused_word_ensemble.py asl|asl-unk|asl-legacy|fsl")
        return
    paths = SEEDS[lang]()
    print(f"Fusing {len(paths)} seeds: {[os.path.basename(p) for p in paths]}")
    L1, L2, dense = collect(paths, drop_visibility=lang in DROP_VISIBILITY)
    forward = make_fn(L1, L2, dense)

    X, y = test_set(lang)
    ref = np.mean([keras.models.load_model(p, compile=False).predict(X, verbose=0, batch_size=128)
                   for p in paths], axis=0)
    fused = np.concatenate([forward(tf.constant(X[i:i + 128])).numpy() for i in range(0, len(X), 128)])
    diff = np.abs(fused - ref).max()
    agree = np.mean(fused.argmax(1) == ref.argmax(1))
    print(f"Parity vs Keras ensemble on {len(X)} test clips: max |dprob| {diff:.2e}, "
          f"top-1 agreement {agree:.2%}, accuracy {np.mean(fused.argmax(1) == y):.2%} "
          f"(Keras {np.mean(ref.argmax(1) == y):.2%})")
    if diff > 1e-3 or agree < 0.999:
        print("ERROR: fused graph does not match the Keras ensemble - not exporting.")
        sys.exit(1)

    # Batch fixed at 1 (the app classifies one clip at a time), so every
    # shape is static and the converter can fold all the shape plumbing away.
    module = tf.Module()
    module.serve = tf.function(lambda x: {"probs": forward(x)},
                               input_signature=[tf.TensorSpec([1, X.shape[1], X.shape[2]], tf.float32, name="x")])
    out_dir = os.path.join(MODEL_DIR, f"{lang.replace('-', '_')}_fused_savedmodel")
    tf.saved_model.save(module, out_dir, signatures={"serving_default": module.serve})
    print(f"Saved {out_dir}")


if __name__ == "__main__":
    main()
