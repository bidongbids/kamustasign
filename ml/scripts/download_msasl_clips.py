"""
Downloads MS-ASL clips for words that overlap with our own vocabulary
(word_classes.json) and drops them into the same folder structure your
existing pipeline already expects:

  ml/data/word_videos/dataset/SL/<word>/msasl_<n>.mp4

That means no changes are needed to build_word_video_manifest.py - just
rerun it after this script finishes, and it will pick up these new clips
alongside whatever's already there, and re-split train/val/test across the
combined pool using its existing per-class logic.

Efficiency note: many MS-ASL entries share the same source YouTube video
(e.g. a single "ASL vocabulary" video containing several signs cut at
different timestamps). Rather than re-downloading that video once per
clip, this script downloads each unique source video ONCE to a temp file,
then uses ffmpeg to cut out every needed segment locally before deleting
the temp file.

Only downloads words already in your vocabulary - does not touch MS-ASL's
other ~900 words (see check_msasl_overlap.py if you want to look at those
too).

Setup: same as check_msasl_overlap.py (MS-ASL.zip unzipped under
ml/data/msasl/, yt-dlp installed). Also needs ffmpeg on PATH (you already
have it - it's a dependency of the extraction pipeline).

Run this with your venv active:
  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/download_msasl_clips.py
"""

import os
import json
import glob
import time
import shutil
import tempfile
import subprocess
import hashlib
from collections import defaultdict

try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except ImportError:
    # Falls back to relying on a system-PATH ffmpeg if imageio-ffmpeg isn't
    # installed, but "pip install imageio-ffmpeg --break-system-packages"
    # is the recommended path - avoids needing to edit Windows PATH at all.
    FFMPEG_EXE = "ffmpeg"

MSASL_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "msasl")
CLASSES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "word_classes.json")
OUTPUT_ROOT = os.path.join(os.path.dirname(__file__), "..", "data", "word_videos", "dataset", "SL")

SLEEP_BETWEEN_VIDEOS = 4.0  # be polite to YouTube, avoid rate-limit/blocks
# (bumped up from 1.5s after a first run saw a 1114/1533 failure rate, likely
# YouTube bot-detection/rate-limiting from many rapid back-to-back requests
# rather than that many links actually being dead)


def normalize(word):
    return word.strip().lower()


def normalize_url(url):
    if url and not url.startswith("http"):
        return "https://" + url
    return url


def find_split_files():
    return glob.glob(os.path.join(MSASL_DIR, "**", "MSASL_*.json"), recursive=True)


def load_matching_records(our_words_norm):
    """Load train/val/test MS-ASL json, keep only records whose clean_text
    is in our vocabulary, and group them by source video URL so each video
    is only downloaded once regardless of how many clips come from it."""
    by_url = defaultdict(list)
    for path in find_split_files():
        name = os.path.basename(path).lower()
        if "classes" in name or "synonym" in name:
            continue
        entries = json.load(open(path, encoding="utf-8"))
        for e in entries:
            word = normalize(e.get("clean_text") or e.get("text") or "")
            if word not in our_words_norm:
                continue
            url = normalize_url(e.get("url"))
            if not url:
                continue
            by_url[url].append({
                "word": word,
                "start": e.get("start_time", 0.0),
                "end": e.get("end_time", 0.0),
            })
    return by_url


def download_video(url, dest_path):
    """Download one full source video to dest_path. Returns True on success."""
    result = subprocess.run(
        [
            "yt-dlp",
            "-f", "best[height<=480][ext=mp4]/best[height<=480]/best",
            "--quiet", "--no-warnings",
            "--retries", "3",
            "-o", dest_path,
            url,
        ],
        capture_output=True, timeout=120,
    )
    return result.returncode == 0 and os.path.exists(dest_path)


def cut_clip(src_path, start, end, dest_path):
    """Cut [start, end] seconds out of src_path into dest_path with ffmpeg."""
    duration = max(0.1, end - start)
    result = subprocess.run(
        [
            FFMPEG_EXE, "-y", "-loglevel", "error",
            "-ss", str(start), "-i", src_path, "-t", str(duration),
            "-c:v", "libx264", "-c:a", "aac",
            dest_path,
        ],
        capture_output=True, timeout=60,
    )
    return result.returncode == 0 and os.path.exists(dest_path)


