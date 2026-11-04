"""
FSL-105, step 1: build data/fsl_manifest.csv from the dataset's CSVs, with a
signer label per clip so the model can be evaluated signer-independently.

Columns (the first four are what extract_fsl_landmarks.py expects):
  path, word, video_id, split, signer, provided_split, flip
(flip = "1": a recording saved mirrored, flipped back before extraction;
see extra_signer_rows below for our own recordings.)

Why a signer column, and how it's derived:
  FSL-105 ships no signer IDs, and the clip stem in clips/<CLASS>/<n>.MOV is
  NOT a signer index. Inspecting the clips shows four signers (two women, two
  men), recorded in contiguous blocks of takes in the same order in every
  class: signer A takes ~0-4, B ~5-9, C ~10-14, D ~15-19 (+ any 20, 21). The
  block boundaries drift by a take or two between classes (e.g. class 6 is
  A 0-5, B 6-11, C 12-16, D 17-21), so they can't be hardcoded.

  So each class is cut into exactly 4 contiguous segments by dynamic
  programming, minimising within-segment variance of a per-clip appearance
  embedding (median over 8 frames of a brightness-normalised, low-res
  grayscale head crop). Segments are then labelled A-D in order. Every class
  with a non-5/5/5/5 cut was checked by eye against a contact sheet; all
  were correct. The provided train.csv/test.csv mix all four signers into
  both splits, so accuracy measured on it is signer-dependent.

split (the one training uses), with TEST_SIGNER held out entirely:
  test  - every clip of TEST_SIGNER
  val   - one random take per (class, signer) from the other three signers.
          Signer-dependent, used only for early stopping / LR schedule.
  train - the rest
provided_split keeps the dataset's own train/test assignment for comparison.

Run (venv active):
  python scripts/build_fsl_manifest.py
"""

import os
import re
import csv
import cv2
import numpy as np

DATASET_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data",
    "FSL-105 A dataset for recognizing 105 Filipino sign language videos",
)
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "fsl_manifest.csv")

# The class folders under clips/ are named by their label as written in
# labels.csv (clips/GOOD MORNING, clips/DON’T KNOW); they were the class
# number (clips/0) until 2026-11-02, as they still are in clips.zip and in the
# dataset's own train.csv/test.csv. video_ids keep the number (<id>_<n>), so
# the landmark cache, the val picks and every model trained before the rename
# still match.
SIGNERS = "ABCD"
TEST_SIGNER = "D"
SPLIT_SEED = 0
MIN_SEGMENT = 3  # no signer block is shorter than this in any class


def clip_embedding(path):
    """Signer-identity proxy: median over 8 frames of the head region,
    normalised per frame so session lighting changes don't dominate."""
    cap = cv2.VideoCapture(path)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    crops = []
    for t in np.linspace(0, n - 1, 8).astype(int):
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(t))
        ok, frame = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(frame[0:150, 240:400], cv2.COLOR_BGR2GRAY)
        g = cv2.resize(g, (16, 15)).astype(np.float32)
        crops.append((g - g.mean()) / (g.std() + 1e-6))
    cap.release()
    if not crops:
        raise RuntimeError(f"could not decode any frame from {path}")
    return np.median(np.stack(crops), 0).ravel()


def segment(V, k=len(SIGNERS)):
    """Optimal split of the rows of V into k contiguous segments (each at
    least MIN_SEGMENT long) minimising total within-segment squared error.
    Returns k (start, end) pairs."""
    n = len(V)
    inf = float("inf")
    cost = lambda i, j: float(((V[i:j] - V[i:j].mean(0)) ** 2).sum())
    dp = np.full((k + 1, n + 1), inf)
    back = np.zeros((k + 1, n + 1), int)
    dp[0, 0] = 0
    for s in range(1, k + 1):
        for j in range(n + 1):
            for i in range(j - MIN_SEGMENT + 1):
                if dp[s - 1, i] < inf:
                    v = dp[s - 1, i] + cost(i, j)
                    if v < dp[s, j]:
                        dp[s, j], back[s, j] = v, i
    bounds, j = [], n
    for s in range(k, 0, -1):
        i = back[s, j]
        bounds.append((i, j))
        j = i
    return bounds[::-1]


