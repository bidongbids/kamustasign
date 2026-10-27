import { signsToReview, type SignRow } from "../lib/classInsights";
import { MASTERY_PASSES } from "../lib/curriculum";

const row = (sign: string, attempts: number, passes: number, best = 0.5): SignRow => ({
  sign,
  attempts,
  passes,
  best_confidence: best,
});

const SIGNS = ["A", "B", "C", "D"];

describe("signsToReview", () => {
  it("ranks by students stuck, then by how far they are from passing", () => {
    const data = new Map<string, SignRow[]>([
      ["s1", [row("A", 5, 0, 0.6), row("B", 4, 0, 0.3), row("C", 3, MASTERY_PASSES, 0.9)]],
      ["s2", [row("A", 2, 0, 0.7), row("B", 6, 0, 0.2)]],
      ["s3", [row("C", 1, 0, 0.5)]],
    ]);
    const out = signsToReview(data, SIGNS);
    expect(out.map((s) => s.sign)).toEqual(["B", "A", "C"]); // B and A: 2 stuck; B further from passing
    expect(out[0]).toEqual({ sign: "B", tried: 2, learned: 0, stuck: 2, attempts: 10, stuckBest: 0.25 });
    expect(out[2]).toMatchObject({ sign: "C", tried: 2, learned: 1, stuck: 1, stuckBest: 0.5 });
  });

  it("leaves out signs everyone has learned and rows with no activity", () => {
    const data = new Map<string, SignRow[]>([
      ["s1", [row("A", 3, MASTERY_PASSES), row("B", 0, 0)]],
      ["s2", [row("A", 4, MASTERY_PASSES)]],
    ]);
    expect(signsToReview(data, SIGNS)).toEqual([]);
  });

  it("ignores signs no longer in the curriculum", () => {
    const data = new Map<string, SignRow[]>([["s1", [row("Z", 9, 0)]]]);
    expect(signsToReview(data, SIGNS)).toEqual([]);
  });

  it("respects the limit", () => {
    const data = new Map<string, SignRow[]>([["s1", SIGNS.map((s) => row(s, 1, 0))]]);
    expect(signsToReview(data, SIGNS, 2)).toHaveLength(2);
  });
});
