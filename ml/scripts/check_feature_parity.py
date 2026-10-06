"""
Verify the TypeScript and Python feature pipelines agree, value for value.

src/ml/wordLandmarks.ts and ml/scripts/extract_word_landmarks.py implement the
same transform in two languages: resample, body-normalise against shoulder
width, then append the wrist-relative hand blocks. If they drift apart nothing
raises - the app just feeds the model features it was never trained on, and
the only symptom is worse predictions. That class of bug is very hard to spot
from the UI, so it gets an explicit test.

This picks a few cached clips (including ones with a hand missing, since the
zero-handling is the subtlest part), runs the Python transform, hands the raw
input to the TS transform via check_feature_parity.ts, and diffs the results.

Run:
    python ml/scripts/check_feature_parity.py --emit
    npx esbuild ml/scripts/check_feature_parity.ts --bundle --platform=node \
        --format=cjs --outfile=/tmp/parity.cjs
    node /tmp/parity.cjs > /tmp/ts_features.json
    python ml/scripts/check_feature_parity.py
"""

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import extract_word_landmarks as ex  # noqa: E402

ML_ROOT = os.path.dirname(HERE)
CACHE_DIR = os.path.join(ML_ROOT, "data", "word_landmarks_cache")
INPUT_JSON = "/tmp/parity_input.json"
TS_OUTPUT_JSON = "/tmp/ts_features.json"

# Float32 round-trips through JSON as decimal text; this is comfortably
# tighter than any real divergence in the maths would be.
TOLERANCE = 1e-5


def pick_clips(n=6):
    """Prefer a mix: some clips with both hands, some with one hand missing."""
    names = sorted(os.listdir(CACHE_DIR))[:400]
    both, partial = [], []
    lh = ex.NUM_POSE * 4
    rh = lh + ex.NUM_HAND * 3
    for name in names:
        seq = np.load(os.path.join(CACHE_DIR, name))
        has_l = np.abs(seq[:, lh:lh + 63]).sum() > 0
        has_r = np.abs(seq[:, rh:rh + 63]).sum() > 0
        (both if (has_l and has_r) else partial).append(name)
        if len(both) >= n // 2 and len(partial) >= n // 2:
            break
    chosen = both[: n // 2] + partial[: n - n // 2]
    if not chosen:
        raise SystemExit(f"no cached clips found in {CACHE_DIR}")
    return chosen


def emit():
    payload = {}
    for name in pick_clips():
        seq = np.load(os.path.join(CACHE_DIR, name))
        payload[name] = seq.astype("float64").tolist()
    with open(INPUT_JSON, "w") as fh:
        json.dump(payload, fh)
    print(f"wrote {len(payload)} clips to {INPUT_JSON}")
    for name in payload:
        print(f"  {name}")


def compare():
    if not os.path.exists(TS_OUTPUT_JSON):
        raise SystemExit(
            f"{TS_OUTPUT_JSON} missing - run the esbuild/node step from the docstring first"
        )
    with open(INPUT_JSON) as fh:
        raw = json.load(fh)
    with open(TS_OUTPUT_JSON) as fh:
        ts = json.load(fh)

    failures = []
    for name, frames in raw.items():
        py = ex.normalize_sequence(np.asarray(frames, dtype="float32"))
        got = np.asarray(ts[name], dtype="float32")

        if got.shape != py.shape:
            failures.append(f"{name}: shape {got.shape} vs python {py.shape}")
            continue

        diff = np.abs(got - py)
        worst = float(diff.max())
        where = np.unravel_index(int(diff.argmax()), diff.shape)
        status = "ok" if worst <= TOLERANCE else "FAIL"
        print(f"  {name:16} shape {py.shape}  max|diff| {worst:.2e}  {status}")
        if worst > TOLERANCE:
            failures.append(f"{name}: max diff {worst:.2e} at frame {where[0]}, feature {where[1]}")

    print()
    if failures:
        for f in failures:
            print("FAIL:", f)
        sys.exit("TypeScript and Python feature pipelines DISAGREE.")
    print(f"All clips match within {TOLERANCE:g}. Pipelines agree.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--emit", action="store_true", help="write the raw input for the TS side")
    args = ap.parse_args()
    emit() if args.emit else compare()
