import { webcrypto } from "crypto";
import { LEAKED_PASSWORD_MESSAGE, isLeakedPassword, leakedPasswordProblem, rangeListsSuffix } from "../lib/pwnedPassword";
import { cleanEmailCode, friendlyAuthError } from "../lib/authForms";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PASSWORD_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
});

afterEach(() => {
  (globalThis as any).fetch = undefined;
});

function fakeRange(body: string, status = 200) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  (globalThis as any).fetch = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    return { ok: status === 200, text: async () => body };
  });
  return calls;
}

describe("leaked-password check", () => {
  it("sends only the first 5 hash characters, padded", async () => {
    const calls = fakeRange(`${PASSWORD_SUFFIX}:9659365\r\n0018A45C4D1DEF81644B54AB7F969B88D65:1`);
    expect(await isLeakedPassword("password")).toBe(true);
    expect(calls[0].url).toBe("https://api.pwnedpasswords.com/range/5BAA6");
    expect(calls[0].headers["Add-Padding"]).toBe("true");
    expect(await leakedPasswordProblem("password")).toBe(LEAKED_PASSWORD_MESSAGE);
  });

  it("hashes non-English passwords the way the service does (UTF-8)", async () => {
    const pw = "pässwörd ñ ✓ 😀 salamat";
    const hash = require("crypto").createHash("sha1").update(pw, "utf8").digest("hex").toUpperCase();
    const calls = fakeRange(`${hash.slice(5)}:4`);
    expect(await isLeakedPassword(pw)).toBe(true);
    expect(calls[0].url.endsWith(hash.slice(0, 5))).toBe(true);
  });

  it("ignores padding entries (count 0) and other suffixes", () => {
    expect(rangeListsSuffix(`${PASSWORD_SUFFIX}:0\nAAAA:3`, PASSWORD_SUFFIX)).toBe(false);
    expect(rangeListsSuffix(`AAAA:3\n${PASSWORD_SUFFIX.toLowerCase()}:2`, PASSWORD_SUFFIX)).toBe(true);
  });

  it("allows a password not on the list", async () => {
    fakeRange("0018A45C4D1DEF81644B54AB7F969B88D65:1");
    expect(await isLeakedPassword("password")).toBe(false);
    expect(await leakedPasswordProblem("password")).toBeNull();
  });

  it("fails open when the service can't be reached or errors", async () => {
    (globalThis as any).fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await isLeakedPassword("password")).toBeNull();
    expect(await leakedPasswordProblem("password")).toBeNull();
    fakeRange("", 503);
    expect(await isLeakedPassword("password")).toBeNull();
  });
});

describe("email codes", () => {
  it("keeps the digits of a pasted code, up to 6", () => {
    expect(cleanEmailCode(" 123 456 ")).toBe("123456");
    expect(cleanEmailCode("12345678")).toBe("123456");
  });

  it("words the code errors", () => {
    expect(friendlyAuthError({ code: "otp_expired", message: "Token has expired or is invalid" })).toMatch(/code didn't work/);
    expect(friendlyAuthError({ message: "Email not confirmed" })).toMatch(/6-digit code/);
  });
});
