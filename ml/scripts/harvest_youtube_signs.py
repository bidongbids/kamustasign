"""
More webcam-style clips for the ASL words the model reads worst, from short
YouTube sign-dictionary videos ("how to sign AWAKE in ASL").

Why: word_model_diagnostics.py's webcam check (asl_per_word.csv) shows the
gap is cross-signer / cross-camera - 104 words score 0% on held-out webcam
clips although most of them do fine on the phone-video test split. Those words
were learned almost entirely from GISLR portrait phone clips. Dictionary videos
are frontal, landscape, one signer, one sign: close to a student at a laptop.

  cd ml
  .\\venv\\Scripts\\python.exe scripts\\harvest_youtube_signs.py search     # metadata only
  .\\venv\\Scripts\\python.exe scripts\\harvest_youtube_signs.py download
  .\\venv\\Scripts\\python.exe scripts\\harvest_youtube_signs.py extract
  .\\venv\\Scripts\\python.exe scripts\\harvest_youtube_signs.py verify

Everything lands in data/youtube_signs/ and every step resumes where it
stopped. Licensing: these are other people's videos, used for a non-commercial
student project like the MS-ASL clips (which are YouTube videos too). Don't
redistribute them, and don't use them as "How to make it" reference media.

search    Two queries per target word, two more where those found too few. Keeps videos of 1.5-25 s, landscape,
          whose title names the word and little else (no songs, stories or
          phrases), and never an MS-ASL video: those are in the webcam test set.
download  At most PER_WORD videos per word, <= 480p, no audio. Stops at the
          first sign of YouTube's bot check or rate limit rather than working
          around it; run it again later and it carries on.
extract   MediaPipe Holistic at <= 15 fps on a 4:3 centre crop (the app's
          camera shape; the dataset's other clips are 4:3 too), then splits the
          video into signing segments - a dictionary video often signs the word
          two or three times, or once normally and once slowed down. Each
          segment, with a little rest either side like an ASL Citizen clip, is
          resampled to the model's 40 frames and saved raw (40, 258).
verify    Scores each segment with the deployed ensemble. The words being
          harvested are exactly the ones it gets wrong, so "top-1 must be right"
          would throw away the useful clips; a segment is kept when the target
          is within the top KEEP_RANK, which rejects clips of an unrelated sign
          (about KEEP_RANK/344 of those slip through) while keeping most real
          ones. The rank distribution of trusted held-out webcam clips of the
          same words is printed next to it, so the cut can be judged.
"""

import csv
import json
import os
import re
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ML = os.path.join(HERE, "..")
OUT = os.path.join(ML, "data", "youtube_signs")
SEARCH_JSON = os.path.join(OUT, "search.json")
VIDEO_DIR = os.path.join(OUT, "videos")
SEG_DIR = os.path.join(OUT, "segments")
MANIFEST = os.path.join(OUT, "segments.csv")
VERIFIED = os.path.join(OUT, "verified.csv")
PER_WORD_CSV = os.path.join(ML, "models", "diagnostics", "asl_per_word.csv")
CLASSES_JSON = os.path.join(ML, "models", "asl_combined_label_classes.json")
MSASL_DIR = os.path.join(ML, "data", "msasl", "MS-ASL", "MS-ASL")

# Target: words the webcam check reads at most this often (or never checked).
WEBCAM_TOP1_MAX = 0.25
PER_WORD = 8
MIN_S, MAX_S = 1.5, 25.0
KEEP_RANK = 20
FPS = 15
REST = 0.25  # rest kept either side of a segment, as a share of its length
SEG_MIN_S, SEG_MAX_S, GAP_S = 0.4, 4.0, 0.5

FILLER = {"asl", "sign", "signs", "signing", "how", "to", "in", "american", "language", "for", "the", "a", "an",
          "learn", "dictionary", "word", "of", "day", "say", "what", "is", "shorts", "short", "do", "you", "video",
          "lesson", "vocabulary", "vocab", "with", "by", "and", "basic", "tutorial", "english", "meaning", "means",
          "variant", "version", "alternate", "alt", "or"}
BANNED = {"song", "lyrics", "cover", "story", "music", "interpreted", "interpreter", "poem", "sentence", "sentences",
          "phrase", "phrases", "conversation", "bsl", "auslan", "lsf", "lsm", "fsl", "ksl", "jsl", "isl", "libras"}


