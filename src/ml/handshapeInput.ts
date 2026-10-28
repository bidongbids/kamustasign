// What a fingerspelling model is fed for one hand: 21 MediaPipe landmarks
// flattened to 63 numbers. Two input formats exist, and each model folder's
// meta.json says which one it was trained on (no meta.json = "raw"):
//
//  - "raw": x, y, z exactly as MediaPipe gives them, fractions of the frame's
//    width and height. The ASL letters model.
//  - "aspect": x and z multiplied by the frame's width/height, so x and y are
//    in the same unit whatever the camera's shape. ASL numbers, FSL letters
//    and FSL numbers (ml/scripts/train_handshape_classifier.py). Those models
//    centre the hand on its wrist and scale it by the palm inside the graph,
//    so where the hand is in the frame and how near the camera stop mattering;
//    this aspect step is the one part the graph can't do, because it can't see
//    the frame.
//
// A left-handed signer is mirrored first (HandednessPicker), on the raw
// coordinates, in both formats.
import { mirrorFlatLandmarks } from "../components/HandednessPicker";

export type HandshapeInputFormat = "raw" | "aspect";

type Point = { x: number; y: number; z: number };

export function handshapeInput(
  landmarks: Point[],
  opts: { format: HandshapeInputFormat; aspect: number; mirror: boolean }
): number[] {
  let flat: number[] = [];
  for (const p of landmarks) flat.push(p.x, p.y, p.z);
  if (opts.mirror) flat = mirrorFlatLandmarks(flat);
  if (opts.format === "aspect" && opts.aspect > 0) {
    for (let i = 0; i < flat.length; i += 3) {
      flat[i] *= opts.aspect;
      flat[i + 2] *= opts.aspect;
    }
  }
  return flat;
}

/** The video frame's width/height, or 4/3 (getUserMedia's default 640x480) before it is known. */
export function frameAspect(video: { videoWidth: number; videoHeight: number } | null | undefined): number {
  return video && video.videoWidth > 0 && video.videoHeight > 0 ? video.videoWidth / video.videoHeight : 4 / 3;
}
