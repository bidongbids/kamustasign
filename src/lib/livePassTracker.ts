// The Letters/Numbers practice pass rule, as a pure state machine so it can
// be tested without a camera (LiveTranslatorScreen feeds it every classified
// frame). A pass needs the target recognised at PASS_CONFIDENCE or more,
// held for LIVE_PASS_HOLD_MS; after a pass the student must let go of the
// sign (or lower the hand) before the next one can count.
import { LIVE_PASS_HOLD_MS, PASS_CONFIDENCE } from "./curriculum";

export type LivePassReport = { passed: boolean; confidence: number };

export type LivePassUpdate = {
  /** Hold-ring progress 0-1 (1 = passed and still held). */
  hold: number;
  /** Results to send to onPracticeResult, in order (usually none). */
  reports: LivePassReport[];
};

export class LivePassTracker {
  private started = false;
  private best = 0;
  private armed = true;
  private holdStart: number | null = null;

  constructor(
    private readonly holdMs = LIVE_PASS_HOLD_MS,
    private readonly passConfidence = PASS_CONFIDENCE
  ) {}

  /** New target sign: forget the best score and any hold in progress. */
  reset() {
    this.started = false;
    this.best = 0;
    this.armed = true;
    this.holdStart = null;
  }

  /** No hand in frame: drops the hold and re-arms, keeps the best score. */
  handLost(): number {
    this.holdStart = null;
    this.armed = true;
    return 0;
  }

  /** One classified frame. `confidence` is 0-1. */
  frame(target: string, label: string, confidence: number, nowMs: number): LivePassUpdate {
    const reports: LivePassReport[] = [];
    // The first frame tells the caller an attempt has started (an "attempt"
    // is counted even if it never passes).
    if (!this.started) {
      this.started = true;
      reports.push({ passed: false, confidence: 0 });
    }
    if (label === target && confidence > this.best) {
      this.best = confidence;
      reports.push({ passed: false, confidence: this.best });
    }

    const onTarget = label === target && confidence >= this.passConfidence;
    if (!onTarget) {
      // Letting go of the sign re-arms the next pass.
      this.holdStart = null;
      this.armed = true;
      return { hold: 0, reports };
    }
    if (!this.armed) return { hold: 1, reports };
    if (this.holdStart === null) {
      this.holdStart = nowMs;
      return { hold: 0.02, reports };
    }
    if (nowMs - this.holdStart >= this.holdMs) {
      this.armed = false;
      this.holdStart = null;
      reports.push({ passed: true, confidence });
      return { hold: 1, reports };
    }
    return { hold: (nowMs - this.holdStart) / this.holdMs, reports };
  }
}