def targets():
    with open(PER_WORD_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    out = []
    for r in rows:
        w = r["webcam_top1"]
        if w in ("", "nan") or float(w) <= WEBCAM_TOP1_MAX:
            out.append(r["word"])
    return out


def spoken_names(word):
    """'my/mine' -> ['my', 'mine']; 'call on phone' stays whole."""
    return [p.strip() for p in word.split("/") if p.strip()]


def title_ok(title, word):
    t = re.sub(r"[^a-z0-9 ]", " ", title.lower())
    tokens = t.split()
    if BANNED & set(tokens):
        return False
    for name in spoken_names(word):
        n = name.lower().split()
        for i in range(len(tokens) - len(n) + 1):
            if tokens[i:i + len(n)] == n:
                rest = tokens[:i] + tokens[i + len(n):]
                # Title is the word plus filler only ("wide awake" is another sign).
                if not [x for x in rest if x not in FILLER and not x.isdigit()]:
                    return True
    return False


def msasl_ids():
    ids = set()
    for split in ("train", "val", "test"):
        path = os.path.join(MSASL_DIR, f"MSASL_{split}.json")
        if os.path.exists(path):
            for e in json.load(open(path, encoding="utf-8")):
                m = re.search(r"v=([\w-]{11})", e.get("url", ""))
                if m:
                    ids.add(m.group(1))
    return ids


# ---- search ----------------------------------------------------------------------

QUERIES = ("{} ASL sign", "how to sign {} in ASL", "{} in sign language", "{} American Sign Language")


def search():
    """Runs the first two QUERIES for every target word, and the rest only for
    words that still have fewer than PER_WORD usable videos."""
    import yt_dlp
    os.makedirs(OUT, exist_ok=True)
    found = json.load(open(SEARCH_JSON, encoding="utf-8")) if os.path.exists(SEARCH_JSON) else {}
    asked_path = os.path.join(OUT, "queries.json")
    asked = json.load(open(asked_path, encoding="utf-8")) if os.path.exists(asked_path) else {}
    for word in found:  # searches from before queries.json existed
        asked.setdefault(word, list(QUERIES[:2]))
    words = targets()
    print(f"{len(words)} target words, {len(found)} already searched")
    opts = {"quiet": True, "no_warnings": True, "extract_flat": True, "skip_download": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        for k, word in enumerate(words):
            name = spoken_names(word)[0]
            for qi, template in enumerate(QUERIES):
                if template in asked.get(word, []):
                    continue
                if qi >= 2 and len(choose({word: found.get(word, [])})[word]) >= PER_WORD:
                    break
                try:
                    res = ydl.extract_info(f"ytsearch20:{template.format(name)}", download=False)
                except Exception as e:  # network hiccup: leave it for the next run
                    print(f"  search failed for {word}: {e}")
                    break
                have = {e["id"] for e in found.get(word, [])}
                for e in res.get("entries") or []:
                    if e and e.get("id") and e["id"] not in have:
                        found.setdefault(word, []).append({"id": e["id"], "title": e.get("title") or "",
                                                           "duration": e.get("duration"), "channel": e.get("channel") or ""})
                        have.add(e["id"])
                asked.setdefault(word, []).append(template)
                json.dump(found, open(SEARCH_JSON, "w", encoding="utf-8"), indent=1)
                json.dump(asked, open(asked_path, "w", encoding="utf-8"), indent=1)
                time.sleep(1.0)
            if (k + 1) % 10 == 0:
                print(f"  {k + 1}/{len(words)}", flush=True)
    picked = choose(found)
    print(f"searched {len(found)} words; {sum(min(len(v), PER_WORD) for v in picked.values())} videos to fetch "
          f"for {sum(1 for v in picked.values() if v)} words")


def choose(found):
    banned_ids = msasl_ids()
    picked, seen = {}, set()
    for word, entries in found.items():
        keep = []
        for e in entries:
            d = e.get("duration")
            if (e["id"] in banned_ids or e["id"] in seen or d is None or not (MIN_S <= d <= MAX_S)
                    or not title_ok(e["title"], word)):
                continue
            keep.append(e)
            seen.add(e["id"])  # one video, one word
        picked[word] = keep[:PER_WORD * 2]  # spares for failed downloads
    return picked


# ---- download --------------------------------------------------------------------

def download():
    import yt_dlp
    picked = choose(json.load(open(SEARCH_JSON, encoding="utf-8")))
    opts = {"quiet": True, "no_warnings": True, "format": "bv*[height<=480][ext=mp4]/b[height<=480]/bv*/b",
            "outtmpl": os.path.join(VIDEO_DIR, "%(id)s.%(ext)s"), "noprogress": True, "retries": 2}
    got = fail = 0
    with yt_dlp.YoutubeDL(opts) as ydl:
        for word, entries in picked.items():
            have = [e for e in entries if os.path.exists(os.path.join(VIDEO_DIR, f"{e['id']}.mp4"))]
            for e in entries:
                if len(have) >= PER_WORD:
                    break
                if e in have:
                    continue
                try:
                    ydl.download([f"https://www.youtube.com/watch?v={e['id']}"])
                except Exception as err:
                    msg = str(err)
                    fail += 1
                    low = msg.lower()
                    if ("confirm you" in low and "bot" in low) or "rate-limited" in low:
                        sys.exit("YouTube is rate-limiting or bot-checking this connection. Stopping here; "
                                 "run download again in an hour or more (it resumes).")
                    continue
                if os.path.exists(os.path.join(VIDEO_DIR, f"{e['id']}.mp4")):
                    have.append(e)
                    got += 1
                time.sleep(4.0)  # 0.5 s got the session rate-limited after ~450 videos
            print(f"  {word}: {len(have)}", flush=True)
    print(f"downloaded {got}, failed {fail}")


# ---- extract ---------------------------------------------------------------------

def holistic():
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision
    import extract_word_landmarks as ex
    ex.ensure_model_downloaded()
    return vision.HolisticLandmarker.create_from_options(vision.HolisticLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=ex.MODEL_PATH), running_mode=vision.RunningMode.VIDEO,
        min_pose_detection_confidence=0.4, min_hand_landmarks_confidence=0.4))  # as extract_word_landmarks.py


