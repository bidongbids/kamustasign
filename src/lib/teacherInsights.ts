// The teacher dashboard's figures beyond curriculum.ts: Today's "Needs you"
// list, the roster's filters and sort, the Progress grid, module
// completion, and the words on due-date chips. Pure, over data the
// dashboard already loads, so it can be tested without a database. Every
// percentage is computeOverall / groupFraction - the figures students see.
import {
  CURRICULUM,
  computeOverall,
  getLanguage,
  groupFraction,
  groupKey,
  groupOff,
  isMastered,
  planSigns,
  type ClassPlan,
  type GroupKey,
  type MasteredCounts,
  type SignGroup,
  type SignLanguage,
} from "./curriculum";
import type { SignInsight } from "./classInsights";
import type { PresenceStatus } from "./callSignaling";

// ---- dates ----

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** "2026-11-01" -> that local day; null if it isn't a real date. */
export function parseDay(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getMonth() === Number(m[2]) - 1 ? d : null;
}

export function toDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole calendar days from today to `date`; negative once it has passed. */
export function daysUntil(date: string, now = new Date()): number | null {
  const d = parseDay(date);
  if (!d) return null;
  return Math.round((d.getTime() - startOfDay(now).getTime()) / DAY_MS);
}

export type DueTone = "none" | "later" | "soon" | "overdue";

