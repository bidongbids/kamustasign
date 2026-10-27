import React, { useRef, useState } from "react";
import { Text, Platform, TextInput } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { friendlyAuthError } from "../../lib/authForms";
import { authStyles as s } from "./authStyles";

export type Role = "student" | "teacher" | "admin";

// Google sign-in has to be switched on in the Supabase dashboard
// (Authentication -> Providers) first; until then the button only errors.
// Student tile only: an OAuth sign-up carries no role, so it always makes a
// student account, which would surprise someone who tapped Teacher.
const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGNIN === "true";

type Props = {
  role: Role;
  accentColor: string;
  canRegister: boolean;
  /** Pre-filled email, e.g. after "Log in instead" on the sign-up screen. */
  initialEmail?: string;
  onNavigateRegister: () => void;
  onNeedsMfa: () => void;
  /** Shows "Forgot password?" - only when reset emails can be sent (AuthNavigator). */
  onForgotPassword?: (email: string) => void;
  onBack: () => void;
};

export default function LoginScreen({
  role,
  accentColor,
  canRegister,
  initialEmail = "",
  onNavigateRegister,
  onNeedsMfa,
  onForgotPassword,
  onBack,
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const handleLogin = async () => {
    // Enter in the password field can fire while a sign-in is still running.
    if (loading) return;
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (signInError) {
      setLoading(false);
      setError(friendlyAuthError(signInError));
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
    if (oauthError) setError(friendlyAuthError(oauthError));
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
        textContentType="username"
        autoComplete="username"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <AuthTextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        textContentType="password"
        autoComplete="current-password"
        enterKeyHint="go"
        onSubmitEditing={handleLogin}
      />
      {onForgotPassword && (
        <Text
          style={[s.forgotLink, { color: accentColor }]}
          onPress={() => onForgotPassword(email.trim())}
          accessibilityRole="link"
        >
          Forgot password?
        </Text>
      )}

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Log In" onPress={handleLogin} loading={loading} accentColor={accentColor} />

      {Platform.OS === "web" && googleSignInEnabled && role === "student" && (
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
