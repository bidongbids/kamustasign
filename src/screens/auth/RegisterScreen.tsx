import React, { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { CheckBox } from "../dashboard/ManageKit";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { NAME_MAX, friendlyAuthError, isEmailShaped, isExistingAccountError, newPasswordProblem } from "../../lib/authForms";
import { useAuthStyles } from "./authStyles";
import type { ProfileRole } from "../../lib/queries";
import { fonts, radii, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

type Props = {
  accentColor: string;
  /** `email` pre-fills the login form ("Log in instead"). */
  onNavigateLogin: (email?: string) => void;
  onRegistered: (role: ProfileRole) => void;
};

// Every sign-up waits for approval (0014_account_approval.sql), and whoever
// approves it can still change the kind of account, so Student is a safe
// default for the children who make most accounts.
const ROLE_CHOICES: { role: ProfileRole; label: string; note: string }[] = [
  { role: "student", label: "Student", note: "Practise signs with your camera and earn stars. An admin approves your account first." },
  { role: "teacher", label: "Teacher", note: "Run classes, follow progress and call students. An admin approves teacher accounts first." },
  { role: "admin", label: "Admin", note: "Manage LCSign accounts. The LCSign super admin approves admin accounts first." },
];

// What LCSign keeps and who sees it, in words a parent can check against the
// app: the data a sign-up creates, the RLS rules on who reads it (0002-0013),
// and the fact that recognition never uploads video.
const PRIVACY_NOTE =
  "LCSign keeps your name, email, class and practice progress, plus notes your teacher saves after a video call. " +
  "Your teacher and the school's LCSign admins can see these; other teachers see only your name and email until " +
  "you join a class. Sign recognition runs on this device, so camera video is never uploaded or saved, and a " +
  "video call is shared only with the person you're calling. Ask an admin to correct or delete your data.";

export default function RegisterScreen({ accentColor, onNavigateLogin, onRegistered }: Props) {
  const styles = useThemedStyles(makeStyles);
  const s = useAuthStyles();
  const [role, setRole] = useState<ProfileRole>("student");
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
    onRegistered(role);
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
      <Text style={[s.title, { color: accentColor }]}>Sign Up</Text>
      <Text style={s.subtitle}>Create your LCSign account</Text>
      {!isSupabaseConfigured && (
        <Text style={s.errorText}>No Supabase project connected yet — this screen is UI-only for now.</Text>
      )}

      <Text style={styles.label}>I am a…</Text>
      <View style={styles.roleRow} accessibilityRole="radiogroup" accessibilityLabel="Kind of account">
        {ROLE_CHOICES.map((c) => {
          const on = c.role === role;
          return (
            <Pressable
              key={c.role}
              onPress={() => setRole(c.role)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${c.label}. ${c.note}`}
              style={({ focused }: any) => [
                styles.roleOption,
                on ? { backgroundColor: accentColor, borderColor: accentColor } : styles.roleOptionOff,
                focused && styles.focused,
                webCursor,
              ]}
            >
              <Text style={[styles.roleText, on && styles.roleTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.roleNote} accessibilityLiveRegion="polite">
        {ROLE_CHOICES.find((c) => c.role === role)!.note}
      </Text>

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

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

// On the frosted card: dark text only, like the rest of the form.
const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  label: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textOnFrosted, marginBottom: spacing.xs + 2 },
  roleRow: { flexDirection: "row", gap: spacing.sm },
  roleOption: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  roleOptionOff: { borderColor: "rgba(30,31,38,0.3)" },
  roleText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textOnFrosted },
  roleTextOn: { color: colors.textOnPrimary },
  roleNote: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textOnFrostedMuted,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
});
