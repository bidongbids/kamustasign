// Booked video calls (0017_call_bookings.sql). The teacher books each call;
// a student can only call during their own booked time, from EARLY_MS
// before its start until its end. The teacher can still call anyone. The
// database refuses overlapping bookings; these pure helpers decide when the
// student's Call button is on, which start times a teacher can pick (taken
// ones marked) and the words on screen.

export type CallBooking = {
  id: string;
  class_id: string;
  teacher_id: string;
  student_id: string;
  starts_at: string;
  ends_at: string;
  /** Teacher side: the student's name, embedded from profiles. */
  student?: { full_name: string } | null;
};

/** A student can ring this long before their booked start. */
export const EARLY_MS = 5 * 60_000;
/** The teacher's app allows this much more either side, for device clocks that disagree. */
export const CLOCK_SLACK_MS = 3 * 60_000;
/** Call lengths a teacher can pick, in minutes. */
export const CALL_LENGTHS = [10, 15, 20, 30] as const;
export const DEFAULT_LENGTH = 15;
/** Start times are every 15 minutes from 7:00 AM to 8:45 PM. */
export const SLOT_STEP_MIN = 15;
export const FIRST_HOUR = 7;
export const LAST_HOUR = 20;

const t = (iso: string) => Date.parse(iso);
const byStart = (a: CallBooking, b: CallBooking) => t(a.starts_at) - t(b.starts_at);

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** The student's booking whose call window is open at `now` (EARLY_MS before its start until its end, plus `slack`). */
export function openBooking(bookings: CallBooking[], studentId: string, now: number, slack = 0): CallBooking | null {
  return (
    bookings
      .filter((b) => b.student_id === studentId && t(b.starts_at) - EARLY_MS - slack <= now && now < t(b.ends_at) + slack)
      .sort(byStart)[0] ?? null
  );
}

/** Bookings that haven't ended, soonest first. */
export function upcomingBookings(bookings: CallBooking[], now: number): CallBooking[] {
  return bookings.filter((b) => t(b.ends_at) > now).sort(byStart);
}

/** The student's next booking that hasn't ended (may be open now). */
export function nextBooking(bookings: CallBooking[], studentId: string, now: number): CallBooking | null {
  return upcomingBookings(bookings, now).find((b) => b.student_id === studentId) ?? null;
}

/** Whether a student can call now, and if not, when. */
export type CallGate = { kind: "open"; booking: CallBooking } | { kind: "later"; booking: CallBooking } | { kind: "none" };

export function studentCallGate(bookings: CallBooking[], studentId: string, now: number): CallGate {
  const open = openBooking(bookings, studentId, now);
  if (open) return { kind: "open", booking: open };
  const next = nextBooking(bookings, studentId, now);
  return next ? { kind: "later", booking: next } : { kind: "none" };
}

export type StartTime = {
  /** Local start, ms since epoch. */
  at: number;
  label: string;
  /** Overlaps another booking (the one in `clash`). */
  clash: CallBooking | null;
  past: boolean;
};

/**
 * Every start time on `day` for a call of `lengthMin` minutes, marking the
 * ones that would overlap another booking (`ignoreId` = the booking being
 * moved) and the ones already past.
 */
export function startTimes(day: Date, lengthMin: number, bookings: CallBooking[], now: number, ignoreId?: string | null): StartTime[] {
  const out: StartTime[] = [];
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_STEP_MIN) {
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
      const end = at + lengthMin * 60_000;
      const clash = bookings.find((b) => b.id !== ignoreId && overlaps(at, end, t(b.starts_at), t(b.ends_at))) ?? null;
      out.push({ at, label: timeWords(at), clash, past: at < now });
    }
  }
  return out;
}

/** Morning (before 12), afternoon (12-5 PM), evening. */
export function partOfDay(at: number): "Morning" | "Afternoon" | "Evening" {
  const h = new Date(at).getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

// ---- words ----

export function timeWords(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today", "Tomorrow", or "Thu, Nov 6". */
export function dayWords(at: number, now: number): string {
  const days = Math.round((startOfDay(new Date(at)) - startOfDay(new Date(now))) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return new Date(at).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "2:00 PM – 2:15 PM". */
export function rangeWords(b: Pick<CallBooking, "starts_at" | "ends_at">): string {
  return `${timeWords(t(b.starts_at))} – ${timeWords(t(b.ends_at))}`;
}

/** "Today · 2:00 PM – 2:15 PM". */
export function bookingWords(b: Pick<CallBooking, "starts_at" | "ends_at">, now: number): string {
  return `${dayWords(t(b.starts_at), now)} · ${rangeWords(b)}`;
}

/** "Now", "in 25 min", "in 2 h", or null when it's another day. */
export function startsInWords(b: Pick<CallBooking, "starts_at" | "ends_at">, now: number): string | null {
  const start = t(b.starts_at);
  if (start <= now && now < t(b.ends_at)) return "Now";
  if (start <= now) return null;
  if (dayWords(start, now) !== "Today") return null;
  const min = Math.ceil((start - now) / 60_000);
  return min < 60 ? `in ${min} min` : `in ${Math.round(min / 60)} h`;
}

/** Bookings grouped by local day, in order. */
export function byDay(bookings: CallBooking[], now: number): { key: string; label: string; items: CallBooking[] }[] {
  const groups: { key: string; label: string; items: CallBooking[] }[] = [];
  for (const b of [...bookings].sort(byStart)) {
    const d = new Date(t(b.starts_at));
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: dayWords(d.getTime(), now), items: [] };
      groups.push(g);
    }
    g.items.push(b);
  }
  return groups;
}
