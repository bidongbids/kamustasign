// The start screen: log in, sign up, or open the Translator without an
// account (StartLayout). There's no role to pick first - the account's role
// decides the dashboard. When a session survived a reload, the card says
// whose it is instead of showing the form (a shared classroom computer).
// With no internet the card says so, and the Classroom joins the Translator
// below it, for practice without an account. The form stays: the check can
// be wrong, and logging in is still worth a try.
import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, Platform, TextInput, View } from "react-native";
import AuthTextField from "../../components/auth/AuthTextField";
import AuthButton from "../../components/auth/AuthButton";
import StartLayout from "./StartLayout";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { friendlyAuthError, isNetworkError } from "../../lib/authForms";
import { recheckConnection } from "../../lib/connectivity";
import { WifiOffIcon } from "../../components/icons/UiIcons";
import type { ProfileRole } from "../../lib/queries";
import { useAuthStyles } from "./authStyles";
import { fonts, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

// Google sign-in has to be switched on in the Supabase dashboard
// (Authentication -> Providers) first; until then the button only errors.
// An OAuth sign-up carries no role, so it makes a student account; whoever
// approves it can change that (0014).
const googleSignInEnabled = process.env.EXPO_PUBLIC_GOOGLE_SIGNIN === "true";

const ROLE_LABELS: Record<ProfileRole, string> = { student: "Student", teacher: "Teacher", admin: "Admin" };

type Props = {
  accentColor: string;
  /** Pre-filled email, e.g. after "Log in instead" on the sign-up screen. */
  initialEmail?: string;
  onNavigateRegister: () => void;
  onNeedsMfa: () => void;
  /** Shows "Forgot password?" - only when reset emails can be sent (AuthNavigator). */
  onForgotPassword?: (email: string) => void;
  /** Signed up but never typed the emailed code: enter it (or get a new one). */
  onConfirmEmail: (email: string) => void;
  onOpenTranslator: () => void;
  /** The server can't be reached: say so, and offer the Classroom without an account. */
  offline?: boolean;
  onOpenClassroom?: () => void;
  /** Someone is still signed in on this device (sessions survive reloads). */
  signedInAs: { name: string; role: ProfileRole | null } | null;
  onContinueSignedIn: () => void;
  onSignOut: () => void;
  /** A one-off message, e.g. an expired email link. */
  notice?: string | null;
  onDismissNotice?: () => void;
};

export default function LoginScreen({
  accentColor,
  initialEmail = "",
  onNavigateRegister,
  onNeedsMfa,
  onForgotPassword,
  onConfirmEmail,
  onOpenTranslator,
  offline = false,
  onOpenClassroom,
  signedInAs,
  onContinueSignedIn,
  onSignOut,
  notice,
  onDismissNotice,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = useAuthStyles();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = async () => {
    // Enter in the password field can fire while a sign-in is still running.
    if (loading) return;
    setError(null);
    setUnconfirmed(false);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Enter your email and password.");
      return;
    }
    setLoading(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
    if (signInError) {
      setLoading(false);
      setError(friendlyAuthError(signInError));
      // Lost the internet since the last check: offer offline practice now.
      if (isNetworkError(signInError)) void recheckConnection();
      // Supabase only says this after the password was right.
      setUnconfirmed(signInError.code === "email_not_confirmed" || /email not confirmed/i.test(signInError.message));
      return;
    }
    if (!data.session) {
      setLoading(false);
      setError("Sign-in didn't return a session. Try again.");
      return;
    }
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== aal.nextLevel) {
      onNeedsMfa();
    }
    // Otherwise the auth-gate listener picks up the session and App opens
    // the dashboard.
  };

  const handleGoogleLogin = async () => {
    setError(null);
    if (!isSupabaseConfigured) {
      setError("Backend isn't connected yet (no Supabase project configured). This screen is UI-only for now.");
      return;
    }
    const redirectTo =
      Platform.OS === "web" && typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (oauthError) setError(friendlyAuthError(oauthError));
    // On success the browser navigates away to Google; nothing else to do here.
  };

  const noticeRow = notice ? (
    <View style={styles.notice} accessibilityRole="alert">
      <Text style={styles.noticeText}>{notice}</Text>
      <Pressable onPress={onDismissNotice} accessibilityRole="button" hitSlop={8}>
        <Text style={[s.switchLink, styles.noticeLink, { color: accentColor }]}>Dismiss</Text>
      </Pressable>
    </View>
  ) : null;

  const classroom = offline ? onOpenClassroom : undefined;
  const offlineRow = offline ? (
    <View style={styles.offline} accessibilityRole="alert">
      <WifiOffIcon size={18} color={colors.textOnFrosted} />
      <Text style={styles.offlineText}>
        <Text style={styles.offlineTitle}>No internet right now. </Text>
        {signedInAs
          ? "Your account needs it to open, but you can still practice below without one."
          : "Logging in needs it, but you can still practice below without an account."}
      </Text>
    </View>
  ) : null;

  if (signedInAs) {
    const shown = signedInAs.name || "Your account";
    return (
      <StartLayout onOpenTranslator={onOpenTranslator} onOpenClassroom={classroom}>
        {offlineRow}
        {noticeRow}
        <Text style={[s.title, { color: accentColor }]} accessibilityRole="header">
          Welcome back
        </Text>
        <Text style={s.subtitle}>This device is still signed in.</Text>
        <View style={styles.who}>
          <Text style={styles.whoLabel}>Signed in as</Text>
          <Text style={styles.whoName} numberOfLines={1}>
            {shown}
            {signedInAs.role ? ` · ${ROLE_LABELS[signedInAs.role]}` : ""}
          </Text>
        </View>
        <AuthButton label={`Continue as ${shown.split(/\s+/)[0]}`} onPress={onContinueSignedIn} accentColor={accentColor} />
        <View style={styles.signOut}>
          <AuthButton label="Not you? Sign out" onPress={onSignOut} variant="secondary" />
        </View>
      </StartLayout>
    );
  }

  return (
    <StartLayout onOpenTranslator={onOpenTranslator} onOpenClassroom={classroom}>
      {offlineRow}
      {noticeRow}
      <Text style={[s.title, { color: accentColor }]} accessibilityRole="header">
        Log In
      </Text>
      <Text style={s.subtitle}>Welcome to LCSign</Text>
      {!isSupabaseConfigured && (
        <Text style={s.errorText}>No Supabase project connected yet — this screen is UI-only for now.</Text>
      )}

      <AuthTextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        textContentType="username"
        autoComplete="username"
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
        placeholder="••••••••"
        textContentType="password"
        autoComplete="current-password"
        enterKeyHint="go"
        onSubmitEditing={handleLogin}
      />
      {onForgotPassword && (
        <Text
          style={[s.forgotLink, { color: accentColor }]}
          onPress={() => onForgotPassword(email.trim())}
          accessibilityRole="link"
        >
          Forgot password?
        </Text>
      )}

      {error ? (
        <Text style={s.errorText}>
          {error}
          {unconfirmed && (
            <>
              {" "}
              <Text style={[s.switchLink, { color: accentColor }]} onPress={() => onConfirmEmail(email.trim())} accessibilityRole="link">
                Enter the code
              </Text>
            </>
          )}
        </Text>
      ) : null}

      <AuthButton label="Log In" onPress={handleLogin} loading={loading} accentColor={accentColor} />

      {Platform.OS === "web" && googleSignInEnabled && (
        <>
          <Text style={s.divider}>or</Text>
          <AuthButton label="Continue with Google" onPress={handleGoogleLogin} variant="secondary" />
        </>
      )}

      <Text style={s.switchText}>
        New here?{" "}
        <Text style={[s.switchLink, { color: accentColor }]} onPress={onNavigateRegister} accessibilityRole="link">
          Create an account
        </Text>
      </Text>
    </StartLayout>
  );
}

// On the frosted card: dark text only.
const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  notice: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(30,31,38,0.16)",
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeText: { flex: 1, minWidth: 160, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textOnFrosted },
  noticeLink: { fontSize: 13, textDecorationLine: "underline" },
  offline: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(30,31,38,0.16)",
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  offlineText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textOnFrosted },
  offlineTitle: { fontFamily: fonts.bodySemiBold },
  who: {
    borderWidth: 1,
    borderColor: "rgba(30,31,38,0.16)",
    borderRadius: 12,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  whoLabel: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnFrostedMuted },
  whoName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textOnFrosted, marginTop: 2 },
  signOut: { marginTop: spacing.sm, width: "100%" },
});
