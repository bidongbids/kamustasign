// Leaked-password check for new passwords (sign-up, password reset, Account
// panel), using Have I Been Pwned's free Pwned Passwords range API.
//
// The password never leaves the device: only the first 5 characters of its
// SHA-1 hash are sent. The service answers with every leaked hash that starts
// with them (padded with fake entries, count 0, so the reply's size gives
// nothing away either), and the match happens here (k-anonymity).
//
// Supabase has the same check built in ("leaked password protection"), but
// only on its paid plans; friendlyAuthError already words its "pwned" error
// if the project ever turns that on.
//
// It fails open: offline, slow or blocked, the password is allowed. This
// protects people from a password that is already on attackers' lists; it
// isn't a lock an attacker has to get past.

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 4000;

export const LEAKED_PASSWORD_MESSAGE =
  "That password has shown up in a data leak, so it's one of the first that attackers try. Choose a different one.";

// UTF-8 bytes, also where TextEncoder is missing (the Jest environment).
function utf8(text: string): Uint8Array<ArrayBuffer> {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return new Uint8Array(bytes);
}

async function sha1Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-1", utf8(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** True if the reply to a range query lists `suffix` with a real (non-zero) count. */
export function rangeListsSuffix(body: string, suffix: string): boolean {
  const want = suffix.toUpperCase();
  for (const line of body.split("\n")) {
    const [hashSuffix, count] = line.trim().split(":");
    if (hashSuffix?.toUpperCase() === want && Number(count) > 0) return true;
  }
  return false;
}

/** true = leaked, false = not found, null = couldn't check. */
export async function isLeakedPassword(password: string): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(password);
    if (!hash) return null;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(RANGE_URL + hash.slice(0, 5), {
        headers: { "Add-Padding": "true" },
        signal: controller?.signal,
      });
      if (!res.ok) return null;
      return rangeListsSuffix(await res.text(), hash.slice(5));
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

/** The message to show when `password` is a known leaked one, else null (also when the check couldn't run). */
export async function leakedPasswordProblem(password: string): Promise<string | null> {
  return (await isLeakedPassword(password)) ? LEAKED_PASSWORD_MESSAGE : null;
}
