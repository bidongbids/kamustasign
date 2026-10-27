// "Forgot password?": emails a reset link. Only reachable when
// EXPO_PUBLIC_PASSWORD_RESET=true (see AuthNavigator), because Supabase's
// built-in mailer only sends to the project team's own addresses - the
// project needs custom SMTP first. The link opens LCSign signed in, and
// ResetPasswordScreen asks for the new password (authGate.recovering).
import React, { useState } from "react";
import { Text } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase } from "../../lib/supabase";
import { friendlyAuthError, isEmailShaped } from "../../lib/authForms";
import { authStyles as s } from "./authStyles";
import type { Role } from "./LoginScreen";

type Props = {
  role: Role;
  accentColor: string;
  initialEmail?: string;
  /** Back to the login form, pre-filled with `email`. */
  onBack: (email?: string) => void;
};

export default function ForgotPasswordScreen({ role, accentColor, initialEmail = "", onBack }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const handleSend = async () => {
    if (loading) return;
    setError(null);
    const cleanEmail = email.trim();
    if (!isEmailShaped(cleanEmail)) {
      setError("Enter the email you signed up with.");
      return;
    }
    setLoading(true);
    // ?role= brings them back to the same sign-in tile, like Google sign-in.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${window.location.origin}${window.location.pathname}?role=${role}`,
    });
    setLoading(false);
    if (resetError) {
      setError(friendlyAuthError(resetError));
      return;
    }
    setSentTo(cleanEmail);
  };

  if (sentTo) {
    // Supabase answers the same whether or not the address has an account,
    // so this can't say which - and shouldn't.
    return (
      <AuthScreenShell accentColor={accentColor}>
        <Text style={[s.title, { color: accentColor }]}>Check your email</Text>
        <Text style={s.subtitle}>
          If an account uses {sentTo}, we've sent it a link to choose a new password. Open the link on this device.
        </Text>
        <AuthButton label="Back to Log In" onPress={() => onBack(sentTo)} accentColor={accentColor} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell accentColor={accentColor} onBack={() => onBack(email.trim() || undefined)} backLabel="Back to Log In">
      <Text style={[s.title, { color: accentColor }]}>Forgot your password?</Text>
      <Text style={s.subtitle}>Enter your email and we'll send you a link to choose a new one.</Text>

      <AuthTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        textContentType="username"
        autoComplete="username"
        enterKeyHint="send"
        autoFocus
        onSubmitEditing={handleSend}
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Send reset link" onPress={handleSend} loading={loading} accentColor={accentColor} />
    </AuthScreenShell>
  );
}
