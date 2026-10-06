import React, { useState } from "react";
import { Text } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase } from "../../lib/supabase";
import { authStyles as s } from "./authStyles";

type Props = {
  accentColor: string;
  factorId: string | null;
  onVerified: () => Promise<void> | void;
  onCancel: () => void;
};

export default function Verify2FAScreen({ accentColor, factorId, onVerified, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    setError(null);
    if (!factorId) {
      setError("No authenticator found on this account. Contact an admin.");
      return;
    }
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
    if (challengeError || !challenge) {
      setLoading(false);
      setError(challengeError?.message ?? "Couldn't start verification. Try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    await onVerified();
  };

  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>Enter your 2FA code</Text>
      <Text style={s.subtitle}>Open your authenticator app and enter the 6-digit code for LCSign.</Text>

      <AuthTextField
        label="6-digit code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="123456"
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton label="Verify" onPress={handleVerify} loading={loading} accentColor={accentColor} />

      <Text style={s.switchText}>
        <Text style={[s.switchLink, { color: accentColor }]} onPress={onCancel}>
          Cancel and log out
        </Text>
      </Text>
    </AuthScreenShell>
  );
}
