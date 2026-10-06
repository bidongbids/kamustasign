"""
FSL-105: score ensembles and per-class accuracy from the test probabilities
train_fsl_classifier.py saved under models/fsl_results/ (no model reloading).

  python scripts/test_fsl_ensemble.py                 deployable ensemble (signer D held out)
  python scripts/test_fsl_ensemble.py loso            leave-one-signer-out, per fold + mean
  python scripts/test_fsl_ensemble.py provided        dataset's own (signer-dependent) split
  python scripts/test_fsl_ensemble.py --per-class     add per-class table for the deployable ensemble

Per-class numbers rest on ~5 test clips per word: treat the top and bottom
bands as signal and the ordering within them as mostly chance.
"""

import os
import sys
import glob
import json
import numpy as np

MODEL_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
RESULTS_DIR = os.path.join(MODEL_DIR, "fsl_results")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "fsl_classes.json")


def load(prefix):
    runs = []
    for p in sorted(glob.glob(os.path.join(RESULTS_DIR, f"{prefix}_seed*.npz"))):
        r = dict(np.load(p))
        r["name"] = os.path.basename(p)[:-4]
        runs.append(r)
    return runs


def topk(probs, y, k):
    return float(np.mean([y[i] in np.argsort(-probs[i])[:k] for i in range(len(y))]))


def report(prefix, label):
    runs = load(prefix)
    if not runs:
        print(f"{label}: no runs found for {prefix}_seed*")
        return None
    y = runs[0]["y"]
    for r in runs:
        assert np.array_equal(r["video_id"], runs[0]["video_id"]), "runs scored on different test sets"
        print(f"  {r['name']:<34} top-1 {topk(r['probs'], y, 1):6.2%}   top-5 {topk(r['probs'], y, 5):6.2%}")
    avg = np.mean([r["probs"] for r in runs], axis=0)
    t1, t5 = topk(avg, y, 1), topk(avg, y, 5)
    print(f"  => {label}: ensemble of {len(runs)}  top-1 {t1:.2%}   top-5 {t5:.2%}   (n={len(y)})")
    return avg, y, t1, t5


def per_class(avg, y):
    classes = json.load(open(CLASSES_PATH, encoding="utf-8"))
    pred = np.argmax(avg, axis=1)
    rows = []
    for i, w in enumerate(classes):
        m = y == i
        if m.any():
            rows.append((w, float(np.mean(pred[m] == i)), int(np.sum(pred[m] == i)), int(m.sum()),
                         classes[np.bincount(pred[m & (pred != i)], minlength=len(classes)).argmax()]
                         if (m & (pred != i)).any() else ""))
    rows.sort(key=lambda r: (-r[1], r[0]))
    print(f"\n{'Word':<18} {'Acc':>5}  C/T   most-confused-with")
    print("-" * 50)
    for w, a, c, t, conf in rows:
        print(f"{w:<18} {a:>5.0%}  {c}/{t}   {conf}")
    safe = [r[0] for r in rows if r[1] == 1.0]
    print(f"\n{len(safe)} words at 100% on the held-out signer: {', '.join(safe)}")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    mode = args[0] if args else "signer"
    if mode == "loso":
        folds = []
        for s in "ABCD":
            print(f"\nFold: test signer {s}")
            r = report(f"fsl_loso{s}", f"held-out {s}")
            if r:
                folds.append(r[2:])
        if folds:
            f = np.array(folds)
            print(f"\nLOSO mean over {len(folds)} folds: top-1 {f[:,0].mean():.2%} "
                  f"(range {f[:,0].min():.2%}-{f[:,0].max():.2%})   top-5 {f[:,1].mean():.2%}")
    elif mode == "provided":
        report("fsl_provided", "provided split (signer-dependent)")
    else:
        print("Deployable models (test = signer D, never seen in training):")
        r = report("fsl_sequence_classifier", "signer-independent")
        if r and "--per-class" in sys.argv:
            per_class(r[0], r[1])


if __name__ == "__main__":
    main()
