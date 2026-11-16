// Rules and wording shared by the sign-in forms (Login, Register, the 2FA
// and password screens, the Account panel): what a usable name, password or
// authenticator code is, and Supabase's auth errors turned into sentences a
// student can act on instead of "Invalid login credentials".

// Matches the profiles_full_name_length check (0011_auth_hardening.sql).
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;
// Supabase hashes with bcrypt, which only reads the first 72 bytes.
const PASSWORD_MAX_BYTES = 72;

export function isEmailShaped(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// UTF-8 length without TextEncoder, which some JS engines (and the Jest
// environment) don't have.
function utf8Bytes(text: string) {
  let bytes = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** Why `password` can't be the new password, or null when it can. */
export function newPasswordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (utf8Bytes(password) > PASSWORD_MAX_BYTES) return "Password is too long (72 characters at most).";
  if (password !== confirm) return "Passwords don't match.";
  return null;
}

/**
 * The digits of an authenticator code however it was typed or pasted.
 * Apps show it as "123 456"; a 6-character limit on the field used to cut
 * that paste to "123 45".
 */
export function cleanTotpCode(text: string) {
  return text.replace(/\D/g, "").slice(0, 6);
}

/**
 * Codes Supabase emails (sign-up confirmation, password reset) - the
 * {{ .Token }} in the email templates. Their length is the project's "Email
 * OTP Length" setting (Authentication > Sign In / Providers > Email): 6.
 */
export const EMAIL_CODE_LENGTH = 6;

export function cleanEmailCode(text: string) {
  return text.replace(/\D/g, "").slice(0, EMAIL_CODE_LENGTH);
}

type AuthErrorLike = { message?: string; code?: string; status?: number; name?: string; reasons?: string[] } | null | undefined;

const NETWORK = "Can't reach the LCSign server. Check your internet connection and try again.";
const SIGNED_OUT = "You've been signed out. Log in again.";
const LOG_IN_AGAIN = "For your safety, log out and log back in, then change your password.";
const EXISTING = "There's already an account with this email.";

// Supabase's error codes (auth-js lib/error-codes.ts) -> what to tell the person.
const MESSAGES: Record<string, string> = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: "Confirm your email first: enter the 6-digit code we emailed you.",
  user_already_exists: EXISTING,
  email_exists: EXISTING,
  email_address_invalid: "That doesn't look like an email address.",
  email_address_not_authorized: "LCSign can't send email to that address yet. Ask your school's LCSign admin for help.",
  weak_password: "That password is too easy to guess. Try a longer one.",
  same_password: "That's your current password. Choose a new one.",
  over_request_rate_limit: "Too many tries. Wait a minute, then try again.",
  over_email_send_rate_limit: "Too many emails were sent. Wait a few minutes, then try again.",
  mfa_verification_failed: "That code didn't work. Enter the newest code from your authenticator app.",
  mfa_challenge_expired: "That code ran out of time. Enter the newest code from your authenticator app.",
  insufficient_aal: "Enter your 2FA code first.",
  reauthentication_needed: LOG_IN_AGAIN,
  reauth_nonce_missing: LOG_IN_AGAIN,
  // Supabase answers a wrong email code and an old one the same way.
  otp_expired: "That code didn't work. It may be mistyped or more than an hour old - check it, or ask for a new one.",
  session_not_found: SIGNED_OUT,
  session_expired: SIGNED_OUT,
  refresh_token_not_found: SIGNED_OUT,
  signup_disabled: "New sign-ups are turned off. Ask your school's LCSign admin.",
  user_banned: "This account is blocked. Ask your school's LCSign admin.",
  request_timeout: NETWORK,
};

// Errors without a code (older servers, some proxies) still have the
// standard message.
const BY_MESSAGE: [RegExp, string][] = [
  [/invalid login credentials/i, "invalid_credentials"],
  [/already (been )?registered|already exists/i, "user_already_exists"],
  [/email not confirmed/i, "email_not_confirmed"],
  [/email rate limit/i, "over_email_send_rate_limit"],
  [/rate limit/i, "over_request_rate_limit"],
];

function codeOf(error: NonNullable<AuthErrorLike>) {
  if (error.code && MESSAGES[error.code]) return error.code;
  return BY_MESSAGE.find(([re]) => re.test(error.message ?? ""))?.[1] ?? error.code;
}

// supabase-js reports a failed fetch (offline, DNS, a 5xx from the gateway)
// as AuthRetryableFetchError; the browser's own wording varies.
export function isNetworkError(error: NonNullable<AuthErrorLike>) {
  return (
    error.name === "AuthRetryableFetchError" ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(error.message ?? "")
  );
}

export function friendlyAuthError(error: AuthErrorLike): string {
  if (!error) return "Something went wrong. Try again.";
  if (isNetworkError(error)) return NETWORK;
  const code = codeOf(error);
  if (code === "weak_password" && error.reasons?.includes("pwned")) {
    return "That password has shown up in a data leak. Choose a different one.";
  }
  if (code === "weak_password" && error.reasons?.includes("characters")) {
    return "Mix in other kinds of characters: capital letters, numbers or symbols.";
  }
  return (code && MESSAGES[code]) || error.message || "Something went wrong. Try again.";
}

/** A password check failed because the password is wrong (not the network etc.). */
export function isWrongPasswordError(error: AuthErrorLike) {
  return !!error && codeOf(error) === "invalid_credentials";
}

/** Sign-up hit an email that already has an account - offer "Log in instead". */
export function isExistingAccountError(error: AuthErrorLike) {
  if (!error) return false;
  const code = codeOf(error);
  return code === "user_already_exists" || code === "email_exists";
}
