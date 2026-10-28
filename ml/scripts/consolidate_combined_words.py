"""
Builds the ASL word dataset from BOTH sources:
  - our clips (MS-ASL / ASL Citizen / WLASL, word_manifest.csv + the
    word_landmarks_cache that extract_word_landmarks.py fills), and
  - the Google Isolated Sign Language Recognition clips
    (extract_gislr_landmarks.py -> gislr_raw.npz).

Vocabulary: every word with at least MIN_EXAMPLES clips across both
sources - the same "enough data to learn" bar consolidate_word_landmarks.py
uses. Today that is our 133 words plus all 250 of the new dataset's signs,
minus the 38 they share and one same-sign merge (mom -> mother): 344 words.

Labels: the new dataset glues multi-word glosses together ("callonphone",
"thankyou"); GISLR_LABELS maps them to the words the app shows, and merges
glosses that are the same ASL sign as one of ours, so the model is never
asked to tell two names for one sign apart.

Splits:
  - our clips keep the split word_manifest.csv assigned;
  - the new clips are split BY SIGNER: VAL_PARTICIPANTS / TEST_PARTICIPANTS
    never appear in training, so test accuracy measures how the model does
    on someone it has never seen - which is every child using the app.

Aspect ratio: MediaPipe's x and y are fractions of the frame's width and
height, so the same body has different proportions in a portrait video than
in a landscape one. The new dataset was filmed on phones in portrait - its
nose-to-shoulder height is ~0.40 shoulder widths, against ~0.72 in our
640x480 webcam clips, which is also the shape the app's camera gives
(getUserMedia's default 640x480). Trained as-is, the model learned the
new-only words in a squashed shape the app never produces (21 of 211 were
recognised from webcam clips of the same signs). So each new-dataset
signer's y coordinates are stretched to match our ASL Citizen clips'
proportions (match_webcam_aspect), per signer since phones differ.

Framing: the new dataset's clips are already cut to the signing; ours have
rest at both ends, so an untrimmed webcam recording looked like "one of our
133 words" (92% of webcam clips of new words were read that way). The fix
that worked is on the app side: it trims ASL recordings to the hand-active
span (trimToHandSpan, ASL_TRIM_MARGIN = 0) before classifying, which took
new words recognised from webcam clips from 44 to 94 of 211. Tried and
rejected (2026-10-21, models/asl_combined_v4_trim): ALSO trimming the
training clips here (trim_to_hand_span) and zeroing hips/legs - test
accuracy was the same, but webcam clips of new words did worse (top-1 14%
vs 18%), so the training clips stay untrimmed.

Pose visibility is zeroed for every clip: the new dataset doesn't have it,
and a model that sees it for some clips and not others would learn "which
dataset is this" instead of "which sign". export_fused_word_ensemble.py
folds the same zeroing into the deployed graph, so the app needs no change.

Output (float16 to fit ~100k clips in RAM):
  data/combined_word_landmarks.npz
    X_train, y_train, X_val, y_val, X_test, y_test, src_{train,val,test}
    (src: 0 = our clips, 1 = new dataset)
  data/combined_word_classes.json

Extra webcam clips (--webcam-extra, 2026-10-28): the 211 words learned
from the new dataset have webcam clips on disk (ASL Citizen / WLASL / MS-ASL)
that were only ever a test set, and they score ~0-25% on them - the gap is
camera/signer domain, not the word. With this flag, half of every word's
held-out webcam clips (a fixed half, by hash of the clip id) go into training,
listed in data/webcam_train_extra.json so word_model_diagnostics.py never
scores them; the other half stays the webcam test. The YouTube dictionary
segments that harvest_youtube_signs.py verify kept are added too. Both are
counted EXTRA_REPEAT times, since a word has a few of them against ~300 phone
clips. src: 2 = moved webcam clip, 3 = YouTube.

Run with the main venv:
  cd ml
  python scripts/consolidate_combined_words.py
  python scripts/consolidate_combined_words.py --webcam-extra
"""
import csv
import json
import os
import sys
from collections import Counter

import numpy as np

import extract_word_landmarks as ex

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
MANIFEST_CSV = os.path.join(DATA_DIR, "word_manifest.csv")
CACHE_DIR = os.path.join(DATA_DIR, "word_landmarks_cache")
GISLR_NPZ = os.path.join(DATA_DIR, "gislr_raw.npz")
OUR_CLASSES = os.path.join(DATA_DIR, "word_classes.json")
OUTPUT_NPZ = os.path.join(DATA_DIR, "combined_word_landmarks.npz")
OUTPUT_CLASSES = os.path.join(DATA_DIR, "combined_word_classes.json")

