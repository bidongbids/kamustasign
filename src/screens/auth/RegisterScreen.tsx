import React, { useState } from "react";
import { Text } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { authStyles as s } from "./authStyles";
import { spacing } from "../../theme/theme";

type Role = "student" | "teacher";

// Matches the profiles_full_name_length check (0011_auth_hardening.sql).
const NAME_MAX = 100;

type Props = {
  role: Role;
  accentColor: string;
  onNavigateLogin: () => void;
  onRegistered: () => void;
};

export default function RegisterScreen({ role, accentColor, onNavigateLogin, onRegistered }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const handleRegister = async () => {
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    if (!fullName.trim() || !email.trim() || !password) {
      setError("Fill in all fields.");
      return;
    }
    if (fullName.trim().length > NAME_MAX) {
      setError(`Keep your name under ${NAME_MAX} characters.`);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("That doesn't look like an email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    // Supabase hashes with bcrypt, which only reads the first 72 bytes.
    if (new TextEncoder().encode(password).length > 72) {
      setError("Password is too long (72 characters at most).");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), role } },
    });
    setLoading(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (!data.session) {
      // Email confirmation is required before a session is issued.
      setConfirmationSentTo(email.trim());
      return;
    }
    onRegistered();
  };

  if (confirmationSentTo) {
    return (
      <AuthScreenShell accentColor={accentColor}>
        <Text style={[s.title, { color: accentColor }]}>Check your email</Text>
        <Text style={s.subtitle}>
          We sent a confirmation link to {confirmationSentTo}. Confirm it, then come back and log in.
        </Text>
        <AuthButton label="Back to Log In" onPress={onNavigateLogin} accentColor={accentColor} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell accentColor={accentColor} onBack={onNavigateLogin} backLabel="Back to Log In">
      <Text style={[s.title, { color: accentColor }]}>{roleLabel} Sign Up</Text>
      <Text style={s.subtitle}>
        {role === "teacher"
          ? "Create your LCSign account. An admin approves new teacher accounts before you can set up classes."
          : "Create your LCSign account"}
      </Text>
      {!isSupabaseConfigured && (
        <Text style={s.errorText}>No Supabase project connected yet — this screen is UI-only for now.</Text>
      )}

      <AuthTextField
        label="Full name"
        value={fullName}
        onChangeText={setFullName}
        placeholder="Juan Dela Cruz"
        maxLength={NAME_MAX}
      />
      <AuthTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
      />
      <AuthTextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
      />
      <AuthTextField
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="••••••••"
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Create account" onPress={handleRegister} loading={loading} accentColor={accentColor} />

      <Text style={[s.switchText, { marginTop: spacing.md }]}>
        Already have an account?{" "}
        <Text style={[s.switchLink, { color: accentColor }]} onPress={onNavigateLogin}>
          Log in
        </Text>
      </Text>
    </AuthScreenShell>
  );
}
