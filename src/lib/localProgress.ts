// Practice progress kept on this device, for the offline Classroom (practice
// with no account: StudentDashboard `guest`). Same row shape and the same
// rules as the database's record_lesson_attempt (0012_class_plan_no_cooldown.sql):
// every attempt adds one, every pass counts, the best score only goes up -
// so stars, "learned" (MASTERY_PASSES) and "Next sign" behave exactly as in
// an account's Classroom.
//
// Nothing here is sent anywhere or merged into an account: it's whoever
// practices on this device, and their teacher never sees it. AsyncStorage
// is localStorage on the web and in the desktop app.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LessonProgressRow } from "./queries";
import type { SignGroup, SignLanguage } from "./curriculum";

export const LOCAL_PROGRESS_KEY = "kamustasign:offlineProgress";
const VERSION = 1;

type Stored = Pick<LessonProgressRow, "attempts" | "passes" | "best_confidence" | "first_passed_at" | "last_passed_at" | "updated_at">;
type Store = { v: number; rows: Record<string, Stored> };
type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

const keyOf = (language: string, group: string, sign: string) => `${language}:${group}:${sign}`;

/** One attempt applied to a row (or to nothing yet), as record_lesson_attempt does. */
export function applyAttempt(prev: Stored | undefined, passed: boolean, confidence: number, now: string): Stored {
  const score = Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0));
  return {
    attempts: (prev?.attempts ?? 0) + 1,
    passes: (prev?.passes ?? 0) + (passed ? 1 : 0),
    best_confidence: Math.max(Number(prev?.best_confidence ?? 0), score),
    first_passed_at: prev?.first_passed_at ?? (passed ? now : null),
    last_passed_at: passed ? now : prev?.last_passed_at ?? null,
    updated_at: now,
  };
}

function toRow(key: string, s: Stored): LessonProgressRow {
  const [language, sign_group, ...rest] = key.split(":");
  return {
    id: `local:${key}`,
    student_id: "this-device",
    language: language as SignLanguage,
    sign_group: sign_group as SignGroup,
    sign: rest.join(":"),
    ...s,
  };
}

async function read(): Promise<Store> {
  const raw = await AsyncStorage.getItem(LOCAL_PROGRESS_KEY);
  if (!raw) return { v: VERSION, rows: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.rows && typeof parsed.rows === "object") return { v: VERSION, rows: parsed.rows };
  } catch {
    // Unreadable (hand-edited, cut off): start over rather than break practice.
  }
  return { v: VERSION, rows: {} };
}

const failed = (err: unknown) => ({ data: null, error: { message: err instanceof Error ? err.message : "Couldn't use this device's storage." } });

/** Every sign practiced on this device. */
export async function getLocalProgress(): Promise<Result<LessonProgressRow[]>> {
  try {
    const { rows } = await read();
    return { data: Object.entries(rows).map(([k, s]) => toRow(k, s)), error: null };
  } catch (err) {
    return failed(err);
  }
}

/** One language + group, like getLessonProgress. */
export async function getLocalGroupProgress(language: SignLanguage, group: SignGroup): Promise<Result<LessonProgressRow[]>> {
  const all = await getLocalProgress();
  if (all.error) return all;
  return { data: all.data.filter((r) => r.language === language && r.sign_group === group), error: null };
}

// Writes go one at a time: two quick attempts must not both read the old
// row and lose one.
let queue: Promise<unknown> = Promise.resolve();

/** Same arguments (minus the student) and the same returned row as recordAttempt. */
export function recordLocalAttempt(
  language: SignLanguage,
  group: SignGroup,
  sign: string,
  passed: boolean,
  confidence: number
): Promise<Result<LessonProgressRow>> {
  const job = queue.then(async (): Promise<Result<LessonProgressRow>> => {
    try {
      const store = await read();
      const key = keyOf(language, group, sign);
      const next = applyAttempt(store.rows[key], passed, confidence, new Date().toISOString());
      store.rows[key] = next;
      await AsyncStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(store));
      return { data: toRow(key, next), error: null };
    } catch (err) {
      return failed(err);
    }
  });
  queue = job.catch(() => {});
  return job;
}
