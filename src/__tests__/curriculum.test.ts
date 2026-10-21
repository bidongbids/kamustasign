// Needs the model label files (public/word-model, public/fsl-model), which
// are gitignored - see FSL_MODEL_GUIDE.md if they're missing.
import {
  CURRICULUM,
  MASTERY_PASSES,
  PASS_COOLDOWN_MINUTES,
  computeOverall,
  countMastered,
  getGroup,
  groupFraction,
  groupKey,
  isMastered,
  nextCountedPassAt,
  formatPercent,
} from "../lib/curriculum";
import { WORD_CATEGORIES, categoriesIn, evenChunks, filterByCategory, getWordCategory } from "../lib/wordCategories";

const NOW = Date.parse("2026-10-21T12:00:00Z");

describe("curriculum data", () => {
  it("drops the fingerspelling UI classes from ASL letters", () => {
    const letters = getGroup("asl", "letters").signs;
    expect(letters).not.toContain("del");
    expect(letters).not.toContain("space");
    expect(letters).not.toContain("nothing");
    expect(letters).toContain("A");
  });

  it("has no duplicate signs within a group", () => {
    for (const lang of CURRICULUM) {
      for (const g of lang.groups) {
        expect(new Set(g.signs).size).toBe(g.signs.length);
      }
    }
  });

  it("has words available for both languages", () => {
    expect(getGroup("asl", "words").available).toBe(true);
    expect(getGroup("fsl", "words").available).toBe(true);
    expect(getGroup("asl", "words").signs.length).toBeGreaterThan(0);
  });
});

describe("mastery", () => {
  it("needs MASTERY_PASSES passes", () => {
    expect(isMastered(null)).toBe(false);
    expect(isMastered({ passes: MASTERY_PASSES - 1 })).toBe(false);
    expect(isMastered({ passes: MASTERY_PASSES })).toBe(true);
  });

  it("countMastered ignores signs no longer in the curriculum", () => {
    const counts = countMastered([
      { language: "asl", sign_group: "letters", sign: "A", passes: MASTERY_PASSES },
      { language: "asl", sign_group: "letters", sign: "B", passes: 1 },
      { language: "asl", sign_group: "letters", sign: "not-a-sign", passes: MASTERY_PASSES },
      { language: "asl", sign_group: "letters", sign: "del", passes: MASTERY_PASSES },
    ]);
    expect(counts[groupKey("asl", "letters")]).toBe(1);
  });

  it("groupFraction is capped at 1", () => {
    const total = getGroup("asl", "letters").signs.length;
    expect(groupFraction("asl", "letters", { "asl:letters": total + 5 })).toBe(1);
    expect(groupFraction("asl", "letters", {})).toBe(0);
  });

  it("computeOverall averages available groups equally and skips unavailable ones", () => {
    const letters = getGroup("asl", "letters").signs.length;
    const available = CURRICULUM.flatMap((l) => l.groups).filter((g) => g.available).length;
    // All ASL letters mastered, nothing else; unavailable ASL numbers must not count.
    const overall = computeOverall({ "asl:letters": letters, "asl:numbers": 10 });
    expect(overall).toBeCloseTo(1 / available, 10);
  });

  it("reaches 100% when every available group is complete", () => {
    const counts: Record<string, number> = {};
    for (const l of CURRICULUM) for (const g of l.groups) counts[groupKey(l.language, g.group)] = g.signs.length;
    expect(computeOverall(counts)).toBeCloseTo(1, 10);
  });
});

describe("pass cooldown", () => {
  it("returns null when a pass would count now", () => {
    expect(nextCountedPassAt(null, NOW)).toBeNull();
    const longAgo = new Date(NOW - (PASS_COOLDOWN_MINUTES + 1) * 60_000).toISOString();
    expect(nextCountedPassAt(longAgo, NOW)).toBeNull();
  });

  it("returns when the cooldown ends", () => {
    const last = new Date(NOW - 60_000).toISOString();
    const at = nextCountedPassAt(last, NOW)!;
    expect(at.getTime()).toBe(NOW - 60_000 + PASS_COOLDOWN_MINUTES * 60_000);
  });
});

describe("formatPercent", () => {
  it("rounds to a whole percent", () => {
    expect(formatPercent(0.456)).toBe("46%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("word categories", () => {
  it("categorises every curriculum word (no silent 'other' drift after a retrain)", () => {
    for (const language of ["asl", "fsl"] as const) {
      const words = getGroup(language, "words").signs;
      const uncategorised = words.filter((w) => getWordCategory(language, w) === "other");
      // A handful of genuinely odd glosses may stay "other"; a retrain that
      // renames classes would push most of them here.
      expect(uncategorised.length / words.length).toBeLessThan(0.1);
    }
  });

  it("categoriesIn only lists categories present, with correct counts", () => {
    const words = getGroup("asl", "words").signs;
    const cats = categoriesIn("asl", words);
    expect(cats.reduce((a, c) => a + c.count, 0)).toBe(words.length);
    expect(cats.every((c) => c.count > 0)).toBe(true);
    const order = WORD_CATEGORIES.map((c) => c.key);
    const idx = cats.map((c) => order.indexOf(c.key));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("filterByCategory keeps order; null returns everything", () => {
    const words = getGroup("asl", "words").signs;
    expect(filterByCategory("asl", words, null)).toBe(words);
    const verbs = filterByCategory("asl", words, "verb");
    expect(verbs).toEqual(words.filter((w) => getWordCategory("asl", w) === "verb"));
  });

  it("evenChunks sizes runs as evenly as possible", () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(evenChunks(items, 10).map((c) => c.length)).toEqual([8, 8, 7]);
    expect(evenChunks([], 10)).toEqual([]);
    expect(evenChunks([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
});
