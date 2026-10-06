import React, { useEffect, useState } from "react";
import { View, Text, Image } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { supabase } from "../../lib/supabase";
import { authStyles as s } from "./authStyles";
import { spacing } from "../../theme/theme";

type Props = {
  accentColor: string;
  onDone: () => void;
};

type EnrollState = {
  factorId: string;
  qrCodeUri: string;
  secret: string;
};

export default function Setup2FAScreen({ accentColor, onDone }: Props) {
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [starting, setStarting] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (cancelled) return;
      setStarting(false);
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Couldn't start 2FA setup.");
        return;
      }
      setEnroll({ factorId: data.id, qrCodeUri: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSkip = async () => {
    // The enrolled factor is unverified until the QR code is confirmed below;
    // drop it so it doesn't linger as a half-set-up factor on the account.
    if (enroll) {
      await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    }
    onDone();
  };

  const handleConfirm = async () => {
    if (!enroll) return;
    setError(null);
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setLoading(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (challengeError || !challenge) {
      setLoading(false);
      setError(challengeError?.message ?? "Couldn't verify. Try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setLoading(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    onDone();
  };

  return (
    <AuthScreenShell accentColor={accentColor}>
      <Text style={[s.title, { color: accentColor }]}>Set up 2FA (recommended)</Text>
      <Text style={s.subtitle}>
        Scan this QR code with Google Authenticator, Authy, or a similar app, then enter the code it shows.
      </Text>

      {starting && <Text style={s.subtitle}>Preparing your QR code…</Text>}

      {enroll && (
        <>
          <Image source={{ uri: enroll.qrCodeUri }} style={s.qr} />
          <Text style={s.secret}>Or enter this key manually: {enroll.secret}</Text>
          <AuthTextField
            label="6-digit code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="123456"
          />
        </>
      )}

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton
        label="Confirm and enable 2FA"
        onPress={handleConfirm}
        loading={loading}
        disabled={!enroll}
        accentColor={accentColor}
      />
      <View style={{ marginTop: spacing.sm, width: "100%" }}>
        <AuthButton label="Skip for now" onPress={handleSkip} variant="secondary" />
      </View>
    </AuthScreenShell>
  );
}
