import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";

export type AuthGateStatus = "loading" | "signedOut" | "needsMfa" | "authenticated";

export type AuthGateState = {
  status: AuthGateStatus;
  session: Session | null;
  mfaFactorId: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

// Session presence alone isn't "authenticated" — Supabase issues a session at
// aal1 right after password sign-in, before an enrolled TOTP factor has been
// verified. Screens must check `status`, not `session`, to gate access.
export function useAuthGate(): AuthGateState {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthGateStatus>("loading");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  const evaluate = useCallback(async (nextSession: Session | null) => {
    if (!nextSession) {
      setSession(null);
      setMfaFactorId(null);
      setStatus("signedOut");
      return;
    }
    setSession(nextSession);

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      setMfaFactorId(factors?.totp?.[0]?.id ?? null);
      setStatus("needsMfa");
      return;
    }

    setMfaFactorId(null);
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      evaluate(nextSession);
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { status, session, mfaFactorId, refresh, signOut };
}