MIN_EXAMPLES = 10

# Held-out signers from the new dataset (21 in all). Fixed, not random, so
# every seed of the ensemble is scored on the same people.
VAL_PARTICIPANTS = {26734, 28656}
TEST_PARTICIPANTS = {16069, 25571}

GISLR_LABELS = {
    # Same ASL sign as one of our words.
    "mom": "mother",
    # Glued glosses -> what the app displays.
    "callonphone": "call on phone",
    "frenchfries": "french fries",
    "glasswindow": "window",
    "haveto": "have to",
    "hesheit": "he/she/it",
    "icecream": "ice cream",
    "minemy": "my/mine",
    "thankyou": "thank you",
    "weus": "we/us",
}

VIS_COLS = np.arange(ex.NUM_POSE) * 4 + 3
# Model-feature columns held at zero: every pose visibility.
# train_word_classifier.py (INPUT_MASK) and export_fused_word_ensemble.py
# (DROP_COLS) must list the same ones.
DROP_COLS = VIS_COLS

# No margin: the new dataset's clips start and end with hands up, so a
# handless margin frame would mark a recording as "not from that dataset".
# Matches the app's ASL_TRIM_MARGIN = 0.
TRIM_MARGIN = 0
HANDS = slice(ex.NUM_POSE * 4, ex.FEATURES_PER_FRAME)


def trim_to_hand_span(raw):
    """(T, 258) raw -> the frames from the first to the last with a hand
    (plus TRIM_MARGIN), resampled back to SEQUENCE_LENGTH. Mirrors the app's
    trimToHandSpan(frames, ASL_TRIM_MARGIN) + resampleSequence, for scoring
    clips the way the app sees them (select_asl_word_references.py); not
    applied to the training clips (see Framing above). No hand at all:
    returned unchanged."""
    active = np.flatnonzero(raw[:, HANDS].any(axis=1))
    if active.size == 0:
        return raw
    span = raw[max(0, active[0] - TRIM_MARGIN):active[-1] + 1 + TRIM_MARGIN]
    return span[np.linspace(0, len(span) - 1, ex.SEQUENCE_LENGTH).round().astype(int)]


def normalize(raw):
    """(T, 258) raw -> (T, 384) model features with DROP_COLS zeroed."""
    x = ex.normalize_sequence(raw.astype("float32"))
    x[:, DROP_COLS] = 0.0
    return x


def normalize_batch(raw):
    """(N, T, 258) -> (N, T, 384): normalize() over a whole batch at once.
    Same maths as ex.normalize_sequence; main() checks the two agree before
    using it, so a change there can't silently diverge here."""
    x = raw.astype("float32").copy()
    x[..., VIS_COLS] = 0.0
    N, T, _ = x.shape

    def wrist_rel(base):
        h = x[..., base:base + ex.NUM_HAND * 3].reshape(N, T, ex.NUM_HAND, 3)
        wrist = h[:, :, ex.HAND_WRIST_IDX:ex.HAND_WRIST_IDX + 1, :]
        palm = np.linalg.norm(h[:, :, ex.HAND_MIDDLE_MCP_IDX, :] - wrist[:, :, 0, :], axis=-1)
        ok = palm > 1e-6
        rel = (h - wrist) / np.where(ok, palm, 1.0)[..., None, None]
        rel[~ok] = 0.0
        return rel.reshape(N, T, ex.NUM_HAND * 3)

    left_rel = wrist_rel(ex.NUM_POSE * 4)
    right_rel = wrist_rel(ex.NUM_POSE * 4 + ex.NUM_HAND * 3)

    ls = x[..., ex.LEFT_SHOULDER_IDX * 4:ex.LEFT_SHOULDER_IDX * 4 + 3]
    rs = x[..., ex.RIGHT_SHOULDER_IDX * 4:ex.RIGHT_SHOULDER_IDX * 4 + 3]
    origin = (ls + rs) / 2.0
    scale = np.linalg.norm(ls - rs, axis=-1, keepdims=True)
    scale = np.where(scale < 1e-6, 1.0, scale)

    pose = x[..., :ex.NUM_POSE * 4].reshape(N, T, ex.NUM_POSE, 4)
    pose[..., :3] = (pose[..., :3] - origin[:, :, None, :]) / scale[:, :, None, :]
    hands = x[..., ex.NUM_POSE * 4:].reshape(N, T, 2 * ex.NUM_HAND, 3)
    hands[:] = (hands - origin[:, :, None, :]) / scale[:, :, None, :]
    x = np.concatenate([pose.reshape(N, T, -1), hands.reshape(N, T, -1), left_rel, right_rel], axis=-1)
    x[..., DROP_COLS] = 0.0
    return x


