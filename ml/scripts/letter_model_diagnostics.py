"""
Per-letter accuracy diagnostics for the deployed ASL letters model
(models/asl_landmark_classifier.keras -> public/model), on two test sets:

  held-out split   the 15% test split train_classifier.py holds back
                   (same CSV, same seed). The ASL Alphabet photos are
                   near-identical frames of very few people, so this split
                   shares people and backgrounds with training - it says
                   whether the model learned the classes, not whether it
                   generalises.
  other signers    the "asl_hg" photo set (data/asl_hg/asl_dataset, 10
                   people, P1-P10), never used for training. Closer to a new
                   child at the camera. Each person is scored as-is and
                   mirrored, and counted with whichever is better - what the
                   app's handedness picker (HandednessPicker.tsx) does for a
                   left-handed signer.

Per letter: top-1 recall, top-3, precision, F1, the letter it is most
mistaken for, and the pass rate at the app's PASS_CONFIDENCE (curriculum.ts):
right AND at least that confident. "del"/"space" are model classes but not
lessons; they are scored on the held-out split only (asl_hg has neither).

  cd ml
  .\\venv\\Scripts\\Activate.ps1
  python scripts/letter_model_diagnostics.py

Writes models/diagnostics/letters_per_class.csv and letters_summary.json.
"""

import csv
import json
import os
import sys

# TensorFlow first: on this Windows setup its DLLs fail to initialise if
# pandas/scikit-learn have loaded theirs already.
from tensorflow import keras
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
CSV_PATH = os.path.join(ML_DIR, "data", "landmarks_dataset.csv")
HG_DIR = os.path.join(ML_DIR, "data", "asl_hg", "asl_dataset")
MODEL_PATH = os.path.join(ML_DIR, "models", "asl_landmark_classifier.keras")
HAND_MODEL = os.path.join(ML_DIR, "hand_landmarker.task")
OUT_DIR = os.path.join(ML_DIR, "models", "diagnostics")

PASS_CONFIDENCE = 0.8  # keep in sync with src/lib/curriculum.ts
PER_PERSON_PER_LETTER = 20


def held_out_split():
    """The exact test split of train_classifier.py."""
    df = pd.read_csv(CSV_PATH)
    df = df[df["label"] != "nothing"]
    X = df.drop(columns=["label"]).values.astype("float32")
    labels = sorted(df["label"].unique())  # LabelEncoder order
    y = np.searchsorted(labels, df["label"].values)
    _, X_tmp, _, y_tmp = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
    _, X_test, _, y_test = train_test_split(X_tmp, y_tmp, test_size=0.5, random_state=42, stratify=y_tmp)
    return X_test, y_test, labels


def other_signers(classes):
    """Landmarks of a sample of asl_hg photos: (X, y, person, n_tried)."""
    import cv2
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    detector = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=HAND_MODEL),
        num_hands=1, min_hand_detection_confidence=0.4, min_hand_presence_confidence=0.4))
    X, y, person, tried = [], [], [], 0
    for ci, letter in enumerate(classes):
        folder = os.path.join(HG_DIR, letter)
        if not os.path.isdir(folder):
            continue
        by_person = {}
        for f in sorted(os.listdir(folder)):
            by_person.setdefault(f.split("_")[0], []).append(f)
        for p, files in sorted(by_person.items()):
            for f in files[::max(1, len(files) // PER_PERSON_PER_LETTER)][:PER_PERSON_PER_LETTER]:
                tried += 1
                img = cv2.imread(os.path.join(folder, f))
                if img is None:
                    continue
                res = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,
                                               data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)))
                if res.hand_landmarks:
                    X.append([v for lm in res.hand_landmarks[0] for v in (lm.x, lm.y, lm.z)])
                    y.append(ci)
                    person.append(p)
        print(f"  {letter}: {sum(1 for v in y if v == ci)} photos with a hand", flush=True)
    detector.close()
    return np.array(X, dtype="float32"), np.array(y), np.array(person), tried


def mirror(X):
    X = X.copy()
    X[:, 0::3] = 1 - X[:, 0::3]  # as mirrorFlatLandmarks in HandednessPicker.tsx
    return X


