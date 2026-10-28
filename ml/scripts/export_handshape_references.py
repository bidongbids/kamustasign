"""
"How to make it" media for the three handshape groups that used to say "soon",
merged into src/data/referenceMedia.json (export_reference_media.py makes the
rest; this one doesn't touch those entries):

  ASL numbers  public/reference/asl-numbers/<0-9>.jpg   ASL-HG, CC BY 4.0
  FSL letters  public/reference/fsl-letters/<A-Z>.jpg   FSL Dataset (J. G. Porton), CC0
  FSL numbers  the FSL-105 clip already exported for the number word
               ("fsl/words/one" -> "fsl/numbers/1"), CC BY 4.0

A photo is picked per sign from the model's own training photos: among the
ones the deployed model (models/<name>.keras) reads as that sign with the
highest confidence, the sharpest and largest hand. ASL numbers come from one
signer, so the ten photos look like one person. "0" is ASL-HG's "O" photo, as
in training (see train_handshape_classifier.py).

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\export_handshape_references.py --review   contact sheets only
  .\\venv\\Scripts\\python.exe scripts\\export_handshape_references.py
"""

import sys
import types

_stub = types.ModuleType("tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper")
_stub.MetricsWrapper = type("MetricsWrapper", (), {"__init__": lambda self, *a, **k: None,
                                                    "__getattr__": lambda self, n: (lambda *a, **k: None)})
sys.modules["tensorflow.lite.python._pywrap_tensorflow_lite_metrics_wrapper"] = _stub

import json
import os

import cv2
import numpy as np
from tensorflow import keras

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import train_handshape_classifier as th  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "ml", "data")
OUT_PUBLIC = os.path.join(ROOT, "public", "reference")
OUT_JSON = os.path.join(ROOT, "src", "data", "referenceMedia.json")
REVIEW_DIR = os.path.join(DATA, "_reference_review")
FSL_NUMBER_WORDS = {"1": "one", "2": "two", "3": "three", "4": "four", "5": "five",
                    "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"}

# After looking at the review sheets: sign -> photo path (relative to ml/data).
PICKS: dict[str, dict[str, str]] = {"asl-numbers": {}, "fsl-letters": {}}


def sharpness(path):
    img = cv2.imread(os.path.join(DATA, path), cv2.IMREAD_GRAYSCALE)
    return float(np.abs(cv2.Laplacian(img, cv2.CV_64F)).mean()) if img is not None else 0.0


def candidates(name, top):
    """sign -> [(score, path)] best first."""
    X, y, classes, groups, d = th.dataset(name)
    model = keras.models.load_model(os.path.join(th.MODEL_DIR, f"{name.replace('-', '_')}.keras"))
    probs = model.predict(X.reshape(-1, 63), verbose=0, batch_size=1024)
    conf = probs[np.arange(len(y)), y]
    original = np.array([".rf." not in p for p in d["path"]])  # not a Roboflow copy
    # The hand's larger side as a share of the photo (H points sideways, O is compact).
    hand_size = np.maximum(np.ptp(d["pts"][:, :, 0], axis=1), np.ptp(d["pts"][:, :, 1], axis=1))
    keep = (original & (probs.argmax(1) == y) & (d["score"] > 0.9) & (hand_size > 0.45)
            & (d["hand"] == th.RIGHT_LABEL))  # a right hand, like the other reference photos
    if name == "asl-numbers":
        # One person for all ten: the signer the model reads most confidently.
        signers = np.unique(d["signer"])
        best = max(signers, key=lambda s: conf[keep & (d["signer"] == s)].mean())
        keep &= d["signer"] == best
        print(f"asl-numbers: photos from signer {best}")
    out = {}
    for c, sign in enumerate(classes):
        idx = np.flatnonzero(keep & (y == c))
        idx = idx[np.argsort(-conf[idx])][:top * 3]
        scored = sorted(((conf[i] * np.log1p(sharpness(d["path"][i])), d["path"][i]) for i in idx), reverse=True)
        out[sign] = scored[:top]
    return out


def review():
    os.makedirs(REVIEW_DIR, exist_ok=True)
    for name in ("asl-numbers", "fsl-letters"):
        rows = []
        for sign, cands in candidates(name, 6).items():
            tiles = []
            for _, p in cands:
                img = cv2.resize(cv2.imread(os.path.join(DATA, p)), (130, 130))
                cv2.putText(img, f"{sign} {os.path.basename(p)[:14]}", (3, 12), 0, 0.33, (0, 255, 255), 1)
                tiles.append(img)
            tiles += [np.zeros((130, 130, 3), np.uint8)] * (6 - len(tiles))
            rows.append(np.hstack(tiles))
        path = os.path.join(REVIEW_DIR, f"{name}.jpg")
        cv2.imwrite(path, np.vstack(rows))
        print("wrote", path)


def export_photos(media, name, folder, key_prefix, credit):
    out = os.path.join(OUT_PUBLIC, folder)
    os.makedirs(out, exist_ok=True)
    for sign, cands in candidates(name, 1).items():
        path = PICKS[name].get(sign) or (cands[0][1] if cands else None)
        if not path:
            print(f"{name} {sign}: no photo")
            continue
        img = cv2.imread(os.path.join(DATA, path))
        h, w = img.shape[:2]
        if max(h, w) < 300:  # the FSL crops are small; scale up so they aren't a blur on a big screen
            img = cv2.resize(img, (round(w * 300 / max(h, w)), round(h * 300 / max(h, w))), interpolation=cv2.INTER_CUBIC)
        cv2.imwrite(os.path.join(out, f"{sign}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        media[f"{key_prefix}/{sign}"] = {"type": "image", "uri": f"/reference/{folder}/{sign}.jpg",
                                         "credit": credit, "source": path.replace("\\", "/")}
        print(f"{name} {sign}: {path}")


def main():
    if "--review" in sys.argv:
        review()
        return
    media = json.load(open(OUT_JSON, encoding="utf-8"))
    export_photos(media, "asl-numbers", "asl-numbers", "asl/numbers", "asl-hg")
    export_photos(media, "fsl-letters", "fsl-letters", "fsl/letters", "fsl-alphabet")
    for digit, word in FSL_NUMBER_WORDS.items():
        src = media.get(f"fsl/words/{word}")
        if src:
            media[f"fsl/numbers/{digit}"] = dict(src)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(media.items())), f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {len(media)} entries -> {os.path.relpath(OUT_JSON, ROOT)}")


if __name__ == "__main__":
    main()
