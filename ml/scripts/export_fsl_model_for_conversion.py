"""
FSL-105, step 5: re-save a trained FSL model as a TF SavedModel for the
tensorflowjs converter (same reason as export_word_model_for_conversion.py).

  python scripts/export_fsl_model_for_conversion.py 0     (and 1, 2, 3)

Then, from venv-convert, convert with float16 weights:
  python -m tensorflowjs.converters.converter --input_format=tf_saved_model ^
      --quantize_float16=* ^
      models\\fsl_sequence_classifier_seed0_savedmodel models\\fsl_tfjs_model_seed0
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
from tensorflow import keras

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 0
NAME = f"fsl_sequence_classifier_seed{SEED}"
MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
KERAS_PATH = os.path.join(MODEL_DIR, f"{NAME}.keras")
SAVED_MODEL_DIR = os.path.join(MODEL_DIR, f"{NAME}_savedmodel")


def main():
    if not os.path.exists(KERAS_PATH):
        print(f"ERROR: trained model not found at {KERAS_PATH}")
        print(f"Run: python scripts/train_fsl_classifier.py {SEED}")
        return
    model = keras.models.load_model(KERAS_PATH)
    model.export(SAVED_MODEL_DIR)
    print(f"Exported {SAVED_MODEL_DIR}")
    print("Convert (venv-convert):")
    print(f"  python -m tensorflowjs.converters.converter --input_format=tf_saved_model "
          f"--quantize_float16=* models\\{NAME}_savedmodel models\\fsl_tfjs_model_seed{SEED}")


if __name__ == "__main__":
    main()
