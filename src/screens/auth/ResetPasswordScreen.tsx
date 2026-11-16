// After a password-reset code (ForgotPasswordScreen) or link (web), shown by
// App while authGate.recovering: the code has already signed the person in,
// so the new password is set on that session. A 2FA account enters its code first (App shows
// Verify2FAScreen while the session is still aal1).
import React, { useRef, useState } from "react";
import { Text, TextInput } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase } from "../../lib/supabase";
import { friendlyAuthError, newPasswordProblem } from "../../lib/authForms";
import { leakedPasswordProblem } from "../../lib/pwnedPassword";
import { useAuthStyles } from "./authStyles";

type Props = {
  accentColor: string;
  /** Password changed - carry on into the app. */
  onDone: () => void;
  /** Backed out: sign the link's session out. */
  onCancel: () => void;
};

export default function ResetPasswordScreen({ accentColor, onDone, onCancel }: Props) {
  const s = useAuthStyles();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  const handleSave = async () => {
    if (loading) return;
    setError(null);
    const problem = newPasswordProblem(password, confirmPassword);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    const leaked = await leakedPasswordProblem(password);
    if (leaked) {
      setLoading(false);
      setError(leaked);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(friendlyAuthError(updateError));
      return;
    }
    setSaved(true);
  };

  if (saved) {
    return (
      <AuthScreenShell accentColor={accentColor}>
        <Text style={[s.title, { color: accentColor }]}>Password changed</Text>
        <Text style={s.subtitle}>Use your new password the next time you log in.</Text>
        <AuthButton label="Continue" onPress={onDone} accentColor={accentColor} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>Choose a new password</Text>
      <Text style={s.subtitle}>Pick a new password for your LCSign account.</Text>

      <AuthTextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="At least 8 characters"
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="next"
        submitBehavior="submit"
        autoFocus
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <AuthTextField
        ref={confirmRef}
        label="Confirm new password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="••••••••"
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="done"
        onSubmitEditing={handleSave}
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Save new password" onPress={handleSave} loading={loading} accentColor={accentColor} />

      <Text style={s.switchText}>
        <Text style={[s.switchLink, { color: accentColor }]} onPress={onCancel}>
          Cancel and log out
        </Text>
      </Text>
    </AuthScreenShell>
  );
}
