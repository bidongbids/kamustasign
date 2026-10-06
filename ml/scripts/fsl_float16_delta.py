"""
FSL-105: accuracy cost of --quantize_float16 on the deployable ensemble.

The converter's float16 option stores weights as float16 and the TF.js
runtime widens them back to float32 at load, so compute still runs in
float32. Rounding every Keras weight through float16 and back reproduces
that exactly, without needing a JS runtime to score the converted models.

  python scripts/fsl_float16_delta.py
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
import glob
import numpy as np
from tensorflow import keras

DATA = os.path.join(os.path.dirname(__file__), "..", "data", "fsl_landmarks.npz")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def acc(probs, y, k):
    return float(np.mean([y[i] in np.argsort(-probs[i])[:k] for i in range(len(y))]))


def main():
    d = np.load(DATA)
    test = d["split"] == "test"
    X, y = d["X"][test], d["y"][test]
    p32, p16 = [], []
    for path in sorted(glob.glob(os.path.join(MODEL_DIR, "fsl_sequence_classifier_seed[0-9].keras"))):
        m = keras.models.load_model(path)
        p32.append(m.predict(X, verbose=0))
        m.set_weights([w.astype(np.float16).astype(np.float32) for w in m.get_weights()])
        p16.append(m.predict(X, verbose=0))
        print(f"{os.path.basename(path)}: top-1 fp32 {acc(p32[-1], y, 1):.2%}  fp16 {acc(p16[-1], y, 1):.2%}")
    a32, a16 = np.mean(p32, 0), np.mean(p16, 0)
    print(f"\nEnsemble of {len(p32)}  fp32 top-1 {acc(a32, y, 1):.2%} top-5 {acc(a32, y, 5):.2%}")
    print(f"             fp16 top-1 {acc(a16, y, 1):.2%} top-5 {acc(a16, y, 5):.2%}")
    print(f"Predictions changed by fp16: {int(np.sum(a32.argmax(1) != a16.argmax(1)))}/{len(y)}   "
          f"max |prob diff| {np.abs(a32 - a16).max():.2e}")


if __name__ == "__main__":
    main()