def per_class(probs, y, classes, only=None):
    pred, conf = probs.argmax(1), probs.max(1)
    top3 = np.array([y[i] in np.argsort(-probs[i])[:3] for i in range(len(y))])
    ok = pred == y
    rows = {}
    for i, c in enumerate(classes):
        if only is not None and c not in only:
            continue
        m = y == i
        n, tp, n_pred = int(m.sum()), int((ok & m).sum()), int((pred == i).sum())
        if not n:
            continue
        rec, prec = tp / n, (tp / n_pred if n_pred else float("nan"))
        wrong = m & ~ok
        confused = ""
        if wrong.any():
            cc = np.bincount(pred[wrong], minlength=len(classes))
            confused = f"{classes[cc.argmax()]} ({cc.max()})"
        rows[c] = {"n": n, "top1": rec, "top3": float(top3[m].mean()), "precision": prec,
                   "f1": 2 * prec * rec / (prec + rec) if n_pred and prec + rec else 0.0,
                   "pass_rate": float((ok & m & (conf >= PASS_CONFIDENCE)).sum() / n),
                   "most_confused_with": confused}
    return rows, {"n": int(len(y)), "top1": float(ok.mean()), "top3": float(top3.mean()),
                  "pass_rate": float((ok & (conf >= PASS_CONFIDENCE)).mean())}


def main():
    model = keras.models.load_model(MODEL_PATH, compile=False)
    X_test, y_test, classes = held_out_split()
    deployed = json.load(open(os.path.join(ML_DIR, "..", "public", "model", "label_classes.json")))
    assert classes == deployed, f"label order differs from the deployed model: {classes} vs {deployed}"
    letters = [c for c in classes if len(c) == 1]

    held_rows, held = per_class(model.predict(X_test, verbose=0), y_test, classes)
    print(f"Held-out split: {held['n']} photos, top-1 {held['top1']:.2%}, top-3 {held['top3']:.2%}, "
          f"pass rate {held['pass_rate']:.2%}")

    print("Extracting landmarks from the other-signers photos...")
    Xh, yh, ph, tried = other_signers(letters)
    raw, mir = model.predict(Xh, verbose=0), model.predict(mirror(Xh), verbose=0)
    people = {}
    best = np.empty_like(raw)
    for p in sorted(set(ph), key=lambda s: int(s[1:])):
        m = ph == p
        a_raw, a_mir = float((raw[m].argmax(1) == yh[m]).mean()), float((mir[m].argmax(1) == yh[m]).mean())
        hand = "right" if a_raw >= a_mir else "left (mirrored)"
        best[m] = raw[m] if a_raw >= a_mir else mir[m]
        people[p] = {"photos": int(m.sum()), "as_is": a_raw, "mirrored": a_mir, "used": hand}
        print(f"  {p}: as-is {a_raw:.1%}, mirrored {a_mir:.1%} -> {hand}")
    hg_rows, hg = per_class(best, yh, classes, only=set(letters))
    hg.update({"photos_tried": tried, "hand_found": float(len(yh) / tried),
               "top1_as_is": float((raw.argmax(1) == yh).mean())})
    print(f"Other signers: {hg['n']} photos ({hg['hand_found']:.0%} had a hand found), "
          f"top-1 {hg['top1']:.2%} (as-is {hg['top1_as_is']:.2%}), pass rate {hg['pass_rate']:.2%}")

    os.makedirs(OUT_DIR, exist_ok=True)
    cols = ["n", "top1", "top3", "precision", "f1", "pass_rate", "most_confused_with"]
    with open(os.path.join(OUT_DIR, "letters_per_class.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["letter"] + [f"heldout_{c}" for c in cols] + [f"signers_{c}" for c in cols])
        for c in classes:
            h, o = held_rows.get(c, {}), hg_rows.get(c, {})
            w.writerow([c] + [h.get(k, "") for k in cols] + [o.get(k, "") for k in cols])
    json.dump({"model": "ASL letters", "classes": classes, "pass_confidence": PASS_CONFIDENCE,
               "held_out": held, "other_signers": hg, "people": people},
              open(os.path.join(OUT_DIR, "letters_summary.json"), "w", encoding="utf-8"), indent=2)
    print(f"Wrote letters_per_class.csv + letters_summary.json to {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    sys.exit(main())
