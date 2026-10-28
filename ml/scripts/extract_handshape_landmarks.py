"""
Hand landmarks for the still-handshape models that fill the "soon" groups
(ASL numbers, FSL letters, FSL numbers), and for retraining ASL letters.

One source per run, cached to ml/data/handshape_landmarks/<source>.npz:

  aslhg       data/asl_hg/asl_dataset/<0-9|A-Z>/P<n>_*.jpg   10 signers, 1,000 photos per class
  japorton    data/new_fsl_dataset/Kaggle japortonfsl-dataset/Collated/<A-Z>/*.jpg
              FSL letters. 450 per letter, of which about a third are Roboflow
              augmentations ("<n>_jpg.rf.<hash>.jpg") of an original "<n>.jpg";
              `group` ties each copy to its original so a split never puts the
              same photo on both sides.
  aslletterclips  test only: WLASL webcam clips of single letters, framed the same.
  aslclips    test only: the webcam clips of ASL zero..nine under data/word_videos
              (ASL Citizen / WLASL / MS-ASL), framed like fsl105.
  fsl105      data/FSL-105 .../clips, the ten number words (one..ten). Video, so
              every 2nd frame of the middle 60% of each clip (the ends are the
              hand rising and falling), keeping the raised hand.

Each row stores the RAW MediaPipe landmarks (x, y in 0-1 of the image, z), the
image width/height, MediaPipe's handedness label for that hand, the class, the
signer (or "" when unknown) and a group id. Normalisation happens in
train_handshape_classifier.py, so this cache never needs re-extracting when the
features change.

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\extract_handshape_landmarks.py aslhg
"""

import glob
import os
import re
import sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data")
OUT_DIR = os.path.join(DATA, "handshape_landmarks")
MODEL_PATH = os.path.join(HERE, "..", "hand_landmarker.task")

FSL105_DIR = os.path.join(DATA, "FSL-105 A dataset for recognizing 105 Filipino sign language videos")
FSL_NUMBER_WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
                    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10"}

_detector = None
_video_detector = None


def detector():
    global _detector
    if _detector is None:
        from mediapipe.tasks import python as mp_python
        from mediapipe.tasks.python import vision
        _detector = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
            num_hands=2, min_hand_detection_confidence=0.4, min_hand_presence_confidence=0.4))
    return _detector


def detect(rgb):
    """All hands in one RGB image -> list of ((21,3) array, handedness label, score)."""
    import mediapipe as mp
    res = detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    hands = []
    for lms, hd in zip(res.hand_landmarks, res.handedness):
        pts = np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32)
        hands.append((pts, hd[0].category_name, float(hd[0].score)))
    return hands


def biggest(hands, h, w):
    """The hand that fills the most of the photo (the signing hand in a close-up)."""
    def area(pts):
        return float((np.ptp(pts[:, 0]) * w) * (np.ptp(pts[:, 1]) * h))
    return max(hands, key=lambda t: area(t[0]))


def raised(hands):
    """In video the resting hand hangs low; the signing hand's wrist is higher (smaller y)."""
    return min(hands, key=lambda t: t[0][0, 1])


# ---- per-source item lists -----------------------------------------------------

def items_aslhg():
    root = os.path.join(DATA, "asl_hg", "asl_dataset")
    out = []
    for cls in sorted(os.listdir(root)):
        for f in sorted(glob.glob(os.path.join(root, cls, "*.jpg"))):
            signer = os.path.basename(f).split("_")[0]
            out.append({"path": f, "label": cls, "signer": signer, "group": f"{cls}/{os.path.basename(f)}"})
    return out


def items_japorton():
    root = os.path.join(DATA, "new_fsl_dataset", "Kaggle japortonfsl-dataset", "Collated")
    out = []
    for cls in sorted(os.listdir(root)):
        for f in sorted(glob.glob(os.path.join(root, cls, "*.jpg"))):
            base = re.match(r"^(\d+)", os.path.basename(f))
            out.append({"path": f, "label": cls, "signer": "",
                        "group": f"{cls}/{base.group(1) if base else os.path.basename(f)}"})
    return out