Y_COLS = np.r_[np.arange(ex.NUM_POSE) * 4 + 1, ex.NUM_POSE * 4 + np.arange(2 * ex.NUM_HAND) * 3 + 1]
NOSE_IDX = 0


def body_ratio(raw):
    """Median nose-above-shoulders height / shoulder width over (..., 258)
    raw frames - the same for every adult in reality, so it measures how the
    frame's aspect ratio distorts y against x."""
    raw = np.asarray(raw, dtype=np.float32).reshape(-1, raw.shape[-1])
    ls = raw[:, ex.LEFT_SHOULDER_IDX * 4:ex.LEFT_SHOULDER_IDX * 4 + 2]
    rs = raw[:, ex.RIGHT_SHOULDER_IDX * 4:ex.RIGHT_SHOULDER_IDX * 4 + 2]
    nose = raw[:, NOSE_IDX * 4:NOSE_IDX * 4 + 2]
    width = np.abs(ls[:, 0] - rs[:, 0])
    height = np.abs(nose[:, 1] - (ls[:, 1] + rs[:, 1]) / 2)
    ok = (width > 1e-3) & (nose[:, 1] > 0)
    return float(np.median(height[ok] / width[ok]))


def match_webcam_aspect(g_X, g_part, ours):
    """Scales each new-dataset signer's y (in place) so their body_ratio
    matches our ASL Citizen clips' (640x480 webcams, like the app's)."""
    citizen = [r for r in ours if r["video_id"].startswith("citizen_")]
    target = body_ratio(np.stack([np.load(os.path.join(CACHE_DIR, f"{r['video_id']}.npy")) for r in citizen]))
    factors = {}
    for p in np.unique(g_part):
        idx = np.flatnonzero(g_part == p)
        factors[int(p)] = target / body_ratio(g_X[idx[:400]])
    per_row = np.array([factors[int(p)] for p in g_part], dtype=np.float32)
    for i in range(0, len(g_X), 4096):
        chunk = g_X[i:i + 4096].astype(np.float32)
        chunk[..., Y_COLS] *= per_row[i:i + 4096, None, None]
        g_X[i:i + 4096] = chunk.astype(g_X.dtype)
    f = np.array(list(factors.values()))
    print(f"  aspect: target body ratio {target:.2f} (ASL Citizen); new-dataset y stretched "
          f"x{f.min():.2f}-{f.max():.2f} (median {np.median(f):.2f}) across {len(f)} signers")
    after = body_ratio(g_X[::50])
    assert abs(after - target) < 0.05, f"aspect correction off: {after:.2f} vs {target:.2f}"


WEBCAM_EXTRA = "--webcam-extra" in sys.argv
EXTRA_REPEAT = 2
YOUTUBE_DIR = os.path.join(DATA_DIR, "youtube_signs")


