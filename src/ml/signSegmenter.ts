// Hands-free mode for the Words screen: decides when a sign starts and ends
// from hand movement, so nobody has to press Record/Stop. Each finished
// segment is classified exactly like a manual recording.
//
// Same idea as a movement-gated demo such as ash-sid.github.io/sign-recognition
// (a sign is a burst of hand movement between pauses), but the model runs
// ONCE per segment rather than every frame: our 4-model ensemble is too heavy
// for per-frame inference, and the word models were trained on one whole
// clip -> one word, which is exactly what a segment is.
//
// Pure logic, no React or MediaPipe: push() takes the same 258-value raw
// frames landmarksToVector() produces, plus a timestamp.
//
// Thresholds are in shoulder-widths per second (distance- and fps-invariant),
// calibrated on the FSL-105 landmark cache: hand speed during signs has a
// median of ~1.7 and a 25th percentile of ~0.66 (holds within a sign), while
// MediaPipe jitter on a hand at rest is ~0.1-0.4.
//
// 2026-11-03, two fixes from replaying recorded signs through this class
// offline (FSL-105's unseen signer, our own recordings, ASL Citizen's
// held-out webcam signers) and scoring the segments with the deployed models
// under the practice pass rule:
//  - The finished segment no longer keeps the trailing stillness. A student
//    who pauses with their hands up (as the screen used to ask) added ~0.5 s
//    of a frozen hand to every clip, squeezing the sign into fewer of the
//    model's 40 frames: FSL passes fell from 80% to 65%.
//  - Speed smoothing is per millisecond, not per frame. Tracking runs at
//    ~12-15 fps on our laptop and less on older PCs; per-frame smoothing
//    made the speed lag by several frames there, so onsets were cut and a
//    still hand took over a second to count as still (at 6 fps, almost half
//    the held signs never finished being read).
// Together, holding the hands up at 15 fps: FSL 65% -> 76% passed, ASL 30%
// -> 40%, our recordings 89% -> 96%; at 6 fps FSL 32% -> 74%.

import { FEATURES_PER_FRAME, NUM_HAND, NUM_POSE } from "./wordLandmarks";

export type SegmenterConfig = {
  /** Smoothed hand speed that starts a sign. */
  startSpeed: number;
  /** Below this (or no hand visible) counts as stillness. */
  stopSpeed: number;
  /** Stillness this long ends the sign. Shorter holds stay inside it. */
  holdMs: number;
  /** Segments shorter than this are discarded as twitches. */
  minSignMs: number;
  /** A sign longer than this is cut and classified anyway. */
  maxSignMs: number;
  /** Frames from just before the start are kept so the onset isn't lost. */
  prerollMs: number;
  /**
   * Time constant of the speed smoothing (an exponential moving average
   * weighted by elapsed time, so it behaves the same at any frame rate;
   * 65 ms gives the newest sample the old 0.4 weight at 30 fps).
   */
  smoothingMs: number;
  /**
   * Stillness kept at the end of a finished segment. The rest of the
   * holdMs wait is dropped: it is a frozen hand, not part of the sign.
   */
  tailMs: number;
  /**
   * After a sign ends, the next can't start until the hands have left the
   * frame or stayed still this long. Without it, lowering the arm after a
   * held handshape (numbers, colours) reads as a second, bogus sign: on the
   * FSL-105 held-out signer, 20% of clips split in two that way, almost all
   * restarting within 1-2 frames of the first segment ending. With this and
   * holdMs 550 it's 9%, and most of those re-read the same word (which the
   * Words screen doesn't re-speak).
   */
  rearmMs: number;
};

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  startSpeed: 0.8,
  stopSpeed: 0.35,
  holdMs: 550,
  minSignMs: 300,
  maxSignMs: 5000,
  prerollMs: 300,
  smoothingMs: 65,
  tailMs: 100,
  rearmMs: 500,
};

export type SegmentEvent =
  | { type: "start" }
  | { type: "end"; frames: Float32Array[] }
  | { type: "discard"; reason: "too-short" };

type Stamped = { frame: Float32Array; t: number };

const POSE_STRIDE = 4;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const HAND_BASES = [NUM_POSE * 4, NUM_POSE * 4 + NUM_HAND * 3];

function handVisible(f: Float32Array, base: number) {
  for (let i = base; i < base + NUM_HAND * 3; i++) if (f[i] !== 0) return true;
  return false;
}

export function anyHandVisible(f: Float32Array) {
  return HAND_BASES.some((b) => handVisible(f, b));
}

