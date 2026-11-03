import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Baloo2_700Bold, Baloo2_600SemiBold } from "@expo-google-fonts/baloo-2";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import TranslatorHubScreen from "./src/screens/TranslatorHubScreen";
import AuthNavigator from "./src/navigation/AuthNavigator";
import StudentDashboard from "./src/screens/dashboard/StudentDashboard";
import TeacherDashboard from "./src/screens/dashboard/TeacherDashboard";
import AdminDashboard from "./src/screens/dashboard/AdminDashboard";
import { useAuthGate } from "./src/lib/authGate";
import { isPendingApproval, type ProfileRole } from "./src/lib/queries";
import AccountNoticeScreen from "./src/screens/auth/AccountNoticeScreen";
import Verify2FAScreen from "./src/screens/auth/Verify2FAScreen";
import ResetPasswordScreen from "./src/screens/auth/ResetPasswordScreen";
import { ThemeColors } from "./src/theme/theme";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import CrashBoundary from "./src/components/CrashBoundary";

// "start": the login screen (or, with a saved session, who is signed in);
// "app": the signed-in account's dashboard; "translator": no account needed,
// opened from either one, and Back returns there.
type Screen = "start" | "app" | "translator";

const roleAccentFor = (colors: ThemeColors): Record<ProfileRole, string> => ({
  student: colors.accentCoral,
  teacher: colors.primaryTeal,
  admin: colors.adminGray,
});

// Who has to act on a sign-up (0014_account_approval.sql) and what waits.
const PENDING_MESSAGE: Record<ProfileRole, string> = {
  student:
    "An admin at Liloan Central School needs to approve your account. Until then you can't practise or join a class. Once they have, choose Check again.",
  teacher:
    "An admin at Liloan Central School needs to approve your teacher account. Until then you can't make classes or calls. Once they have, choose Check again.",
  admin: "The LCSign super admin needs to approve your admin account. Until then you can't manage accounts. Once they have, choose Check again.",
};
const ROLE_WITH_ARTICLE: Record<ProfileRole, string> = { student: "a student", teacher: "a teacher", admin: "an admin" };

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
    <CrashBoundary plain>
      <SafeAreaProvider>
        <ThemeProvider>
          <CrashBoundary>
            <AppContent />
          </CrashBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </CrashBoundary>
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

  const [screen, setScreen] = useState<Screen>("start");
  const [translatorFrom, setTranslatorFrom] = useState<Screen>("start");
  const [setupPromptActive, setSetupPromptActive] = useState(false);
  const authGate = useAuthGate();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // A failed email link's #error=... has been read by authGate and
    // shouldn't come back on a reload; links from before the login screen
    // also carry the old ?role=. A successful link's #access_token=... is
    // left for supabase-js.
    const url = new URL(window.location.href);
    const failedLink = /[#&]error(_code)?=/.test(url.hash);
    if (!url.searchParams.has("role") && !failedLink) return;
    url.searchParams.delete("role");
    if (failedLink) url.hash = "";
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Signing in (or finishing 2FA) on the login screen goes straight to the
  // dashboard. A session restored at launch doesn't: on a shared classroom
  // computer the start screen first says who is still signed in.
  const lastStatus = useRef(authGate.status);
  useEffect(() => {
    const prev = lastStatus.current;
    lastStatus.current = authGate.status;
    if (authGate.status === "authenticated" && (prev === "signedOut" || prev === "needsMfa")) setScreen("app");
    if (authGate.status === "signedOut") setScreen((s) => (s === "translator" ? s : "start"));
  }, [authGate.status]);

  const openTranslator = (from: Screen) => {
    setTranslatorFrom(from);
    setScreen("translator");
  };

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
    const leave = async () => {
      authGate.endRecovery();
      await authGate.signOut();
    };
    return (
      <>
        <StatusBar style={statusBarStyle} />
        {authGate.status === "needsMfa" ? (
          <Verify2FAScreen
            accentColor={colors.primaryTeal}
            title="Confirm it's you"
            factorId={authGate.mfaFactorId}
            onVerified={authGate.refresh}
            onCancel={leave}
          />
        ) : (
          <ResetPasswordScreen accentColor={colors.primaryTeal} onDone={authGate.endRecovery} onCancel={leave} />
        )}
      </>
    );
  }

  if (screen === "translator") {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <TranslatorHubScreen
          onBack={() => setScreen(translatorFrom)}
          backLabel={translatorFrom === "app" ? "Back to your dashboard" : "Back to the log-in screen"}
          signerName={authGate.status === "authenticated" ? authGate.profile?.full_name ?? undefined : undefined}
        />
      </>
    );
  }

  const signedIn = authGate.status === "authenticated" && !setupPromptActive;

  if (!signedIn || screen === "start") {
    const restored = signedIn ? { name: authGate.profile?.full_name ?? "", role: authGate.profile?.role ?? null } : null;
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <AuthNavigator
          accentColor={colors.primaryTeal}
          authGate={authGate}
          onOpenTranslator={() => openTranslator("start")}
          signedInAs={restored}
          onContinueSignedIn={() => setScreen("app")}
          onSetupPromptActive={setSetupPromptActive}
        />
      </>
    );
  }

  // The dashboard follows the account's role in the database. (RLS is what
  // actually protects the data either way.)
  const profile = authGate.profile;
  if (!profile || isPendingApproval(profile)) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <AccountNoticeScreen
          accentColor={profile ? roleAccent[profile.role] : colors.primaryTeal}
          title={profile ? "Waiting for approval" : "Can't open your account"}
          message={profile ? PENDING_MESSAGE[profile.role] : authGate.profileError ?? "Couldn't load your profile."}
          kind={profile ? "pending" : "error"}
          detail={
            profile
              ? `Signed up ${new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })} as ${
                  ROLE_WITH_ARTICLE[profile.role]
                }${authGate.session?.user.email ? ` · ${authGate.session.user.email}` : ""}`
              : undefined
          }
          footnote={profile ? "Picked the wrong kind of account? Whoever approves you can change it." : undefined}
          onCheckAgain={authGate.refresh}
          onSignOut={() => authGate.signOut()}
        />
      </>
    );
  }

  const dashboardProps = {
    accentColor: roleAccent[profile.role],
    onSignOut: () => authGate.signOut(),
    onExitToStart: () => setScreen("start"),
    onAccountChange: authGate.refresh,
  };

  return (
    <>
      <StatusBar style={statusBarStyle} />
      {profile.role === "student" && <StudentDashboard {...dashboardProps} onOpenTranslator={() => openTranslator("app")} />}
      {profile.role === "teacher" && <TeacherDashboard {...dashboardProps} onOpenTranslator={() => openTranslator("app")} />}
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
