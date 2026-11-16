import {
  chunk,
  nextPracticeSign,
  starsFor,
  tileStatus,
  type ProgressLike,
} from "../lib/practiceFlow";
import { MASTERY_PASSES } from "../lib/curriculum";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const row = (passes: number, attempts = passes, lastPassMinutesAgo: number | null = null): ProgressLike => ({
  passes,
  attempts,
  last_passed_at: lastPassMinutesAgo === null ? null : minutesAgo(lastPassMinutesAgo),
});

describe("tileStatus", () => {
  it("is not-started with no row or no activity", () => {
    expect(tileStatus(null)).toBe("not-started");
    expect(tileStatus(row(0, 0))).toBe("not-started");
  });

  it("is tried after an attempt, learned at the first pass", () => {
    expect(MASTERY_PASSES).toBe(1);
    expect(tileStatus(row(0, 4))).toBe("tried");
    expect(tileStatus(row(1, 1, 1))).toBe("learned");
  });
});

describe("starsFor", () => {
  it("is accuracy against the sign's reference, not passes", () => {
    expect(starsFor(undefined, 0.8)).toBe(0);
    expect(starsFor({ ...row(0, 1), best_confidence: 0.4 }, 0.8)).toBe(1.5);
    // Many passes don't add stars by themselves.
    expect(starsFor({ ...row(MASTERY_PASSES + 4), best_confidence: 0.2 }, 0.8)).toBe(0.75);
  });
});

describe("nextPracticeSign", () => {
  const signs = ["A", "B", "C", "D"];

  it("starts from the beginning when nothing was practiced", () => {
    expect(nextPracticeSign(signs, new Map(), null)).toBe("A");
  });

  it("moves to the sign after the current one, wrapping", () => {
    expect(nextPracticeSign(signs, new Map(), "B")).toBe("C");
    expect(nextPracticeSign(signs, new Map(), "D")).toBe("A");
  });

  it("skips learned signs", () => {
    const rows = new Map<string, ProgressLike>([
      ["B", row(MASTERY_PASSES, MASTERY_PASSES, 1)],
      ["C", row(0, 2)], // tried, not learned
    ]);
    expect(nextPracticeSign(signs, rows, "A")).toBe("C");
  });

  it("never returns the current sign and is null when the rest are learned", () => {
    const rows = new Map<string, ProgressLike>(
      ["B", "C", "D"].map((s) => [s, row(MASTERY_PASSES)] as [string, ProgressLike])
    );
    expect(nextPracticeSign(signs, rows, "A")).toBeNull();
    expect(nextPracticeSign([], new Map(), null)).toBeNull();
  });

  it("in a module, doesn't skip signs learned before the module was made", () => {
    const rows = new Map<string, ProgressLike>([
      ["B", row(MASTERY_PASSES, MASTERY_PASSES, 60 * 24 * 3)], // learned 3 days ago
      ["C", row(MASTERY_PASSES, MASTERY_PASSES, 5)], // passed 5 minutes ago
    ]);
    const made = minutesAgo(60);
    expect(nextPracticeSign(signs, rows, "A", made)).toBe("B");
    expect(nextPracticeSign(signs, rows, "B", made)).toBe("D");
    expect(nextPracticeSign(signs, rows, "A")).toBe("D"); // outside a module, both count
  });
});

describe("chunk", () => {
  it("splits into fixed-size pieces with a short tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
