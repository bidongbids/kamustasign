// 3D signing avatar - plays back SMPL-X rotation clips on a procedural skeleton.
//
// Why a procedural skeleton instead of a downloaded Mixamo/Ready Player Me
// character: the clips are SMPL-X joint rotations, so the fastest correct
// thing to render them on is the SMPL-X skeleton itself. That means zero
// retargeting (the rotations apply 1:1), zero external asset downloads, and
// no bone-name mapping to get wrong. Once this reads as convincing, swapping
// in a skinned humanoid is a separate, isolated problem: map SMPL-X joint
// names onto that rig's bone names and account for its rest pose.
//
// Clip files come from ml/scripts/signavatars_to_rotations.py. Skeleton
// definition lives in src/lib/smplxSkeleton.ts.

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  PARENTS,
  REST_OFFSETS,
  ALL_JOINTS,
  SIGNING_JOINTS,
  type SignerClip,
} from "../lib/smplxSkeleton";
import { colors } from "../theme/theme";

const LIMB_COLOR = new THREE.Color("#8E97A8");
const SIGNING_LIMB_COLOR = new THREE.Color(colors.primaryTeal);
const JOINT_COLOR = new THREE.Color(colors.accentCoral);
const SKIN_COLOR = new THREE.Color("#E8B48C");

const FINGER_PATTERN = /thumb|index|middle|pinky|ring/;
const isFinger = (name: string) => FINGER_PATTERN.test(name);

/**
 * Bone thickness as [base, tip] radii, in metres.
 *
 * Fingers need roughly a quarter of the arm's thickness and must taper, or
 * they read as sausages. The proximal segment of each finger is thicker than
 * the two beyond it, same as a real hand.
 */
function limbRadii(name: string): [number, number] {
  if (!isFinger(name)) return [0.022, 0.022];
  if (name.endsWith("1")) return [0.0085, 0.0075];
  if (name.endsWith("2")) return [0.0075, 0.0065];
  return [0.0065, 0.005];
}

/** Marker sphere radius in metres; 0 means draw no marker at all. */
function markerRadius(name: string): number {
  if (isFinger(name)) {
    // Knuckles only, and small. Tip joints get nothing - the tapered bone end
    // already reads as a fingertip.
    return name.endsWith("3") ? 0 : 0.0065;
  }
  if (name.endsWith("wrist")) return 0.017;
  if (name === "jaw") return 0;
  return SIGNING_JOINTS.has(name) ? 0.024 : 0.014;
}

type BuiltSkeleton = {
  root: THREE.Group;
  nodes: Map<string, THREE.Group>;
};

/**
 * Build one THREE.Group per joint, nested to match the SMPL-X kinematic tree.
 *
 * Each joint's group sits at its rest offset inside its parent, so setting a
 * group's quaternion rotates that joint and everything below it - standard
 * bone semantics. The limb *visual* for the bone parent->child is drawn inside
 * the parent (it's fixed in the parent's frame), which is why the meshes are
 * added to `parentNode` rather than to the joint's own group.
 */
function buildSkeleton(): BuiltSkeleton {
  const nodes = new Map<string, THREE.Group>();

  for (const name of ALL_JOINTS) {
    const group = new THREE.Group();
    group.name = name;
    const [x, y, z] = REST_OFFSETS[name] ?? [0, 0, 0];
    group.position.set(x, y, z);
    nodes.set(name, group);
  }

  const jointGeo = new THREE.SphereGeometry(1, 12, 10);

  for (const name of ALL_JOINTS) {
    const node = nodes.get(name)!;
    const parentName = PARENTS[name];
    const parentNode = parentName ? nodes.get(parentName) : null;

    if (parentNode) {
      parentNode.add(node);

      // Limb from the parent's origin out to this joint's rest position.
      const offset = new THREE.Vector3(...(REST_OFFSETS[name] ?? [0, 0, 0]));
      const length = offset.length();
      if (length > 1e-4) {
        // Finger bones taper toward the fingertip, which reads far more like a
        // hand than uniform tubes do.
        const [base, tip] = limbRadii(name);
        const limbGeo = new THREE.CylinderGeometry(tip, base, length, 10);
        // Cylinders are built along +Y; aim it down the offset direction.
        limbGeo.translate(0, length / 2, 0);
        limbGeo.rotateX(Math.PI / 2);
        const limb = new THREE.Mesh(
          limbGeo,
          new THREE.MeshStandardMaterial({
            color: isFinger(name) ? SKIN_COLOR
              : SIGNING_JOINTS.has(name) ? SIGNING_LIMB_COLOR
              : LIMB_COLOR,
            roughness: isFinger(name) ? 0.75 : 0.55,
            metalness: 0.05,
          })
        );
        limb.lookAt(offset);
        parentNode.add(limb);
      }
    }

    // Joint markers. Finger knuckles have to be tiny and skin-coloured or they
    // swallow the bones they sit on - a 0.026 sphere on a 0.025 finger segment
    // turns the whole hand into one undifferentiated blob.
    const radius = markerRadius(name);
    if (radius > 0) {
      const marker = new THREE.Mesh(
        jointGeo,
        new THREE.MeshStandardMaterial({
          color: isFinger(name) || name.endsWith("wrist") ? SKIN_COLOR : JOINT_COLOR,
          roughness: isFinger(name) ? 0.75 : 0.4,
        })
      );
      marker.scale.setScalar(radius);
      node.add(marker);
    }

    // Give each hand some palm mass, so the fingers read as attached to
    // something rather than radiating out of a point.
    if (name.endsWith("wrist")) {
      const side = name.startsWith("left") ? 1 : -1;
      const palm = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshStandardMaterial({ color: SKIN_COLOR, roughness: 0.75 })
      );
      // Flattened ellipsoid spanning wrist -> knuckles, wide across the
      // knuckle line and thin front-to-back, like an actual palm.
      palm.scale.set(0.045, 0.014, 0.038);
      palm.position.set(side * 0.042, 0, -0.008);
      node.add(palm);
    }
  }

  return { root: nodes.get("pelvis")!, nodes };
}

