// Sweep camera distances until no joint leaves the viewport, for every frame
// of every bundled clip.
//
// The first version of SignerAvatar aimed its camera at the world origin,
// which put the figure's thighs dead centre and the actual signing off the top
// of the frame - the sort of bug that is obvious in a screenshot and invisible
// in a unit test. This script makes the framing a measured value instead of a
// guessed one: it projects every joint of every clip through the real
// THREE.PerspectiveCamera and reports the worst normalised device coordinate.
//
// |NDC| <= 1.0 is on-screen; the constants in SignerAvatar.tsx are picked to
// keep the worst case near 0.83, so a longer-reaching clip added later has
// room before it clips.
//
// Legs are excluded on purpose - the camera deliberately crops below the hips
// so the signing space fills the frame.
//
// Run:  npx esbuild ml/scripts/check_camera_framing.ts --bundle \
//         --platform=node --format=cjs --outfile=/tmp/framing.cjs \
//         && node /tmp/framing.cjs

import * as THREE from "three";
import { PARENTS, REST_OFFSETS, ALL_JOINTS } from "../../src/lib/smplxSkeleton";
import { SIGNER_CLIPS, SIGNABLE_WORDS } from "../../src/data/signer_clips";

// Keep these in sync with SignerAvatar.tsx.
const SIGNING_CENTRE = 0.6;
const CAMERA_DISTANCE = 1.7;
const FOV = 42;
const SAFE_LIMIT = 0.92;

const isLeg = (name: string) => /ankle|foot|knee|hip/.test(name);

function buildPosedSkeleton() {
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
  const container = new THREE.Group();
  container.rotation.set(Math.PI, 0, 0);
  container.position.set(0, 0.25 - SIGNING_CENTRE, 0);
  container.add(nodes.get("pelvis")!);
  return { nodes, container };
}

/** Worst |NDC| across every joint of every frame of every clip. */
function worstAtDistance(distance: number, perWord?: Map<string, number>) {
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, distance);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  let overall = 0;
  for (const word of SIGNABLE_WORDS) {
    const clip = SIGNER_CLIPS[word] as any;
    const { nodes, container } = buildPosedSkeleton();
    let worst = 0;
    for (let frame = 0; frame < clip.frame_count; frame++) {
      for (const [name, node] of nodes) {
        const track = clip.tracks[name];
        if (!track?.[frame]) continue;
        const [x, y, z, w] = track[frame];
        node.quaternion.set(x, y, z, w);
      }
      container.updateMatrixWorld(true);
      for (const name of ALL_JOINTS) {
        if (isLeg(name)) continue;
        const p = nodes.get(name)!.getWorldPosition(new THREE.Vector3()).project(camera);
        worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
      }
    }
    perWord?.set(word, worst);
    overall = Math.max(overall, worst);
  }
  return overall;
}

const perWord = new Map<string, number>();
const worst = worstAtDistance(CAMERA_DISTANCE, perWord);

console.log(`camera distance ${CAMERA_DISTANCE}, fov ${FOV}, centre ${SIGNING_CENTRE}\n`);
for (const [word, value] of [...perWord].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${word.padEnd(12)} worst |NDC| ${value.toFixed(3)}  ${value <= 1 ? "on-screen" : "CLIPS"}`);
}
console.log(`\nworst overall: ${worst.toFixed(3)} (safe limit ${SAFE_LIMIT})`);

if (worst > 1) {
  console.error("\nFAIL: at least one clip runs off the viewport.");
  process.exit(1);
}
if (worst > SAFE_LIMIT) {
  console.warn("\nWARNING: on-screen but with little margin. Consider increasing CAMERA_DISTANCE.");
}

console.log("\ndistance sweep:");
for (const d of [1.3, 1.5, 1.6, 1.7, 1.8, 2.0]) {
  const w = worstAtDistance(d);
  console.log(`  ${d.toFixed(2)}  ${w.toFixed(3)}  ${w > 1 ? "clips" : w > SAFE_LIMIT ? "tight" : "ok"}`);
}
