// In-call practice: the teacher asks the student to make one sign, and the
// student's own device checks it with the same rules as the classroom
// practice screen - letters must hold the target at PASS_CONFIDENCE for
// LIVE_PASS_HOLD_MS (LivePassTracker), a word clip must be the target at
// PASS_CONFIDENCE. Pure, so it can be tested without a camera; the call
// screen feeds it the sign reader's readings (useCallSignReader onReading).
import { PASS_CONFIDENCE, getGroup, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "./curriculum";
import { LivePassTracker } from "./livePassTracker";
import type { CallModelKey, PracticeResult } from "./callSignaling";
import type { CallPracticeEntry } from "./queries";
import type { SignReading } from "../hooks/useCallSignReader";

export function callModelScope(key: CallModelKey): { language: SignLanguage; group: SignGroup } {
  const [language, group] = key.split("-") as [SignLanguage, SignGroup];
  return { language, group };
}

/** The signs a teacher can ask for with this model: the class plan's words, or every letter. */
export function practiceSignsFor(key: CallModelKey, plan?: ClassPlan | null): string[] {
  const { language, group } = callModelScope(key);
  return group === "words" ? planSigns(language, group, plan) : getGroup(language, group).signs;
}

/** An attempt that is over: what to record and tell the teacher. */
export type PracticeAttempt = { passed: boolean; seen: string | null; confidence: number };

// A letters attempt that never passed ends when the hand goes away - but
// only after this many frames, so a flicker of the hand isn't a "try".
const MIN_FRAMES_FOR_TRY = 8;

export class CallPracticeGrader {
  private tracker = new LivePassTracker();
  /** Letters: how far the current hold is toward a pass, 0-1 (the student's ring). */
  hold = 0;
  private frames = 0;
  private best = 0;
  private lastSeen: string | null = null;
  private passedThisHold = false;

  constructor(
    readonly sign: string,
    readonly group: SignGroup
  ) {}

  /** One reading; returns a finished attempt, or null. */
  push(r: SignReading): PracticeAttempt | null {
    if (this.group === "words") {
      if (r.kind !== "clip") return null;
      const passed = r.label === this.sign && r.confidence >= PASS_CONFIDENCE;
      return { passed, seen: r.label, confidence: r.label === this.sign ? r.confidence : 0 };
    }
    if (r.kind === "no-hand") {
      this.hold = this.tracker.handLost();
      const tried = this.frames >= MIN_FRAMES_FOR_TRY && !this.passedThisHold;
      const attempt = tried ? { passed: false, seen: this.lastSeen, confidence: this.best } : null;
      this.frames = 0;
      this.best = 0;
      this.lastSeen = null;
      this.passedThisHold = false;
      return attempt;
    }
    if (r.kind !== "frame") return null;
    this.frames += 1;
    if (r.confidence >= 0.6) this.lastSeen = r.label;
    if (r.label === this.sign) this.best = Math.max(this.best, r.confidence);
    const update = this.tracker.frame(this.sign, r.label, r.confidence, r.at);
    this.hold = update.hold;
    const pass = update.reports.find((x) => x.passed);
    if (pass) {
      this.passedThisHold = true;
      return { passed: true, seen: this.sign, confidence: pass.confidence };
    }
    return null;
  }
}

/** One line per sign asked for in a call, for the notes: passed if any try passed. */
export function summarizePractice(results: PracticeResult[], key: CallModelKey | ((r: PracticeResult) => CallModelKey)): CallPracticeEntry[] {
  const byRequest = new Map<number, CallPracticeEntry>();
  for (const r of results) {
    const scope = callModelScope(typeof key === "function" ? key(r) : key);
    const e = byRequest.get(r.practiceId) ?? { sign: r.sign, ...scope, passed: false, confidence: 0, tries: 0 };
    e.tries += 1;
    e.passed = e.passed || r.passed;
    e.confidence = Math.max(e.confidence, r.confidence);
    byRequest.set(r.practiceId, e);
  }
  return [...byRequest.values()];
}
