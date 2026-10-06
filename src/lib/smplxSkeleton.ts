// SMPL-X skeleton definition used to build the signing avatar's rig.
//
// The clip JSONs produced by ml/scripts/signavatars_to_rotations.py are
// per-joint quaternion tracks named after SMPL-X's own joint list. To play
// them back we need the skeleton those rotations belong to: which joint
// parents which, and where each joint sits in the rest pose.
//
// PARENTS is exact - the SMPL-X kinematic tree is fixed and anatomically
// determined, identical across the SMPL family.
//
// REST_OFFSETS is approximate. The true template offsets live inside the
// licensed SMPL-X model file (smpl-x.is.tue.mpg.de), which we don't ship.
// These are hand-set proportions for a roughly 1.7m adult. This matters less
// than it sounds: we are applying *rotations*, so the joint angles are exactly
// right either way - only the limb lengths are approximate, which changes how
// the figure is proportioned, not which sign it performs. Validated against
// the source clips' own 2D projections at r = 0.98 (see the FK check in
// ml/scripts/). Swapping in true offsets later is a change to this table only.
//
// Units are metres, Y-up, X to the model's left, Z forward.

export type Vec3 = [number, number, number];

export const BODY_JOINTS = [
  "pelvis",
  "left_hip", "right_hip", "spine1",
  "left_knee", "right_knee", "spine2",
  "left_ankle", "right_ankle", "spine3",
  "left_foot", "right_foot", "neck",
  "left_collar", "right_collar", "head",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
] as const;

const FINGERS = ["index", "middle", "pinky", "ring", "thumb"] as const;

export const HAND_JOINTS: string[] = (["left", "right"] as const).flatMap((side) =>
  FINGERS.flatMap((finger) => [1, 2, 3].map((seg) => `${side}_${finger}${seg}`))
);

export const ALL_JOINTS: string[] = [...BODY_JOINTS, ...HAND_JOINTS, "jaw"];

export const PARENTS: Record<string, string | null> = {
  pelvis: null,
  left_hip: "pelvis",
  right_hip: "pelvis",
  spine1: "pelvis",
  left_knee: "left_hip",
  right_knee: "right_hip",
  spine2: "spine1",
  left_ankle: "left_knee",
  right_ankle: "right_knee",
  spine3: "spine2",
  left_foot: "left_ankle",
  right_foot: "right_ankle",
  neck: "spine3",
  left_collar: "spine3",
  right_collar: "spine3",
  head: "neck",
  left_shoulder: "left_collar",
  right_shoulder: "right_collar",
  left_elbow: "left_shoulder",
  right_elbow: "right_shoulder",
  left_wrist: "left_elbow",
  right_wrist: "right_elbow",
  jaw: "head",
  // Fingers all hang off their wrist; segments chain outward.
  ...Object.fromEntries(
    (["left", "right"] as const).flatMap((side) =>
      FINGERS.flatMap((finger) =>
        [1, 2, 3].map((seg) => [
          `${side}_${finger}${seg}`,
          seg === 1 ? `${side}_wrist` : `${side}_${finger}${seg - 1}`,
        ])
      )
    )
  ),
};

// Mirror a left-side offset to the right side (negate X).
const mirror = ([x, y, z]: Vec3): Vec3 => [-x, y, z];

const LEFT_HAND_OFFSETS: Record<string, Vec3> = {
  left_index1: [0.08, 0, 0.025],
  left_index2: [0.035, 0, 0],
  left_index3: [0.025, 0, 0],
  left_middle1: [0.085, 0, 0.005],
  left_middle2: [0.04, 0, 0],
  left_middle3: [0.028, 0, 0],
  left_pinky1: [0.07, 0, -0.045],
  left_pinky2: [0.025, 0, 0],
  left_pinky3: [0.018, 0, 0],
  left_ring1: [0.08, 0, -0.02],
  left_ring2: [0.035, 0, 0],
  left_ring3: [0.025, 0, 0],
  left_thumb1: [0.03, 0, 0.04],
  left_thumb2: [0.035, 0, 0.015],
  left_thumb3: [0.03, 0, 0.012],
};

export const REST_OFFSETS: Record<string, Vec3> = {
  pelvis: [0, 0, 0],
  left_hip: [0.07, -0.08, 0],
  right_hip: [-0.07, -0.08, 0],
  spine1: [0, 0.1, 0],
  left_knee: [0, -0.38, 0],
  right_knee: [0, -0.38, 0],
  spine2: [0, 0.12, 0],
  left_ankle: [0, -0.4, 0],
  right_ankle: [0, -0.4, 0],
  spine3: [0, 0.1, 0],
  left_foot: [0, -0.06, 0.12],
  right_foot: [0, -0.06, 0.12],
  neck: [0, 0.21, 0],
  left_collar: [0.08, 0.16, 0],
  right_collar: [-0.08, 0.16, 0],
  head: [0, 0.1, 0],
  left_shoulder: [0.1, 0.03, 0],
  right_shoulder: [-0.1, 0.03, 0],
  left_elbow: [0.26, 0, 0],
  right_elbow: [-0.26, 0, 0],
  left_wrist: [0.25, 0, 0],
  right_wrist: [-0.25, 0, 0],
  jaw: [0, 0.02, 0.06],
  ...LEFT_HAND_OFFSETS,
  ...Object.fromEntries(
    Object.entries(LEFT_HAND_OFFSETS).map(([name, off]) => [
      name.replace("left_", "right_"),
      mirror(off),
    ])
  ),
};

/** Joints whose motion actually carries the sign - useful for debug views. */
export const SIGNING_JOINTS = new Set<string>([
  "left_collar", "right_collar",
  "left_shoulder", "right_shoulder",
  "left_elbow", "right_elbow",
  "left_wrist", "right_wrist",
  ...HAND_JOINTS,
]);

/** Shape of a clip file written by ml/scripts/signavatars_to_rotations.py. */
export type SignerClip = {
  source: string;
  video_id: string;
  gloss: string | null;
  fps: number;
  frame_count: number;
  duration: number;
  times: number[];
  rotation_order: string;
  /** joint name -> per-frame [x, y, z, w] quaternions */
  tracks: Record<string, [number, number, number, number][]>;
};
