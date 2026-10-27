// The TOTP setup steps - QR code, manual key, first code - shared by the
// prompt after a teacher signs up (Setup2FAScreen) and the Account panel.
// Draws inside a frosted card, with the auth screens' styles.
import React, { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import AuthTextField from "./AuthTextField";
import AuthButton from "./AuthButton";
import { supabase } from "../../lib/supabase";
import { cleanTotpCode, friendlyAuthError } from "../../lib/authForms";
import { authStyles as s } from "../../screens/auth/authStyles";
import { spacing } from "../../theme/theme";

type Props = {
  accentColor: string;
  /** "Skip for now" after sign-up, "Cancel" in the Account panel. */
  cancelLabel: string;
  /** true once 2FA is on; false when the person backed out. */
  onDone: (enabled: boolean) => void;
};

type EnrollState = {
  factorId: string;
  qrCodeUri: string;
  secret: string;
};

// supabase-js hands back the QR code as raw SVG text in a data: URI, and
// react-native-web draws an Image as a CSS url("...") background, which the
// SVG's own double quotes cut short - the QR code came out blank, leaving
// only the manual key. Percent-encoding the SVG makes it a valid URL.
function qrImageUri(uri: string) {
  const comma = uri.indexOf(",");
  if (comma < 0 || uri.slice(0, comma).includes(";base64")) return uri;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(uri.slice(comma + 1))}`;
}

export default function TwoFactorSetup({ accentColor, cancelLabel, onDone }: Props) {
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [starting, setStarting] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // A full code submits itself, so typing and Enter can both fire one.
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A setup abandoned before its first code (tab closed) leaves an
      // unverified factor on the account; clear those so they don't pile up.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      // issuer is the name the authenticator app shows next to the code.
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "LCSign" });
      if (cancelled) {
        if (data) supabase.auth.mfa.unenroll({ factorId: data.id });
        return;
      }
      setStarting(false);
      if (enrollError || !data) {
        setError(enrollError ? friendlyAuthError(enrollError) : "Couldn't start 2FA setup.");
        return;
      }
      setEnroll({ factorId: data.id, qrCodeUri: qrImageUri(data.totp.qr_code), secret: data.totp.secret });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = async (value: string) => {
    if (!enroll || busy.current) return;
    setError(null);
    const digits = cleanTotpCode(value);
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    busy.current = true;
    setLoading(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.factorId, code: digits });
    busy.current = false;
    setLoading(false);
    if (verifyError) {
      setError(friendlyAuthError(verifyError));
      setCode("");
      return;
    }
    onDone(true);
  };

  const cancel = async () => {
    // The factor stays unverified until a code is confirmed; drop it so a
    // half-set-up factor doesn't linger on the account.
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    onDone(false);
  };

  return (
    <>
      {starting && <Text style={s.subtitle}>Preparing your QR code…</Text>}

      {enroll && (
        <>
          <Image source={{ uri: enroll.qrCodeUri }} style={s.qr} accessibilityLabel="QR code for your authenticator app" />
          <Text style={s.secret}>Or enter this key manually: {enroll.secret}</Text>
          <AuthTextField
            label="6-digit code"
            value={code}
            onChangeText={(text) => {
              const digits = cleanTotpCode(text);
              setCode(digits);
              if (digits.length === 6) confirm(digits);
            }}
            keyboardType="number-pad"
            placeholder="123456"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            enterKeyHint="done"
            onSubmitEditing={() => confirm(code)}
          />
        </>
      )}

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <AuthButton
        label="Confirm and turn on 2FA"
        onPress={() => confirm(code)}
        loading={loading}
        disabled={!enroll}
        accentColor={accentColor}
      />
      <View style={{ marginTop: spacing.sm, width: "100%" }}>
        <AuthButton label={cancelLabel} onPress={cancel} variant="secondary" />
      </View>
    </>
  );
}
