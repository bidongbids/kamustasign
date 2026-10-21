// Teacher "Signs to review": which signs in one language+group a class is
// stuck on. Pure, over the lesson_progress rows RLS already lets the teacher
// read, so the same maths can be tested without a database.
import { isMastered } from "./curriculum";

export type SignRow = { sign: string; attempts?: number; passes: number; best_confidence?: number };

export type SignInsight = {
  sign: string;
  /** Students with at least one attempt at this sign. */
  tried: number;
  /** Students who have mastered it. */
  learned: number;
  /** Tried but not learned yet - the number the card ranks by. */
  stuck: number;
  /** Total attempts across the class. */
  attempts: number;
  /** Mean best confidence (0-1) among students who are stuck; null if none. */
  stuckBest: number | null;
};

/**
 * Signs ordered by how many students are stuck on them, then by how far
 * those students are from passing (lowest best confidence first), then by
 * how many attempts it has eaten. Signs nobody is stuck on are left out, so
 * an empty result means "nothing to review", not "no data".
 */
export function signsToReview(rowsByStudent: Map<string, SignRow[]>, signs: string[], limit = 8): SignInsight[] {
  const inCurriculum = new Set(signs);
  const bySign = new Map<string, SignInsight & { bestSum: number }>();
  for (const rows of rowsByStudent.values()) {
    for (const r of rows) {
      if (!inCurriculum.has(r.sign)) continue;
      const attempts = r.attempts ?? 0;
      if (attempts === 0 && r.passes === 0) continue;
      let s = bySign.get(r.sign);
      if (!s) {
        s = { sign: r.sign, tried: 0, learned: 0, stuck: 0, attempts: 0, stuckBest: null, bestSum: 0 };
        bySign.set(r.sign, s);
      }
      s.tried++;
      s.attempts += attempts;
      if (isMastered(r)) {
        s.learned++;
      } else {
        s.stuck++;
        s.bestSum += r.best_confidence ?? 0;
      }
    }
  }
  return [...bySign.values()]
    .filter((s) => s.stuck > 0)
    .map(({ bestSum, ...s }) => ({ ...s, stuckBest: bestSum / s.stuck }))
    .sort(
      (a, b) =>
        b.stuck - a.stuck ||
        (a.stuckBest ?? 0) - (b.stuckBest ?? 0) ||
        b.attempts - a.attempts ||
        a.sign.localeCompare(b.sign)
    )
    .slice(0, limit);
}
