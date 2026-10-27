// The signed-in person's own account, for the Account panel: password and
// 2FA. The name is a profile field, so it goes through queries.ts
// (updateProfileName) like an admin's edit does.
import { supabase, createScratchClient } from "./supabase";
import { friendlyAuthError, isWrongPasswordError } from "./authForms";

/**
 * Changes the password after checking the current one. Supabase lets any
 * open session set a new password, so on a shared classroom computer
 * whoever sat down next could lock the owner out. The check signs in on a
 * separate client, so the open session (maybe aal2) isn't replaced.
 */
export async function changePassword(email: string, current: string, next: string): Promise<{ error: string | null }> {
  const scratch = createScratchClient();
  const { error: checkError } = await scratch.auth.signInWithPassword({ email, password: current });
  if (checkError) {
    return { error: isWrongPasswordError(checkError) ? "Your current password isn't right." : friendlyAuthError(checkError) };
  }
  // That sign-in was only a check; end its session again.
  await scratch.auth.signOut({ scope: "local" });
  // current_password is checked by the server too when the project turns on
  // "require current password"; otherwise it's ignored.
  const { error } = await supabase.auth.updateUser({ password: next, current_password: current });
  return { error: error ? friendlyAuthError(error) : null };
}

/** The account's verified authenticator-app factor, or null without 2FA. */
export async function getTotpFactor(): Promise<{ factorId: string | null; error: string | null }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { factorId: null, error: friendlyAuthError(error) };
  return { factorId: data?.totp?.[0]?.id ?? null, error: null };
}

/** Turns 2FA off - only with a fresh code, so a borrowed open session can't. */
export async function turnOffTwoFactor(factorId: string, code: string): Promise<{ error: string | null }> {
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (verifyError) return { error: friendlyAuthError(verifyError) };
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return { error: error ? friendlyAuthError(error) : null };
}
