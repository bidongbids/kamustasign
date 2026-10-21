"""
Out-of-vocabulary (OOV) rejection check for the deployed ASL word ensemble.

The app shows a word only when the ensemble's top probability clears a gate
(MIN_CONFIDENCE in WordTranslatorScreen.tsx, WORD_MIN_PCT in
useCallSignReader.ts - 40% and 60%). This measures what that gate does with signs
the model was NEVER taught, which test accuracy can't show:

  OOV clips   ASL Citizen test-split clips whose gloss is not one of the 344
              words (nor an alias of one, see select_asl_word_references.py).
  In-vocab    ASL Citizen test-split clips of the 344 words that were not used
              for training/validation (word_manifest.csv).

Both sets are webcam clips (landscape, like the app), extracted with the same
Holistic settings as training and trimmed to the hand-active span the way the
app trims a recording. For each gate it reports:

  false accept   OOV clip shown as some word        (lower is better)
  accept         in-vocab clip shown at all
  correct shown  in-vocab clip shown AND right      (higher is better)

  cd ml
  .\\venv\\Scripts\\Activate.ps1
  python scripts/oov_rejection_eval.py              # extract (resumable) + score
  python scripts/oov_rejection_eval.py --per-set 150

Landmarks are cached in data/oov_landmarks_cache/, so a killed run resumes.
Writes models/diagnostics/oov_rejection.json.
"""

import os
import sys
import csv
import json
import glob
import random
import argparse
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import extract_word_landmarks as ex  # noqa: E402
import select_asl_word_references as sel  # noqa: E402
from consolidate_combined_words import trim_to_hand_span  # noqa: E402

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
DATA_DIR = os.path.join(ML_DIR, "data")
MODEL_DIR = os.path.join(ML_DIR, "models")
CITIZEN = os.path.join(DATA_DIR, "ASL_Citizen")
CACHE = os.path.join(DATA_DIR, "oov_landmarks_cache")
OUT = os.path.join(MODEL_DIR, "diagnostics", "oov_rejection.json")
APP_GATE = 0.40  # Words translator; the video-call reader uses 0.60
GATES = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]


def pick_clips(classes, per_set, seed):
    vocab = {sel.key(c) for c in classes}
    for c, aliases in sel.ALIASES.items():
        vocab.add(sel.key(c))
        vocab.update(sel.key(a.rstrip("0123456789")) for a in aliases)
    with open(os.path.join(DATA_DIR, "word_manifest.csv"), newline="", encoding="utf-8") as f:
        used = {r["video_id"] for r in csv.DictReader(f) if r["split"] in ("train", "val")}
    used |= {u.removeprefix("citizen_") for u in used}
    word_index = {sel.key(c): i for i, c in enumerate(classes)}

    oov, inv = {}, {}
    with open(os.path.join(CITIZEN, "splits", "test.csv"), newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            stem = os.path.splitext(r["Video file"])[0]
            if stem in used or not os.path.exists(os.path.join(CITIZEN, "videos", r["Video file"])):
                continue
            k = sel.key(r["Gloss"])
            # One clip per gloss keeps a few very common glosses from dominating.
            if k in word_index:
                inv.setdefault(k, (r["Video file"], word_index[k]))
            elif k not in vocab:
                oov.setdefault(k, (r["Video file"], -1))
    rng = random.Random(seed)
    oov_pick = rng.sample(sorted(oov.values()), min(per_set, len(oov)))
    inv_pick = rng.sample(sorted(inv.values()), min(per_set, len(inv)))
    print(f"pool: {len(oov)} OOV glosses, {len(inv)} in-vocab glosses with an unused test clip")
    return oov_pick, inv_pick


def extract(files):
    todo = [f for f in files if not os.path.exists(os.path.join(CACHE, os.path.splitext(f)[0] + ".npy"))]
    if not todo:
        return
    print(f"extracting landmarks for {len(todo)} clips (cached in {CACHE}) ...")
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.HolisticLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)
    ts = 0
    for n, f in enumerate(todo, 1):
        seq, ts = ex.extract_video_sequence(detector, os.path.join(CITIZEN, "videos", f), ts)
        if seq is not None:
            np.save(os.path.join(CACHE, os.path.splitext(f)[0] + ".npy"), seq)
        if n % 25 == 0:
            print(f"  {n}/{len(todo)}", flush=True)
    detector.close()


def load(picks):
    X, y = [], []
    for f, label in picks:
        p = os.path.join(CACHE, os.path.splitext(f)[0] + ".npy")
        if not os.path.exists(p):
            continue
        raw = trim_to_hand_span(np.load(p).astype("float32"))
        raw[:, [k * 4 + 3 for k in range(ex.NUM_POSE)]] = 0.0  # as in training
        X.append(ex.normalize_sequence(raw))
        y.append(label)
    return np.array(X, dtype="float32"), np.array(y)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-set", type=int, default=250)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    os.makedirs(CACHE, exist_ok=True)

    classes = json.load(open(os.path.join(DATA_DIR, "combined_word_classes.json"), encoding="utf-8"))
    oov_pick, inv_pick = pick_clips(classes, args.per_set, args.seed)
    extract([f for f, _ in oov_pick + inv_pick])

    from tensorflow import keras
    Xo, _ = load(oov_pick)
    Xi, yi = load(inv_pick)
    paths = sorted(glob.glob(os.path.join(MODEL_DIR, "asl_combined_seed[0-9].keras")))
    po, pi = [], []
    for p in paths:
        m = keras.models.load_model(p, compile=False)
        po.append(m.predict(Xo, verbose=0, batch_size=128))
        pi.append(m.predict(Xi, verbose=0, batch_size=128))
    po, pi = np.mean(po, axis=0), np.mean(pi, axis=0)
    conf_o, conf_i = po.max(1), pi.max(1)
    right_i = pi.argmax(1) == yi

    rows = []
    for g in GATES:
        rows.append({
            "gate": g,
            "false_accept": float(np.mean(conf_o >= g)),
            "accept": float(np.mean(conf_i >= g)),
            "correct_shown": float(np.mean((conf_i >= g) & right_i)),
        })
    result = {
        "model": f"ASL words ({len(paths)}-seed ensemble, {len(classes)} words)",
        "oov_clips": int(len(Xo)),
        "in_vocab_clips": int(len(Xi)),
        "in_vocab_top1": float(right_i.mean()),
        "app_gate": APP_GATE,
        "mean_conf_oov": float(conf_o.mean()),
        "mean_conf_in_vocab": float(conf_i.mean()),
        "gates": rows,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(result, open(OUT, "w"), indent=2)

    print(f"\n{result['model']}: {len(Xo)} OOV clips, {len(Xi)} in-vocab clips "
          f"(in-vocab top-1 {right_i.mean():.1%})")
    print(f"mean top confidence: OOV {conf_o.mean():.2f}, in-vocab {conf_i.mean():.2f}")
    print(f"{'gate':>6} {'false accept':>13} {'accept':>8} {'correct shown':>14}")
    for r in rows:
        mark = "  <- app" if abs(r["gate"] - APP_GATE) < 1e-9 else ""
        print(f"{r['gate']:>6.2f} {r['false_accept']:>13.1%} {r['accept']:>8.1%} {r['correct_shown']:>14.1%}{mark}")
    print(f"\nwrote {OUT}")


if __name__ == "__main__":
    main()
