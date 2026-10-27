import React, { useRef, useState } from "react";
import { Text } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase } from "../../lib/supabase";
import { cleanTotpCode, friendlyAuthError } from "../../lib/authForms";
import { authStyles as s } from "./authStyles";

type Props = {
  accentColor: string;
  factorId: string | null;
  onVerified: () => Promise<void> | void;
  onCancel: () => void;
  /** Overrides the default "Enter your 2FA code" (e.g. before a password reset). */
  title?: string;
};

export default function Verify2FAScreen({ accentColor, factorId, onVerified, onCancel, title = "Enter your 2FA code" }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A full code submits itself, so typing and Enter can both fire one.
  const busy = useRef(false);

  const handleVerify = async (value: string) => {
    if (busy.current) return;
    setError(null);
    if (!factorId) {
      setError("No authenticator found on this account. Ask your school's LCSign admin.");
      return;
    }
    const digits = cleanTotpCode(value);
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    busy.current = true;
    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: digits });
    busy.current = false;
    setLoading(false);
    if (verifyError) {
      setError(friendlyAuthError(verifyError));
      // Clear it so the next code can be typed (and submit itself) fresh.
      setCode("");
      return;
    }
    await onVerified();
  };

  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>{title}</Text>
      <Text style={s.subtitle}>Open your authenticator app and enter the 6-digit code for LCSign.</Text>

      <AuthTextField
        label="6-digit code"
        value={code}
        onChangeText={(text) => {
          const digits = cleanTotpCode(text);
          setCode(digits);
          if (digits.length === 6) handleVerify(digits);
        }}
        keyboardType="number-pad"
        placeholder="123456"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        enterKeyHint="go"
        autoFocus
        onSubmitEditing={() => handleVerify(code)}
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Verify" onPress={() => handleVerify(code)} loading={loading} accentColor={accentColor} />

      <Text style={s.helpText}>Lost your phone? Ask your school's LCSign admin to turn off 2FA for your account.</Text>

      <Text style={s.switchText}>
        <Text style={[s.switchLink, { color: accentColor }]} onPress={onCancel}>
          Cancel and log out
        </Text>
      </Text>
    </AuthScreenShell>
  );
}
