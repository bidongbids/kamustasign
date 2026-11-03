"""
Per-word accuracy diagnostics for both deployed word ensembles (the 4-seed
ASL word model behind public/word-model and the 4-seed FSL-105 model behind
public/fsl-model), scored on each one's held-out test set:

  ASL  combined_word_landmarks.npz X_test/y_test (our manifest's test split
       plus 2 held-out signers from the Google Isolated SLR dataset)
  FSL  fsl_landmarks.npz split == "test" (signer D, never seen in training)

For every word: test clips, top-1 recall, top-5, precision, F1, mean
confidence when right / wrong, the word it is most often mistaken for, and
how it behaves at the app's MIN_CONFIDENCE gate (WordTranslatorScreen.tsx):
"shown" = top prediction cleared the gate, "shown_ok" = shown and correct.

ASL also gets a webcam check (webcam_clips / webcam_top1 / webcam_top5):
the ASL test set is mostly the Google dataset's portrait phone clips, which
flatters the words learned only from it. The webcam check scores every
landscape webcam clip on disk (ASL Citizen / WLASL / MS-ASL, filed under the
word) that was not used for training or validation, trimmed to the
hand-active span as the app trims a recording - the closest thing here to a
child at a laptop camera. Since 2026-10-29 those are the clips of five ASL
Citizen signers the model never saw at all (HELDOUT_SIGNERS below).

  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/word_model_diagnostics.py            both models
  python scripts/word_model_diagnostics.py asl        one model

Writes models/diagnostics/{asl,fsl}_per_word.csv and a JSON summary.
FSL words are shown by the Tagalog names the app uses (src/lib/signNames.ts):
in the printout, the summary's confusions and the CSV's name and
most_confused_with columns. The CSV's word column keeps the English label,
the key export_word_practice_order.py and export_star_reference.py look up.
Per-word figures rest on a handful of test clips each - read the top and
bottom bands as signal and the ordering inside them as mostly noise.
"""

import os
import re
import sys
import csv
import json
import glob
import numpy as np
from tensorflow import keras

sys.path.insert(0, os.path.dirname(__file__))

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
DATA_DIR = os.path.join(ML_DIR, "data")
MODEL_DIR = os.path.join(ML_DIR, "models")
OUT_DIR = os.path.join(MODEL_DIR, "diagnostics")
SIGN_NAMES_TS = os.path.join(ML_DIR, "..", "src", "lib", "signNames.ts")

MIN_CONFIDENCE = 0.40  # keep in sync with WordTranslatorScreen.tsx


def fsl_tagalog():
    """FSL word label -> the Tagalog name the app shows (FSL_WORDS_TAGALOG)."""
    src = open(SIGN_NAMES_TS, encoding="utf-8").read()
    block = src.split("FSL_WORDS_TAGALOG")[1].split("};")[0]
    return {q or bare: name for q, bare, name in re.findall(r'^\s*(?:"([^"]+)"|(\w+)):\s*"([^"]*)"', block, re.M)}


def load_asl():
    # The deployed ASL model: our clips + the Google Isolated SLR clips
    # (consolidate_combined_words.py, train_word_classifier.py --combined).
    d = np.load(os.path.join(DATA_DIR, "combined_word_landmarks.npz"))
    classes = json.load(open(os.path.join(DATA_DIR, "combined_word_classes.json"), encoding="utf-8"))
    paths = sorted(glob.glob(os.path.join(MODEL_DIR, "asl_combined_seed[0-9].keras")))
    # train counts give context for weak words (few training clips vs. hard sign)
    return (d["X_test"].astype("float32"), d["y_test"], np.bincount(d["y_train"], minlength=len(classes)),
            classes, paths)


def load_fsl():
    d = np.load(os.path.join(DATA_DIR, "fsl_landmarks.npz"))
    classes = json.load(open(os.path.join(DATA_DIR, "fsl_classes.json"), encoding="utf-8"))
    paths = sorted(glob.glob(os.path.join(MODEL_DIR, "fsl_sequence_classifier_seed[0-9].keras")))
    test, train = d["split"] == "test", d["split"] == "train"
    return d["X"][test], d["y"][test], np.bincount(d["y"][train], minlength=len(classes)), classes, paths


