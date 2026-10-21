"""Pick a "How to make it" video for every ASL word the deployed model knows.

The new GISLR words come as landmarks only, so the footage comes from the
video datasets already on disk (ml/data/word_videos/dataset/SL - ASL Citizen,
WLASL, MS-ASL). Those are licensed for research and forbid redistributing the
footage; the project owner chose to show them anyway, for a non-commercial
capstone (see public/reference/CREDITS.txt).

For each word, up to MAX_CANDIDATES clips are tried (ASL Citizen first: one
plain webcam setup, so the references look alike), each clip's landmarks are
run through the deployed model, and the clip the model recognises as that word
most confidently wins. So the reference shows the sign the way the model
expects students to make it. The best clip is "verified" if the model's top
guess for it is the word, or the word is a close second (probability at
least MIN_PROB - usually a look-alike pair such as listen/hear).

An unverified clip is still used when it is filed under the word itself
(or a numbered variant of it, such as fall1):
the datasets' labels are human-made, and the model is the weaker judge -
it learned most of the new words from phone video of other signers and
still misses many of them on webcam clips. A clip found only through an
ALIASES gloss needs the model's confirmation, since the alias may be a
different sign; without it the word gets no video.

Landmarks come from ml/data/word_landmarks_cache when a clip was used in
training; new clips are extracted (MediaPipe Holistic, as in
extract_word_landmarks.py) and cached there too.

Writes ml/data/asl_word_reference_picks.json, which export_reference_media.py
turns into videos.

Usage (from the repo root, with the ML venv):
  ml/venv/Scripts/python.exe ml/scripts/select_asl_word_references.py
"""

import json
import os
import re
import sys
import time
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import extract_word_landmarks as ex  # noqa: E402
from consolidate_combined_words import trim_to_hand_span  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SL_DIR = os.path.join(ROOT, "ml", "data", "word_videos", "dataset", "SL")
CACHE_DIR = os.path.join(ROOT, "ml", "data", "word_landmarks_cache")
LABELS = os.path.join(ROOT, "public", "word-model", "label_classes.json")
FUSED = os.path.join(ROOT, "ml", "models", "asl_fused_savedmodel")
OUT = os.path.join(ROOT, "ml", "data", "asl_word_reference_picks.json")

MAX_CANDIDATES = 8
MIN_PROB = 0.3
WORKERS = 4

# Model words whose clips are filed under another gloss. The model picks
# between them, so a loose alias (e.g. "quiet" for "shhh") only wins if the
# clip really looks like the sign.
ALIASES = {
    "call on phone": ["phone", "call"],
    "fall": ["fall1", "fall2"],
    "fireman": ["fireman1", "fireman2", "firefighter"],
    "garbage": ["trash"],
    "grandpa": ["grandfather"],
    "have to": ["must"],
    "he/she/it": ["he", "she"],
    "into": ["in"],
    "jeans": ["pants", "pants1", "pants2"],
    "kitty": ["kitten", "cat"],
    "look": ["lookat", "look at"],
    "mitten": ["glove", "gloves", "gloves1"],
    "my/mine": ["my", "mine"],
    "nap": ["sleep", "rest"],
    "noisy": ["noise"],
    "nuts": ["nut", "nut1", "nut2", "peanut"],
    "owie": ["hurt"],
    "pool": ["swim", "swimming"],
    "potty": ["toilet"],
    "puppy": ["dog", "dog1", "dog2"],
    "shhh": ["quiet"],
    "shoe": ["shoes"],
    "toy": ["toy1", "toy2", "toy3"],
    "wake": ["wake up"],
    "we/us": ["we", "us"],
}


