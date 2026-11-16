import { clearErrors, describeError, errorReport, installErrorCapture, recentErrors, recordError } from "../lib/errorLog";
import { APP_VERSION } from "../lib/appVersion";

beforeEach(() => {
  clearErrors();
  localStorage.clear();
});

describe("recordError", () => {
  it("keeps the source, message and top of the stack", () => {
    recordError("console", "[word reader] model load failed", new TypeError("Failed to fetch"));
    const [e] = recentErrors();
    expect(e.source).toBe("console");
    expect(e.message).toContain("[word reader] model load failed TypeError: Failed to fetch");
    expect(e.count).toBe(1);
  });

  it("the same error again is counted, not stored twice", () => {
    for (let i = 0; i < 50; i++) recordError("uncaught", "tracker frame failed");
    expect(recentErrors()).toHaveLength(1);
    expect(recentErrors()[0].count).toBe(50);
  });

  it("keeps only the last 30", () => {
    for (let i = 0; i < 40; i++) recordError("console", `error ${i}`);
    const list = recentErrors();
    expect(list).toHaveLength(30);
    expect(list[0].message).toBe("error 10");
    expect(list[29].message).toBe("error 39");
  });

  it("survives a reload (kept in this device's storage)", () => {
    recordError("console", "before the reload");
    expect(localStorage.getItem("lcsign.errorLog")).toContain("before the reload");
  });

  it("cuts very long messages", () => {
    recordError("console", "x".repeat(10_000));
    expect(recentErrors()[0].message.length).toBe(1500);
  });
});

describe("describeError", () => {
  it("supabase-style error objects keep their fields", () => {
    expect(describeError({ message: "JWT expired", code: "PGRST301" })).toBe('{"message":"JWT expired","code":"PGRST301"}');
  });
  it("plain values", () => {
    expect(describeError("text")).toBe("text");
    expect(describeError(42)).toBe("42");
    expect(describeError(undefined)).toBe("undefined");
  });
});

describe("errorReport", () => {
  it("starts with the version and lists the errors, newest last", () => {
    recordError("console", "first");
    recordError("uncaught", "second");
    recordError("uncaught", "second");
    const text = errorReport(new Date("2026-11-17T08:00:00Z"));
    expect(text.split("\n")[0]).toBe(`LCSign ${APP_VERSION} (Web) - error report, 2026-11-17T08:00:00.000Z`);
    expect(text.indexOf("first")).toBeLessThan(text.indexOf("second"));
    expect(text).toContain("[uncaught] (x2)");
  });

  it("says so when there's nothing to report", () => {
    expect(errorReport()).toContain("No errors recorded on this device.");
  });
});

describe("installErrorCapture", () => {
  it("records uncaught errors, failed promises and console.error - and still prints", () => {
    const listeners: Record<string, (e: any) => void> = {};
    const target = { addEventListener: (type: string, fn: (e: any) => void) => (listeners[type] = fn) } as any;
    const printed = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      installErrorCapture(target);
      listeners.error({ error: new Error("boom"), message: "boom" });
      listeners.unhandledrejection({ reason: new Error("no answer") });
      console.error("[call] couldn't connect");
      const messages = recentErrors().map((e) => `${e.source}: ${e.message.split("\n")[0]}`);
      expect(messages).toEqual(["uncaught: Error: boom", "unhandled promise: Error: no answer", "console: [call] couldn't connect"]);
      expect(printed).toHaveBeenCalledWith("[call] couldn't connect");
    } finally {
      printed.mockRestore();
    }
  });
});