EXTRA_CLIP = re.compile(r"^(?P<signer>[a-z]+) \((?P<take>\d+)\)\.(mp4|mov)$", re.IGNORECASE)
# Clips named only by when they were recorded (2026-11-01_23-36-33.mp4). Each
# batch lists who recorded, in recording order, TAKES_PER_SIGNER takes each
# (a longer or shorter last block is fine) unless TAKE_BLOCKS gives the word's
# own counts. 2026-11-01 (12 words): checked by shirt colour in every class -
# paul (white), ry (striped), ivan (orange); WOMAN has 14 of ivan.
# 2026-11-02 (29 words): same three people in the same order, matched by face
# across the two sessions - months in the morning (same shirts as 11-01),
# colours/greetings/AUNTIE/CORRECT/BLIND/DEAF BLIND/(DON'T) UNDERSTAND in the
# afternoon (paul white, ry red, ivan printed white). Ten more words were
# recorded late that evening (22:57-23:42, same shirts, 15/15/15 each by
# contact sheet) and added 2026-11-04: CRAB, COLD, COUSIN, FRIDAY,
# GRANDMOTHER, PARENTS, MONDAY, MOTHER, THURSDAY, WHITE. A timestamp clip from
# any other day stops the build until its recorders are added here.
TIMESTAMP_CLIP = re.compile(r"^(?P<day>\d{4}-\d{2}-\d{2})_(?P<time>\d{2}-\d{2}-\d{2})\.mp4$")
TIMESTAMP_BATCHES = {"2026-11-01": ("paul", "ry", "ivan"), "2026-11-02": ("paul", "ry", "ivan")}
TAKES_PER_SIGNER = 15
# (day, word): takes per recorder, in TIMESTAMP_BATCHES order, where a batch
# isn't TAKES_PER_SIGNER each. 2026-11-02: read off contact sheets of every
# clip and confirmed by cutting each word into three contiguous blocks by
# shirt colour (the same dynamic programming as segment()); every other word
# that day is 15/15/15 by both checks.
TAKE_BLOCKS = {
    ("2026-11-02", "april"): (5, 6, 5),
    ("2026-11-02", "february"): (5, 5, 5),
    ("2026-11-02", "green"): (6, 4, 6),
    ("2026-11-02", "june"): (10, 10, 10),
    ("2026-11-02", "july"): (10, 10, 10),
    ("2026-11-02", "see you tomorrow"): (15, 16, 14),
    ("2026-11-02", "august"): (15, 15, 16),
    ("2026-11-02", "understand"): (15, 15, 16),
}
# Classes whose named clips were saved mirrored (selfie-style): the signing
# hand is on the right of the picture, the opposite of FSL-105 and of the raw
# frame the app's camera gives. The first batch (TUESDAY, WEDNESDAY): the old
# model read all 92 clips as "weelchair person", which is also what it reads
# for FSL-105's own signer D when mirrored; flipped, they got ordinary
# look-alike errors. The 2026-11-01 batch is NOT mirrored (the deployed model
# got 29/60 sampled clips as recorded, 3/60 flipped). extract_fsl_landmarks.py
# flips these frames before Holistic. Check every new batch.
MIRRORED_CLASSES = {43, 44}
# ASL videos copied into FSL class folders where the ASL and FSL signs look
# the same. 2026-11-03: COLD (59) and HELLO (36), from ASL_word_dataset (ASL
# Citizen, WLASL, MS-ASL); the user chose to train on them. They are training-only
# (never val or test) under signer "asl", so signer D's test numbers stay
# comparable with earlier models. GISLR .parquet files in those folders are
# landmark tables, not videos, and are skipped. The FSL model expects
# right-handed signing (FSL-105's HELLO is all in Holistic's right-hand
# slot), so BORROWED_FLIP lists the clips signed mainly with the left hand,
# found from their unflipped extraction (left hand tracked in clearly more
# frames than the right); two-handed COLD clips stay as recorded.
# Tried 2026-11-03 and switched OFF: with them, signer D went 90.3% -> 89.5%
# (4-seed ensemble). HELLO only 1/5 -> 2/5, while the ASL COLD clips pulled
# CRAB 5/5 -> 1/5 and CORRECT 2/6 -> 0/6 into "cold" (FSL COLD was already
# 5/5). The run is in models/fsl_experiments_2026-11-03_asl_clips/. The ASL
# files were then deleted from the FSL folders (copies remain in
# data/ASL_word_dataset/cold and /hello; the numbered COLD ones are wlasl_*
# there). To train on them again, copy the videos back and set
# INCLUDE_BORROWED_ASL = True.
INCLUDE_BORROWED_ASL = False
BORROWED_CLIP = re.compile(r"^(citizen_.+|wlasl_\d+|msasl_.+|\d{4,6})\.mp4$", re.IGNORECASE)
BORROWED_FLIP = {  # 13 of 95 (9 HELLO; 4 COLD where Holistic mostly saw one hand)
    "3_asl_citizen_0022932153577568393-HELLO", "3_asl_citizen_05614933522741539-HELLO",
    "3_asl_citizen_0755679379568106-HELLO", "3_asl_citizen_1789715889624135-HELLO",
    "3_asl_citizen_25802117645943423-HELLO", "3_asl_citizen_3283413810240037-HELLO",
    "3_asl_citizen_5339916560192981-HELLO", "3_asl_citizen_5911924789322505-HELLO",
    "3_asl_citizen_9042145214602195-HELLO", "96_asl_citizen_13808032394299397-COLD",
    "96_asl_citizen_39072948576699607-COLD", "96_asl_citizen_6663708012671183-COLD",
    "96_asl_msasl_20234_0",
}


