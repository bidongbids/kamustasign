import {
  chunk,
  isResting,
  minutesUntil,
  nextPracticeSign,
  starsFor,
  tileStatus,
  type ProgressLike,
} from "../lib/practiceFlow";
import { MASTERY_PASSES, PASS_COOLDOWN_MINUTES } from "../lib/curriculum";

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

  it("is tried after an attempt, learned at mastery", () => {
    expect(tileStatus(row(0, 1))).toBe("tried");
    expect(tileStatus(row(MASTERY_PASSES - 1))).toBe("tried");
    expect(tileStatus(row(MASTERY_PASSES))).toBe("learned");
  });
});

describe("starsFor", () => {
  it("is one star per counted pass, capped at mastery", () => {
    expect(starsFor(undefined)).toBe(0);
    expect(starsFor(row(2))).toBe(2);
    expect(starsFor(row(MASTERY_PASSES + 4))).toBe(MASTERY_PASSES);
  });
});

describe("isResting", () => {
  it("rests inside the cooldown after a pass", () => {
    expect(isResting(row(1, 1, 1), NOW)).toBe(true);
  });

  it("stops resting once the cooldown has passed", () => {
    expect(isResting(row(1, 1, PASS_COOLDOWN_MINUTES + 1), NOW)).toBe(false);
  });

  it("never rests a learned sign", () => {
    expect(isResting(row(MASTERY_PASSES, MASTERY_PASSES, 1), NOW)).toBe(false);
  });
});

describe("minutesUntil", () => {
  it("rounds up and is at least 1", () => {
    expect(minutesUntil(new Date(NOW + 90_000), NOW)).toBe(2);
    expect(minutesUntil(new Date(NOW - 5_000), NOW)).toBe(1);
  });
});

describe("nextPracticeSign", () => {
  const signs = ["A", "B", "C", "D"];

  it("starts from the beginning when nothing was practised", () => {
    expect(nextPracticeSign(signs, new Map(), null, NOW)).toBe("A");
  });

  it("moves to the sign after the current one, wrapping", () => {
    expect(nextPracticeSign(signs, new Map(), "B", NOW)).toBe("C");
    expect(nextPracticeSign(signs, new Map(), "D", NOW)).toBe("A");
  });

  it("skips learned signs and prefers non-resting ones", () => {
    const rows = new Map<string, ProgressLike>([
      ["B", row(MASTERY_PASSES)],
      ["C", row(1, 1, 1)], // resting
    ]);
    expect(nextPracticeSign(signs, rows, "A", NOW)).toBe("D");
  });

  it("falls back to a resting sign when every open sign is resting", () => {
    const rows = new Map<string, ProgressLike>([
      ["B", row(1, 1, 1)],
      ["C", row(MASTERY_PASSES)],
      ["D", row(MASTERY_PASSES)],
    ]);
    expect(nextPracticeSign(signs, rows, "A", NOW)).toBe("B");
  });

  it("never returns the current sign and is null when the rest are learned", () => {
    const rows = new Map<string, ProgressLike>(
      ["B", "C", "D"].map((s) => [s, row(MASTERY_PASSES)] as [string, ProgressLike])
    );
    expect(nextPracticeSign(signs, rows, "A", NOW)).toBeNull();
    expect(nextPracticeSign([], new Map(), null, NOW)).toBeNull();
  });
});

describe("chunk", () => {
  it("splits into fixed-size pieces with a short tail", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
