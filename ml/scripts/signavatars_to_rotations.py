"""
Convert a SignAvatars word2motion .pkl into Three.js-ready joint rotations.

Why this exists
---------------
The SignAvatars repo ships vis.py, but it cannot run on the word2motion .pkl
files without significant patching: it calls .cuda() (needs an NVIDIA GPU),
loads the licensed SMPL-X body-model files (separate registration), reads
results_dict['height'] / ['width'] (keys that do not exist in word2motion
pkls), looks the clip up in a text_dict built only from the hamnosys2motion
and language2motion subsets (KeyError for a WLASL video id), and reads
'../assets/blender.png' (not present in the repo's assets folder).

None of that is needed for our purpose. We don't want a rendered mesh video -
we want the joint rotations, so a rigged avatar in Three.js can be driven
directly. Those rotations are already sitting in the pkl as plain numpy, so
this script reads them out and writes them as quaternion keyframe tracks.

The 182-dim per-frame layout is taken from SignAvatars' own vis.py
(process_single_video, lines 211-214), not guessed:

    [  0:  3 ]  root / global_orient   (axis-angle)
    [  3: 66 ]  body_pose              21 joints x 3 (axis-angle)
    [ 66:111 ]  left_hand_pose         15 joints x 3 (axis-angle)
    [111:156 ]  right_hand_pose        15 joints x 3 (axis-angle)
    [156:159 ]  jaw_pose               (axis-angle)
    [159:169 ]  betas                  (body shape - all zeros in the
                                        "defult_shape" release)
    [169:179 ]  expression
    [179:182 ]  cam_trans              (camera, not a body rotation)

Joint names come from the repo's own smplx/joint_names.py ordering. The hand
models are built with use_pca=False (see common/utils/human_models.py), so
each hand is full per-joint axis-angle rather than PCA coefficients - which
is exactly what makes this directly retargetable.

Output format is a dict of quaternion tracks, one per joint, each a list of
[x, y, z, w] per frame. That maps 1:1 onto THREE.QuaternionKeyframeTrack, so
the playback engine does not have to do any conversion at load time.

Usage
-----
    python signavatars_to_rotations.py --pkl <path to 00962.pkl>
    python signavatars_to_rotations.py --word add --out ../data/signer_clips/
"""

import argparse
import json
import os
import pickle

import numpy as np

# --- SMPL-X joint ordering (from SignAvatars/common/utils/smplx/smplx/joint_names.py) ---

BODY_JOINTS = [
    "left_hip", "right_hip", "spine1", "left_knee", "right_knee", "spine2",
    "left_ankle", "right_ankle", "spine3", "left_foot", "right_foot", "neck",
    "left_collar", "right_collar", "head", "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow", "left_wrist", "right_wrist",
]  # 21 joints, JOINT_NAMES[1:22] - pelvis is the root and lives in root_pose

_FINGERS = ["index", "middle", "pinky", "ring", "thumb"]
LEFT_HAND_JOINTS = [f"left_{f}{i}" for f in _FINGERS for i in (1, 2, 3)]
RIGHT_HAND_JOINTS = [f"right_{f}{i}" for f in _FINGERS for i in (1, 2, 3)]

# Slice boundaries in the 182-dim per-frame vector (see module docstring).
SLICES = {
    "root": (0, 3),
    "body": (3, 66),
    "left_hand": (66, 111),
    "right_hand": (111, 156),
    "jaw": (156, 159),
}
EXPECTED_DIM = 182


class _TorchStub:
    """Placeholder for torch objects we never actually read."""

    def __init__(self, *args, **kwargs):
        pass


class _NoTorchUnpickler(pickle.Unpickler):
    """Load the pkl without requiring torch to be installed.

    The word2motion pkls contain a couple of torch tensors (the hand validity
    masks) alongside the numpy arrays we care about. Rather than pull in a
    ~700MB torch install just to unpickle them, swap any torch class for a
    harmless stub. Every array this script touches is plain numpy.
    """

    def find_class(self, module, name):
        if module.startswith("torch"):
            return lambda *args, **kwargs: _TorchStub()
        return super().find_class(module, name)


def axis_angle_to_quaternion(vecs):
    """(N, 3) axis-angle (radians, magnitude = angle) -> (N, 4) xyzw quaternions.

    xyzw order is what THREE.Quaternion expects. A zero-length vector means
    "no rotation" and maps to the identity quaternion.
    """
    vecs = np.asarray(vecs, dtype=np.float64).reshape(-1, 3)
    angles = np.linalg.norm(vecs, axis=1)
    quats = np.zeros((len(vecs), 4), dtype=np.float64)
    quats[:, 3] = 1.0  # identity default, correct for the zero-rotation case

    moving = angles > 1e-8
    axes = vecs[moving] / angles[moving, None]
    half = angles[moving] / 2.0
    quats[moving, :3] = axes * np.sin(half)[:, None]
    quats[moving, 3] = np.cos(half)
    return quats


