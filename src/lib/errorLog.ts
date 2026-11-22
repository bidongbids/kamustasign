// The last few errors on this device, for "Copy error report" in
// Appearance > About LCSign and "Copy details" on the crash screen. When a
// teacher says "it broke", the report says which version, where, and what
// went wrong just before.
//
// Kept in this browser's storage (it survives a reload, which is usually
// the first thing anyone tries). While someone is signed in, the errors are
// also sent to the school's own database for its admins (App.tsx ->
// startErrorUpload, 0019_error_reports.sql): admins only, deleted after 30
// days. Never to an outside crash-reporting service: the students are
// minors (see ops notes). Email addresses, log-in tokens and Windows user
// names are taken out of the text first (scrubPersonal). The desktop app
// also writes page errors to %APPDATA%\LCSign\logs\lcsign.log
// (electron/main.js), which keeps far more.
//
// installErrorCapture() (App.tsx, production builds) records errors nothing
// caught - a failed promise, an error in a timer - and everything the app
// itself writes with console.error, which is how most screens report a
// failed load.
import { APP_VERSION, PLATFORM_LABEL, appPlatform, type AppPlatform } from "./appVersion";

export type ErrorEntry = {
  /** This device's key for the error: a repeat updates one row in the database. */
  id: string;
  at: string;
  source: string;
  message: string;
  count: number;
  /** The app version it happened in. */
  version: string;
  /** The account signed in when it happened (its user id); null = nobody. */
  user: string | null;
  /** How much of `count` the database already has. */
  sent: number;
};

/** One error as report_errors() (0019) takes it. */
export type ErrorUpload = {
  key: string;
  at: string;
  version: string;
  platform: AppPlatform;
  source: string;
  message: string;
  count: number;
  before_sign_in: boolean;
  device: string | null;
};

/** Sends a batch; true once the database has it. */
export type ErrorSender = (entries: ErrorUpload[]) => Promise<boolean>;

const STORAGE_KEY = "lcsign.errorLog";
const DESKTOP_SEEN_KEY = "lcsign.errorLog.desktopSeen";
const MAX_ENTRIES = 30;
const MAX_MESSAGE = 1500;
/** A burst of errors goes up as one batch. */
const UPLOAD_DELAY_MS = 15_000;
/** After a failed send: 1, 2, 4 ... minutes, at most 30. */
const RETRY_MS = 60_000;
const RETRY_MAX_MS = 30 * 60_000;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function newId(): string {
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `e${Date.now().toString(36)}${random}`;
}

function load(): ErrorEntry[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Entries saved by 1.1.0 have no id, version, user or sent yet.
    return parsed.slice(-MAX_ENTRIES).map((e: Partial<ErrorEntry>) => ({
      id: typeof e.id === "string" ? e.id : newId(),
      at: String(e.at ?? new Date().toISOString()),
      source: String(e.source ?? "unknown"),
      message: String(e.message ?? ""),
      count: Number(e.count) || 1,
      version: typeof e.version === "string" ? e.version : APP_VERSION,
      user: typeof e.user === "string" ? e.user : null,
      sent: Number(e.sent) || 0,
    }));
  } catch {
    return [];
  }
}

let entries: ErrorEntry[] = load();
let currentUser: string | null = null;

function save() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // full or blocked storage: the in-memory list still works
  }
}

/**
 * Takes out what could identify someone before an error is kept or sent:
 * email addresses, log-in tokens (JWTs, ?access_token=..., Bearer ...), and
 * the Windows / Mac / Linux user name in file paths - on a school computer
 * that can be the student's name.
 */
