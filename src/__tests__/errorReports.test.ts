import { deviceLabel, firstLine, personText, reportText, sourceText, summarize, summaryText, whenText } from "../lib/errorReports";
import type { ErrorReportRow } from "../lib/queries";

const row = (over: Partial<ErrorReportRow> = {}): ErrorReportRow => ({
  id: 1,
  user_id: "u1",
  happened_at: "2026-11-22T09:30:00.000Z",
  reported_at: "2026-11-22T09:31:00.000Z",
  app_version: "1.1.0",
  platform: "desktop",
  source: "console",
  message: "[word reader] model load failed TypeError: Failed to fetch\n    at load (index.js:1:2)",
  count: 1,
  before_sign_in: false,
  device: null,
  ...over,
});

describe("deviceLabel", () => {
  it("names the system and browser", () => {
    expect(
      deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) LCSign/1.1.0 Chrome/140.0.0.0 Electron/39.2.0 Safari/537.36")
    ).toBe("Windows · Electron 39");
    expect(
      deviceLabel("Mozilla/5.0 (Linux; Android 14; SM-A146P Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36")
    ).toBe("Android 14 · Chrome 141");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0")).toBe(
      "Windows · Edge 141"
    );
    expect(deviceLabel(null)).toBe("");
  });
});

describe("whenText", () => {
  const now = new Date(2026, 10, 22, 15, 0);
  it("recent times in words, older ones as a date", () => {
    expect(whenText(new Date(2026, 10, 22, 14, 59, 40).toISOString(), now)).toBe("just now");
    expect(whenText(new Date(2026, 10, 22, 14, 48).toISOString(), now)).toBe("12 min ago");
    expect(whenText(new Date(2026, 10, 22, 12, 0).toISOString(), now)).toBe("3 h ago");
    expect(whenText(new Date(2026, 10, 21, 20, 0).toISOString(), now)).toBe("yesterday");
    expect(whenText(new Date(2026, 10, 18, 9, 0).toISOString(), now)).toMatch(/18/);
  });
});

describe("the admin's list", () => {
  it("first line, where, and whose account", () => {
    expect(firstLine(row().message)).toBe("[word reader] model load failed TypeError: Failed to fetch");
    expect(sourceText("desktop crash")).toBe("Windows app stopped");
    expect(sourceText("something new")).toBe("something new");
    expect(personText(row(), { name: "Ana Cruz", role: "student" })).toBe("Ana Cruz (student)");
    expect(personText(row({ before_sign_in: true }), { name: "Ana Cruz", role: "student" })).toBe("before sign-in, sent by Ana Cruz (student)");
    expect(personText(row(), null)).toBe("a deleted account");
  });

  it("summary for the card", () => {
    const now = new Date("2026-11-22T12:00:00.000Z");
    const rows = [row(), row({ id: 2, user_id: "u2", count: 4 }), row({ id: 3, happened_at: "2026-11-01T00:00:00.000Z" })];
    const s = summarize(rows, now);
    expect(s).toEqual({ rows: 3, times: 6, people: 2, lastWeek: 2 });
    expect(summaryText(s)).toBe("3 errors from 2 accounts in the last 30 days, 2 in the last 7 days.");
    expect(summaryText(summarize([row()], now))).toBe("1 error from 1 account in the last 30 days, all in the last 7 days.");
    expect(summaryText(summarize([], now))).toBe("No errors in the last 30 days.");
  });

  it("copy text has everything someone fixing it needs", () => {
    const text = reportText(row({ count: 3, device: "Mozilla/5.0 (Windows NT 10.0)" }), { name: "Ana Cruz", role: "student" });
    expect(text.split("\n")).toEqual([
      "LCSign 1.1.0 (Windows app) - 2026-11-22T09:30:00.000Z (x3)",
      "Where: reported by the app [console]",
      "Account: Ana Cruz (student)",
      "Device: Mozilla/5.0 (Windows NT 10.0)",
      "",
      "[word reader] model load failed TypeError: Failed to fetch",
      "    at load (index.js:1:2)",
    ]);
  });
});
