import { buildFeedback, closerText, type PracticeFeedbackState } from "../lib/learnCopy";

const feedback = (state: PracticeFeedbackState, isLive = false) =>
  buildFeedback({ state, isLive, sign: "eye", passes: 0, holding: false, saveError: null, tipIndex: 0 });

describe("buildFeedback scores", () => {
  it("shows a near miss's score and the pass mark", () => {
    const m = feedback({ kind: "retry", predicted: "eye", confidence: 0.62 });
    expect(m.headline).toBe("Almost! 62%");
    expect(m.body).toBe("You need 80% to pass. Try again.");
    expect(m.score).toBe(0.62);
  });

  it("never rounds a miss up to the pass mark", () => {
    expect(feedback({ kind: "retry", predicted: "eye", confidence: 0.799 }).headline).toBe("Almost! 79%");
  });

  it("says when a try beat the last one, and never points out a drop", () => {
    expect(feedback({ kind: "retry", predicted: "eye", confidence: 0.71, previous: 0.62 }).body).toBe("Up from 62%. Getting closer!");
    expect(feedback({ kind: "retry", predicted: "eye", confidence: 0.6, previous: 0.62 }).body).toBe("You need 80% to pass. Try again.");
    expect(closerText(0.625, 0.621)).toBeNull(); // same whole percent
  });

  it("scores the target when the computer saw another sign, or nothing", () => {
    expect(feedback({ kind: "retry", predicted: "ear", confidence: 0.12 }).body).toBe("“eye” scored 12%. It looked more like “ear”.");
    expect(feedback({ kind: "retry", predicted: null, confidence: 0.05 }).body).toBe("“eye” scored 5%. That's okay. Try again.");
  });

  it("puts the score on a pass", () => {
    const m = feedback({ kind: "passed", counted: null, alreadyLearned: false, confidence: 0.91 });
    expect(m.headline).toBe("Correct! 91%");
    expect(m.score).toBe(0.91);
  });

  it("shows letters' best so far", () => {
    expect(feedback({ kind: "trying", best: 0.64 }, true).body).toBe("Best so far: 64%. Reach 80% and hold still.");
    expect(feedback({ kind: "trying", best: 0.85 }, true).body).toBe("Best so far: 85%. Now hold it still.");
    expect(feedback({ kind: "trying", best: 0 }, true).score).toBeUndefined();
  });
});
