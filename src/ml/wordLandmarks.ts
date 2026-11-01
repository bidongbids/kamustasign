// Mirrors the feature extraction/normalization done in the Python training
// pipeline (ml/scripts/extract_word_landmarks.py) so live inference in the
// app matches training exactly. Any change here MUST be mirrored there and
// vice versa - a mismatch silently produces garbage predictions instead of
// an error, so keep these in lockstep.

export const NUM_POSE = 33;
export const NUM_HAND = 21;

/** Width of one raw captured frame, before normalization. */
export const FEATURES_PER_FRAME = NUM_POSE * 4 + NUM_HAND * 3 + NUM_HAND * 3; // 258

/**
 * Width of one frame AFTER normalizeSequence - what the model actually eats.
 *
 * The extra 126 values are the two wrist-relative hand blocks. The body
 * normalization divides every landmark, hands included, by shoulder width,
 * which leaves handshape as tiny perturbations on much larger arm-position
 * values. Measured effect of adding these: test top-1 went from 30.7% to
 * 65.1% at matched training budget, and the handshape confusions the model
 * was making (pink/sweet, work/appointment, yes/no) largely resolved.
 */
export const MODEL_FEATURES_PER_FRAME = FEATURES_PER_FRAME + 2 * NUM_HAND * 3; // 384

export const SEQUENCE_LENGTH = 40;

const LEFT_SHOULDER_IDX = 11;
const RIGHT_SHOULDER_IDX = 12;

// MediaPipe hand landmark indices: 0 is the wrist, 9 the middle-finger
// knuckle, whose distance from the wrist is the palm-length reference.
const HAND_WRIST_IDX = 0;
const HAND_MIDDLE_MCP_IDX = 9;

type Landmark = { x: number; y: number; z: number; visibility?: number };

// Holistic result fields may come back empty, as a flat array, or as an
// array-of-arrays depending on library version - handle both, same as the
// defensive isinstance() check on the Python side.
function firstOrSelf(arr: any): Landmark[] | null {
  if (!arr || arr.length === 0) return null;
  return Array.isArray(arr[0]) ? arr[0] : arr;
}

// Flatten one Holistic detection result into the same 258-value layout used
// in training: pose (33 x [x,y,z,visibility]) + left hand (21 x [x,y,z]) +
// right hand (21 x [x,y,z]). Missing components are left as zeros.
export function landmarksToVector(result: any): Float32Array {
  const vec = new Float32Array(FEATURES_PER_FRAME);

  const pose = firstOrSelf(result?.poseLandmarks);
  if (pose) {
    for (let i = 0; i < Math.min(NUM_POSE, pose.length); i++) {
      const lm = pose[i];
      const base = i * 4;
      vec[base] = lm.x;
      vec[base + 1] = lm.y;
      vec[base + 2] = lm.z;
      vec[base + 3] = lm.visibility ?? 0;
    }
  }

  const leftHand = firstOrSelf(result?.leftHandLandmarks);
  if (leftHand) {
    for (let i = 0; i < Math.min(NUM_HAND, leftHand.length); i++) {
      const lm = leftHand[i];
      const base = NUM_POSE * 4 + i * 3;
      vec[base] = lm.x;
      vec[base + 1] = lm.y;
      vec[base + 2] = lm.z;
    }
  }

  const rightHand = firstOrSelf(result?.rightHandLandmarks);
  if (rightHand) {
    for (let i = 0; i < Math.min(NUM_HAND, rightHand.length); i++) {
      const lm = rightHand[i];
      const base = NUM_POSE * 4 + NUM_HAND * 3 + i * 3;
      vec[base] = lm.x;
      vec[base + 1] = lm.y;
      vec[base + 2] = lm.z;
    }
  }

  return vec;
}

// Resample a variable-length recording to exactly targetLen frames, using
// the same nearest-index (np.linspace-style) sampling as extraction did.
export function resampleSequence(
  frames: Float32Array[],
  targetLen: number = SEQUENCE_LENGTH
): Float32Array[] {
  const n = frames.length;
  if (n === targetLen) return frames;
  const out: Float32Array[] = [];
  for (let i = 0; i < targetLen; i++) {
    const idx = n === 1 ? 0 : Math.round((i * (n - 1)) / (targetLen - 1));
    out.push(frames[Math.min(idx, n - 1)]);
  }
  return out;
}

// Puts a recording into the 4:3 frame shape both word models learned from:
// 640x480 webcams, FSL-105 letterboxed to 640x480 before tracking, and the
// Google dataset's portrait clips stretched to match (match_webcam_aspect in
// consolidate_combined_words.py). MediaPipe gives x as a fraction of the
// frame's width and y of its height (z in width units, like x), so a phone
// held upright (3:4) squeezes every sign sideways. Stretching y by
// (4/3)/aspect undoes that; on a 4:3 webcam it changes nothing. Offline, on
// the 1,435 held-out webcam clips cropped to 3:4 with both hands kept in
// view: ASL top-1 76.8% without this, 81.7% with it (82.4% as filmed).
// Missing landmarks are zeros and stay zeros. Apply before normalizeSequence,
// which derives the wrist-relative hand blocks from these values.
export function matchTrainingAspect(frames: Float32Array[], aspect: number): Float32Array[] {
  const f = 4 / 3 / aspect;
  if (!(aspect > 0) || Math.abs(f - 1) < 1e-3) return frames;
  return frames.map((frame) => {
    const out = frame.slice();
    for (let i = 0; i < NUM_POSE; i++) out[i * 4 + 1] *= f;
    for (let i = 0; i < 2 * NUM_HAND; i++) out[NUM_POSE * 4 + i * 3 + 1] *= f;
    return out;
  });
}