type RigProps = {
  clip: SignerClip;
  playing: boolean;
  speed: number;
  onFrame?: (frame: number) => void;
};

function Rig({ clip, playing, speed, onFrame }: RigProps) {
  const { root, nodes } = useMemo(() => buildSkeleton(), []);
  const elapsed = useRef(0);
  const lastReported = useRef(-1);
  const scratch = useRef(new THREE.Quaternion());

  // Reset playback whenever a different clip is loaded.
  useEffect(() => {
    elapsed.current = 0;
    lastReported.current = -1;
  }, [clip]);

  useFrame((_, delta) => {
    if (playing) elapsed.current += delta * speed;

    const frame = clip.frame_count
      ? Math.floor((elapsed.current * clip.fps) % clip.frame_count)
      : 0;

    for (const [name, node] of nodes) {
      const track = clip.tracks[name];
      if (!track) continue;
      const q = track[frame];
      if (!q) continue;
      scratch.current.set(q[0], q[1], q[2], q[3]);
      node.quaternion.copy(scratch.current);
    }

    if (onFrame && frame !== lastReported.current) {
      lastReported.current = frame;
      onFrame(frame);
    }
  });

  // Two things happen here.
  //
  // The rotation cancels the 180-degree flip about X that the clips carry in
  // their root track (SMPL-X stores camera-space orientation, where Y grows
  // downward). Doing it at the container leaves the clip data untouched.
  //
  // The Y offset frames the camera on the signing space. Measured on the
  // upright figure, the pelvis sits at Y 0.25, head at 0.88, and the wrists
  // travel 0.42-0.78 - so signing happens well above the origin. Without this
  // shift a camera aimed at the origin stares at the figure's thighs. Dropping
  // the rig by SIGNING_CENTRE puts the chest-to-head band on the view axis.
  return (
    <group rotation={[Math.PI, 0, 0]} position={[0, 0.25 - SIGNING_CENTRE, 0]}>
      <primitive object={root} />
    </group>
  );
}

/** World Y of the middle of the signing band, on the un-offset figure. */
const SIGNING_CENTRE = 0.6;

/**
 * Camera distance, chosen by measurement rather than taste: every frame of all
 * seven bundled clips was projected through this camera and the distance swept
 * until nothing left the viewport. 1.3 clipped three words (hands at full
 * extension ran off the sides, and "apple" went off the top); 1.6 was the
 * first safe value, and 1.7 leaves the worst joint at 0.83 of half-frame -
 * enough headroom that a longer-reaching clip won't immediately clip.
 *
 * Re-run ml/scripts/ frame sweep if the clip set changes substantially.
 */
const CAMERA_DISTANCE = 1.7;

export type SignerAvatarProps = {
  clip: SignerClip;
  playing?: boolean;
  speed?: number;
  onFrame?: (frame: number) => void;
};

export default function SignerAvatar({
  clip,
  playing = true,
  speed = 1,
  onFrame,
}: SignerAvatarProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, CAMERA_DISTANCE], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.85} />
      <directionalLight position={[2, 3, 4]} intensity={1.1} />
      <directionalLight position={[-3, 1, -2]} intensity={0.4} />
      <Rig clip={clip} playing={playing} speed={speed} onFrame={onFrame} />
    </Canvas>
  );
}