# Webcam clips moved into training by consolidate_combined_words.py
# --webcam-extra are listed here and never scored, so the webcam check stays a
# test of unseen clips. 2026-10-28: a hash half of each word's clips.
# Since 2026-10-29 the split is by PERSON (WEBCAM_SPLIT is written): every clip
# by HELDOUT_SIGNERS - five of ASL Citizen's own test-split participants - stays
# out of training, including their clips in our manifest's train/val split, and
# only theirs are scored; every other webcam clip not in our manifest trains.
WEBCAM_TRAIN_LIST = os.path.join(DATA_DIR, "webcam_train_extra.json")
WEBCAM_SPLIT = os.path.join(DATA_DIR, "webcam_split.json")
HELDOUT_SIGNERS = ("P35", "P9", "P48", "P15", "P42")

_citizen_signers = None


def citizen_signer(video_id):
    """ASL Citizen participant ID of a clip id ("citizen_<file stem>"), or None."""
    global _citizen_signers
    if _citizen_signers is None:
        _citizen_signers = {}
        for split in ("train", "val", "test"):
            with open(os.path.join(DATA_DIR, "ASL_Citizen", "splits", f"{split}.csv"), newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    _citizen_signers["citizen_" + os.path.splitext(r["Video file"])[0]] = r["Participant ID"]
    return _citizen_signers.get(video_id)


def vocab_clip_files(classes):
    """[(video_id, class index, cache path)] of every webcam clip on disk with
    landmarks, filed under a vocabulary word or a numbered variant of it."""
    import select_asl_word_references as sel
    folders = {sel.key(d): d for d in os.listdir(sel.SL_DIR)}
    out = []
    for i, w in enumerate(classes):
        names = [w] + [a for a in sel.ALIASES.get(w, []) if a[:-1] == w and a[-1].isdigit()]
        for n in names:
            d = folders.get(sel.key(n))
            for f in sorted(os.listdir(os.path.join(sel.SL_DIR, d))) if d else []:
                vid = os.path.splitext(f)[0]
                cached = os.path.join(sel.CACHE_DIR, vid + ".npy")
                if f.endswith(".mp4") and os.path.exists(cached):
                    out.append((vid, i, cached))
    return out


def webcam_clip_files(classes):
    """[(video_id, class index, cache path)] of the webcam clips the webcam
    check may score: with the person split, every clip by a held-out signer;
    before it, every clip not in our manifest's train/val split."""
    clips = vocab_clip_files(classes)
    if os.path.exists(WEBCAM_SPLIT):
        held = set(json.load(open(WEBCAM_SPLIT))["heldout_signers"])
        return [c for c in clips if citizen_signer(c[0]) in held]
    with open(os.path.join(DATA_DIR, "word_manifest.csv"), newline="", encoding="utf-8") as f:
        used = {r["video_id"] for r in csv.DictReader(f) if r["split"] in ("train", "val")}
    return [c for c in clips if c[0] not in used]


def webcam_clips(classes, include_moved=False, skip=()):
    """(X, y) of the held-out webcam clips for the ASL webcam check. skip: clip
    ids to leave out as well (e.g. ones an older model trained on)."""
    import extract_word_landmarks as ex
    from consolidate_combined_words import trim_to_hand_span
    moved = set() if include_moved or not os.path.exists(WEBCAM_TRAIN_LIST) else set(json.load(open(WEBCAM_TRAIN_LIST)))
    moved |= set(skip)
    X, y = [], []
    for vid, i, cached in webcam_clip_files(classes):
        if vid in moved:
            continue
        raw = trim_to_hand_span(np.load(cached).astype("float32"))
        raw[:, [k * 4 + 3 for k in range(ex.NUM_POSE)]] = 0.0  # as in training
        X.append(ex.normalize_sequence(raw))
        y.append(i)
    return np.array(X, dtype="float32"), np.array(y)


def run(name, loader, webcam=False, names=None):
    X, y, train_counts, classes, paths = loader()
    n_cls = len(classes)
    shown_as = lambda w: (names or {}).get(w, w)
    print(f"\n{'=' * 78}\n{name}: {len(paths)} model(s), {n_cls} words, {len(y)} test clips")
    Xw, yw = webcam_clips(classes) if webcam else (None, None)
    probs, wprobs = [], []
    for p in paths:
        m = keras.models.load_model(p, compile=False)
        pr = m.predict(X, verbose=0, batch_size=128)
        print(f"  {os.path.basename(p):<42} top-1 {np.mean(pr.argmax(1) == y):6.2%}")
        probs.append(pr)
        if webcam:
            wprobs.append(m.predict(Xw, verbose=0, batch_size=128))
    avg = np.mean(probs, axis=0)
    if webcam:
        wavg = np.mean(wprobs, axis=0)
        w_ok = wavg.argmax(1) == yw
        w_top5 = np.array([yw[i] in np.argsort(-wavg[i])[:5] for i in range(len(yw))])
        print(f"  webcam check: {len(yw)} held-out webcam clips, top-1 {w_ok.mean():.2%}, top-5 {w_top5.mean():.2%}")
    pred = avg.argmax(1)
    conf = avg.max(1)
    top5 = np.array([y[i] in np.argsort(-avg[i])[:5] for i in range(len(y))])
    ok = pred == y
    shown = conf >= MIN_CONFIDENCE

    rows = []
    for i, w in enumerate(classes):
        m = y == i
        n = int(m.sum())
        tp = int(np.sum(ok & m))
        n_pred = int(np.sum(pred == i))
        rec = tp / n if n else float("nan")
        prec = tp / n_pred if n_pred else float("nan")
        f1 = 2 * prec * rec / (prec + rec) if n and n_pred and (prec + rec) else 0.0
        wrong = m & ~ok
        confused = ""
        if wrong.any():
            c = np.bincount(pred[wrong], minlength=n_cls)
            confused = f"{shown_as(classes[c.argmax()])} ({c.max()})"
        rows.append({
            "word": w, "name": shown_as(w), "train_clips": int(train_counts[i]), "test_clips": n,
            "top1": rec, "top5": float(top5[m].mean()) if n else float("nan"),
            "precision": prec, "f1": f1, "times_predicted": n_pred,
            "conf_when_right": float(conf[m & ok].mean()) if (m & ok).any() else float("nan"),
            "conf_when_wrong": float(conf[wrong].mean()) if wrong.any() else float("nan"),
            "shown": int(np.sum(m & shown)), "shown_ok": int(np.sum(m & shown & ok)),
            "most_confused_with": confused,
        })
        if webcam:
            mw = yw == i
            rows[-1].update({
                "webcam_clips": int(mw.sum()),
                "webcam_top1": float(w_ok[mw].mean()) if mw.any() else float("nan"),
                "webcam_top5": float(w_top5[mw].mean()) if mw.any() else float("nan"),
            })

    tested = [r for r in rows if r["test_clips"]]
    tested.sort(key=lambda r: (-r["top1"], -r["f1"], r["word"]))
    untested = [r["name"] for r in rows if not r["test_clips"]]

    wide = min(max(18, max(len(r["name"]) for r in rows) + 1), 30)
    print(f"\n{'Word':<{wide}}{'Trn':>4}{'Tst':>4}{'Top1':>6}{'Top5':>6}{'Prec':>6}{'F1':>6}"
          f"{'Cf+':>5}{'Cf-':>5}{'Gate':>7}  most-confused-with")
    print("-" * 100)
    fmt = lambda v: "  -  " if np.isnan(v) else f"{v:5.0%}"
    for r in tested:
        print(f"{r['name'][:wide - 1]:<{wide}}{r['train_clips']:>4}{r['test_clips']:>4} {fmt(r['top1'])} {fmt(r['top5'])}"
              f" {fmt(r['precision'])} {fmt(r['f1'])}{fmt(r['conf_when_right'])}{fmt(r['conf_when_wrong'])}"
              f"  {r['shown_ok']}/{r['shown']:<3}  {r['most_confused_with']}")

    # Most frequent confusion pairs across the whole test set
    pairs = {}
    for t, p in zip(y[~ok], pred[~ok]):
        pair = (shown_as(classes[t]), shown_as(classes[p]))
        pairs[pair] = pairs.get(pair, 0) + 1
    top_pairs = sorted(pairs.items(), key=lambda kv: -kv[1])[:15]

    t1s = np.array([r["top1"] for r in tested])
    summary = {
        "model": name, "seeds": len(paths), "words": n_cls, "test_clips": int(len(y)),
        "top1": float(ok.mean()), "top5": float(top5.mean()),
        "macro_top1": float(t1s.mean()),
        "macro_f1": float(np.mean([r["f1"] for r in tested])),
        "gate": MIN_CONFIDENCE,
        "shown_rate": float(shown.mean()),
        "precision_when_shown": float(ok[shown].mean()) if shown.any() else None,
        "mean_conf_right": float(conf[ok].mean()), "mean_conf_wrong": float(conf[~ok].mean()),
        "words_100": int(np.sum(t1s == 1.0)), "words_0": int(np.sum(t1s == 0.0)),
        "words_ge_80": int(np.sum(t1s >= 0.8)), "words_lt_50": int(np.sum(t1s < 0.5)),
        "untested_words": untested,
        "top_confusions": [{"true": a, "pred": b, "count": c} for (a, b), c in top_pairs],
    }
    if webcam:
        summary.update({"webcam_clips": int(len(yw)), "webcam_top1": float(w_ok.mean()),
                        "webcam_top5": float(w_top5.mean())})

    print("-" * 100)
    print(f"Overall top-1 {summary['top1']:.2%}   top-5 {summary['top5']:.2%}   "
          f"macro top-1 {summary['macro_top1']:.2%}   macro F1 {summary['macro_f1']:.2%}")
    print(f"At the app's {MIN_CONFIDENCE:.0%} gate: shows a word for {summary['shown_rate']:.1%} of clips, "
          f"and {summary['precision_when_shown']:.1%} of shown words are right")
    print(f"Mean confidence: right {summary['mean_conf_right']:.0%}, wrong {summary['mean_conf_wrong']:.0%}")
    print(f"Words: {summary['words_100']} at 100%, {summary['words_ge_80']} >=80%, "
          f"{summary['words_lt_50']} <50%, {summary['words_0']} at 0%")
    if untested:
        print(f"No test clips for: {', '.join(untested)}")
    print("Most frequent confusions (true -> predicted):")
    for (a, b), c in top_pairs:
        print(f"  {a} -> {b}  x{c}")

    os.makedirs(OUT_DIR, exist_ok=True)
    key = name.split()[0].lower()
    with open(os.path.join(OUT_DIR, f"{key}_per_word.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(tested)
    return summary


def main():
    which = (sys.argv[1:] or ["both"])[0].lower()
    summaries = []
    if which in ("both", "asl"):
        summaries.append(run("ASL words", load_asl, webcam=True))
    if which in ("both", "fsl"):
        summaries.append(run("FSL-105 (signer D held out)", load_fsl, names=fsl_tagalog()))
    os.makedirs(OUT_DIR, exist_ok=True)
    # A one-language run replaces only its own entry, so `... fsl` doesn't
    # drop the ASL summary (and vice versa).
    path = os.path.join(OUT_DIR, "summary.json")
    fresh = {s["model"] for s in summaries}
    if os.path.exists(path):
        kept = [s for s in json.load(open(path, encoding="utf-8")) if s["model"] not in fresh]
        summaries = [s for s in kept if s["model"].startswith("ASL")] + summaries + \
                    [s for s in kept if not s["model"].startswith("ASL")]
    json.dump(summaries, open(path, "w", encoding="utf-8"), indent=2)
    print(f"\nCSV + summary.json written to {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