def main():
    if not os.path.exists(CLASSES_PATH):
        print(f"ERROR: {CLASSES_PATH} not found.")
        return
    our_words = json.load(open(CLASSES_PATH, encoding="utf-8"))
    our_words_norm = {normalize(w) for w in our_words}

    if not os.path.isdir(MSASL_DIR):
        print(f"ERROR: {MSASL_DIR} not found. Unzip MS-ASL.zip there first.")
        return

    print("Scanning MS-ASL annotations for clips matching our vocabulary...")
    by_url = load_matching_records(our_words_norm)
    total_clips = sum(len(v) for v in by_url.values())
    print(f"Found {total_clips} clips across {len(by_url)} unique source videos "
          f"for words in our vocabulary.\n")

    if total_clips == 0:
        print("Nothing to download - did check_msasl_overlap.py find overlap earlier?")
        return

    os.makedirs(OUTPUT_ROOT, exist_ok=True)

    videos_ok = 0
    videos_failed = 0
    clips_saved = 0
    clips_skipped = 0
    clips_failed = 0
    per_word_new = defaultdict(int)

    urls = list(by_url.items())
    for i, (url, clips) in enumerate(urls, 1):
        # Skip entirely if every clip from this video already exists on disk.
        pending = []
        for j, c in enumerate(clips):
            word_dir = os.path.join(OUTPUT_ROOT, c["word"])
            # Stable across runs, unlike built-in hash() which is randomized
            # per-process (PYTHONHASHSEED) - a hash()-based name here meant
            # every rerun computed different filenames for the same video,
            # so skip-detection below never recognized already-downloaded
            # clips and silently re-downloaded + duplicated them.
            url_id = hashlib.md5(url.encode("utf-8")).hexdigest()[:10]
            out_name = f"msasl_{url_id}_{j}.mp4"
            out_path = os.path.join(word_dir, out_name)
            if os.path.exists(out_path):
                clips_skipped += 1
            else:
                pending.append((c, out_path))

        if not pending:
            continue

        print(f"[{i}/{len(urls)}] {url}  ({len(pending)} clip(s) needed)")

        with tempfile.TemporaryDirectory() as tmp:
            tmp_video = os.path.join(tmp, "src.mp4")
            try:
                ok = download_video(url, tmp_video)
            except Exception as e:
                print(f"    FAILED to download source video ({e}) - skipping its clips")
                videos_failed += 1
                clips_failed += len(pending)
                continue
            if not ok:
                print("    FAILED to download source video - skipping its clips")
                videos_failed += 1
                clips_failed += len(pending)
                continue
            videos_ok += 1

            for c, out_path in pending:
                os.makedirs(os.path.dirname(out_path), exist_ok=True)
                try:
                    cut_ok = cut_clip(tmp_video, c["start"], c["end"], out_path)
                except Exception as e:
                    print(f"    FAILED to cut clip for '{c['word']}' ({e})")
                    clips_failed += 1
                    continue
                if cut_ok:
                    clips_saved += 1
                    per_word_new[c["word"]] += 1
                else:
                    clips_failed += 1
                    print(f"    FAILED to cut clip for '{c['word']}'")

        time.sleep(SLEEP_BETWEEN_VIDEOS)

    print("\n=== Done ===")
    print(f"Source videos downloaded OK: {videos_ok}   failed: {videos_failed}")
    print(f"Clips saved: {clips_saved}   skipped (already existed): {clips_skipped}   failed: {clips_failed}")
    print(f"\nNew clips added per word (top 15):")
    for word, n in sorted(per_word_new.items(), key=lambda x: -x[1])[:15]:
        print(f"  {word}: +{n}")
    print("\nNext step: rerun build_word_video_manifest.py to fold these into "
          "the manifest, then extract_word_landmarks.py -> consolidate_word_landmarks.py "
          "-> train_word_classifier.py as usual.")


if __name__ == "__main__":
    main()
