// Words for the admin's "App errors" list (AdminErrorReports.tsx): the rows
// every copy of the app sends (errorLog.ts -> 0019_error_reports.sql).
import { PLATFORM_LABEL } from "./appVersion";
import type { ErrorReportRow, ProfileRole } from "./queries";

/** "Windows · Chrome 141" from a browser line; "" when it says nothing useful. */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "";
  const android = /Android\s?(\d+)?/.exec(ua);
  const os = android
    ? `Android${android[1] ? ` ${android[1]}` : ""}`
    : /iPhone|iPad/.test(ua)
      ? "iPhone/iPad"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /CrOS/.test(ua)
            ? "Chromebook"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  // First match wins: Electron and Edge also say "Chrome", Chrome also says "Safari".
  const browsers: [RegExp, string][] = [
    [/Electron\/(\d+)/, "Electron"],
    [/Edg\/(\d+)/, "Edge"],
    [/Firefox\/(\d+)/, "Firefox"],
    [/Chrome\/(\d+)/, "Chrome"],
    [/Version\/(\d+).*Safari/, "Safari"],
  ];
  let browser = "";
  for (const [re, name] of browsers) {
    const m = re.exec(ua);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  return [os, browser].filter(Boolean).join(" · ");
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "Nov 20". */
export function whenText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const ms = now.getTime() - d.getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24 && d.getDate() === now.getDate()) return `${h} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "yesterday";
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** The error's first line, which is usually all an admin needs to recognise it. */
export function firstLine(message: string): string {
  return (message.split("\n").find((l) => l.trim()) ?? message).trim();
}

/** Where in the app, in words. */
export function sourceText(source: string): string {
  switch (source) {
    case "console":
      return "reported by the app";
    case "uncaught":
      return "not caught";
    case "unhandled promise":
      return "not caught (background task)";
    case "crash":
      return "screen crashed";
    case "desktop crash":
      return "Windows app stopped";
    case "desktop freeze":
      return "Windows app froze";
    case "desktop main":
      return "Windows app (background)";
    default:
      return source;
  }
}

export type ReportPerson = { name: string; role: ProfileRole } | null;

export function personText(row: Pick<ErrorReportRow, "before_sign_in">, person: ReportPerson): string {
  const who = person ? `${person.name} (${person.role})` : "a deleted account";
  return row.before_sign_in ? `before sign-in, sent by ${who}` : who;
}

export type ErrorSummary = { rows: number; times: number; people: number; lastWeek: number };

export function summarize(rows: ErrorReportRow[], now = new Date()): ErrorSummary {
  const weekAgo = now.getTime() - 7 * 24 * 3600_000;
  return {
    rows: rows.length,
    times: rows.reduce((n, r) => n + r.count, 0),
    people: new Set(rows.map((r) => r.user_id)).size,
    lastWeek: rows.filter((r) => new Date(r.happened_at).getTime() >= weekAgo).length,
  };
}

/** One sentence for the card on the Accounts page. */
export function summaryText(s: ErrorSummary): string {
  if (!s.rows) return "No errors in the last 30 days.";
  const errors = `${s.rows} error${s.rows === 1 ? "" : "s"}`;
  const people = `${s.people} account${s.people === 1 ? "" : "s"}`;
  const week = s.lastWeek === s.rows ? "all in the last 7 days" : `${s.lastWeek} in the last 7 days`;
  return `${errors} from ${people} in the last 30 days, ${week}.`;
}

/** One report as plain text, for whoever fixes LCSign. */
export function reportText(row: ErrorReportRow, person: ReportPerson): string {
  return [
    `LCSign ${row.app_version} (${PLATFORM_LABEL[row.platform] ?? row.platform}) - ${row.happened_at}${row.count > 1 ? ` (x${row.count})` : ""}`,
    `Where: ${sourceText(row.source)} [${row.source}]`,
    `Account: ${personText(row, person)}`,
    row.device ? `Device: ${row.device}` : null,
    "",
    row.message,
  ]
    .filter((l) => l !== null)
    .join("\n");
}
