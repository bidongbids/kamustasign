"""
Reports per-word accuracy on the held-out test set, using the same
model-averaging ensemble as test_ensemble.py. Useful for picking words that
are most likely to demonstrate correctly live - a word with 100% accuracy
across several test clips is a much safer live demo than one the model
barely gets right.

Run this with your venv active (same as test_ensemble.py):
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/per_class_accuracy.py
"""

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

    print(f"Found {len(model_paths)} model(s), loading...")
    all_probs = []
    for path in model_paths:
        model = keras.models.load_model(path)
        all_probs.append(model.predict(X_test, verbose=0))

    avg_probs = np.mean(all_probs, axis=0)
    preds = np.argmax(avg_probs, axis=1)

    # Per-class stats: how many test examples for this word, how many the
    # ensemble got right (top-1), and the resulting accuracy.
    num_classes = len(classes)
    correct = np.zeros(num_classes, dtype=int)
    total = np.zeros(num_classes, dtype=int)
    for true_idx, pred_idx in zip(y_test, preds):
        total[true_idx] += 1
        if pred_idx == true_idx:
            correct[true_idx] += 1

    rows = []
    for i, word in enumerate(classes):
        if total[i] == 0:
            continue  # word had no test examples, skip
        acc = correct[i] / total[i]
        rows.append((word, acc, correct[i], total[i]))

    # Sort by accuracy desc, then by test-example count desc (more examples
    # = more trustworthy accuracy figure) as a tiebreaker.
    rows.sort(key=lambda r: (-r[1], -r[3]))

    print(f"\n{'Word':<20} {'Accuracy':>10}   Correct/Total")
    print("-" * 45)
    for word, acc, c, t in rows:
        print(f"{word:<20} {acc:>9.0%}   {c}/{t}")

    perfect = [r for r in rows if r[1] == 1.0 and r[3] >= 2]
    print(f"\n{len(perfect)} word(s) at 100% accuracy with >=2 test examples - best bets for a live demo:")
    for word, acc, c, t in perfect[:20]:
        print(f"  {word} ({c}/{t})")


if __name__ == "__main__":
    main()