def class_folders():
    """{class id: its folder under clips/} - the label from labels.csv."""
    with open(os.path.join(DATASET_DIR, "labels.csv"), newline="", encoding="utf-8-sig") as f:
        return {int(r["id"]): r["label"].strip() for r in csv.DictReader(f)}


def team_clips(cls, word, files):
    """{signer: [(sort key, file, video_id suffix)]} for our recordings in one class."""
    takes = {}
    by_day = {}
    for f in sorted(f for f in files if TIMESTAMP_CLIP.match(f)):
        by_day.setdefault(TIMESTAMP_CLIP.match(f)["day"], []).append(f)
    for day, stamped in by_day.items():
        if day not in TIMESTAMP_BATCHES:
            raise SystemExit(f"class {cls} ({word}), {stamped[0]}: unknown recording day - add it to TIMESTAMP_BATCHES")
        who = TIMESTAMP_BATCHES[day]
        blocks = TAKE_BLOCKS.get((day, word))
        if blocks:
            if len(blocks) != len(who) or sum(blocks) != len(stamped):
                raise SystemExit(f"class {cls} ({word}), {day}: {len(stamped)} clips, TAKE_BLOCKS says {blocks}")
            order = [s for s, k in zip(who, blocks) for _ in range(k)]
        else:
            order = [who[min(i // TAKES_PER_SIGNER, len(who) - 1)] for i in range(len(stamped))]
        for signer, f in zip(order, stamped):
            t = TIMESTAMP_CLIP.match(f)["time"].replace("-", "")
            takes.setdefault(signer, []).append(((0, f), f, f"_{t}"))
    for f in files:
        m = EXTRA_CLIP.match(f)
        if m:
            takes.setdefault(m["signer"].lower(), []).append(((1, int(m["take"])), f, m["take"]))
    return takes


def extra_signer_rows(labels, folders):
    """Our own recordings, saved next to FSL-105's clips as
    clips/<CLASS>/<name> (<k>).mp4, one name per person, or named by
    recording time (see TIMESTAMP_BATCHES). ivan, paul and ry: TUESDAY and
    WEDNESDAY, 20 more words on 2026-11-01, 29 + 10 more on 2026-11-02. Each person is their own
    signer; they train, with one take per (class, signer) as val. Signer D
    stays the only test signer, so test numbers stay comparable with earlier
    models. A separate RNG per class keeps the FSL-105 rows' val picks, and
    other classes' picks, unchanged when a class gets new recordings."""
    rows = []
    for cls in sorted(labels):
        rng = np.random.default_rng((SPLIT_SEED + 1, cls))
        cls_dir = os.path.join(DATASET_DIR, "clips", folders[cls])
        takes = team_clips(cls, labels[cls], os.listdir(cls_dir))
        flip = cls in MIRRORED_CLASSES
        for signer in sorted(takes):
            clips = sorted(takes[signer])
            val_file = clips[rng.integers(len(clips))][1]
            for _, f, suffix in clips:
                rows.append({
                    "path": f"clips/{folders[cls]}/{f}", "word": labels[cls],
                    # "m": cached from the flipped frames, so an unflipped cache can't be reused
                    "video_id": f"{cls}_{signer}{suffix}{'m' if flip else ''}",
                    "split": "val" if f == val_file else "train", "signer": signer, "provided_split": "",
                    "flip": "1" if flip else "",
                })
            print(f"class {cls:3d} {labels[cls]:<16} + {signer}: {len(clips)} clips")
    return rows


def borrowed_asl_rows(labels, folders):
    """ASL clips in FSL class folders (see BORROWED_CLIP): train only, signer "asl"."""
    rows = []
    for cls in sorted(labels):
        cls_dir = os.path.join(DATASET_DIR, "clips", folders[cls])
        files = sorted(f for f in os.listdir(cls_dir) if BORROWED_CLIP.match(f))
        for f in files:
            base = f"{cls}_asl_{os.path.splitext(f)[0]}"
            flip = base in BORROWED_FLIP
            rows.append({
                "path": f"clips/{folders[cls]}/{f}", "word": labels[cls],
                "video_id": base + ("m" if flip else ""),
                "split": "train", "signer": "asl", "provided_split": "",
                "flip": "1" if flip else "",
            })
        if files:
            print(f"class {cls:3d} {labels[cls]:<16} + asl: {len(files)} borrowed clips "
                  f"({sum(1 for r in rows[-len(files):] if r['flip'])} flipped)")
    return rows


def main():
    labels = {}
    with open(os.path.join(DATASET_DIR, "labels.csv"), newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            labels[int(r["id"])] = r["label"].strip().lower()
    folders = class_folders()

    provided = {}
    for split in ("train", "test"):
        with open(os.path.join(DATASET_DIR, f"{split}.csv"), newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                provided[r["vid_path"].replace("\\", "/")] = split

    rng = np.random.default_rng(SPLIT_SEED)
    rows = []
    for cls in sorted(labels):
        cls_dir = os.path.join(DATASET_DIR, "clips", folders[cls])
        stems = sorted(int(f.split(".")[0]) for f in os.listdir(cls_dir) if f.upper().endswith(".MOV"))
        V = np.stack([clip_embedding(os.path.join(cls_dir, f"{n}.MOV")) for n in stems])
        bounds = segment(V)
        print(f"class {cls:3d} {labels[cls]:<16} blocks {[j - i for i, j in bounds]}")

        for s, (i, j) in enumerate(bounds):
            signer = SIGNERS[s]
            val_take = None if signer == TEST_SIGNER else stems[i + rng.integers(j - i)]
            for n in stems[i:j]:
                rel = f"clips/{folders[cls]}/{n}.MOV"
                split = "test" if signer == TEST_SIGNER else ("val" if n == val_take else "train")
                rows.append({
                    "path": rel,
                    "word": labels[cls],
                    # Stems repeat across classes (CORRECT/6 and RED/6), so the
                    # class must be part of the id or the cache collides.
                    "video_id": f"{cls}_{n}",
                    "split": split,
                    "signer": signer,
                    # train.csv/test.csv still use the numbered folders
                    "provided_split": provided.get(f"clips/{cls}/{n}.MOV", ""),
                    "flip": "",
                })

    rows += extra_signer_rows(labels, folders)
    if INCLUDE_BORROWED_ASL:
        rows += borrowed_asl_rows(labels, folders)

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print(f"\n{len(rows)} clips, {len(labels)} classes -> {OUTPUT_CSV}")
    print("split:", dict(Counter(r["split"] for r in rows)))
    print("signer:", dict(Counter(r["signer"] for r in rows)))
    missing = sum(1 for r in rows if not r["provided_split"] and r["signer"] in SIGNERS)
    if missing:
        print(f"WARNING: {missing} clips not found in train.csv/test.csv")


if __name__ == "__main__":
    main()
