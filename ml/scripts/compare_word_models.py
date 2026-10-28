"""
Before/after for an ASL word retrain: two ensembles on the same clips.

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\compare_word_models.py models\\asl_combined_v3_flip models
  .\\venv\\Scripts\\python.exe scripts\\compare_word_models.py models\\asl_combined_v3_flip models --seeds 0
      (one seed on each side: a quick read after training only seed 0)

Scores each folder's asl_combined_seed[0-9].keras (averaged, like the app) on
  - the test split of data/combined_word_landmarks.npz (mostly GISLR phone clips), and
  - the held-out webcam clips (word_model_diagnostics.webcam_clips) - after a
    --webcam-extra consolidation, only the half that stayed out of training,
split into the words the webcam check reads worst before (WEAK: <= 25% top-1
in models/diagnostics/asl_per_word.csv) and the rest. Writes
models/diagnostics/word_model_comparison.json.
"""

import csv
import glob
import json
import os
import sys

from tensorflow import keras
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import word_model_diagnostics as wd  # noqa: E402

ML = os.path.join(HERE, "..")


SEEDS = sys.argv[sys.argv.index("--seeds") + 1] if "--seeds" in sys.argv else "0-9"


def ensemble(folder, X):
    paths = sorted(glob.glob(os.path.join(folder, f"asl_combined_seed[{SEEDS}].keras")))
    if not paths:
        sys.exit(f"no asl_combined_seed*.keras in {folder}")
    return np.mean([keras.models.load_model(p, compile=False).predict(X, verbose=0, batch_size=128) for p in paths], axis=0), len(paths)


def scores(probs, y, mask=None):
    m = np.ones(len(y), bool) if mask is None else mask
    order = np.argsort(-probs[m], axis=1)
    return {"n": int(m.sum()), "top1": float((order[:, 0] == y[m]).mean()),
            "top5": float((order[:, :5] == y[m][:, None]).any(1).mean()),
            "shown_ok_at_60": float(((probs[m].max(1) >= 0.6) & (order[:, 0] == y[m])).mean())}


def main():
    old_dir, new_dir = sys.argv[1], sys.argv[2]
    d = np.load(os.path.join(ML, "data", "combined_word_landmarks.npz"))
    classes = json.load(open(os.path.join(ML, "data", "combined_word_classes.json"), encoding="utf-8"))
    Xt, yt = d["X_test"].astype("float32"), d["y_test"]
    Xw, yw = wd.webcam_clips(classes)
    with open(os.path.join(ML, "models", "diagnostics", "asl_per_word.csv"), newline="", encoding="utf-8") as f:
        weak = {r["word"] for r in csv.DictReader(f) if r["webcam_top1"] not in ("", "nan") and float(r["webcam_top1"]) <= 0.25}
    weak_ids = np.array([classes[i] in weak for i in range(len(classes))])

    result = {}
    for name, folder in (("before", old_dir), ("after", new_dir)):
        pt, n = ensemble(folder, Xt)
        pw, _ = ensemble(folder, Xw)
        result[name] = {"folder": folder, "seeds": n, "test_split": scores(pt, yt),
                        "webcam": scores(pw, yw), "webcam_weak_words": scores(pw, yw, weak_ids[yw]),
                        "webcam_other_words": scores(pw, yw, ~weak_ids[yw])}
    for key in ("test_split", "webcam", "webcam_weak_words", "webcam_other_words"):
        b, a = result["before"][key], result["after"][key]
        print(f"{key:20} n={b['n']:5}  top-1 {b['top1']:6.1%} -> {a['top1']:6.1%}   top-5 {b['top5']:6.1%} -> {a['top5']:6.1%}"
              f"   shown & right at 60% {b['shown_ok_at_60']:6.1%} -> {a['shown_ok_at_60']:6.1%}")
    out = os.path.join(ML, "models", "diagnostics", "word_model_comparison.json")
    with open(out, "w") as f:
        json.dump(result, f, indent=1)
    print("wrote", out)


if __name__ == "__main__":
    main()
