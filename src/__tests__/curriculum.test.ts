// Needs the model label files (public/word-model, public/fsl-model), which
// are gitignored - see FSL_MODEL_GUIDE.md if they're missing.
import {
  CURRICULUM,
  MASTERY_PASSES,
  computeOverall,
  countMastered,
  getGroup,
  groupFraction,
  groupInPlan,
  groupKey,
  groupOff,
  isMastered,
  planSigns,
  formatPercent,
  UNKNOWN_SIGN_LABEL,
} from "../lib/curriculum";
import { WORD_CATEGORIES, categoriesIn, evenChunks, filterByCategory, getWordCategory } from "../lib/wordCategories";
import { sectionsByCategory } from "../components/learn/WordCategoryList";

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

  it("never lists the model's unknown-sign class as a lesson", () => {
    for (const lang of CURRICULUM) for (const g of lang.groups) expect(g.signs).not.toContain(UNKNOWN_SIGN_LABEL);
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
      { language: "asl", sign_group: "letters", sign: "B", passes: 0 },
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

  it("computeOverall averages available groups equally", () => {
    const letters = getGroup("asl", "letters").signs.length;
    const available = CURRICULUM.flatMap((l) => l.groups).filter((g) => g.available).length;
    expect(available).toBe(6);
    const overall = computeOverall({ "asl:letters": letters });
    expect(overall).toBeCloseTo(1 / available, 10);
  });

  it("FSL numbers are 1-10 (FSL-105 has no zero) and ASL numbers 0-9", () => {
    expect(getGroup("fsl", "numbers").signs).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(getGroup("asl", "numbers").signs).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(getGroup("fsl", "letters").signs).toHaveLength(26);
  });

  it("reaches 100% when every available group is complete", () => {
    const counts: Record<string, number> = {};
    for (const l of CURRICULUM) for (const g of l.groups) counts[groupKey(l.language, g.group)] = g.signs.length;
    expect(computeOverall(counts)).toBeCloseTo(1, 10);
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

describe("class learning plan", () => {
  const words = getGroup("asl", "words").signs;
  const picked = [words[5], words[0], words[2]];

  it("planSigns keeps curriculum order and drops words the model doesn't have", () => {
    expect(planSigns("asl", "words", null)).toBe(words);
    expect(planSigns("asl", "words", { asl: [...picked, "not-a-model-word"] })).toEqual([words[0], words[2], words[5]]);
    // Only words are planned; letters are always the whole group.
    expect(planSigns("asl", "letters", { asl: [] })).toEqual(getGroup("asl", "letters").signs);
  });

  it("counts and fractions only cover planned words", () => {
    const plan = { asl: picked };
    const rows = [words[0], words[1]].map((sign) => ({ language: "asl", sign_group: "words", sign, passes: 1 }));
    const counts = countMastered(rows, plan);
    expect(counts[groupKey("asl", "words")]).toBe(1); // words[1] isn't in the plan
    expect(groupFraction("asl", "words", counts, plan)).toBeCloseTo(1 / 3, 10);
  });

  it("computeOverall leaves out a group the plan empties", () => {
    const counts: Record<string, number> = {};
    for (const l of CURRICULUM) for (const g of l.groups) counts[groupKey(l.language, g.group)] = g.signs.length;
    expect(computeOverall(counts, { fsl: [] })).toBeCloseTo(1, 10);
    const withoutFsl = computeOverall({ [groupKey("asl", "letters")]: getGroup("asl", "letters").signs.length }, { fsl: [] });
    // ASL letters done; ASL numbers, ASL words, FSL letters, FSL numbers not. The
    // plan only picks words, so FSL letters and numbers still count.
    expect(withoutFsl).toBeCloseTo(1 / 5, 10);
  });

  it("a switched-off group teaches nothing and leaves the overall", () => {
    const aslOnly = { off: { fsl: ["letters", "numbers", "words"] as const } } as any;
    for (const g of ["letters", "numbers", "words"] as const) {
      expect(groupOff("fsl", g, aslOnly)).toBe(true);
      expect(planSigns("fsl", g, aslOnly)).toEqual([]);
      expect(groupInPlan("fsl", g, aslOnly)).toBe(false);
    }
    expect(groupInPlan("asl", "letters", aslOnly)).toBe(true);
    // Every ASL letter learned in an ASL-only class: 1 of 3 groups, not 1 of 6.
    const lettersDone = { [groupKey("asl", "letters")]: getGroup("asl", "letters").signs.length };
    expect(computeOverall(lettersDone)).toBeCloseTo(1 / 6, 10);
    expect(computeOverall(lettersDone, aslOnly)).toBeCloseTo(1 / 3, 10);
    // Counts ignore an off group's signs too.
    const rows = [{ language: "fsl", sign_group: "letters", sign: getGroup("fsl", "letters").signs[0], passes: 1 }];
    expect(countMastered(rows, aslOnly)[groupKey("fsl", "letters")]).toBe(0);
  });

  it("switching Words off keeps the word list for when it is switched back on", () => {
    const plan = { asl: picked, off: { asl: ["words"] } } as any;
    expect(planSigns("asl", "words", plan)).toEqual([]);
    expect(planSigns("asl", "words", { ...plan, off: undefined })).toEqual([words[0], words[2], words[5]]);
    expect(planSigns("asl", "numbers", plan)).toEqual(getGroup("asl", "numbers").signs);
  });
});

describe("sectionsByCategory", () => {
  it("groups by category in display order, most reliable word first inside each", () => {
    const words = getGroup("asl", "words").signs;
    const sections = sectionsByCategory("asl", words);
    const order = WORD_CATEGORIES.map((c) => c.key);
    expect(sections.map((s) => order.indexOf(s.key as any))).toEqual(
      [...sections.map((s) => order.indexOf(s.key as any))].sort((a, b) => a - b)
    );
    expect(sections.reduce((n, s) => n + s.signs.length, 0)).toBe(words.length);
    for (const s of sections) {
      const ranks = s.signs.map((w) => words.indexOf(w));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });
});