def read_frames(path):
    """<= FPS frames, centre-cropped to 4:3 and sized 640x480. None for portrait video."""
    import cv2
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, round(fps / FPS))
    frames, i = [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i % step == 0:
            h, w = f.shape[:2]
            if h > w:
                cap.release()
                return None, 0
            cw = min(w, round(h * 4 / 3))
            ch = min(h, round(cw * 3 / 4))
            x0, y0 = (w - cw) // 2, (h - ch) // 2
            frames.append(cv2.resize(f[y0:y0 + ch, x0:x0 + cw], (640, 480)))
        i += 1
    cap.release()
    return frames, fps / step


def segments(raw, fps):
    """Signing spans: a hand is up (wrist above the elbow line's lower reach).
    Split where the hands rest for GAP_S or more."""
    import extract_word_landmarks as ex
    hands = raw[:, ex.NUM_POSE * 4:ex.FEATURES_PER_FRAME].reshape(len(raw), 2, 21, 3)
    present = hands.any(axis=(2, 3))
    pose = raw[:, :ex.NUM_POSE * 4].reshape(len(raw), ex.NUM_POSE, 4)
    shoulder_y = pose[:, [11, 12], 1].mean(1)
    hip_y = pose[:, [23, 24], 1].mean(1)
    rest_line = shoulder_y + 0.7 * np.maximum(hip_y - shoulder_y, 0.15)
    up = (present & (hands[:, :, 0, 1] < rest_line[:, None])).any(1)
    idx = np.flatnonzero(up)
    if idx.size == 0:
        return []
    gap = max(1, round(GAP_S * fps))
    spans, start, prev = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - prev > gap:
            spans.append((start, prev))
            start = i
        prev = i
    spans.append((start, prev))
    out = []
    for a, b in spans:
        n = b - a + 1
        if SEG_MIN_S * fps <= n <= SEG_MAX_S * fps:
            pad = max(1, round(n * REST))
            out.append((max(0, a - pad), min(len(raw) - 1, b + pad)))
    return out[:3]


def extract():
    import mediapipe as mp
    import extract_word_landmarks as ex
    import cv2
    picked = choose(json.load(open(SEARCH_JSON, encoding="utf-8")))
    os.makedirs(SEG_DIR, exist_ok=True)
    done = set()
    if os.path.exists(MANIFEST):
        with open(MANIFEST, newline="", encoding="utf-8") as f:
            done = {r["video"] for r in csv.DictReader(f)}
    new = not os.path.exists(MANIFEST)
    out = open(MANIFEST, "a", newline="", encoding="utf-8")
    w = csv.writer(out)
    if new:
        w.writerow(["word", "video", "segment", "file", "frames", "seconds", "channel", "title"])
    det, ts = holistic(), 0
    total = 0
    for word, entries in picked.items():
        for e in entries:
            path = os.path.join(VIDEO_DIR, f"{e['id']}.mp4")
            if e["id"] in done or not os.path.exists(path):
                continue
            frames, fps = read_frames(path)
            if not frames:
                w.writerow([word, e["id"], -1, "", 0, 0, e["channel"], e["title"]])
                continue
            vecs = []
            for f in frames:
                img = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
                vecs.append(ex.landmarks_to_vector(det.detect_for_video(img, ts)))
                ts += 40
            ts += 1000
            raw = np.stack(vecs)
            segs = segments(raw, fps)
            if not segs:
                w.writerow([word, e["id"], -1, "", len(raw), 0, e["channel"], e["title"]])
            for k, (a, b) in enumerate(segs):
                span = raw[a:b + 1]
                seq = span[np.linspace(0, len(span) - 1, ex.SEQUENCE_LENGTH).round().astype(int)]
                name = f"{e['id']}_{k}.npy"
                np.save(os.path.join(SEG_DIR, name), seq.astype(np.float32))
                w.writerow([word, e["id"], k, name, len(span), round(len(span) / fps, 2), e["channel"], e["title"]])
                total += 1
            out.flush()
        print(f"  {word}", flush=True)
    out.close()
    print(f"{total} new segments")


# ---- verify ----------------------------------------------------------------------

def ranks(models, X, y):
    probs = np.mean([m.predict(X, verbose=0, batch_size=256) for m in models], axis=0)
    order = np.argsort(-probs, axis=1)
    return np.array([int(np.flatnonzero(order[i] == y[i])[0]) + 1 for i in range(len(y))]), probs


def verify():
    import tensorflow  # noqa: F401  (load TF before pandas/sklearn, see letter_model_diagnostics.py)
    from tensorflow import keras
    import word_model_diagnostics as wd
    from consolidate_combined_words import trim_to_hand_span
    import extract_word_landmarks as ex
    classes = json.load(open(CLASSES_JSON, encoding="utf-8"))
    index = {c: i for i, c in enumerate(classes)}
    models = [keras.models.load_model(os.path.join(ML, "models", f"asl_combined_seed{s}.keras")) for s in range(4)]

    with open(MANIFEST, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["file"]]
    X, y = [], []
    for r in rows:
        raw = trim_to_hand_span(np.load(os.path.join(SEG_DIR, r["file"])))
        raw[:, [k * 4 + 3 for k in range(ex.NUM_POSE)]] = 0.0
        X.append(ex.normalize_sequence(raw))
        y.append(index[r["word"]])
    X, y = np.array(X, dtype="float32"), np.array(y)
    rk, _ = ranks(models, X, y)

    # The same measure on trusted clips of the same words, for comparison.
    Xw, yw = wd.webcam_clips(classes)
    words = {index[r["word"]] for r in rows}
    m = np.isin(yw, list(words))
    rw, _ = ranks(models, Xw[m], yw[m])
    for name, r in (("youtube segments", rk), ("held-out webcam clips, same words", rw)):
        print(f"{name}: n={len(r)}  top-1 {np.mean(r <= 1):.1%}  top-5 {np.mean(r <= 5):.1%}  "
              f"top-{KEEP_RANK} {np.mean(r <= KEEP_RANK):.1%}  median rank {np.median(r):.0f}")

    with open(VERIFIED, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["word", "video", "segment", "file", "rank", "kept"])
        for r, k in zip(rows, rk):
            w.writerow([r["word"], r["video"], r["segment"], r["file"], int(k), int(k <= KEEP_RANK)])
    kept = rk <= KEEP_RANK
    per_word = {}
    for r, k in zip(rows, kept):
        per_word[r["word"]] = per_word.get(r["word"], 0) + int(k)
    print(f"kept {kept.sum()} of {len(rk)} segments, for {sum(1 for v in per_word.values() if v)} words -> {VERIFIED}")


if __name__ == "__main__":
    step = sys.argv[1] if len(sys.argv) > 1 else ""
    steps = {"search": search, "download": download, "extract": extract, "verify": verify}
    if step not in steps:
        sys.exit(f"usage: harvest_youtube_signs.py {{{'|'.join(steps)}}}")
    steps[step]()
