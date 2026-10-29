"""Export the "How to make it" reference media for the classroom module.

  ASL letters  <- ASL Alphabet (Kaggle, Akash Nagaraj 2018)      GPL 2
  FSL words    <- FSL-105 (Tupal, De La Salle University 2023)   CC BY 4.0
  ASL words    <- ASL Citizen / WLASL / MS-ASL                    research only

The ASL word datasets are licensed for research and do not allow
redistributing the footage. The project owner chose to show them anyway in
this non-commercial capstone; don't ship a public build with them without
permission from the dataset authors (see public/reference/CREDITS.txt).
The clip per word is chosen by select_asl_word_references.py - run it first.

Writes
  public/reference/asl-letters/<LETTER>.jpg
  public/reference/fsl-words/<class index>.mp4   (H.264, muted, web-ready)
  public/reference/asl-words/<word slug>.mp4      (same)
  src/data/referenceMedia.json                    sign -> media + credit key

Usage (from the repo root, with the ML venv):
  ml/venv/Scripts/python.exe ml/scripts/export_reference_media.py --review
      contact sheets of the top letter candidates -> ml/data/_reference_review/
  ml/venv/Scripts/python.exe ml/scripts/export_reference_media.py
      export everything

To override an automatic letter pick after reviewing, add the file name to
LETTER_PICKS below (e.g. "J": "J1234.jpg").
"""

import argparse
import csv
import json
import os
import re
import subprocess
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(ROOT, "ml", "data")
LETTERS_SRC = os.path.join(DATA, "asl_alphabet_train", "asl_alphabet_train")
ASL_WORDS_SRC = os.path.join(DATA, "word_videos", "dataset", "SL")
ASL_WORD_PICKS = os.path.join(DATA, "asl_word_reference_picks.json")
FSL_SRC = os.path.join(DATA, "FSL-105 A dataset for recognizing 105 Filipino sign language videos")
FSL_MANIFEST = os.path.join(DATA, "fsl_manifest.csv")
OUT_PUBLIC = os.path.join(ROOT, "public", "reference")
OUT_JSON = os.path.join(ROOT, "src", "data", "referenceMedia.json")
REVIEW_DIR = os.path.join(DATA, "_reference_review")

LETTERS = [chr(c) for c in range(ord("A"), ord("Z") + 1)]
# Manual overrides after looking at the review sheets: letter -> file name.
# The automatic pick for these was cut off at the frame edge (G, H), too
# small to read (E, S), or an extreme close-up (M, T).
LETTER_PICKS: dict[str, str] = {
    "E": "E1179.jpg",
    "G": "G1485.jpg",
    "H": "H1278.jpg",
    "M": "M1746.jpg",
    "S": "S1566.jpg",
    "T": "T1917.jpg",
}
LETTER_SAMPLE_STEP = 10  # score every 10th of ~3,000 photos per letter

# One signer for every word, so the references look like one teacher.
FSL_SIGNER = "D"
FSL_CROP_W = 480  # center 4:3 crop of the 640x360 frame - the signer stays in
FSL_FPS = 30
FSL_MOTION_PAD_S = 0.3


# ---- ASL letters -----------------------------------------------------------

