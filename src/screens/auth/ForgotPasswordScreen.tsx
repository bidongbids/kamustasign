// "Forgot password?": emails a 6-digit reset code. Only reachable when
// EXPO_PUBLIC_PASSWORD_RESET=true (see AuthNavigator), because Supabase's
// built-in mailer only sends to the project team's own addresses - the
// project needs custom SMTP first (set up 2026-11-04: the LCSign Gmail).
// A code, not a link: the installed app (app://) can't be opened from an
// email. The right code signs the person in and fires PASSWORD_RECOVERY, so
// App shows ResetPasswordScreen (authGate.recovering), after the 2FA code on
// an account that has 2FA.
import React, { useState } from "react";
import { Platform, Text } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import EmailCodeForm from "../../components/auth/EmailCodeForm";
import { supabase } from "../../lib/supabase";
import { friendlyAuthError, isEmailShaped } from "../../lib/authForms";
import { useAuthStyles } from "./authStyles";

type Props = {
  accentColor: string;
  initialEmail?: string;
  /** Back to the login form, pre-filled with `email`. */
  onBack: (email?: string) => void;
};

// The web build still passes its own address, in case the email template
// carries a link again; the desktop app has no address an email can open.
const redirectTo =
  Platform.OS === "web" && typeof window !== "undefined" && window.location.protocol.startsWith("http")
    ? `${window.location.origin}${window.location.pathname}`
    : undefined;

export default function ForgotPasswordScreen({ accentColor, initialEmail = "", onBack }: Props) {
  const s = useAuthStyles();
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
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, redirectTo ? { redirectTo } : undefined);
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
      <AuthScreenShell accentColor={accentColor} onBack={() => onBack(sentTo)} backLabel="Back to Log In">
        <Text style={[s.title, { color: accentColor }]}>Check your email</Text>
        <Text style={s.subtitle}>
          If an account uses {sentTo}, we've emailed it a 6-digit code. Enter it here to choose a new password.
        </Text>
        <EmailCodeForm accentColor={accentColor} email={sentTo} purpose="recovery" onVerified={() => {}} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell accentColor={accentColor} onBack={() => onBack(email.trim() || undefined)} backLabel="Back to Log In">
      <Text style={[s.title, { color: accentColor }]}>Forgot your password?</Text>
      <Text style={s.subtitle}>Enter your email and we'll send you a code to choose a new one.</Text>

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

      <AuthButton label="Send code" onPress={handleSend} loading={loading} accentColor={accentColor} />
    </AuthScreenShell>
  );
}
