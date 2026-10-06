"""
Re-saves a trained word-sequence model as a TF SavedModel, which the
tensorflowjs converter needs (see note below on why SavedModel, not .h5).

Ensemble support: pass a seed number to export that seed's model (must
match a seed you actually trained with train_word_classifier.py). With no
argument, exports the main model (seed 0).

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1     (Windows)
  python scripts/export_word_model_for_conversion.py          (seed 0)
  python scripts/export_word_model_for_conversion.py 1
  python scripts/export_word_model_for_conversion.py 2
  python scripts/export_word_model_for_conversion.py 3

Then convert each with (venv-convert active):
  python -m tensorflowjs.converters.converter --input_format=tf_saved_model ^
      models\word_sequence_classifier_savedmodel models\word_tfjs_model
  python -m tensorflowjs.converters.converter --input_format=tf_saved_model ^
      models\word_sequence_classifier_seed1_savedmodel models\word_tfjs_model_seed1
  ...and so on for seed2, seed3.
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
from tensorflow import keras

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 0
SUFFIX = "" if SEED == 0 else f"_seed{SEED}"

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
KERAS_PATH = os.path.join(MODEL_DIR, f"word_sequence_classifier{SUFFIX}.keras")
H5_PATH = os.path.join(MODEL_DIR, f"word_sequence_classifier{SUFFIX}.h5")
SAVED_MODEL_DIR = os.path.join(MODEL_DIR, f"word_sequence_classifier{SUFFIX}_savedmodel")
TFJS_HINT_DIR = os.path.join(MODEL_DIR, f"word_tfjs_model{SUFFIX}")


def main():
    if not os.path.exists(KERAS_PATH):
        print(f"ERROR: trained model not found at {KERAS_PATH}")
        print(f"Run: python scripts/train_word_classifier.py {SEED if SEED else ''}")
        return

    print(f"Loading {KERAS_PATH} ...")
    model = keras.models.load_model(KERAS_PATH)

    print(f"Saving as {H5_PATH} ...")
    model.save(H5_PATH)

    # TensorFlow 2.16+/Keras 3 writes .h5 files the tensorflowjs converter's
    # legacy H5 reader can't fully parse ("failed to lookup keras version" /
    # "weight only file"). Exporting a plain TF SavedModel instead avoids
    # that mismatch entirely - use THIS with the converter, not the .h5.
    print(f"Exporting SavedModel to {SAVED_MODEL_DIR} ...")
    model.export(SAVED_MODEL_DIR)

    print("\nDone. Convert using the SavedModel directory (not the .h5):")
    print(f"  python -m tensorflowjs.converters.converter --input_format=tf_saved_model "
          f"models\\{os.path.basename(SAVED_MODEL_DIR)} models\\{os.path.basename(TFJS_HINT_DIR)}")


if __name__ == "__main__":
    main()
