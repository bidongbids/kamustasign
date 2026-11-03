import { SignSegmenter, anyHandVisible, handSpeed, type SegmentEvent } from "../ml/signSegmenter";
import { FEATURES_PER_FRAME, NUM_HAND, NUM_POSE } from "../ml/wordLandmarks";

// Synthetic raw frames: shoulders 0.2 apart (one shoulder-width), right hand
// as 21 landmarks at the same point, so speeds are easy to reason about.
const FRAME_MS = 33;
const SHOULDER_WIDTH = 0.2;
const RIGHT_HAND_BASE = NUM_POSE * 4 + NUM_HAND * 3;

function frame(handX: number | null): Float32Array {
  const f = new Float32Array(FEATURES_PER_FRAME);
  f[11 * 4] = 0.4; // left shoulder x
  f[11 * 4 + 1] = 0.5;
  f[12 * 4] = 0.4 + SHOULDER_WIDTH; // right shoulder x
  f[12 * 4 + 1] = 0.5;
  if (handX !== null) {
    for (let i = 0; i < NUM_HAND; i++) {
      f[RIGHT_HAND_BASE + i * 3] = handX;
      f[RIGHT_HAND_BASE + i * 3 + 1] = 0.6;
    }
  }
  return f;
}

/** Hand displacement per frame that gives `speed` shoulder-widths per second. */
const stepFor = (speed: number) => speed * SHOULDER_WIDTH * (FRAME_MS / 1000);

type Phase = { frames: number; speed?: number; hand?: boolean };

/** Feeds phases of motion and returns every event with the frame index it fired on. */
function run(seg: SignSegmenter, phases: Phase[]) {
  const events: { i: number; e: SegmentEvent }[] = [];
  let x = 0.5;
  let i = 0;
  for (const p of phases) {
    for (let k = 0; k < p.frames; k++, i++) {
      if (p.hand !== false) x += stepFor(p.speed ?? 0);
      const e = seg.push(frame(p.hand === false ? null : x), i * FRAME_MS);
      if (e) events.push({ i, e });
    }
  }
  return events;
}

describe("handSpeed", () => {
  it("measures speed in shoulder-widths per second", () => {
    const a = frame(0.5);
    const b = frame(0.5 + stepFor(2));
    expect(handSpeed(a, b, FRAME_MS)).toBeCloseTo(2, 5);
  });

  it("is 0 when the hand is missing in either frame", () => {
    expect(handSpeed(frame(null), frame(0.5), FRAME_MS)).toBe(0);
    expect(handSpeed(frame(0.5), frame(null), FRAME_MS)).toBe(0);
  });

  it("is 0 for a non-positive time step", () => {
    expect(handSpeed(frame(0.5), frame(0.6), 0)).toBe(0);
  });
});

describe("anyHandVisible", () => {
  it("detects a visible hand", () => {
    expect(anyHandVisible(frame(0.5))).toBe(true);
    expect(anyHandVisible(frame(null))).toBe(false);
  });
});

describe("SignSegmenter", () => {
  it("emits start then end for a movement burst followed by stillness", () => {
    const seg = new SignSegmenter();
    const events = run(seg, [
      { frames: 10, speed: 0 }, // resting hand
      { frames: 25, speed: 2 }, // ~0.8s of signing
      { frames: 30, speed: 0 }, // ~1s still: longer than holdMs
    ]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end"]);
    const end = events[1].e as Extract<SegmentEvent, { type: "end" }>;
    // Includes the pre-roll, not just the moving frames...
    expect(end.frames.length).toBeGreaterThan(25);
    expect(seg.isActive).toBe(false);
  });

  it("drops the trailing stillness from the finished sign (all but tailMs)", () => {
    const seg = new SignSegmenter();
    const events = run(seg, [
      { frames: 10, speed: 0 },
      { frames: 25, speed: 2 },
      { frames: 30, speed: 0 }, // the hand stays up, frozen
    ]);
    const end = events.find((x) => x.e.type === "end")!.e as Extract<SegmentEvent, { type: "end" }>;
    // pre-roll (~10 frames) + 25 moving + the speed settling (~4) + tailMs (~3).
    // Keeping the whole holdMs wait would add ~17 frozen frames more.
    expect(end.frames.length).toBeLessThanOrEqual(25 + 10 + 4 + 4);
  });

  it("reads a sign the same way at a low frame rate", () => {
    // 6 fps, like a slow PC: ~1 s of signing, then a frozen hand.
    const ms = 167;
    const seg = new SignSegmenter();
    const events: { t: number; e: SegmentEvent }[] = [];
    let x = 0.5;
    let t = 0;
    const push = (n: number, speed: number) => {
      for (let k = 0; k < n; k++, t += ms) {
        x += speed * SHOULDER_WIDTH * (ms / 1000);
        const e = seg.push(frame(x), t);
        if (e) events.push({ t, e });
      }
    };
    push(3, 0);
    push(6, 2);
    const stoppedAt = t;
    push(10, 0);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end"]);
    // Ends about holdMs after the hand stops: per-frame smoothing used to
    // take several extra frames (~0.5 s more) to see the stillness here.
    expect(events[1].t - stoppedAt).toBeLessThanOrEqual(550 + 2 * ms);
  });

  it("keeps a short pause inside one sign", () => {
    const seg = new SignSegmenter();
    const events = run(seg, [
      { frames: 15, speed: 2 },
      { frames: 6, speed: 0 }, // ~200ms hold, under holdMs
      { frames: 15, speed: 2 },
      { frames: 30, speed: 0 },
    ]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end"]);
  });

  it("discards a twitch shorter than minSignMs", () => {
    const seg = new SignSegmenter({ prerollMs: 0 });
    const events = run(seg, [
      { frames: 2, speed: 3 },
      { frames: 40, speed: 0 },
    ]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "discard"]);
  });

  it("ends the sign when the hands leave the frame", () => {
    const seg = new SignSegmenter();
    const events = run(seg, [
      { frames: 20, speed: 2 },
      { frames: 30, hand: false },
    ]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end"]);
  });

  it("cuts a sign that runs past maxSignMs", () => {
    const seg = new SignSegmenter({ maxSignMs: 1000 });
    const events = run(seg, [{ frames: 40, speed: 2 }]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end"]);
    expect(events[1].i * FRAME_MS).toBeLessThanOrEqual(1100);
  });

  it("does not re-arm while the hand keeps moving after a sign (rearmMs)", () => {
    const seg = new SignSegmenter({ maxSignMs: 600 });
    // Continuous motion: the first sign is cut at maxSignMs, and the arm
    // still moving afterwards must not immediately start a second one.
    const events = run(seg, [{ frames: 40, speed: 2 }]);
    expect(events.filter((x) => x.e.type === "start")).toHaveLength(1);
  });

  it("re-arms once the hand has settled for rearmMs", () => {
    const seg = new SignSegmenter();
    const events = run(seg, [
      { frames: 20, speed: 2 },
      { frames: 40, speed: 0 }, // hold ends the sign, then settles past rearmMs
      { frames: 20, speed: 2 },
      { frames: 40, speed: 0 },
    ]);
    expect(events.map((x) => x.e.type)).toEqual(["start", "end", "start", "end"]);
  });

  it("reset() drops an in-progress segment", () => {
    const seg = new SignSegmenter();
    run(seg, [{ frames: 10, speed: 2 }]);
    expect(seg.isActive).toBe(true);
    seg.reset();
    expect(seg.isActive).toBe(false);
    expect(seg.length).toBe(0);
  });
});