def score_letter_image(img: np.ndarray) -> float:
    """Higher = clearer reference: a lit hand with visible finger detail.

    Most of the set is shot against a bright window, so the hand is the dark
    part of the frame. Scoring global contrast picks pure silhouettes, where
    A / E / M / N / S / T are the same black fist. Instead, score how bright
    and how detailed the darker (hand) pixels are.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    hand_mask = gray <= np.percentile(gray, 45)
    hand_brightness = float(gray[hand_mask].mean())
    lap = np.abs(cv2.Laplacian(gray, cv2.CV_64F))
    hand_detail = float(lap[hand_mask].mean())
    blown_out = float((gray > 250).mean())
    return hand_brightness * np.log1p(hand_detail) * (1.0 - blown_out)


def letter_candidates(letter: str, top: int) -> list[tuple[float, str]]:
    folder = os.path.join(LETTERS_SRC, letter)
    names = sorted(os.listdir(folder))[::LETTER_SAMPLE_STEP]
    scored = []
    for name in names:
        img = cv2.imread(os.path.join(folder, name))
        if img is not None:
            scored.append((score_letter_image(img), name))
    scored.sort(reverse=True)
    return scored[:top]


def review_letters() -> None:
    os.makedirs(REVIEW_DIR, exist_ok=True)
    for half, letters in (("A-M", LETTERS[:13]), ("N-Z", LETTERS[13:])):
        rows = []
        for letter in letters:
            tiles = []
            for _, name in letter_candidates(letter, 6):
                img = cv2.imread(os.path.join(LETTERS_SRC, letter, name))
                img = cv2.resize(img, (140, 140))
                cv2.putText(img, f"{letter} {name}", (3, 12), 0, 0.35, (0, 255, 255), 1)
                tiles.append(img)
            rows.append(np.hstack(tiles))
        path = os.path.join(REVIEW_DIR, f"letters_{half}.jpg")
        cv2.imwrite(path, np.vstack(rows))
        print("wrote", path)


def export_letters(media: dict) -> None:
    out = os.path.join(OUT_PUBLIC, "asl-letters")
    os.makedirs(out, exist_ok=True)
    for letter in LETTERS:
        name = LETTER_PICKS.get(letter) or letter_candidates(letter, 1)[0][1]
        img = cv2.imread(os.path.join(LETTERS_SRC, letter, name))
        # Every photo in the set has a 2px blue frame baked in; trim it.
        img = img[3:-3, 3:-3]
        cv2.imwrite(os.path.join(out, f"{letter}.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
        media[f"asl/letters/{letter}"] = {
            "type": "image",
            "uri": f"/reference/asl-letters/{letter}.jpg",
            "credit": "asl-alphabet",
            "source": f"{letter}/{name}",
        }
        print(f"letter {letter}: {name}")


# ---- FSL words -------------------------------------------------------------

def ffmpeg_exe() -> str:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def active_span(path: str) -> tuple[float, float, float]:
    """(start_s, end_s, duration_s) of the part of the clip where hands move.

    The clips start and end with the signer standing still; trimming that
    makes the loop show the sign instead of a pause.
    """
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    prev, motion = None, []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(cv2.resize(frame, (160, 90)), cv2.COLOR_BGR2GRAY).astype(np.float32)
        motion.append(0.0 if prev is None else float(np.abs(gray - prev).mean()))
        prev = gray
    cap.release()
    duration = len(motion) / fps
    if not motion:
        return 0.0, duration, duration
    m = np.convolve(np.array(motion), np.ones(5) / 5, mode="same")
    threshold = max(m.max() * 0.15, 0.6)
    active = np.where(m > threshold)[0]
    if len(active) == 0:
        return 0.0, duration, duration
    start = max(active[0] / fps - FSL_MOTION_PAD_S, 0.0)
    end = min(active[-1] / fps + FSL_MOTION_PAD_S, duration)
    if end - start < 1.0:  # a too-short loop reads as a flicker
        return 0.0, duration, duration
    return start, end, duration


def export_fsl(media: dict) -> None:
    with open(os.path.join(ROOT, "public", "fsl-model", "label_classes.json"), encoding="utf-8") as f:
        app_labels = json.load(f)
    rows = list(csv.DictReader(open(FSL_MANIFEST, encoding="utf-8")))
    out = os.path.join(OUT_PUBLIC, "fsl-words")
    os.makedirs(out, exist_ok=True)
    ffmpeg = ffmpeg_exe()

    for label in app_labels:
        # The first clip of the chosen signer (manifest order = file order).
        row = next(r for r in rows if r["word"] == label and r["signer"] == FSL_SIGNER)
        src = os.path.join(FSL_SRC, row["path"])
        class_dir = row["path"].split("/")[1]
        start, end, _ = active_span(src)
        dst_name = f"{class_dir}.mp4"
        cmd = [
            ffmpeg, "-y", "-loglevel", "error",
            "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", src,
            "-vf", f"crop={FSL_CROP_W}:ih,fps={FSL_FPS}",
            "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            os.path.join(out, dst_name),
        ]
        subprocess.run(cmd, check=True)
        media[f"fsl/words/{label}"] = {
            "type": "video",
            "uri": f"/reference/fsl-words/{dst_name}",
            "credit": "fsl-105",
            "source": row["path"],
        }
        print(f"fsl {label!r}: {row['path']} [{start:.2f}-{end:.2f}s]")


# ---- ASL words -------------------------------------------------------------

def asl_word_credit(file_name: str) -> str:
    if file_name.startswith("citizen_"):
        return "asl-citizen"
    if file_name.startswith("msasl_"):
        return "ms-asl"
    return "wlasl"


def export_asl_words(media: dict) -> None:
    if not os.path.exists(ASL_WORD_PICKS):
        print(f"skipping ASL words: run select_asl_word_references.py first ({ASL_WORD_PICKS} missing)")
        return
    picks = json.load(open(ASL_WORD_PICKS, encoding="utf-8"))["picks"]
    out = os.path.join(OUT_PUBLIC, "asl-words")
    os.makedirs(out, exist_ok=True)
    ffmpeg = ffmpeg_exe()

    for word, pick in sorted(picks.items()):
        src = os.path.join(ASL_WORDS_SRC, pick["path"])
        start, end, _ = active_span(src)
        dst_name = re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-") + ".mp4"
        # Clips come in every size from 320x240 to 1280x720: scale to 360
        # high, then a centre 4:3 crop like the FSL clips (signers are centred).
        cmd = [
            ffmpeg, "-y", "-loglevel", "error",
            "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", src,
            "-vf", f"scale=-2:360,crop='min(iw,{FSL_CROP_W})':360,fps={FSL_FPS}",
            "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "27",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            os.path.join(out, dst_name),
        ]
        subprocess.run(cmd, check=True)
        media[f"asl/words/{word}"] = {
            "type": "video",
            "uri": f"/reference/asl-words/{dst_name}",
            "credit": asl_word_credit(os.path.basename(pick["path"])),
            "source": pick["path"],
        }
        print(f"asl {word!r}: {pick['path']} [{start:.2f}-{end:.2f}s]")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--review", action="store_true", help="write letter contact sheets only")
    args = parser.parse_args()

    if args.review:
        review_letters()
        return

    # Keep the groups export_handshape_references.py merges in (ASL numbers,
    # FSL letters, FSL numbers); everything this script makes is rebuilt.
    own = ("asl/letters/", "fsl/words/", "asl/words/")
    media: dict = {}
    if os.path.exists(OUT_JSON):
        old = json.load(open(OUT_JSON, encoding="utf-8"))
        media = {k: v for k, v in old.items() if not k.startswith(own)}
    export_letters(media)
    export_fsl(media)
    export_asl_words(media)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(media.items())), f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {len(media)} entries -> {os.path.relpath(OUT_JSON, ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
