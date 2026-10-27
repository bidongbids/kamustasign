import {
  cleanTotpCode,
  friendlyAuthError,
  isEmailShaped,
  isExistingAccountError,
  isWrongPasswordError,
  newPasswordProblem,
} from "../lib/authForms";

describe("friendlyAuthError", () => {
  it("maps Supabase error codes to plain sentences", () => {
    expect(friendlyAuthError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(
      "That email and password don't match. Check them and try again."
    );
    expect(friendlyAuthError({ code: "mfa_verification_failed", message: "Invalid TOTP code entered" })).toMatch(/code didn't work/);
    expect(friendlyAuthError({ code: "same_password", message: "New password should be different" })).toMatch(/current password/);
  });

  it("falls back to the standard message when there is no code", () => {
    expect(friendlyAuthError({ message: "Invalid login credentials" })).toMatch(/don't match/);
    expect(friendlyAuthError({ message: "User already registered" })).toMatch(/already an account/);
    expect(friendlyAuthError({ message: "Email rate limit exceeded" })).toMatch(/Too many emails/);
  });

  it("says when the server can't be reached", () => {
    expect(friendlyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 })).toMatch(
      /Can't reach the LCSign server/
    );
    expect(friendlyAuthError({ name: "TypeError", message: "NetworkError when attempting to fetch resource." })).toMatch(
      /internet connection/
    );
  });

  it("explains which weak-password rule failed", () => {
    expect(friendlyAuthError({ code: "weak_password", message: "Password is known to be weak", reasons: ["pwned"] })).toMatch(
      /data leak/
    );
    expect(friendlyAuthError({ code: "weak_password", message: "Password should contain...", reasons: ["characters"] })).toMatch(
      /capital letters/
    );
  });

  it("keeps an unknown error's own message", () => {
    expect(friendlyAuthError({ code: "something_new", message: "Something specific" })).toBe("Something specific");
    expect(friendlyAuthError(null)).toBe("Something went wrong. Try again.");
  });
});

describe("isExistingAccountError", () => {
  it("recognises an email that already has an account", () => {
    expect(isExistingAccountError({ code: "user_already_exists", message: "User already registered" })).toBe(true);
    expect(isExistingAccountError({ message: "User already registered" })).toBe(true);
    expect(isExistingAccountError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
    expect(isExistingAccountError(null)).toBe(false);
  });
});

describe("isWrongPasswordError", () => {
  it("is only a wrong password, not a network or rate-limit failure", () => {
    expect(isWrongPasswordError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(true);
    expect(isWrongPasswordError({ message: "Invalid login credentials" })).toBe(true);
    expect(isWrongPasswordError({ code: "over_request_rate_limit", message: "Too many requests" })).toBe(false);
    expect(isWrongPasswordError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(false);
  });
});

describe("cleanTotpCode", () => {
  it("keeps only the digits, at most six", () => {
    expect(cleanTotpCode("123 456")).toBe("123456");
    expect(cleanTotpCode(" 123-456 ")).toBe("123456");
    expect(cleanTotpCode("1234567")).toBe("123456");
    expect(cleanTotpCode("12a")).toBe("12");
  });
});

describe("newPasswordProblem", () => {
  it("accepts a long-enough matching password", () => {
    expect(newPasswordProblem("correct horse", "correct horse")).toBeNull();
  });

  it("rejects short, too-long and mismatched passwords", () => {
    expect(newPasswordProblem("short", "short")).toMatch(/at least 8/);
    // bcrypt reads 72 bytes; "é" is two bytes in UTF-8.
    expect(newPasswordProblem("é".repeat(37), "é".repeat(37))).toMatch(/too long/);
    expect(newPasswordProblem("long enough", "long enougH")).toMatch(/don't match/);
  });
});

describe("isEmailShaped", () => {
  it("checks the basic shape only", () => {
    expect(isEmailShaped(" ana@school.edu.ph ")).toBe(true);
    expect(isEmailShaped("ana@school")).toBe(false);
    expect(isEmailShaped("ana school@x.ph")).toBe(false);
  });
});
