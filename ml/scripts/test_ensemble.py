"""
Evaluate an ensemble of trained word classifiers - averages predicted
probabilities across every word_sequence_classifier*.keras model found in
ml/models/, then reports top-1/top-5 accuracy on the held-out test set,
alongside each individual model's own accuracy for comparison.

Train multiple models first with different seeds:
  python scripts/train_word_classifier.py         (seed 0, main model)
  python scripts/train_word_classifier.py 1
  python scripts/train_word_classifier.py 2
  python scripts/train_word_classifier.py 3

Then run this:
  python scripts/test_ensemble.py
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
import glob
import json
import numpy as np
from tensorflow import keras

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
NPZ_PATH = os.path.join(DATA_DIR, "word_landmarks.npz")
CLASSES_PATH = os.path.join(DATA_DIR, "word_classes.json")
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")


def main():
    model_paths = sorted(
        p for p in glob.glob(os.path.join(MODEL_DIR, "word_sequence_classifier*.keras"))
        if "diagnostic" not in os.path.basename(p)
    )
    if len(model_paths) == 0:
        print(f"ERROR: no trained models found in {MODEL_DIR}")
        return

    data = np.load(NPZ_PATH)
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    X_test, y_test = data["X_test"], data["y_test"]
    if len(X_test) == 0:
        print("No test examples available.")
        return
    n = len(y_test)

    all_probs = []
    print(f"Found {len(model_paths)} model(s):")
    for path in model_paths:
        print(f"  Loading {os.path.basename(path)} ...")
        model = keras.models.load_model(path)
        probs = model.predict(X_test, verbose=0)
        all_probs.append(probs)

        top1 = np.mean(np.argmax(probs, axis=1) == y_test)
        top5 = np.mean([y_test[i] in np.argsort(-probs[i])[:5] for i in range(n)])
        print(f"    solo top-1: {top1:.2%}   solo top-5: {top5:.2%}")

    if len(model_paths) == 1:
        print("\nOnly one model found - nothing to ensemble. Train more with "
              "different seed arguments (see docstring) to build an ensemble.")
        return

    avg_probs = np.mean(all_probs, axis=0)
    ens_top1 = np.mean(np.argmax(avg_probs, axis=1) == y_test)
    ens_top5 = np.mean([y_test[i] in np.argsort(-avg_probs[i])[:5] for i in range(n)])

    print(f"\n=== Ensemble of {len(model_paths)} models ===")
    print(f"Ensemble top-1 accuracy: {ens_top1:.2%}")
    print(f"Ensemble top-5 accuracy: {ens_top5:.2%}")


if __name__ == "__main__":
    main()