def key(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def candidates(word: str, folders: dict[str, str], aliases: bool = True) -> list[str]:
    """Relative paths under SL_DIR, ASL Citizen first."""
    # Without aliases, numbered variants of the word itself (fall1, toy2) still count.
    names = [word] + [a for a in ALIASES.get(word, []) if aliases or re.fullmatch(re.escape(word) + r"\d", a)]
    found = []
    for n in names:
        d = folders.get(key(n))
        if d:
            found += [f"{d}/{f}" for f in sorted(os.listdir(os.path.join(SL_DIR, d))) if f.endswith(".mp4")]
    citizen = [p for p in found if os.path.basename(p).startswith("citizen_")]
    other = [p for p in found if not os.path.basename(p).startswith("citizen_")]
    return (citizen + other)[:MAX_CANDIDATES]


def video_id(rel: str) -> str:
    return os.path.splitext(os.path.basename(rel))[0]


def extract_many(rels: list[str]) -> int:
    """Worker: extract and cache landmarks for clips not cached yet."""
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.HolisticLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4,
        min_hand_landmarks_confidence=0.4,
    )
    detector = vision.HolisticLandmarker.create_from_options(options)
    ts, n = 0, 0
    for rel in rels:
        seq, ts = ex.extract_video_sequence(detector, os.path.join(SL_DIR, rel), ts)
        if seq is not None:
            np.save(os.path.join(CACHE_DIR, f"{video_id(rel)}.npy"), seq)
            n += 1
    detector.close()
    return n


def main() -> None:
    ex.ensure_model_downloaded()
    labels = json.load(open(LABELS, encoding="utf-8"))
    folders = {key(d): d for d in sorted(os.listdir(SL_DIR))}
    cands = {w: candidates(w, folders) for w in labels}
    own = {w: set(candidates(w, folders, aliases=False)) for w in labels}

    todo = sorted({rel for rels in cands.values() for rel in rels
                   if not os.path.exists(os.path.join(CACHE_DIR, f"{video_id(rel)}.npy"))})
    print(f"{sum(map(len, cands.values()))} candidate clips for {sum(1 for c in cands.values() if c)} "
          f"of {len(labels)} words; {len(todo)} need landmarks")
    if todo:
        t = time.time()
        chunks = [todo[i::WORKERS] for i in range(WORKERS)]
        with Pool(WORKERS) as pool:
            done = sum(pool.map(extract_many, chunks))
        print(f"extracted {done}/{len(todo)} in {(time.time() - t) / 60:.1f} min")

    import tensorflow as tf

    fn = list(tf.saved_model.load(FUSED).signatures.values())[0]
    picks, skipped = {}, {}
    for w, rels in cands.items():
        target = labels.index(w)
        best = best_own = None
        for rel in rels:
            path = os.path.join(CACHE_DIR, f"{video_id(rel)}.npy")
            if not os.path.exists(path):
                continue
            # Trimmed like the app trims a recording before classifying it.
            x = ex.normalize_sequence(trim_to_hand_span(np.load(path).astype(np.float32)))[None]
            p = list(fn(tf.constant(x, tf.float32)).values())[0].numpy()[0]
            score = float(p[target])
            if best is None or score > best[0]:
                best = (score, rel, labels[int(p.argmax())])
            if rel in own[w] and (best_own is None or score > best_own[0]):
                best_own = (score, rel)
        if best is None:
            skipped[w] = "no clips"
        elif best[2] == w or best[0] >= MIN_PROB:
            picks[w] = {"path": best[1], "prob": round(best[0], 3), "tried": len(rels), "verified": True}
        elif best_own is not None:
            picks[w] = {"path": best_own[1], "prob": round(best_own[0], 3), "tried": len(rels), "verified": False}
        else:
            skipped[w] = f"only alias clips, best {best[1]} reads as {best[2]!r} (p={best[0]:.2f})"

    json.dump({"picks": picks, "skipped": skipped}, open(OUT, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    verified = sum(p["verified"] for p in picks.values())
    print(f"picked {len(picks)}/{len(labels)} ({verified} verified by the model, "
          f"{len(picks) - verified} on the dataset's label alone); no video for {len(skipped)}:")
    for w, why in skipped.items():
        print(f"  {w}: {why}")
    print("wrote", os.path.relpath(OUT, ROOT))


if __name__ == "__main__":
    main()
