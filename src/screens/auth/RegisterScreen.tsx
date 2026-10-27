import React, { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { CheckBox } from "../dashboard/ManageKit";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { NAME_MAX, friendlyAuthError, isEmailShaped, isExistingAccountError, newPasswordProblem } from "../../lib/authForms";
import { authStyles as s } from "./authStyles";
import { spacing } from "../../theme/theme";

type Role = "student" | "teacher";

type Props = {
  role: Role;
  accentColor: string;
  /** `email` pre-fills the login form ("Log in instead"). */
  onNavigateLogin: (email?: string) => void;
  onRegistered: () => void;
};

// What LCSign keeps and who sees it, in words a parent can check against the
// app: the data a sign-up creates, the RLS rules on who reads it (0002-0013),
// and the fact that recognition never uploads video.
const PRIVACY_NOTE =
  "LCSign keeps your name, email, class and practice progress, plus notes your teacher saves after a video call. " +
  "Your teacher and the school's LCSign admins can see these; other teachers see only your name and email until " +
  "you join a class. Sign recognition runs on this device, so camera video is never uploaded or saved, and a " +
  "video call is shared only with the person you're calling. Ask an admin to correct or delete your data.";

export default function RegisterScreen({ role, accentColor, onNavigateLogin, onRegistered }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAccount, setExistingAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

  const handleRegister = async () => {
    if (loading) return;
    setError(null);
    setExistingAccount(false);
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
    if (!isEmailShaped(email)) {
      setError("That doesn't look like an email address.");
      return;
    }
    const passwordProblem = newPasswordProblem(password, confirmPassword);
    if (passwordProblem) {
      setError(passwordProblem);
      return;
    }
    if (!agreed) {
      setError("Read the privacy note and tick the box to continue.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      // privacy_accepted_at is kept with the account as the record of consent.
      options: { data: { full_name: fullName.trim(), role, privacy_accepted_at: new Date().toISOString() } },
    });
    setLoading(false);
    if (signUpError) {
      setError(friendlyAuthError(signUpError));
      setExistingAccount(isExistingAccountError(signUpError));
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
        <AuthButton label="Back to Log In" onPress={() => onNavigateLogin(confirmationSentTo)} accentColor={accentColor} />
      </AuthScreenShell>
    );
  }

  return (
    <AuthScreenShell accentColor={accentColor} onBack={() => onNavigateLogin()} backLabel="Back to Log In">
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
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <AuthTextField
        ref={emailRef}
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        textContentType="emailAddress"
        autoComplete="email"
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
        placeholder="At least 8 characters"
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <AuthTextField
        ref={confirmRef}
        label="Confirm password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        placeholder="••••••••"
        textContentType="newPassword"
        autoComplete="new-password"
        enterKeyHint="done"
        onSubmitEditing={handleRegister}
      />

      <View style={s.notice}>
        <Text style={s.noticeTitle}>Your privacy</Text>
        <Text style={s.noticeText}>{PRIVACY_NOTE}</Text>
        <Pressable
          onPress={() => setAgreed((a) => !a)}
          style={s.consentRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="I agree to the privacy note. If I'm under 18, a parent or guardian agrees too."
        >
          <CheckBox checked={agreed} accentColor={accentColor} />
          <Text style={s.consentText}>I agree. If I'm under 18, a parent or guardian agrees too.</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={s.errorText}>
          {error}
          {existingAccount && (
            <>
              {" "}
              <Text style={[s.switchLink, { color: accentColor }]} onPress={() => onNavigateLogin(email.trim())}>
                Log in instead
              </Text>
            </>
          )}
        </Text>
      ) : null}

      <AuthButton label="Create account" onPress={handleRegister} loading={loading} accentColor={accentColor} />

      <Text style={[s.switchText, { marginTop: spacing.md }]}>
        Already have an account?{" "}
        <Text style={[s.switchLink, { color: accentColor }]} onPress={() => onNavigateLogin(email.trim() || undefined)}>
          Log in
        </Text>
      </Text>
    </AuthScreenShell>
  );
}
