// The last few errors on this device, for "Copy error report" in
// Appearance > About LCSign and "Copy details" on the crash screen. When a
// teacher says "it broke", the report says which version, where, and what
// went wrong just before.
//
// Kept in this browser's storage (it survives a reload, which is usually
// the first thing anyone tries) and never sent anywhere: the students are
// minors, so there is no crash-reporting service (see ops notes). The
// desktop app also writes page errors to %APPDATA%\LCSign\logs\lcsign.log
// (electron/main.js), which keeps far more.
//
// installErrorCapture() (App.tsx, production builds) records errors nothing
// caught - a failed promise, an error in a timer - and everything the app
// itself writes with console.error, which is how most screens report a
// failed load.
import { APP_VERSION, PLATFORM_LABEL, appPlatform } from "./appVersion";

export type ErrorEntry = { at: string; source: string; message: string; count: number };

const STORAGE_KEY = "lcsign.errorLog";
const MAX_ENTRIES = 30;
const MAX_MESSAGE = 1500;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function load(): ErrorEntry[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

let entries: ErrorEntry[] = load();

function save() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // full or blocked storage: the in-memory list still works
  }
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

export function recordError(source: string, ...values: unknown[]) {
  const message = values.map(describeError).join(" ").slice(0, MAX_MESSAGE);
  if (!message.trim()) return;
  const last = entries[entries.length - 1];
  if (last && last.source === source && last.message === message) {
    // The same error every frame shouldn't push everything else out.
    last.count += 1;
    last.at = new Date().toISOString();
  } else {
    entries = [...entries, { at: new Date().toISOString(), source, message, count: 1 }].slice(-MAX_ENTRIES);
  }
  save();
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
