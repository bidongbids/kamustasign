"""
Training data for an "unknown sign" class (__unknown__) in the ASL word model.

The deployed model is a 344-way softmax with no "none of these" option, so
any sign it wasn't taught still lands on some word - at the app's 40% gate,
52.8% of out-of-vocabulary clips were captioned (oov_rejection_eval.py). A
class trained on real signs that are NOT in the vocabulary gives it a place
to put them.

Source: ASL Citizen train + val splits, glosses that are not one of the 344
words or an alias of one, one clip per gloss. The 250 glosses that
oov_rejection_eval.py tests on are EXCLUDED, so that test still measures
signs the model has never seen in any form. Clips are processed exactly
like the word clips in consolidate_combined_words.py (same Holistic settings,
same normalize(), untrimmed - the v3 recipe).

  cd ml
  .\\venv\\Scripts\\Activate.ps1
  python scripts/build_unknown_class.py               # ~2,200 clips; resumable
  python scripts/build_unknown_class.py --limit 600   # quicker, smaller class

Landmarks are cached in data/oov_landmarks_cache (shared with the eval), so a
killed run resumes. Writes data/unknown_landmarks.npz (X_train, X_val).
Then: python scripts/train_word_classifier.py --combined --unknown [seed]
"""

import os
import sys
import csv
import json
import random
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import select_asl_word_references as sel  # noqa: E402
import oov_rejection_eval as oov  # noqa: E402
from consolidate_combined_words import normalize  # noqa: E402

DATA_DIR = oov.DATA_DIR
OUT = os.path.join(DATA_DIR, "unknown_landmarks.npz")
VAL_FRACTION = 0.12


def vocab_keys(classes):
    keys = {sel.key(c) for c in classes}
    for c, aliases in sel.ALIASES.items():
        keys.add(sel.key(c))
        keys.update(sel.key(a.rstrip("0123456789")) for a in aliases)
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="max glosses (default: all)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    classes = json.load(open(os.path.join(DATA_DIR, "combined_word_classes.json"), encoding="utf-8"))
    vocab = vocab_keys(classes)
    eval_oov, _ = oov.pick_clips(classes, 250, 0)  # same call/seed as the eval's default
    with open(os.path.join(oov.CITIZEN, "splits", "test.csv"), newline="", encoding="utf-8") as f:
        test_gloss = {r["Video file"]: r["Gloss"] for r in csv.DictReader(f)}
    held_out = {sel.key(test_gloss[f]) for f, _ in eval_oov}

    by_gloss = {}
    for split in ("train", "val"):
        with open(os.path.join(oov.CITIZEN, "splits", f"{split}.csv"), newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                k = sel.key(r["Gloss"])
                if k in vocab or k in held_out:
                    continue
                if os.path.exists(os.path.join(oov.CITIZEN, "videos", r["Video file"])):
                    by_gloss.setdefault(k, r["Video file"])
    glosses = sorted(by_gloss)
    random.Random(args.seed).shuffle(glosses)
    if args.limit:
        glosses = glosses[: args.limit]
    print(f"{len(by_gloss)} usable OOV glosses (excluding {len(held_out)} held out for the eval); using {len(glosses)}")

    files = [by_gloss[g] for g in glosses]
    os.makedirs(oov.CACHE, exist_ok=True)
    oov.extract(files)

    X = []
    for f in files:
        p = os.path.join(oov.CACHE, os.path.splitext(f)[0] + ".npy")
        if os.path.exists(p):
            X.append(normalize(np.load(p)).astype(np.float16))
    X = np.stack(X)
    n_val = int(round(len(X) * VAL_FRACTION))
    np.savez(OUT, X_train=X[n_val:], X_val=X[:n_val])
    print(f"wrote {OUT}: {len(X) - n_val} train, {n_val} val clips of shape {X.shape[1:]}")


if __name__ == "__main__":
    main()
