import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyAttempt, getLocalGroupProgress, getLocalProgress, LOCAL_PROGRESS_KEY, recordLocalAttempt } from "../lib/localProgress";
import { countMastered, MASTERY_PASSES } from "../lib/curriculum";

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe("applyAttempt (same rules as record_lesson_attempt)", () => {
  const t1 = "2026-11-05T01:00:00.000Z";
  const t2 = "2026-11-05T02:00:00.000Z";

  it("starts a row on the first attempt", () => {
    expect(applyAttempt(undefined, false, 0.4, t1)).toEqual({
      attempts: 1,
      passes: 0,
      best_confidence: 0.4,
      first_passed_at: null,
      last_passed_at: null,
      updated_at: t1,
    });
    expect(applyAttempt(undefined, true, 0.9, t1)).toMatchObject({ passes: 1, first_passed_at: t1, last_passed_at: t1 });
  });

  it("counts every pass, keeps the best score and the first pass time", () => {
    const a = applyAttempt(undefined, true, 0.9, t1);
    const b = applyAttempt(a, true, 0.7, t2);
    expect(b).toMatchObject({ attempts: 2, passes: 2, best_confidence: 0.9, first_passed_at: t1, last_passed_at: t2 });
  });

  it("a miss leaves the last pass alone", () => {
    const a = applyAttempt(undefined, true, 0.9, t1);
    expect(applyAttempt(a, false, 0.95, t2)).toMatchObject({ attempts: 2, passes: 1, best_confidence: 0.95, last_passed_at: t1, updated_at: t2 });
  });

  it("clamps the score to 0..1", () => {
    expect(applyAttempt(undefined, false, 1.7, t1).best_confidence).toBe(1);
    expect(applyAttempt(undefined, false, -2, t1).best_confidence).toBe(0);
    expect(applyAttempt(undefined, false, NaN, t1).best_confidence).toBe(0);
  });
});

describe("device store", () => {
  it("saves attempts and reads them back by group", async () => {
    const r1 = await recordLocalAttempt("asl", "letters", "A", true, 0.8);
    expect(r1.error).toBeNull();
    expect(r1.data).toMatchObject({ language: "asl", sign_group: "letters", sign: "A", attempts: 1, passes: 1 });
    await recordLocalAttempt("fsl", "words", "salamat", false, 0.3);

    const all = await getLocalProgress();
    expect(all.data).toHaveLength(2);
    const letters = await getLocalGroupProgress("asl", "letters");
    expect(letters.data!.map((r) => r.sign)).toEqual(["A"]);
  });

  it("doesn't lose attempts sent at the same time", async () => {
    await Promise.all(Array.from({ length: 5 }, () => recordLocalAttempt("asl", "numbers", "3", true, 0.9)));
    const [row] = (await getLocalGroupProgress("asl", "numbers")).data!;
    expect(row).toMatchObject({ attempts: 5, passes: 5 });
  });

  it("feeds the Classroom's learned counts", async () => {
    for (let i = 0; i < MASTERY_PASSES; i++) await recordLocalAttempt("asl", "letters", "B", true, 0.9);
    await recordLocalAttempt("asl", "letters", "C", false, 0.4); // tried, not passed
    const counts = countMastered((await getLocalProgress()).data!, {});
    expect(counts["asl:letters"]).toBe(1);
  });

  it("starts over when the stored value is unreadable", async () => {
    await AsyncStorage.setItem(LOCAL_PROGRESS_KEY, "{not json");
    expect((await getLocalProgress()).data).toEqual([]);
    const r = await recordLocalAttempt("asl", "letters", "D", true, 0.9);
    expect(r.data).toMatchObject({ attempts: 1 });
  });
});
