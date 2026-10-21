import { LivePassTracker } from "../lib/livePassTracker";
import { LIVE_PASS_HOLD_MS, PASS_CONFIDENCE } from "../lib/curriculum";

const HIGH = Math.min(1, PASS_CONFIDENCE + 0.1);
const LOW = PASS_CONFIDENCE - 0.2;

describe("LivePassTracker", () => {
  it("reports the attempt start on the first frame", () => {
    const t = new LivePassTracker();
    const u = t.frame("A", "B", 0.9, 0);
    expect(u.reports[0]).toEqual({ passed: false, confidence: 0 });
    expect(u.hold).toBe(0);
  });

  it("passes after holding the target for LIVE_PASS_HOLD_MS", () => {
    const t = new LivePassTracker();
    expect(t.frame("A", "A", HIGH, 0).hold).toBeCloseTo(0.02);
    const mid = t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS / 2);
    expect(mid.hold).toBeCloseTo(0.5);
    expect(mid.reports.some((r) => r.passed)).toBe(false);
    const done = t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS);
    expect(done.hold).toBe(1);
    expect(done.reports).toContainEqual({ passed: true, confidence: HIGH });
  });

  it("does not pass below PASS_CONFIDENCE, however long it is held", () => {
    const t = new LivePassTracker();
    for (let ms = 0; ms <= LIVE_PASS_HOLD_MS * 4; ms += 33) {
      const u = t.frame("A", "A", LOW, ms);
      expect(u.reports.some((r) => r.passed)).toBe(false);
      expect(u.hold).toBe(0);
    }
  });

  it("restarts the hold when the target flickers off", () => {
    const t = new LivePassTracker();
    t.frame("A", "A", HIGH, 0);
    t.frame("A", "B", HIGH, LIVE_PASS_HOLD_MS * 0.8); // one wrong frame
    const u = t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 1.1);
    expect(u.reports.some((r) => r.passed)).toBe(false);
  });

  it("counts one pass per hold; letting go re-arms", () => {
    const t = new LivePassTracker();
    t.frame("A", "A", HIGH, 0);
    t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS);
    // Still holding: ring stays full, no second pass.
    const still = t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 3);
    expect(still.hold).toBe(1);
    expect(still.reports.some((r) => r.passed)).toBe(false);
    // Let go, then hold again: a second pass.
    t.frame("A", "B", 0.9, LIVE_PASS_HOLD_MS * 4);
    t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 5);
    const again = t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 6);
    expect(again.reports.some((r) => r.passed)).toBe(true);
  });

  it("handLost re-arms after a pass", () => {
    const t = new LivePassTracker();
    t.frame("A", "A", HIGH, 0);
    t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS);
    expect(t.handLost()).toBe(0);
    t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 2);
    expect(t.frame("A", "A", HIGH, LIVE_PASS_HOLD_MS * 3).reports.some((r) => r.passed)).toBe(true);
  });

  it("reports a new best confidence only when it improves", () => {
    const t = new LivePassTracker();
    expect(t.frame("A", "A", 0.5, 0).reports).toContainEqual({ passed: false, confidence: 0.5 });
    expect(t.frame("A", "A", 0.4, 33).reports).toEqual([]);
    expect(t.frame("A", "A", 0.6, 66).reports).toEqual([{ passed: false, confidence: 0.6 }]);
  });

  it("reset forgets the best score and re-announces the attempt", () => {
    const t = new LivePassTracker();
    t.frame("A", "A", 0.7, 0);
    t.reset();
    const u = t.frame("B", "B", 0.3, 33);
    expect(u.reports).toEqual([
      { passed: false, confidence: 0 },
      { passed: false, confidence: 0.3 },
    ]);
  });
});