/** Frames kept either side of the hand-active span (~0.1 s at 30 fps). */
export const TRIM_MARGIN = 3;
// ASL is trimmed with no margin: the new dataset's training clips start and
// end with hands up, so a handless margin frame would mark a recording as
// "not from that dataset" (see TRIM_MARGIN in consolidate_combined_words.py).
export const ASL_TRIM_MARGIN = 0;

// Cut a raw recording down to the frames from the first to the last one with
// any hand detected, plus `margin` frames each side. Mirrors hand_span() in
// ml/scripts/consolidate_fsl_landmarks.py: both word models score clips
// trimmed this way, so input must be trimmed the same way before resampling
// or the sign lands on a different timescale than training. FSL-105 clips
// are mostly idle, hands below the frame. For ASL, the new dataset's clips
// are already cut to the signing while ours had rest at both ends, so an
// untrimmed webcam recording looked like "one of our clips" and the model
// leaned toward our 133 words (trimming took the new words recognised from
// webcam clips from 44 to 77 of 211). A recording with no hand at all is
// returned unchanged.
export function trimToHandSpan(
  frames: Float32Array[],
  margin: number = TRIM_MARGIN
): Float32Array[] {
  const handStart = NUM_POSE * 4;
  const hasHand = (f: Float32Array) => {
    for (let i = handStart; i < FEATURES_PER_FRAME; i++) if (f[i] !== 0) return true;
    return false;
  };
  let first = -1;
  let last = -1;
  frames.forEach((f, i) => {
    if (hasHand(f)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) return frames;
  return frames.slice(Math.max(0, first - margin), Math.min(frames.length, last + 1 + margin));
}

// Re-express one hand's 21 landmarks relative to that hand's own wrist,
// scaled by palm length. Mirrors wrist_relative_hand() in
// extract_word_landmarks.py. Reads RAW values: an undetected hand is all
// zeros and must stay zero, which it would not after the body normalization
// below has shifted everything by the shoulder origin.
function wristRelativeHand(raw: Float32Array, base: number, out: Float32Array, outBase: number) {
  const wx = raw[base + HAND_WRIST_IDX * 3];
  const wy = raw[base + HAND_WRIST_IDX * 3 + 1];
  const wz = raw[base + HAND_WRIST_IDX * 3 + 2];
  const mx = raw[base + HAND_MIDDLE_MCP_IDX * 3] - wx;
  const my = raw[base + HAND_MIDDLE_MCP_IDX * 3 + 1] - wy;
  const mz = raw[base + HAND_MIDDLE_MCP_IDX * 3 + 2] - wz;
  const palm = Math.sqrt(mx * mx + my * my + mz * mz);

  if (palm <= 1e-6) return; // hand not detected - leave the block zeroed

  for (let i = 0; i < NUM_HAND; i++) {
    const s = base + i * 3;
    const d = outBase + i * 3;
    out[d] = (raw[s] - wx) / palm;
    out[d + 1] = (raw[s + 1] - wy) / palm;
    out[d + 2] = (raw[s + 2] - wz) / palm;
  }
}

// Center every frame on the shoulder midpoint and scale by shoulder width -
// makes the features invariant to camera distance/position - then append the
// two wrist-relative hand blocks. Mirrors normalize_sequence() in
// extract_word_landmarks.py exactly, including the 258 -> 384 widening. Must
// run AFTER resampling, same order as the Python pipeline.
export function normalizeSequence(frames: Float32Array[]): Float32Array[] {
  const leftBase = NUM_POSE * 4;
  const rightBase = NUM_POSE * 4 + NUM_HAND * 3;

  return frames.map((frame) => {
    const vec = new Float32Array(MODEL_FEATURES_PER_FRAME);
    vec.set(frame.subarray(0, FEATURES_PER_FRAME));

    // Derived from the raw values, before the rescaling below.
    wristRelativeHand(frame, leftBase, vec, FEATURES_PER_FRAME);
    wristRelativeHand(frame, rightBase, vec, FEATURES_PER_FRAME + NUM_HAND * 3);

    const lsBase = LEFT_SHOULDER_IDX * 4;
    const rsBase = RIGHT_SHOULDER_IDX * 4;
    const ox = (vec[lsBase] + vec[rsBase]) / 2;
    const oy = (vec[lsBase + 1] + vec[rsBase + 1]) / 2;
    const oz = (vec[lsBase + 2] + vec[rsBase + 2]) / 2;
    const dx = vec[lsBase] - vec[rsBase];
    const dy = vec[lsBase + 1] - vec[rsBase + 1];
    const dz = vec[lsBase + 2] - vec[rsBase + 2];
    let scale = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (scale < 1e-6) scale = 1;

    const applyTo = (base: number) => {
      vec[base] = (vec[base] - ox) / scale;
      vec[base + 1] = (vec[base + 1] - oy) / scale;
      vec[base + 2] = (vec[base + 2] - oz) / scale;
    };

    for (let i = 0; i < NUM_POSE; i++) applyTo(i * 4);
    for (let i = 0; i < NUM_HAND; i++) applyTo(NUM_POSE * 4 + i * 3);
    for (let i = 0; i < NUM_HAND; i++) applyTo(NUM_POSE * 4 + NUM_HAND * 3 + i * 3);

    return vec;
  });
}
