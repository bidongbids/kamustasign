"""
FSL-105, step 1: build data/fsl_manifest.csv from the dataset's CSVs, with a
signer label per clip so the model can be evaluated signer-independently.

Columns (the first four are what extract_fsl_landmarks.py expects):
  path, word, video_id, split, signer, provided_split

Why a signer column, and how it's derived:
  FSL-105 ships no signer IDs, and the clip stem in clips/<class>/<n>.MOV is
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
import csv
import cv2
import numpy as np

DATASET_DIR = os.path.join(
    os.path.dirname(__file__), "..", "data",
    "FSL-105 A dataset for recognizing 105 Filipino sign language videos",
)
OUTPUT_CSV = os.path.join(os.path.dirname(__file__), "..", "data", "fsl_manifest.csv")

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


def main():
    labels = {}
    with open(os.path.join(DATASET_DIR, "labels.csv"), newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            labels[int(r["id"])] = r["label"].strip().lower()

    provided = {}
    for split in ("train", "test"):
        with open(os.path.join(DATASET_DIR, f"{split}.csv"), newline="", encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                provided[r["vid_path"].replace("\\", "/")] = split

    rng = np.random.default_rng(SPLIT_SEED)
    rows = []
    for cls in sorted(labels):
        cls_dir = os.path.join(DATASET_DIR, "clips", str(cls))
        stems = sorted(int(f.split(".")[0]) for f in os.listdir(cls_dir) if f.upper().endswith(".MOV"))
        V = np.stack([clip_embedding(os.path.join(cls_dir, f"{n}.MOV")) for n in stems])
        bounds = segment(V)
        print(f"class {cls:3d} {labels[cls]:<16} blocks {[j - i for i, j in bounds]}")

        for s, (i, j) in enumerate(bounds):
            signer = SIGNERS[s]
            val_take = None if signer == TEST_SIGNER else stems[i + rng.integers(j - i)]
            for n in stems[i:j]:
                rel = f"clips/{cls}/{n}.MOV"
                split = "test" if signer == TEST_SIGNER else ("val" if n == val_take else "train")
                rows.append({
                    "path": rel,
                    "word": labels[cls],
                    # Stems repeat across classes (clips/17/6 and clips/74/6),
                    # so the class must be part of the id or the cache collides.
                    "video_id": f"{cls}_{n}",
                    "split": split,
                    "signer": signer,
                    "provided_split": provided.get(rel, ""),
                })

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    from collections import Counter
    print(f"\n{len(rows)} clips, {len(labels)} classes -> {OUTPUT_CSV}")
    print("split:", dict(Counter(r["split"] for r in rows)))
    print("signer:", dict(Counter(r["signer"] for r in rows)))
    missing = sum(1 for r in rows if not r["provided_split"])
    if missing:
        print(f"WARNING: {missing} clips not found in train.csv/test.csv")


if __name__ == "__main__":
    main()
