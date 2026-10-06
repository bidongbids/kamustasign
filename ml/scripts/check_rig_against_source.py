"""
Correlate the Three.js rig's output against independent ground truth.

Companion to ml/scripts/verify_rig.ts. That script rebuilds SignerAvatar's
bone hierarchy in plain Three.js, runs a clip through it, and prints
world-space wrist trajectories as JSON. This script checks those trajectories
against the 2D keypoints stored inside the original SignAvatars .pkl - which
were produced by the dataset authors' own pipeline, not by any of our code, so
they are a genuinely independent reference.

If the kinematic tree, rest offsets, or quaternion convention were wrong, the
avatar would still animate, just incorrectly. Correlations near 1.0 mean the
rig is reading the rotations correctly. Anything below ~0.9 means something in
src/lib/smplxSkeleton.ts or the conversion in signavatars_to_rotations.py has
drifted.

Note on sign: the correlation for wrist *height* is expected to be POSITIVE
even though image Y grows downward while the rig's Y grows upward. The clips
carry SMPL-X's camera-space orientation, where the root holds a 180-degree
flip about X - SignerAvatar cancels that at the container level for display.
The magnitude is what this check cares about, not the sign.

Run:
    npx esbuild ml/scripts/verify_rig.ts --bundle --platform=node \
        --format=cjs --outfile=/tmp/verify_rig.cjs
    node /tmp/verify_rig.cjs > /tmp/rig_out.json
    python ml/scripts/check_rig_against_source.py /tmp/rig_out.json
"""

import argparse
import os
import pickle
import sys

import numpy as np

# Indices into the pkl's pred_2d array. The 106 projected keypoints are laid
# out body/face first, then the two hands; each hand group starts at its wrist.
# Verified empirically: these two groups carry ~10x the motion of every other
# point and sit in two tight spatial clusters.
LEFT_WRIST_2D = 64
RIGHT_WRIST_2D = 85

PASS_THRESHOLD = 0.90


class _TorchStub:
    def __init__(self, *args, **kwargs):
        pass


class _NoTorchUnpickler(pickle.Unpickler):
    """Same trick as signavatars_to_rotations.py - read the pkl without torch."""

    def find_class(self, module, name):
        if module.startswith("torch"):
            return lambda *args, **kwargs: _TorchStub()
        return super().find_class(module, name)


def correlate(a, b):
    return float(np.corrcoef(np.asarray(a), np.asarray(b))[0, 1])


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ml_root = os.path.dirname(here)
    default_pkl = os.path.join(
        ml_root, "SignAvatars", "dataset", "word2motion",
        "wlasl_pkls_cropFalse_defult_shape", "00962.pkl",
    )

    parser = argparse.ArgumentParser(description=__doc__.strip().split("\n")[0])
    parser.add_argument("rig_json", help="output of `node verify_rig.cjs`")
    parser.add_argument("--pkl", default=default_pkl, help="the source .pkl for that clip")
    args = parser.parse_args()

    import json
    with open(args.rig_json, "r", encoding="utf-8") as fh:
        rig = json.load(fh)

    with open(args.pkl, "rb") as fh:
        kp = _NoTorchUnpickler(fh).load()["pred_2d"]

    left = np.asarray(rig["left_wrist"])
    right = np.asarray(rig["right_wrist"])
    index_tip = np.asarray(rig["left_index3"])

    if len(left) != len(kp):
        sys.exit(
            f"frame count mismatch: rig has {len(left)}, pkl has {len(kp)}. "
            "Are these the same clip?"
        )

    checks = {
        "left wrist height": correlate(left[:, 1], kp[:, LEFT_WRIST_2D, 1]),
        "right wrist height": correlate(right[:, 1], kp[:, RIGHT_WRIST_2D, 1]),
        "hand separation": correlate(
            np.linalg.norm(left - right, axis=1),
            np.linalg.norm(kp[:, LEFT_WRIST_2D] - kp[:, RIGHT_WRIST_2D], axis=1),
        ),
    }

    print(f"{rig['frames']} frames, {rig['joints']} joints\n")
    failures = []
    for label, value in checks.items():
        ok = abs(value) >= PASS_THRESHOLD
        print(f"  {label:22} r = {value:+.3f}   {'ok' if ok else 'FAIL'}")
        if not ok:
            failures.append(label)

    # A hand whose finger joints never move relative to its wrist means the
    # hand-pose slices are being dropped somewhere in the pipeline.
    articulation = float((index_tip - left).std(axis=0).sum())
    hand_ok = articulation > 0.01
    print(
        f"\n  finger articulation    {articulation:.4f} m   "
        f"{'ok' if hand_ok else 'FAIL (hand is frozen to the wrist)'}"
    )
    if not hand_ok:
        failures.append("finger articulation")

    if failures:
        sys.exit(f"\nFAILED: {', '.join(failures)}")
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
