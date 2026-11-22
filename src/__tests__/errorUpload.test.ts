// errorLog.ts: what is kept out of error text, and sending errors to the
// school's database (0019) - whose errors, when, and what happens on failure.
import {
  addDesktopProblems,
  clearErrors,
  flushErrors,
  recentErrors,
  recordError,
  scrubPersonal,
  setErrorUser,
  startErrorUpload,
  stopErrorUpload,
  unsentErrors,
  type ErrorUpload,
} from "../lib/errorLog";
import { APP_VERSION } from "../lib/appVersion";

beforeEach(() => {
  stopErrorUpload();
  setErrorUser(null);
  clearErrors();
  localStorage.clear();
});

describe("scrubPersonal", () => {
  it("takes out emails, log-in tokens and user names in paths", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijklmnop";
    const text = scrubPersonal(
      `juan.cruz@school.edu.ph failed; Authorization: Bearer ${jwt}; https://x.supabase.co/auth?access_token=${jwt}&type=recovery; ` +
        "at C:\\Users\\JuanCruz\\AppData\\Local\\lcsign.js and /home/ana/app.js"
    );
    expect(text).not.toMatch(/juan|JuanCruz|ana\/|eyJ/i);
    expect(text).toContain("[email] failed");
    expect(text).toContain("Bearer [token]");
    expect(text).toContain("access_token=[removed]&type=recovery");
    expect(text).toContain("C:\\Users\\[user]\\AppData");
    expect(text).toContain("/home/[user]/app.js");
  });

  it("leaves ordinary errors alone", () => {
    const text = "TypeError: Failed to fetch\n    at loadModel (app://lcsign/_expo/static/js/web/index-3f2a.js:1:2345)";
    expect(scrubPersonal(text)).toBe(text);
  });

  it("is applied before an error is kept", () => {
    recordError("console", "couldn't sign in ana@example.com");
    expect(recentErrors()[0].message).toBe("couldn't sign in [email]");
  });
});

describe("sending to the school's database", () => {
  const sender = (result: boolean | "throw" = true) => {
    const batches: ErrorUpload[][] = [];
    const send = jest.fn(async (entries: ErrorUpload[]) => {
      batches.push(entries);
      if (result === "throw") throw new Error("offline");
      return result;
    });
    return { send, batches };
  };

  it("tags errors with the account signed in at the time", () => {
    recordError("console", "before");
    setErrorUser("user-a");
    recordError("console", "during");
    expect(recentErrors().map((e) => e.user)).toEqual([null, "user-a"]);
  });

  it("the same error under another account is a new entry", () => {
    setErrorUser("user-a");
    recordError("console", "same");
    setErrorUser("user-b");
    recordError("console", "same");
    expect(recentErrors()).toHaveLength(2);
  });

  it("sends this account's errors and those from before sign-in - not another account's", async () => {
    recordError("console", "before sign-in");
    setErrorUser("user-b");
    recordError("console", "b's error");
    setErrorUser("user-a");
    recordError("console", "a's error");
    const { send, batches } = sender();
    startErrorUpload("user-a", send);
    await flushErrors();
    expect(batches).toHaveLength(1);
    expect(batches[0].map((e) => [e.message, e.before_sign_in])).toEqual([
      ["before sign-in", true],
      ["a's error", false],
    ]);
    expect(batches[0][0]).toMatchObject({ version: APP_VERSION, platform: "web", source: "console", count: 1 });
    expect(batches[0][0].key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    // Sent once only; b's waits for b.
    expect(unsentErrors("user-a")).toHaveLength(0);
    expect(unsentErrors("user-b").map((e) => e.message)).toEqual(["b's error"]);
  });

  it("a repeat after sending goes up again with the same key and the new count", async () => {
    setErrorUser("user-a");
    const { send, batches } = sender();
    startErrorUpload("user-a", send);
    recordError("uncaught", "tracker frame failed");
    await flushErrors();
    recordError("uncaught", "tracker frame failed");
    recordError("uncaught", "tracker frame failed");
    await flushErrors();
    expect(batches).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
    expect(batches[1][0].key).toBe(batches[0][0].key);
    expect(batches[1][0].count).toBe(3);
  });

  it("keeps errors when sending fails, and remembers what was sent across a reload", async () => {
    setErrorUser("user-a");
    recordError("console", "one");
    const failing = sender("throw");
    startErrorUpload("user-a", failing.send);
    await flushErrors();
    expect(failing.send).toHaveBeenCalled();
    expect(unsentErrors("user-a")).toHaveLength(1);
    const refused = sender(false);
    startErrorUpload("user-a", refused.send);
    await flushErrors();
    expect(unsentErrors("user-a")).toHaveLength(1);
    const ok = sender(true);
    startErrorUpload("user-a", ok.send);
    await flushErrors();
    expect(unsentErrors("user-a")).toHaveLength(0);
    const saved = JSON.parse(localStorage.getItem("lcsign.errorLog")!);
    expect(saved[0]).toMatchObject({ message: "one", user: "user-a", sent: 1, count: 1 });
  });

  it("sends nothing while stopped (signed out)", async () => {
    recordError("console", "x");
    const { send } = sender();
    startErrorUpload("user-a", send);
    stopErrorUpload();
    await flushErrors();
    expect(send).not.toHaveBeenCalled();
  });

  it("a burst of errors goes up as one batch, a little later", async () => {
    jest.useFakeTimers();
    try {
      setErrorUser("user-a");
      const { send, batches } = sender();
      startErrorUpload("user-a", send);
      await jest.advanceTimersByTimeAsync(10);
      for (let i = 0; i < 5; i++) recordError("console", `error ${i}`);
      expect(send).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(15_000);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it("after a failure it waits before trying again", async () => {
    jest.useFakeTimers();
    try {
      setErrorUser("user-a");
      recordError("console", "x");
      const failing = sender(false);
      startErrorUpload("user-a", failing.send);
      await jest.advanceTimersByTimeAsync(10);
      expect(failing.send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(failing.send).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(60_000);
      expect(failing.send).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("addDesktopProblems", () => {
  const problems = [
    { at: "2026-11-20T08:00:00.000Z", kind: "freeze", message: "LCSign stopped responding (the window froze)." },
    { at: "2026-11-20T09:00:00.000Z", kind: "crash", message: "LCSign stopped working: oom (exit code -536870904). Found when it opened again." },
  ];

  it("adds crashes from the desktop app once, with their own time", () => {
    setErrorUser("user-a");
    addDesktopProblems(problems);
    addDesktopProblems(problems);
    expect(recentErrors().map((e) => [e.source, e.at, e.user])).toEqual([
      ["desktop freeze", "2026-11-20T08:00:00.000Z", "user-a"],
      ["desktop crash", "2026-11-20T09:00:00.000Z", "user-a"],
    ]);
    addDesktopProblems([...problems, { at: "2026-11-21T10:00:00.000Z", kind: "crash", message: "again" }]);
    expect(recentErrors()).toHaveLength(3);
  });

  it("ignores anything that isn't a list of problems", () => {
    addDesktopProblems(null);
    addDesktopProblems({ at: "x" });
    addDesktopProblems([{ nope: true }]);
    expect(recentErrors()).toHaveLength(0);
  });
});
