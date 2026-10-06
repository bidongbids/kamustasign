// Regression check: does the Three.js skeleton reproduce the source motion?
//
// SignerAvatar.tsx builds a bone hierarchy from src/lib/smplxSkeleton.ts and
// drives it with the quaternion tracks in a clip JSON. If the kinematic tree,
// the rest offsets, or the quaternion convention were wrong, the avatar would
// still animate - just incorrectly - and that is hard to catch by eye.
//
// So this rebuilds the same hierarchy in plain Three.js (no React, no canvas),
// runs the clip through it, and prints the world-space wrist trajectories.
// ml/scripts/check_rig_against_source.py then correlates those against the
// 2D keypoints stored inside the original .pkl, which are independent ground
// truth. Anything below ~0.9 means the rig is misreading the rotations.
//
// Run:  npx esbuild ml/scripts/verify_rig.ts --bundle --platform=node \
//         --format=cjs --outfile=/tmp/verify_rig.cjs && node /tmp/verify_rig.cjs

import * as THREE from "three";
import { PARENTS, REST_OFFSETS, ALL_JOINTS } from "../../src/lib/smplxSkeleton";
import clipJson from "../../src/data/signer_clips/add_00962.json";

const clip = clipJson as any;

const nodes = new Map<string, THREE.Group>();
for (const name of ALL_JOINTS) {
  const group = new THREE.Group();
  const [x, y, z] = (REST_OFFSETS as any)[name] ?? [0, 0, 0];
  group.position.set(x, y, z);
  nodes.set(name, group);
}
for (const name of ALL_JOINTS) {
  const parent = PARENTS[name];
  if (parent) nodes.get(parent)!.add(nodes.get(name)!);
}
const root = nodes.get("pelvis")!;

function poseAt(frame: number) {
  for (const [name, node] of nodes) {
    const track = clip.tracks[name];
    if (!track || !track[frame]) continue;
    const [x, y, z, w] = track[frame];
    node.quaternion.set(x, y, z, w);
  }
  root.updateMatrixWorld(true);
}

const worldOf = (name: string) =>
  nodes.get(name)!.getWorldPosition(new THREE.Vector3());

const leftWrist: number[][] = [];
const rightWrist: number[][] = [];
const leftIndexTip: number[][] = [];

for (let frame = 0; frame < clip.frame_count; frame++) {
  poseAt(frame);
  for (const [name, out] of [
    ["left_wrist", leftWrist],
    ["right_wrist", rightWrist],
    ["left_index3", leftIndexTip],
  ] as const) {
    const p = worldOf(name);
    out.push([p.x, p.y, p.z]);
  }
}

console.log(
  JSON.stringify({
    frames: clip.frame_count,
    joints: nodes.size,
    left_wrist: leftWrist,
    right_wrist: rightWrist,
    left_index3: leftIndexTip,
  })
);