def items_fsl105():
    import csv
    out = []
    with open(os.path.join(DATA, "fsl_manifest.csv"), newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["word"] in FSL_NUMBER_WORDS:
                out.append({"path": os.path.join(FSL105_DIR, row["path"]), "label": FSL_NUMBER_WORDS[row["word"]],
                            "signer": row["signer"], "group": row["video_id"]})
    return out


ASL_NUMBER_WORDS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
                    "six": "6", "seven": "7", "eight": "8", "nine": "9"}


def items_aslclips():
    """Test only: webcam clips (ASL Citizen / WLASL / MS-ASL) of the number signs zero..nine."""
    root = os.path.join(DATA, "word_videos", "dataset", "SL")
    out = []
    for word, digit in ASL_NUMBER_WORDS.items():
        for f in sorted(glob.glob(os.path.join(root, word, "*.mp4"))):
            out.append({"path": f, "label": digit, "signer": "", "group": f"{word}/{os.path.basename(f)}"})
    return out


def items_aslletterclips():
    """Test only: WLASL's webcam clips of single fingerspelled letters (a, b, d, ...)."""
    root = os.path.join(DATA, "word_videos", "dataset", "SL")
    out = []
    for d in sorted(os.listdir(root)):
        if len(d) == 1 and d.isalpha():
            for f in sorted(glob.glob(os.path.join(root, d, "*.mp4"))):
                out.append({"path": f, "label": d.upper(), "signer": "", "group": f"{d}/{os.path.basename(f)}"})
    return out


SOURCES = {"aslhg": items_aslhg, "japorton": items_japorton, "fsl105": items_fsl105, "aslclips": items_aslclips,
           "aslletterclips": items_aslletterclips}


# ---- workers -------------------------------------------------------------------

def run_image(item):
    img = cv2.imread(item["path"])
    if img is None:
        return []
    h, w = img.shape[:2]
    hands = detect(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if not hands:
        return []
    pts, hand, score = biggest(hands, h, w)
    return [dict(item, pts=pts, hand=hand, score=score, w=w, h=h, frame=0, hands=len(hands))]


def run_video(item):
    cap = cv2.VideoCapture(item["path"])
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame)
    cap.release()
    n = len(frames)
    rows = []
    for i in range(int(n * 0.2), int(n * 0.8), 2):
        frame = frames[i]
        h, w = frame.shape[:2]
        hands = detect(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if not hands:
            continue
        pts, hand, score = raised(hands)
        rows.append(dict(item, pts=pts, hand=hand, score=score, w=w, h=h, frame=i, hands=len(hands)))
    return rows


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else ""
    if source not in SOURCES:
        sys.exit(f"usage: extract_handshape_landmarks.py {{{'|'.join(SOURCES)}}}")
    items = SOURCES[source]()
    worker = run_video if source in ("fsl105", "aslclips", "aslletterclips") else run_image
    print(f"{source}: {len(items)} items")

    # One process: with several workers starting at once, Windows' application
    # control policy intermittently blocked a TensorFlow Lite DLL in one of them.
    rows, missed = [], 0
    for k, item in enumerate(items):
        got = worker(item)
        if not got:
            missed += 1
        rows.extend(got)
        if (k + 1) % 1000 == 0 or (worker is run_video and (k + 1) % 50 == 0):
            print(f"  {k + 1}/{len(items)}  rows {len(rows)}  no hand {missed}", flush=True)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f"{source}.npz")
    np.savez_compressed(
        out,
        pts=np.stack([r["pts"] for r in rows]).astype(np.float32),
        label=np.array([r["label"] for r in rows]),
        signer=np.array([r["signer"] for r in rows]),
        group=np.array([r["group"] for r in rows]),
        path=np.array([os.path.relpath(r["path"], DATA) for r in rows]),
        hand=np.array([r["hand"] for r in rows]),
        score=np.array([r["score"] for r in rows], dtype=np.float32),
        wh=np.array([[r["w"], r["h"]] for r in rows], dtype=np.int32),
        frame=np.array([r["frame"] for r in rows], dtype=np.int32),
        hands=np.array([r["hands"] for r in rows], dtype=np.int32),
    )
    print(f"{source}: {len(rows)} rows from {len(items)} items, no hand in {missed} -> {out}")


if __name__ == "__main__":
    main()
