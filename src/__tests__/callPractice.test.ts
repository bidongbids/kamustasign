// Needs the model label files (public/word-model, public/fsl-model), like curriculum.test.ts.
jest.mock("../lib/supabase", () => ({ supabase: {} }));

import { CallPracticeGrader, callModelScope, practiceSignsFor, summarizePractice } from "../lib/callPractice";
import { LIVE_PASS_HOLD_MS, getGroup } from "../lib/curriculum";
import { gradeQuality } from "../hooks/useVideoCall";

describe("callModelScope / practiceSignsFor", () => {
  it("maps each call model to its curriculum group", () => {
    expect(callModelScope("asl-letters")).toEqual({ language: "asl", group: "letters" });
    expect(callModelScope("asl-words")).toEqual({ language: "asl", group: "words" });
    expect(callModelScope("fsl-words")).toEqual({ language: "fsl", group: "words" });
  });

  it("offers the class plan's words, and every letter", () => {
    const words = getGroup("asl", "words").signs;
    expect(practiceSignsFor("asl-words", { asl: [words[3], words[1]] })).toEqual([words[1], words[3]]);
    expect(practiceSignsFor("asl-words", null)).toBe(words);
    expect(practiceSignsFor("asl-letters", { asl: [] })).toEqual(getGroup("asl", "letters").signs);
  });
});

describe("CallPracticeGrader", () => {
  it("words: each clip is a try; passes on the target at 80%", () => {
    const g = new CallPracticeGrader("hello", "words");
    expect(g.push({ kind: "clip", label: "bye", confidence: 0.9, at: 0 })).toEqual({ passed: false, seen: "bye", confidence: 0 });
    expect(g.push({ kind: "clip", label: "hello", confidence: 0.7, at: 1 })).toEqual({ passed: false, seen: "hello", confidence: 0.7 });
    expect(g.push({ kind: "clip", label: "hello", confidence: 0.85, at: 2 })?.passed).toBe(true);
    expect(g.push({ kind: "frame", label: "A", confidence: 1, at: 3 })).toBeNull();
  });

  it("letters: passes once the target is held, and a try without a pass ends when the hand goes", () => {
    const g = new CallPracticeGrader("B", "letters");
    let t = 0;
    const results = [];
    for (let i = 0; i < 20; i++) {
      const r = g.push({ kind: "frame", label: "B", confidence: 0.95, at: (t += LIVE_PASS_HOLD_MS / 8) });
      if (r) results.push(r);
    }
    expect(results).toEqual([{ passed: true, seen: "B", confidence: 0.95 }]);
    // Lowering the hand after a pass isn't another (failed) try.
    expect(g.push({ kind: "no-hand", at: (t += 10) })).toBeNull();

    for (let i = 0; i < 10; i++) g.push({ kind: "frame", label: "D", confidence: 0.9, at: (t += 30) });
    expect(g.push({ kind: "no-hand", at: (t += 10) })).toEqual({ passed: false, seen: "D", confidence: 0 });
    // A flicker of a hand is not a try.
    g.push({ kind: "frame", label: "D", confidence: 0.9, at: (t += 30) });
    expect(g.push({ kind: "no-hand", at: (t += 10) })).toBeNull();
  });
});

describe("CallPracticeGrader.hold (the student's ring)", () => {
  it("fills only while the target is held at the pass level, is full on the pass, and empties when the hand goes", () => {
    const g = new CallPracticeGrader("B", "letters");
    g.push({ kind: "frame", label: "B", confidence: 0.7, at: 0 }); // read as B, but under 80%
    expect(g.hold).toBe(0);
    g.push({ kind: "frame", label: "B", confidence: 0.9, at: 100 });
    g.push({ kind: "frame", label: "B", confidence: 0.9, at: 100 + LIVE_PASS_HOLD_MS / 2 });
    expect(g.hold).toBeCloseTo(0.5, 1);
    const pass = g.push({ kind: "frame", label: "B", confidence: 0.9, at: 100 + LIVE_PASS_HOLD_MS });
    expect(pass?.passed).toBe(true);
    expect(g.hold).toBe(1);
    g.push({ kind: "no-hand", at: 2000 });
    expect(g.hold).toBe(0);
  });
});

describe("summarizePractice", () => {
  it("one entry per request: passed if any try passed, best confidence, try count", () => {
    const out = summarizePractice(
      [
        { practiceId: 1, sign: "hello", passed: false, seen: "bye", confidence: 0 },
        { practiceId: 1, sign: "hello", passed: true, seen: "hello", confidence: 0.88 },
        { practiceId: 2, sign: "bye", passed: false, seen: null, confidence: 0.4 },
      ],
      "asl-words"
    );
    expect(out).toEqual([
      { sign: "hello", language: "asl", group: "words", passed: true, confidence: 0.88, tries: 2 },
      { sign: "bye", language: "asl", group: "words", passed: false, confidence: 0.4, tries: 1 },
    ]);
  });
});

describe("gradeQuality", () => {
  it("grades by loss and round trip", () => {
    expect(gradeQuality(80, 0)).toBe("good");
    expect(gradeQuality(null, 0.5)).toBe("good");
    expect(gradeQuality(350, 0)).toBe("fair");
    expect(gradeQuality(100, 4)).toBe("fair");
    expect(gradeQuality(700, 0)).toBe("poor");
    expect(gradeQuality(100, 12)).toBe("poor");
  });
});