def webcam_extra(words, idx):
    """(X, y, src) of the extra training clips, and writes the moved-clip list."""
    import hashlib
    import word_model_diagnostics as wd
    by_word = {}
    for vid, i, cached in wd.webcam_clip_files(words):
        by_word.setdefault(i, []).append((hashlib.md5(vid.encode()).hexdigest(), vid, cached))
    moved, X, y, src = [], [], [], []
    for i, clips in by_word.items():
        clips.sort()
        for _, vid, cached in clips[:len(clips) // 2]:  # a word with one clip keeps it as a test
            moved.append(vid)
            X.append(normalize(np.load(cached)).astype(np.float16))
            y.append(i)
            src.append(2)
    with open(wd.WEBCAM_TRAIN_LIST, "w") as f:
        json.dump(sorted(moved), f, indent=0)
    n_web = len(X)
    verified = os.path.join(YOUTUBE_DIR, "verified.csv")
    if os.path.exists(verified):
        with open(verified, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r["kept"] == "1" and r["word"] in idx:
                    X.append(normalize(np.load(os.path.join(YOUTUBE_DIR, "segments", r["file"]))).astype(np.float16))
                    y.append(idx[r["word"]])
                    src.append(3)
    print(f"  extra: {n_web} held-out webcam clips moved to training (list in {os.path.basename(wd.WEBCAM_TRAIN_LIST)}), "
          f"{len(X) - n_web} YouTube segments, each x{EXTRA_REPEAT}")
    return X * EXTRA_REPEAT, y * EXTRA_REPEAT, src * EXTRA_REPEAT


def main():
    our_vocab = json.load(open(OUR_CLASSES, encoding="utf-8"))
    with open(MANIFEST_CSV, newline="", encoding="utf-8") as f:
        ours = [r for r in csv.DictReader(f)
                if r["word"] in set(our_vocab) and os.path.exists(os.path.join(CACHE_DIR, f"{r['video_id']}.npy"))]

    # Read each array ONCE: indexing an NpzFile (g["X"][i]) re-reads the
    # whole 2 GB array from disk on every access.
    with np.load(GISLR_NPZ) as g:
        g_X = g["X"]
        g_signs = np.array([GISLR_LABELS.get(s, s) for s in g["sign"]])
        g_part = g["participant"]

    match_webcam_aspect(g_X, g_part, ours)

    probe = g_X[:64]
    ref = np.stack([normalize(c) for c in probe])
    err = np.abs(normalize_batch(probe) - ref).max()
    assert err < 1e-4, f"normalize_batch disagrees with normalize_sequence (max err {err})"
    print(f"Our clips: {len(ours)}   New-dataset clips: {len(g_signs)} from {len(np.unique(g_part))} signers")

    counts = Counter(r["word"] for r in ours) + Counter(g_signs.tolist())
    words = sorted(w for w, c in counts.items() if c >= MIN_EXAMPLES)
    dropped = sorted(w for w, c in counts.items() if c < MIN_EXAMPLES)
    print(f"Vocabulary: {len(words)} words with >= {MIN_EXAMPLES} clips"
          + (f" (dropped {len(dropped)}: {dropped})" if dropped else ""))
    shared = sorted(set(our_vocab) & set(g_signs.tolist()))
    print(f"  in both sources: {len(shared)}")
    idx = {w: i for i, w in enumerate(words)}

    out = {s: ([], [], []) for s in ("train", "val", "test")}
    for r in ours:
        X, y, src = out[r["split"]]
        X.append(normalize(np.load(os.path.join(CACHE_DIR, f"{r['video_id']}.npy"))).astype(np.float16))
        y.append(idx[r["word"]])
        src.append(0)

    if WEBCAM_EXTRA:
        Xe, ye, se = webcam_extra(words, idx)
        out["train"][0].extend(Xe)
        out["train"][1].extend(ye)
        out["train"][2].extend(se)

    g_split = np.where(np.isin(g_part, list(TEST_PARTICIPANTS)), "test",
                       np.where(np.isin(g_part, list(VAL_PARTICIPANTS)), "val", "train"))
    g_norm = np.empty((len(g_X), g_X.shape[1], ex.MODEL_FEATURES_PER_FRAME), dtype=np.float16)
    for i in range(0, len(g_X), 4096):
        g_norm[i:i + 4096] = normalize_batch(g_X[i:i + 4096])
    print(f"  normalised {len(g_X)} new-dataset clips", flush=True)
    del g_X

    arrays = {}
    for s, (X, y, src) in out.items():
        m = g_split == s
        X = [np.stack(X)] if X else []
        X.append(g_norm[m])
        y = y + [idx[w] for w in g_signs[m]]
        src = src + [1] * int(m.sum())
        arrays[f"X_{s}"] = np.concatenate(X)
        arrays[f"y_{s}"] = np.array(y, dtype=np.int32)
        arrays[f"src_{s}"] = np.array(src, dtype=np.int8)
        print(f"{s}: {len(y)} clips ({sum(1 for v in src if v == 0)} ours, {sum(1 for v in src if v == 1)} new"
              f"{f', {sum(1 for v in src if v >= 2)} extra webcam/YouTube' if WEBCAM_EXTRA else ''})")

    np.savez(OUTPUT_NPZ, **arrays)
    with open(OUTPUT_CLASSES, "w", encoding="utf-8") as f:
        json.dump(words, f, indent=2)
    print(f"Saved {OUTPUT_NPZ} and {len(words)} labels to {OUTPUT_CLASSES}")
    print("Next: python scripts/train_word_classifier.py --combined [seed]")


if __name__ == "__main__":
    main()