/** A module's due chip: "Due Sun, Nov 1 · in 5 days" (soon = within 7 days), "Overdue · was due Oct 20". */
export function dueInfo(date: string | null, now = new Date()): { tone: DueTone; text: string; days: number | null } {
  const d = date ? parseDay(date) : null;
  const days = date ? daysUntil(date, now) : null;
  if (!d || days === null) return { tone: "none", text: "No due date", days: null };
  if (days < 0) {
    return { tone: "overdue", text: `Overdue · was due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, days };
  }
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return { tone: days <= 7 ? "soon" : "later", text: `Due ${day} · ${when}`, days };
}

/** "Sunday, Nov 1" and "Nov 1" for a due date (Today's rows). */
export function dayWords(date: string): { long: string; short: string } {
  const d = parseDay(date);
  if (!d) return { long: date, short: date };
  return {
    long: d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
    short: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
}

/** A month as weeks for a calendar grid, Sunday first; days outside the month are null. */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// ---- groups ----

export type GroupRef = { language: SignLanguage; group: SignGroup; key: GroupKey; label: string };

/**
 * Groups with a model behind them, e.g. ASL Letters, ASL Words, FSL Words -
 * minus any the class plan switches off, when a plan is given.
 */
export function availableGroups(plan?: ClassPlan | null): GroupRef[] {
  return CURRICULUM.flatMap((l) =>
    l.groups
      .filter((g) => g.available && !groupOff(l.language, g.group, plan))
      .map((g) => ({ language: l.language, group: g.group, key: groupKey(l.language, g.group), label: `${l.label} ${g.label}` }))
  );
}

/** "ASL Numbers, FSL Letters and FSL Numbers" - the groups with no model yet. */
export function soonGroupsText(): string {
  const names = CURRICULUM.flatMap((l) => l.groups.filter((g) => !g.available).map((g) => `${l.label} ${g.label}`));
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The class average for each available group (plan words only). */
export function classGroupAverages(students: { mastered: MasteredCounts }[], plan: ClassPlan) {
  return availableGroups()
    .filter((g) => planSigns(g.language, g.group, plan).length > 0)
    .map((g) => ({
      ...g,
      total: planSigns(g.language, g.group, plan).length,
      value: students.length ? students.reduce((sum, s) => sum + groupFraction(g.language, g.group, s.mastered, plan), 0) / students.length : 0,
    }));
}

// ---- roster ----

export type RosterFilter = "all" | "online" | "under25" | "notStarted";
export type RosterSortKey = "name" | "status" | "overall" | GroupKey;
export type RosterStudent = { id: string; full_name: string; mastered: MasteredCounts };

/** "Under 25%" - the same overall figure as Today and the student's own dashboard. */
export const NEEDS_HELP_BELOW = 0.25;

export const isOnline = (p: PresenceStatus | undefined) => p === "available" || p === "busy";
const statusRank = (p: PresenceStatus | undefined) => (p === "available" ? 0 : p === "busy" ? 1 : 2);

export function matchesFilter(f: RosterFilter, overall: number, presence: PresenceStatus | undefined): boolean {
  if (f === "online") return isOnline(presence);
  if (f === "under25") return overall < NEEDS_HELP_BELOW;
  if (f === "notStarted") return overall === 0;
  return true;
}

export function rosterCounts(students: RosterStudent[], plan: ClassPlan, presence: Record<string, PresenceStatus>): Record<RosterFilter, number> {
  const counts: Record<RosterFilter, number> = { all: 0, online: 0, under25: 0, notStarted: 0 };
  for (const s of students) {
    const overall = computeOverall(s.mastered, plan);
    for (const f of Object.keys(counts) as RosterFilter[]) if (matchesFilter(f, overall, presence[s.id])) counts[f]++;
  }
  return counts;
}

/** Sorted copy; ties fall back to the name, so the order never jumps around. */
export function sortRoster<T extends RosterStudent>(
  students: T[],
  key: RosterSortKey,
  ascending: boolean,
  plan: ClassPlan,
  presence: Record<string, PresenceStatus>
): T[] {
  const score = (s: T): number => {
    if (key === "overall") return computeOverall(s.mastered, plan);
    if (key === "status") return statusRank(presence[s.id]);
    if (key === "name") return 0;
    const [language, group] = key.split(":") as [SignLanguage, SignGroup];
    return groupFraction(language, group, s.mastered, plan);
  };
  const byName = (a: T, b: T) => a.full_name.localeCompare(b.full_name);
  return [...students].sort((a, b) => {
    if (key === "name") return ascending ? byName(a, b) : byName(b, a);
    return (ascending ? score(a) - score(b) : score(b) - score(a)) || byName(a, b);
  });
}

// ---- progress rows ----

type Row = { sign: string; passes: number; attempts?: number };

export type Cell = "learned" | "tried" | "none";
export type GridRow = { id: string; name: string; cells: Cell[]; learned: number; tried: string[] };

/** Student x sign: learned / tried, not learned / not tried, in `signs` order. */
export function signGrid(students: { id: string; name: string }[], rowsByStudent: Map<string, Row[]>, signs: string[]): GridRow[] {
  return students.map((s) => {
    const bySign = new Map((rowsByStudent.get(s.id) ?? []).map((r) => [r.sign, r]));
    const cells = signs.map((sign): Cell => {
      const r = bySign.get(sign);
      if (!r || ((r.attempts ?? 0) === 0 && r.passes === 0)) return "none";
      return isMastered(r) ? "learned" : "tried";
    });
    return {
      id: s.id,
      name: s.name,
      cells,
      learned: cells.filter((c) => c === "learned").length,
      tried: signs.filter((_, i) => cells[i] === "tried"),
    };
  });
}

/** The share of the class that learned each sign (the column chart). */
export function shareLearned(grid: GridRow[], signs: string[]): number[] {
  return signs.map((_, i) => (grid.length ? grid.filter((g) => g.cells[i] === "learned").length / grid.length : 0));
}

/** How far each student is through a module's signs, the class average, and who finished. */
export function moduleCompletion(signs: string[], studentIds: string[], rowsByStudent: Map<string, Row[]> | null | undefined) {
  const set = new Set(signs);
  const perStudent = new Map<string, number>();
  for (const id of studentIds) {
    const learned = (rowsByStudent?.get(id) ?? []).filter((r) => set.has(r.sign) && isMastered(r)).length;
    perStudent.set(id, learned);
  }
  const fractions = studentIds.map((id) => (signs.length ? (perStudent.get(id) ?? 0) / signs.length : 0));
  return {
    perStudent,
    average: fractions.length ? fractions.reduce((a, b) => a + b, 0) / fractions.length : 0,
    finished: fractions.filter((f) => f >= 1).length,
  };
}

/** Signs the class is stuck on: at least a fifth of the class (2 at least) tried them and hasn't learned them. */
export function stuckSigns(insights: SignInsight[], classSize: number, limit = 4): SignInsight[] {
  const min = Math.max(2, Math.ceil(classSize * 0.2));
  return insights.filter((s) => s.stuck >= min).slice(0, limit);
}

// ---- Today ----

export type NeedsYouItem =
  | { kind: "missed"; key: string; callerId: string; name: string; at: string; ids: string[] }
  | { kind: "under25"; key: "under25"; students: { id: string; name: string; overall: number }[] }
  | { kind: "stuck"; key: "stuck"; language: SignLanguage; group: SignGroup; signs: SignInsight[] }
  | { kind: "due"; key: string; moduleId: string; title: string; date: string; days: number; finished: number; signs: number }
  | { kind: "waiting"; key: "waiting"; students: { id: string; name: string }[] };

/**
 * Most urgent first: missed calls (newest first), students under 25%
 * (lowest first), signs the class is stuck on, modules due within a week or
 * overdue (soonest first), students waiting for a class.
 */
export function needsYou(input: {
  missed: { id: string; caller_id: string; created_at: string }[];
  nameOf: (id: string) => string | null;
  students: { id: string; name: string; overall: number }[];
  stuck: { language: SignLanguage; group: SignGroup; signs: SignInsight[] } | null;
  modules: { id: string; title: string; due_date: string | null; signs: number; finished: number }[];
  waiting: { id: string; name: string }[];
  now?: Date;
}): NeedsYouItem[] {
  const items: NeedsYouItem[] = [];
  const byCaller = new Map<string, { latest: { caller_id: string; created_at: string }; ids: string[] }>();
  for (const c of [...input.missed].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const e = byCaller.get(c.caller_id);
    if (e) e.ids.push(c.id);
    else byCaller.set(c.caller_id, { latest: c, ids: [c.id] });
  }
  for (const [callerId, { latest, ids }] of byCaller) {
    items.push({ kind: "missed", key: `missed:${callerId}`, callerId, name: input.nameOf(callerId) ?? "Someone in your class", at: latest.created_at, ids });
  }
  const under = input.students.filter((s) => s.overall < NEEDS_HELP_BELOW).sort((a, b) => a.overall - b.overall || a.name.localeCompare(b.name));
  if (under.length) items.push({ kind: "under25", key: "under25", students: under });
  if (input.stuck && input.stuck.signs.length) items.push({ kind: "stuck", key: "stuck", ...input.stuck });
  const due = input.modules
    .map((m) => ({ m, days: m.due_date ? daysUntil(m.due_date, input.now) : null }))
    .filter((x): x is { m: (typeof input.modules)[number]; days: number } => x.days !== null && x.days <= 7)
    .sort((a, b) => a.days - b.days);
  for (const { m, days } of due) {
    items.push({ kind: "due", key: `due:${m.id}`, moduleId: m.id, title: m.title, date: m.due_date!, days, finished: m.finished, signs: m.signs });
  }
  if (input.waiting.length) items.push({ kind: "waiting", key: "waiting", students: input.waiting });
  return items;
}

/** "Kyla Bautista and Leo Navarro", "Ana, Ben and 3 more". */
export function nameList(names: string[], max = 3): string {
  if (names.length <= 1) return names.join("");
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "ASL Letters" from a group key. */
export function groupLabel(language: SignLanguage, group: SignGroup): string {
  const l = getLanguage(language);
  return `${l.label} ${l.groups.find((g) => g.group === group)?.label ?? group}`;
}