function shoulderWidth(f: Float32Array) {
  const l = LEFT_SHOULDER * POSE_STRIDE;
  const r = RIGHT_SHOULDER * POSE_STRIDE;
  const w = Math.hypot(f[l] - f[r], f[l + 1] - f[r + 1]);
  return w > 1e-6 ? w : null;
}

/**
 * Speed of the faster-moving hand between two raw frames, in shoulder-widths
 * per second: mean 2-D displacement of its 21 landmarks. 0 when no hand is
 * visible in both frames or the shoulders aren't tracked.
 */
export function handSpeed(prev: Float32Array, cur: Float32Array, dtMs: number) {
  if (dtMs <= 0 || prev.length < FEATURES_PER_FRAME) return 0;
  const sw = shoulderWidth(cur);
  if (!sw) return 0;
  let best = 0;
  for (const base of HAND_BASES) {
    if (!handVisible(prev, base) || !handVisible(cur, base)) continue;
    let sum = 0;
    for (let i = 0; i < NUM_HAND; i++) {
      const k = base + i * 3;
      sum += Math.hypot(cur[k] - prev[k], cur[k + 1] - prev[k + 1]);
    }
    best = Math.max(best, sum / NUM_HAND);
  }
  return best / sw / (dtMs / 1000);
}

export class SignSegmenter {
  private cfg: SegmenterConfig;
  private preroll: Stamped[] = [];
  private segment: Stamped[] = [];
  private active = false;
  private stillSince: number | null = null;
  // Set when a sign ends; cleared once the hands leave or settle (rearmMs).
  private cooling = false;
  private calmSince: number | null = null;
  private prev: Stamped | null = null;
  private speed = 0;

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.cfg = { ...DEFAULT_SEGMENTER_CONFIG, ...config };
  }

  get isActive() {
    return this.active;
  }

  /** Frames in the current segment (0 when idle). */
  get length() {
    return this.active ? this.segment.length : 0;
  }

  /** Smoothed hand speed after the last push - for a debug readout. */
  get currentSpeed() {
    return this.speed;
  }

  reset() {
    this.preroll = [];
    this.segment = [];
    this.active = false;
    this.stillSince = null;
    this.cooling = false;
    this.calmSince = null;
    this.prev = null;
    this.speed = 0;
  }

  push(frame: Float32Array, t: number): SegmentEvent | null {
    const cfg = this.cfg;
    const dt = this.prev ? t - this.prev.t : 0;
    const raw = this.prev ? handSpeed(this.prev.frame, frame, dt) : 0;
    const weight = dt > 0 ? 1 - Math.exp(-dt / cfg.smoothingMs) : 0;
    this.speed = weight * raw + (1 - weight) * this.speed;
    this.prev = { frame, t };
    const stamped = { frame, t };
    const visible = anyHandVisible(frame);

    if (!this.active) {
      this.preroll.push(stamped);
      while (this.preroll.length && t - this.preroll[0].t > cfg.prerollMs) this.preroll.shift();
      if (this.cooling) {
        if (!visible) {
          this.cooling = false;
        } else if (this.speed < cfg.stopSpeed) {
          if (this.calmSince === null) this.calmSince = t;
          if (t - this.calmSince >= cfg.rearmMs) this.cooling = false;
        } else {
          this.calmSince = null;
        }
        if (this.cooling) return null;
      }
      if (visible && this.speed >= cfg.startSpeed) {
        this.active = true;
        this.segment = this.preroll;
        this.preroll = [];
        this.stillSince = null;
        return { type: "start" };
      }
      return null;
    }

    this.segment.push(stamped);
    const still = !visible || this.speed < cfg.stopSpeed;
    if (still) {
      if (this.stillSince === null) this.stillSince = t;
    } else {
      this.stillSince = null;
    }

    const duration = t - this.segment[0].t;
    const settled = this.stillSince !== null && t - this.stillSince >= cfg.holdMs;
    if (!settled && duration < cfg.maxSignMs) return null;

    // Sign over. Duration of actual signing excludes the trailing stillness,
    // and so do the frames, but for tailMs of it.
    const stillAt = this.stillSince;
    const kept = stillAt === null ? this.segment : this.segment.filter((s) => s.t <= stillAt + cfg.tailMs);
    const frames = kept.map((s) => s.frame);
    const signingMs = (stillAt ?? t) - this.segment[0].t;
    this.active = false;
    this.segment = [];
    this.stillSince = null;
    this.cooling = true;
    this.calmSince = null;
    if (signingMs < cfg.minSignMs) return { type: "discard", reason: "too-short" };
    return { type: "end", frames };
  }
}