def load_gloss_map(wlasl_json):
    """video_id (int) -> gloss, from WLASL_v0.3.json."""
    with open(wlasl_json, "r", encoding="utf-8") as fh:
        entries = json.load(fh)
    mapping = {}
    for entry in entries:
        for inst in entry["instances"]:
            try:
                mapping[int(inst["video_id"])] = entry["gloss"]
            except (ValueError, KeyError):
                continue
    return mapping


def convert(pkl_path, gloss=None, fps=24, precision=5):
    with open(pkl_path, "rb") as fh:
        data = _NoTorchUnpickler(fh).load()

    pose = np.asarray(data["smplx"], dtype=np.float64)
    if pose.ndim != 2 or pose.shape[1] != EXPECTED_DIM:
        raise ValueError(
            f"{pkl_path}: expected (frames, {EXPECTED_DIM}) 'smplx' array, "
            f"got {pose.shape}. This script targets the word2motion release."
        )
    frame_count = pose.shape[0]

    # These files get bundled into the app, so trim the float noise. Quaternion
    # components are all within [-1, 1]; 5 decimals is ~0.001 degrees of angular
    # resolution, far below anything visible, and cuts file size by about a
    # third versus full float64 repr.
    def quats(vectors):
        return np.round(axis_angle_to_quaternion(vectors), precision).tolist()

    tracks = {}

    start, end = SLICES["root"]
    tracks["pelvis"] = quats(pose[:, start:end])

    start, end = SLICES["body"]
    body = pose[:, start:end].reshape(frame_count, 21, 3)
    for i, name in enumerate(BODY_JOINTS):
        tracks[name] = quats(body[:, i, :])

    for key, names in (("left_hand", LEFT_HAND_JOINTS), ("right_hand", RIGHT_HAND_JOINTS)):
        start, end = SLICES[key]
        hand = pose[:, start:end].reshape(frame_count, 15, 3)
        for i, name in enumerate(names):
            tracks[name] = quats(hand[:, i, :])

    start, end = SLICES["jaw"]
    tracks["jaw"] = quats(pose[:, start:end])

    video_id = os.path.basename(pkl_path).split(".pkl")[0]
    times = [round(i / fps, 6) for i in range(frame_count)]

    return {
        "source": "SignAvatars word2motion (WLASL), SMPL-X neutral shape",
        "video_id": video_id,
        "gloss": gloss,
        "fps": fps,
        "frame_count": frame_count,
        "duration": round(frame_count / fps, 6),
        "times": times,
        "rotation_order": "xyzw (THREE.Quaternion)",
        "tracks": tracks,
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ml_root = os.path.dirname(here)
    default_pkl_dir = os.path.join(
        ml_root, "SignAvatars", "dataset", "word2motion",
        "wlasl_pkls_cropFalse_defult_shape",
    )
    default_wlasl = os.path.join(
        ml_root, "SignAvatars", "datasets", "word2motion", "WLASL_v0.3.json"
    )

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("--pkl", help="path to a single word2motion .pkl")
    parser.add_argument("--word", help="WLASL gloss to convert (all clips for it)")
    parser.add_argument("--pkl-dir", default=default_pkl_dir)
    parser.add_argument("--wlasl-json", default=default_wlasl)
    parser.add_argument("--out", default=os.path.join(ml_root, "data", "signer_clips"))
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument(
        "--precision", type=int, default=5,
        help="decimal places kept per quaternion component (default 5)",
    )
    args = parser.parse_args()

    gloss_map = {}
    if os.path.exists(args.wlasl_json):
        gloss_map = load_gloss_map(args.wlasl_json)
    else:
        print(f"note: {args.wlasl_json} not found - output will have no gloss label")

    if args.pkl:
        targets = [args.pkl]
    elif args.word:
        available = sorted(
            f for f in os.listdir(args.pkl_dir) if f.endswith(".pkl")
        )
        targets = [
            os.path.join(args.pkl_dir, f)
            for f in available
            if gloss_map.get(int(f[:-4])) == args.word
        ]
        if not targets:
            raise SystemExit(
                f'no clips for "{args.word}" in {args.pkl_dir}. '
                "This download covers WLASL video ids 295-4304 only "
                '(glosses "a" through "available").'
            )
    else:
        raise SystemExit("pass either --pkl or --word")

    os.makedirs(args.out, exist_ok=True)
    for pkl_path in targets:
        vid = int(os.path.basename(pkl_path)[:-4])
        clip = convert(pkl_path, gloss=gloss_map.get(vid), fps=args.fps, precision=args.precision)
        name = f"{clip['gloss'] or 'unknown'}_{clip['video_id']}.json"
        dest = os.path.join(args.out, name)
        with open(dest, "w", encoding="utf-8") as fh:
            json.dump(clip, fh, separators=(",", ":"))
        size_kb = os.path.getsize(dest) / 1024
        print(
            f"{os.path.basename(pkl_path)} -> {name}  "
            f"({clip['frame_count']} frames, {len(clip['tracks'])} joints, {size_kb:.0f} KB)"
        )


if __name__ == "__main__":
    main()
