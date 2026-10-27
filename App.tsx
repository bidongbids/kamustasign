import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Baloo2_700Bold, Baloo2_600SemiBold } from "@expo-google-fonts/baloo-2";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import RoleSelectScreen from "./src/screens/RoleSelectScreen";
import TranslatorHubScreen from "./src/screens/TranslatorHubScreen";
import AuthNavigator from "./src/navigation/AuthNavigator";
import StudentDashboard from "./src/screens/dashboard/StudentDashboard";
import TeacherDashboard from "./src/screens/dashboard/TeacherDashboard";
import AdminDashboard from "./src/screens/dashboard/AdminDashboard";
import { useAuthGate } from "./src/lib/authGate";
import { isPendingTeacher } from "./src/lib/queries";
import AccountNoticeScreen from "./src/screens/auth/AccountNoticeScreen";
import Verify2FAScreen from "./src/screens/auth/Verify2FAScreen";
import ResetPasswordScreen from "./src/screens/auth/ResetPasswordScreen";
import { ThemeColors } from "./src/theme/theme";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";

type Role = "student" | "teacher" | "admin";
type Screen = Role | "translator" | null;

const roleAccentFor = (colors: ThemeColors): Record<Role, string> => ({
  student: colors.accentCoral,
  teacher: colors.primaryTeal,
  admin: colors.adminGray,
});

// Restores the role the user was mid-signin-as after a Google OAuth redirect
// or a password-reset email link brings them back (LoginScreen's and
// ForgotPasswordScreen's redirectTo).
function roleFromQueryString(): Role | null {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("role");
  return value === "student" || value === "teacher" || value === "admin" ? value : null;
}

// Installable app / offline shell (public/sw.js). Production web builds only:
// in dev it would cache Metro's bundles, and Electron's app:// scheme has no
// service worker support (it's offline anyway).
if (
  !__DEV__ &&
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.protocol.startsWith("http")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw] registration failed", err));
    // This page, its bundle and fonts loaded before the worker existed, so it
    // never saw them; hand it the list so one online visit is enough.
    navigator.serviceWorker.ready.then((reg) =>
      reg.active?.postMessage({
        type: "cache-urls",
        urls: ["/", ...performance.getEntriesByType("resource").map((e) => e.name)],
      })
    );
  });
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const { colors, name: themeName } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const roleAccent = roleAccentFor(colors);
  const statusBarStyle = themeName === "light" ? "dark" : "light";
  const [fontsLoaded] = useFonts({
    Baloo2_700Bold,
    Baloo2_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [role, setRole] = useState<Screen>(() => roleFromQueryString());
  const [setupPromptActive, setSetupPromptActive] = useState(false);
  const authGate = useAuthGate();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // ?role= has been read (above), and a failed email link's #error=...
    // has been read by authGate; neither should come back on a reload.
    // A successful link's #access_token=... is left for supabase-js.
    const url = new URL(window.location.href);
    const failedLink = /[#&]error(_code)?=/.test(url.hash);
    if (!url.searchParams.has("role") && !failedLink) return;
    url.searchParams.delete("role");
    if (failedLink) url.hash = "";
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!fontsLoaded || authGate.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primaryTeal} />
      </View>
    );
  }

  // Opened from a password-reset email: the link signed the person in, and
  // the new password comes before anything else. A 2FA account's session is
  // still aal1, so its code comes first.
  if (authGate.recovering && authGate.status !== "signedOut") {
    const accent = role && role !== "translator" ? roleAccent[role] : colors.primaryTeal;
    const leave = async () => {
      authGate.endRecovery();
      await authGate.signOut();
    };
    return (
      <>
        <StatusBar style={statusBarStyle} />
        {authGate.status === "needsMfa" ? (
          <Verify2FAScreen
            accentColor={accent}
            title="Confirm it's you"
            factorId={authGate.mfaFactorId}
            onVerified={authGate.refresh}
            onCancel={leave}
          />
        ) : (
          <ResetPasswordScreen accentColor={accent} onDone={authGate.endRecovery} onCancel={leave} />
        )}
      </>
    );
  }

  if (!role) {
    const signedIn = authGate.status === "authenticated" ? authGate.profile : null;
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <RoleSelectScreen
          onSelectRole={setRole}
          onOpenTranslator={() => setRole("translator")}
          signedInAs={signedIn ? { name: signedIn.full_name, role: signedIn.role } : null}
          onContinueSignedIn={() => signedIn && setRole(signedIn.role)}
          onSignOut={() => authGate.signOut()}
          notice={authGate.linkError}
          onDismissNotice={authGate.clearLinkError}
        />
      </>
    );
  }

  if (role === "translator") {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <TranslatorHubScreen onBack={() => setRole(null)} />
      </>
    );
  }

  const showAuthFlow = authGate.status !== "authenticated" || setupPromptActive;

  if (showAuthFlow) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <AuthNavigator
          role={role}
          accentColor={roleAccent[role]}
          authGate={authGate}
          onRequestExit={() => setRole(null)}
          onSetupPromptActive={setSetupPromptActive}
        />
      </>
    );
  }

  // The dashboard follows the account's real role, not the tile that was
  // tapped - a student who logs in through the Admin tile gets the student
  // dashboard. (RLS is what actually protects the data either way.)
  const profile = authGate.profile;
  if (!profile || isPendingTeacher(profile)) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <AccountNoticeScreen
          accentColor={roleAccent[profile?.role ?? role]}
          title={profile ? "Waiting for approval" : "Can't open your account"}
          message={
            profile
              ? "An admin at Liloan Central School needs to approve your teacher account. Until then you can't make classes or calls. Once they have, choose Check again."
              : authGate.profileError ?? "Couldn't load your profile."
          }
          kind={profile ? "pending" : "error"}
          detail={
            profile
              ? `Signed up ${new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${
                  authGate.session?.user.email ? ` as ${authGate.session.user.email}` : ""
                }`
              : undefined
          }
          footnote={profile ? "Signed up as a student by mistake? Ask an admin to change your role." : undefined}
          onCheckAgain={authGate.refresh}
          onSignOut={() => authGate.signOut()}
        />
      </>
    );
  }

  const dashboardProps = {
    accentColor: roleAccent[profile.role],
    onSignOut: () => authGate.signOut(),
    onExitToRoleSelect: () => setRole(null),
    onAccountChange: authGate.refresh,
  };

  return (
    <>
      <StatusBar style={statusBarStyle} />
      {profile.role === "student" && <StudentDashboard {...dashboardProps} />}
      {profile.role === "teacher" && <TeacherDashboard {...dashboardProps} />}
      {profile.role === "admin" && <AdminDashboard {...dashboardProps} />}
    </>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
