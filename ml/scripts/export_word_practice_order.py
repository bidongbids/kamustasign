"""
Writes the order the classroom's Words lessons are listed in
(src/data/wordPracticeOrder.json), from the per-word diagnostics that
word_model_diagnostics.py produces for the deployed ensembles.

Most reliably recognised words first, so a beginner meets signs the model
actually gets right before the ones it rarely does - failing three times on a
word the model only recognises 30% of the time reads as the student's fault.
Sort key: held-out top-1 recall, then mean confidence when right (a pass in
the classroom needs >= 80% confidence, so a word that is right but unsure is
still a hard lesson).

Only the ORDER comes from here. Which words exist is still read from each
model's deployed label_classes.json by src/lib/curriculum.ts; a word missing
from this file is simply listed after the ranked ones.

  cd ml
  python scripts/word_model_diagnostics.py      (if the models changed)
  python scripts/export_word_practice_order.py
"""

import os
import csv
import json
import math

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
DIAG_DIR = os.path.join(ML_DIR, "models", "diagnostics")
OUT_PATH = os.path.join(ML_DIR, "..", "src", "data", "wordPracticeOrder.json")

SOURCES = {
    "asl": "asl_per_word.csv",
    "fsl": "fsl-105_per_word.csv",
}


def number(value):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if math.isnan(x) else x


def ranked_words(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    rows.sort(key=lambda r: (-number(r["top1"]), -number(r["conf_when_right"]), r["word"]))
    return [r["word"] for r in rows]


def main():
    out = {}
    for language, filename in SOURCES.items():
        path = os.path.join(DIAG_DIR, filename)
        out[language] = ranked_words(path)
        print(f"{language}: {len(out[language])} words, first five: {out[language][:5]}")
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"Wrote {os.path.normpath(OUT_PATH)}")


if __name__ == "__main__":
    main()
