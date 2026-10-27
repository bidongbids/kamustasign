// Student learning layer helpers (Graphite Aurora "Kids"). Pure functions
// over the lesson_progress columns that already exist - nothing here adds a
// rule. Mastery, the pass threshold and the cooldown still come from
// curriculum.ts; this only decides how they are SHOWN (tile state, the
// "Next" sign). Stars are accuracy (starReference.ts).
import { isMastered } from "./curriculum";
import { accuracyStars } from "./starReference";

export type ProgressLike = {
  attempts: number;
  passes: number;
  last_passed_at: string | null;
  /** Best recognition confidence so far (0-1) - drives the stars. */
  best_confidence?: number;
};

export type TileStatus = "not-started" | "tried" | "learned";

export function tileStatus(row: ProgressLike | null | undefined): TileStatus {
  if (!row || (row.attempts === 0 && row.passes === 0)) return "not-started";
  return isMastered(row) ? "learned" : "tried";
}

/** Accuracy stars (0-3, quarter steps) against the sign's model reference (starReference()). */
export function starsFor(row: ProgressLike | null | undefined, reference: number | null): number {
  return accuracyStars(row?.best_confidence, reference);
}

/**
 * The sign to practise next, in curriculum order: the first sign after
 * `after` (wrapping once, never `after` itself) that is not learned. Null
 * when every other sign is learned. With `after` null it scans from the start and may
 * return any sign - this is the dashboard's "Next up".
 */
export function nextPracticeSign(
  signs: string[],
  rows: Map<string, ProgressLike>,
  after: string | null
): string | null {
  if (signs.length === 0) return null;
  const start = after === null ? 0 : signs.indexOf(after) + 1;
  const ordered: string[] = [];
  for (let i = 0; i < signs.length; i++) {
    const sign = signs[(start + i) % signs.length];
    if (sign !== after) ordered.push(sign);
  }
  return ordered.find((s) => !isMastered(rows.get(s))) ?? null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