export function scrubPersonal(text: string): string {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[token]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]")
    .replace(/\b(access_token|refresh_token|provider_token|token|apikey|api_key|password|code)=[^&\s"'#]+/gi, "$1=[removed]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/([A-Za-z]:[\\/]+Users[\\/]+)[^\\/\s"']+/gi, "$1[user]")
    .replace(/(\/(?:Users|home)\/)[^/\s"']+/g, "$1[user]");
}

/** Readable text for anything thrown or logged: name, message and the top of the stack. */
export function describeError(value: unknown): string {
  if (value instanceof Error) {
    const stack = (value.stack ?? "").split("\n").slice(1, 7).join("\n");
    return `${value.name}: ${value.message}${stack ? `\n${stack}` : ""}`;
  }
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value && typeof (value as { message: unknown }).message === "string") {
    // supabase-js errors and the like: { message, code, details }
    try {
      return JSON.stringify(value);
    } catch {
      return String((value as { message: string }).message);
    }
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function add(source: string, message: string, at: string) {
  const last = entries[entries.length - 1];
  if (last && last.source === source && last.message === message && last.user === currentUser) {
    // The same error every frame shouldn't push everything else out.
    last.count += 1;
    last.at = at;
  } else {
    const entry: ErrorEntry = { id: newId(), at, source, message, count: 1, version: APP_VERSION, user: currentUser, sent: 0 };
    entries = [...entries, entry].slice(-MAX_ENTRIES);
  }
  save();
  scheduleUpload(UPLOAD_DELAY_MS);
}

export function recordError(source: string, ...values: unknown[]) {
  const message = scrubPersonal(values.map(describeError).join(" ")).slice(0, MAX_MESSAGE);
  if (!message.trim()) return;
  add(source, message, new Date().toISOString());
}

export function recentErrors(): ErrorEntry[] {
  return entries.slice();
}

export function clearErrors() {
  entries = [];
  save();
}

/** Version, device and the recent errors, newest last - for the clipboard. */
export function errorReport(now = new Date()): string {
  const where = typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "unknown";
  const lines = [
    `LCSign ${APP_VERSION} (${PLATFORM_LABEL[appPlatform()]}) - error report, ${now.toISOString()}`,
    `Device: ${where}`,
    "",
  ];
  if (!entries.length) lines.push("No errors recorded on this device.");
  for (const e of entries) {
    lines.push(`${e.at} [${e.source}]${e.count > 1 ? ` (x${e.count})` : ""}`, e.message, "");
  }
  return lines.join("\n").trimEnd();
}

// ── Desktop crashes and freezes ─────────────────────────────────────────
// A page that crashed can't record its own crash, so the desktop app's main
// process keeps the last few in problems.json (electron/main.js); the page
// adds the ones it hasn't seen once someone signs in again.

export type DesktopProblem = { at: string; kind: string; message: string };

export function addDesktopProblems(list: unknown) {
  if (!Array.isArray(list)) return;
  const store = storage();
  let seen = "";
  try {
    seen = store?.getItem(DESKTOP_SEEN_KEY) ?? "";
  } catch {
    seen = "";
  }
  const fresh = (list as DesktopProblem[])
    .filter((p) => p && typeof p.at === "string" && typeof p.message === "string" && p.at > seen)
    .sort((a, b) => a.at.localeCompare(b.at));
  if (!fresh.length) return;
  for (const p of fresh) {
    add(`desktop ${String(p.kind || "problem").slice(0, 20)}`, scrubPersonal(p.message).slice(0, MAX_MESSAGE), p.at);
  }
  try {
    store?.setItem(DESKTOP_SEEN_KEY, fresh[fresh.length - 1].at);
  } catch {
    // seen again next time: the database updates the same rows, no harm
  }
}

// ── Sending to the school's database ────────────────────────────────────

let upload: { user: string; send: ErrorSender } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;
let failures = 0;

/** Whose account new errors belong to (App.tsx); null = nobody signed in. */
export function setErrorUser(user: string | null) {
  currentUser = user;
}

/** Errors this account may send: its own, and those from before anyone signed in. */
export function unsentErrors(user: string): ErrorEntry[] {
  return entries.filter((e) => e.count > e.sent && (e.user === user || e.user === null)).slice(-MAX_ENTRIES);
}

function deviceText(): string | null {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return ua ? ua.slice(0, 300) : null;
}

function toUpload(e: ErrorEntry): ErrorUpload {
  return {
    key: e.id,
    at: e.at,
    version: e.version,
    platform: appPlatform(),
    source: e.source.slice(0, 40),
    message: e.message,
    count: e.count,
    before_sign_in: e.user === null,
    device: deviceText(),
  };
}

function scheduleUpload(ms: number) {
  if (!upload || timer) return;
  timer = setTimeout(() => void flushErrors(), ms);
}

/** Sends what's waiting now. Exported for tests; the timers call it. */
export async function flushErrors(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!upload || inFlight) return;
  const { user, send } = upload;
  const batch = unsentErrors(user);
  if (!batch.length) return;
  const counts = batch.map((e) => ({ id: e.id, count: e.count }));
  inFlight = true;
  let ok = false;
  try {
    ok = await send(batch.map(toUpload));
  } catch {
    // Never console.error here: that would record an error about sending errors.
    ok = false;
  }
  inFlight = false;
  if (ok) {
    failures = 0;
    for (const { id, count } of counts) {
      const e = entries.find((x) => x.id === id);
      if (e) e.sent = Math.max(e.sent, count);
    }
    save();
    if (upload && unsentErrors(upload.user).length) scheduleUpload(UPLOAD_DELAY_MS);
  } else {
    failures += 1;
    scheduleUpload(Math.min(RETRY_MS * 2 ** (failures - 1), RETRY_MAX_MS));
  }
}

/** Signed in and approved: send this account's errors now and as they happen. */
export function startErrorUpload(user: string, send: ErrorSender) {
  if (upload?.user === user && upload.send === send) return;
  stopErrorUpload();
  upload = { user, send };
  failures = 0;
  scheduleUpload(0);
}

/** Signed out (or not allowed to send): errors stay on the device. */
export function stopErrorUpload() {
  upload = null;
  if (timer) clearTimeout(timer);
  timer = null;
  failures = 0;
}

// ── Capture ─────────────────────────────────────────────────────────────

let installed = false;

/** Window error / unhandledrejection, and a copy of every console.error. Once only. */
export function installErrorCapture(target: (Window & typeof globalThis) | undefined = typeof window !== "undefined" ? window : undefined) {
  if (installed || !target || typeof target.addEventListener !== "function") return;
  installed = true;
  target.addEventListener("error", (event: ErrorEvent) => {
    recordError("uncaught", event.error ?? event.message);
  });
  // (Chromium also prints both of these to the console as "Uncaught ...",
  // which is how they reach the desktop app's log file.)
  target.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    recordError("unhandled promise", event.reason);
  });
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      recordError("console", ...args);
    } catch {
      // never let the log break logging
    }
    original(...args);
  };
}
