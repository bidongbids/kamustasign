// "Enter the 6-digit code we emailed you" - the code from Supabase's Confirm
// signup and Reset password emails ({{ .Token }} in the templates).
//
// Codes, not links: a link opens a web browser, and the installed LCSign
// (Electron, app://) can't be opened by one; the project's Site URL isn't a
// real page either. Typing a code works the same on every device.
//
//   signup   -> verifyOtp type "email": confirms the address and signs in
//               (the account then waits for approval as usual).
//   recovery -> verifyOtp type "recovery": signs in and fires
//               PASSWORD_RECOVERY, so App shows ResetPasswordScreen (after
//               the 2FA code on an account that has it).
// Drawn inside an auth screen's frosted card, with the auth screens' styles.
import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import AuthTextField from "./AuthTextField";
import AuthButton from "./AuthButton";
import { supabase } from "../../lib/supabase";
import { EMAIL_CODE_LENGTH, cleanEmailCode, friendlyAuthError } from "../../lib/authForms";
import { useAuthStyles } from "../../screens/auth/authStyles";

export type EmailCodePurpose = "signup" | "recovery";

// Supabase's default "minimum interval" between emails to one address.
const RESEND_WAIT_S = 60;

type Props = {
  accentColor: string;
  email: string;
  purpose: EmailCodePurpose;
  /** The code was right; the session is live (auth events follow). */
  onVerified: () => void;
  /** Seconds to wait before "Send a new code" - 60 right after an email went out, 0 when none was just sent. */
  initialWait?: number;
};

/** Sends a fresh code for `purpose` to `email`. */
export async function sendEmailCode(email: string, purpose: EmailCodePurpose): Promise<string | null> {
  const { error } =
    purpose === "signup" ? await supabase.auth.resend({ type: "signup", email }) : await supabase.auth.resetPasswordForEmail(email);
  return error ? friendlyAuthError(error) : null;
}

export default function EmailCodeForm({ accentColor, email, purpose, onVerified, initialWait = RESEND_WAIT_S }: Props) {
  const s = useAuthStyles();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [wait, setWait] = useState(initialWait);
  // A full code submits itself, so typing and Enter can both fire one.
  const busy = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value: string) => {
    if (busy.current) return;
    setError(null);
    setNote(null);
    const digits = cleanEmailCode(value);
    if (digits.length !== EMAIL_CODE_LENGTH) {
      setError(`Enter the ${EMAIL_CODE_LENGTH}-digit code from the email.`);
      return;
    }
    busy.current = true;
    setLoading(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: digits,
      type: purpose === "signup" ? "email" : "recovery",
    });
    busy.current = false;
    setLoading(false);
    if (verifyError) {
      setError(friendlyAuthError(verifyError));
      setCode("");
      return;
    }
    onVerified();
  };

  const resend = async () => {
    if (wait > 0 || loading) return;
    setError(null);
    setNote(null);
    setLoading(true);
    const problem = await sendEmailCode(email, purpose);
    setLoading(false);
    if (problem) {
      setError(problem);
      return;
    }
    setCode("");
    setWait(RESEND_WAIT_S);
    setNote("We sent a new code. Use the newest email - older codes stop working.");
  };

  return (
    <>
      <AuthTextField
        label={`${EMAIL_CODE_LENGTH}-digit code`}
        value={code}
        onChangeText={(text) => {
          const digits = cleanEmailCode(text);
          setCode(digits);
          if (digits.length === EMAIL_CODE_LENGTH) verify(digits);
        }}
        keyboardType="number-pad"
        placeholder="123456"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        enterKeyHint="go"
        autoFocus
        onSubmitEditing={() => verify(code)}
      />

      {error ? <Text style={s.errorText}>{error}</Text> : null}
      {note ? <Text style={s.helpText}>{note}</Text> : null}

      <AuthButton label={purpose === "signup" ? "Confirm email" : "Continue"} onPress={() => verify(code)} loading={loading} accentColor={accentColor} />

      <Text style={s.helpText}>Can't find it? Check your spam folder. The code works for 1 hour.</Text>
      <Text style={s.switchText}>
        {wait > 0 ? (
          <Text>Send a new code in {wait}s</Text>
        ) : (
          <Text style={[s.switchLink, { color: accentColor }]} onPress={resend} accessibilityRole="button">
            Send a new code
          </Text>
        )}
      </Text>
    </>
  );
}
