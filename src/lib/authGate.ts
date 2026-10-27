import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import { friendlyAuthError } from "./authForms";
import type { Profile } from "./queries";

export type AuthGateStatus = "loading" | "signedOut" | "needsMfa" | "authenticated";

export type AuthGateState = {
  status: AuthGateStatus;
  session: Session | null;
  mfaFactorId: string | null;
  /** The signed-in account's profile - its role decides the dashboard, never
   *  the tile picked on the role-select screen. Null until loaded. */
  profile: Profile | null;
  profileError: string | null;
  /** Opened from a password-reset email: show ResetPasswordScreen first. */
  recovering: boolean;
  endRecovery: () => void;
  /** An email link (reset, confirmation) that failed - expired or used. */
  linkError: string | null;
  clearLinkError: () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

// Supabase email links come back with their result in the URL hash. Read it
// once at load, before supabase-js clears it: its PASSWORD_RECOVERY event can
// fire before the hook below has subscribed.
const linkParams =
  Platform.OS === "web" && typeof window !== "undefined" ? new URLSearchParams(window.location.hash.slice(1)) : null;
const recoveryLinkOnLoad = linkParams?.get("type") === "recovery";
const linkErrorOnLoad =
  linkParams && (linkParams.get("error_code") || linkParams.get("error"))
    ? friendlyAuthError({
        code: linkParams.get("error_code") ?? undefined,
        message: linkParams.get("error_description") ?? "That link didn't work. Ask for a new one.",
      })
    : null;

// Session presence alone isn't "authenticated" — Supabase issues a session at
// aal1 right after password sign-in, before an enrolled TOTP factor has been
// verified. Screens must check `status`, not `session`, to gate access. (The
// database refuses aal1 sessions on 2FA accounts too - 0011_auth_hardening.sql -
// so skipping this screen gets nothing.)
export function useAuthGate(): AuthGateState {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthGateStatus>("loading");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(recoveryLinkOnLoad);
  const [linkError, setLinkError] = useState<string | null>(linkErrorOnLoad);
  // Evaluations are async and can overlap (initial getSession + an auth
  // event); only the latest one may set state.
  const runRef = useRef(0);

  const evaluate = useCallback(async (nextSession: Session | null) => {
    const run = ++runRef.current;
    const stale = () => run !== runRef.current;

    if (!nextSession) {
      setSession(null);
      setMfaFactorId(null);
      setProfile(null);
      setProfileError(null);
      setRecovering(false);
      setStatus("signedOut");
      return;
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (stale()) return;
    setSession(nextSession);
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      if (stale()) return;
      setMfaFactorId(factors?.totp?.[0]?.id ?? null);
      setProfile(null);
      setStatus("needsMfa");
      return;
    }

    const { data, error } = await supabase.from("profiles").select("*").eq("id", nextSession.user.id).maybeSingle();
    if (stale()) return;
    setMfaFactorId(null);
    setProfile((data as Profile | null) ?? null);
    setProfileError(error ? error.message : data ? null : "This account has no profile. Ask an admin for help.");
    setStatus("authenticated");
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await evaluate(data.session);
  }, [evaluate]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setStatus("signedOut");
      return;
    }
    supabase.auth.getSession().then(({ data }) => evaluate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // Token refreshes don't change who's signed in or their role.
      if (event === "TOKEN_REFRESHED") {
        setSession(nextSession);
        return;
      }
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      // supabase-js holds a lock while this callback runs; calling back into
      // supabase.auth from inside it can deadlock, so evaluate afterwards.
      setTimeout(() => evaluate(nextSession), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const endRecovery = useCallback(() => setRecovering(false), []);
  const clearLinkError = useCallback(() => setLinkError(null), []);

  return {
    status,
    session,
    mfaFactorId,
    profile,
    profileError,
    recovering,
    endRecovery,
    linkError,
    clearLinkError,
    refresh,
    signOut,
  };
}
