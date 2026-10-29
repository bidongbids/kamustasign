"""
Landmarks for every webcam clip of the ASL word vocabulary on disk.

The clip folders (ml/data/word_videos/dataset/SL - ASL Citizen, WLASL,
MS-ASL) hold ~30 ASL Citizen clips for many words, but landmarks were only
ever extracted for the ~8 per word that select_asl_word_references.py tried
as reference candidates. A word's webcam accuracy follows how many webcam
clips of it are in training (2026-10-29: 0-2 clips 14% top-1, 3-5 40%,
6-9 61%, 20+ 76%), so this extracts the rest into the shared cache
(ml/data/word_landmarks_cache) for consolidate_combined_words.py
--webcam-extra and the webcam check in word_model_diagnostics.py.

Resumable: each clip is saved as soon as it is done, and cached clips are
skipped. Clips MediaPipe finds nothing in are listed in
data/webcam_extract_failed.json and not retried.

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\extract_webcam_word_clips.py
"""

import json
import os
import sys
import time
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(__file__))
import select_asl_word_references as sel  # noqa: E402
import extract_word_landmarks as ex  # noqa: E402

ML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CLASSES = os.path.join(ML, "data", "combined_word_classes.json")
FAILED = os.path.join(ML, "data", "webcam_extract_failed.json")
CHUNK = 12


def clip_paths(classes):
    """Paths under SL_DIR of every clip filed under a vocabulary word (or a
    numbered variant of it, as word_model_diagnostics.webcam_clip_files)."""
    folders = {sel.key(d): d for d in os.listdir(sel.SL_DIR)}
    out = []
    for w in classes:
        names = [w] + [a for a in sel.ALIASES.get(w, []) if a[:-1] == w and a[-1].isdigit()]
        for n in names:
            d = folders.get(sel.key(n))
            if d:
                out += [f"{d}/{f}" for f in sorted(os.listdir(os.path.join(sel.SL_DIR, d))) if f.endswith(".mp4")]
    return out


def work(rels):
    sel.extract_many(rels)
    return [r for r in rels if not os.path.exists(os.path.join(sel.CACHE_DIR, f"{sel.video_id(r)}.npy"))]


def main():
    ex.ensure_model_downloaded()
    classes = json.load(open(CLASSES, encoding="utf-8"))
    failed = set(json.load(open(FAILED))) if os.path.exists(FAILED) else set()
    rels = clip_paths(classes)
    todo = [r for r in rels if r not in failed
            and not os.path.exists(os.path.join(sel.CACHE_DIR, f"{sel.video_id(r)}.npy"))]
    print(f"{len(rels)} webcam clips of {len(classes)} words; {len(todo)} need landmarks", flush=True)
    chunks = [todo[i:i + CHUNK] for i in range(0, len(todo), CHUNK)]
    t, done = time.time(), 0
    with Pool(sel.WORKERS) as pool:
        for bad in pool.imap_unordered(work, chunks):
            done += CHUNK
            failed |= set(bad)
            with open(FAILED, "w") as f:
                json.dump(sorted(failed), f, indent=0)
            rate = done / (time.time() - t)
            print(f"  {min(done, len(todo))}/{len(todo)}  {rate * 60:.0f} clips/min, "
                  f"~{(len(todo) - done) / max(rate, 1e-9) / 60:.0f} min left, {len(failed)} without landmarks", flush=True)
    print(f"done in {(time.time() - t) / 60:.1f} min")


if __name__ == "__main__":
    main()
