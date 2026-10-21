// Stars = accuracy, relative to the model, per sign (adviser decision,
// Oct 2026): the student's best confidence on a sign divided by what the
// deployed model typically gives a correctly made attempt of that sign
// (src/data/starReference.json, from ml/scripts/export_star_reference.py).
// 3 full stars = matching that reference; shown in quarter-star steps.
//
// Stars are a display of how well a sign is made. Learning a sign (mastery,
// progress %) is still MASTERY_PASSES counted passes - see curriculum.ts.
import reference from "../data/starReference.json";
import type { SignGroup, SignLanguage } from "./curriculum";

export const STAR_COUNT = 3;
export const STAR_STEP = 0.25;

type GroupRefs = Record<string, number>;
const REFS = reference as unknown as Partial<Record<SignLanguage, Partial<Record<SignGroup, GroupRefs>>>>;

/** What a correct attempt at this sign typically scores (0-1), or null for a group with no model data. */
export function starReference(language: SignLanguage, group: SignGroup, sign: string): number | null {
  const refs = REFS[language]?.[group];
  if (!refs) return null;
  return refs[sign] ?? refs._default ?? null;
}

/** 0-3 in quarter steps. No reference (no model for the group) -> 0. */
export function accuracyStars(bestConfidence: number | null | undefined, ref: number | null): number {
  if (!ref || !bestConfidence || bestConfidence <= 0) return 0;
  const ratio = Math.min(1, bestConfidence / ref);
  return Math.round((ratio * STAR_COUNT) / STAR_STEP) * STAR_STEP;
}

/** "2 ¾ stars" style, for labels and screen readers. */
export function starsText(stars: number): string {
  const whole = Math.floor(stars);
  const frac = stars - whole;
  const part = frac === 0.25 ? "¼" : frac === 0.5 ? "½" : frac === 0.75 ? "¾" : "";
  const n = part ? `${whole > 0 ? whole + " " : ""}${part}` : `${whole}`;
  return `${n} star${stars === 1 ? "" : "s"}`;
}
