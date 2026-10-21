import { accuracyStars, starReference, starsText, STAR_COUNT } from "../lib/starReference";
import { getGroup } from "../lib/curriculum";

describe("accuracyStars", () => {
  it("is 3 stars at the reference and scales below it", () => {
    expect(accuracyStars(0.6, 0.6)).toBe(3);
    expect(accuracyStars(0.54, 0.6)).toBe(2.75); // 90% of the reference
    expect(accuracyStars(0.3, 0.6)).toBe(1.5);
  });

  it("never exceeds 3 and rounds to quarter stars", () => {
    expect(accuracyStars(0.99, 0.6)).toBe(STAR_COUNT);
    const s = accuracyStars(0.37, 0.71);
    expect(s * 4).toBe(Math.round(s * 4));
  });

  it("is 0 with no attempt or no reference", () => {
    expect(accuracyStars(0, 0.6)).toBe(0);
    expect(accuracyStars(undefined, 0.6)).toBe(0);
    expect(accuracyStars(0.9, null)).toBe(0);
  });
});

describe("starReference", () => {
  it("has a reference for every available practice sign", () => {
    for (const [lang, group] of [["asl", "letters"], ["asl", "words"], ["fsl", "words"]] as const) {
      for (const sign of getGroup(lang, group).signs) {
        const r = starReference(lang, group, sign);
        expect(r).not.toBeNull();
        expect(r!).toBeGreaterThanOrEqual(0.4);
        expect(r!).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is null for groups without a model", () => {
    expect(starReference("asl", "numbers", "1")).toBeNull();
  });
});

describe("starsText", () => {
  it("names fractional stars", () => {
    expect(starsText(2.75)).toBe("2 ¾ stars");
    expect(starsText(0.5)).toBe("½ stars");
    expect(starsText(1)).toBe("1 star");
    expect(starsText(0)).toBe("0 stars");
  });
});
