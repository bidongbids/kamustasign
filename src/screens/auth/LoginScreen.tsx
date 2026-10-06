import React, { useState } from "react";
import { Text, Platform } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { authStyles as s } from "./authStyles";

export type Role = "student" | "teacher" | "admin";

type Props = {
  role: Role;
  accentColor: string;
  canRegister: boolean;
  onNavigateRegister: () => void;
  onNeedsMfa: () => void;
  onBack: () => void;
};

export default function LoginScreen({
  role,
  accentColor,
  canRegister,
  onNavigateRegister,
  onNeedsMfa,
  onBack,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const handleLogin = async () => {
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }
    if (!data.session) {
      setLoading(false);
      setError("Sign-in didn't return a session. Try again.");
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      onNeedsMfa();
    }
    // Otherwise the auth-gate listener picks up the session and the parent
    // navigator swaps this screen out automatically.
  };

  const handleGoogleLogin = async () => {
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    const redirectTo =
      Platform.OS === "web" && typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}?role=${role}`
        : undefined;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) setError(oauthError.message);
    // On success the browser navigates away to Google; nothing else to do here.
  };

  return (
    <AuthScreenShell accentColor={accentColor} onBack={onBack} backLabel="Choose a different role">
      <Text style={[s.title, { color: accentColor }]}>{roleLabel} Log In</Text>
      <Text style={s.subtitle}>Welcome back to LCSign</Text>
      {!isSupabaseConfigured && (
        <Text style={s.errorText}>No Supabase project connected yet — this screen is UI-only for now.</Text>
      )}

      <AuthTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        textContentType="emailAddress"
      />
      <AuthTextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        textContentType="password"
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Log In" onPress={handleLogin} loading={loading} accentColor={accentColor} />

      {Platform.OS === "web" && canRegister && (
        <>
          <Text style={s.divider}>or</Text>
          <AuthButton label="Continue with Google" onPress={handleGoogleLogin} variant="secondary" />
        </>
      )}

      {canRegister && (
        <Text style={s.switchText}>
          New here?{" "}
          <Text style={[s.switchLink, { color: accentColor }]} onPress={onNavigateRegister}>
            Create an account
          </Text>
        </Text>
      )}
    </AuthScreenShell>
  );
}
