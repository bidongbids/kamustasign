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
import { useConnection } from "./src/lib/connectivity";
import { isPendingApproval, type ProfileRole } from "./src/lib/queries";
import AccountNoticeScreen from "./src/screens/auth/AccountNoticeScreen";
import Verify2FAScreen from "./src/screens/auth/Verify2FAScreen";
import ResetPasswordScreen from "./src/screens/auth/ResetPasswordScreen";
import Setup2FAScreen from "./src/screens/auth/Setup2FAScreen";
import { ThemeColors } from "./src/theme/theme";
import { ThemeProvider, useTheme, useThemedStyles } from "./src/theme/ThemeProvider";
import { SafeAreaProvider } from "react-native-safe-area-context";
import CrashBoundary from "./src/components/CrashBoundary";
import { isAndroidApp } from "./src/lib/androidApp";
import { installErrorCapture } from "./src/lib/errorLog";
import { useAppRelease } from "./src/lib/appRelease";
import UpdateRequiredScreen from "./src/screens/auth/UpdateRequiredScreen";

// "start": the login screen (or, with a saved session, who is signed in);
// "app": the signed-in account's dashboard; "translator": no account needed,
// opened from either one, and Back returns there; "classroom": the offline
// Classroom - practice with no account, progress kept on this device
// (StudentDashboard `guest`) - offered when the internet is down.
type Screen = "start" | "app" | "translator" | "classroom";

// Launching offline with a saved session, supabase-js retries the token
// refresh for ~25 s before it gives up. The start screen doesn't wait for it
// once the connectivity check says offline, or after this long anyway: the
// Translator and offline practice need no account.
const AUTH_WAIT_MS = 5000;

/** True once `active` has stayed true for `ms`; false again when it isn't. */
function useAfter(active: boolean, ms: number) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    setOver(false);
    if (!active) return;
    const id = setTimeout(() => setOver(true), ms);
    return () => clearTimeout(id);
  }, [active, ms]);
  return over;
}

const roleAccentFor = (colors: ThemeColors): Record<ProfileRole, string> => ({
  student: colors.accentCoral,
  teacher: colors.primaryTeal,
  admin: colors.adminGray,
});

// Who has to act on a sign-up (0014_account_approval.sql) and what waits.
const PENDING_MESSAGE: Record<ProfileRole, string> = {
  student:
    "An admin at Liloan Central School needs to approve your account. Until then you can't practice or join a class. Once they have, choose Check again.",
  teacher:
    "An admin at Liloan Central School needs to approve your teacher account. Until then you can't make classes or calls. Once they have, choose Check again.",
  admin: "The LCSign super admin needs to approve your admin account. Until then you can't manage accounts. Once they have, choose Check again.",
};
const ROLE_WITH_ARTICLE: Record<ProfileRole, string> = { student: "a student", teacher: "a teacher", admin: "an admin" };

// Keep the last few errors on this device for "Copy error report"
// (Appearance > About LCSign) - production builds; in dev the console is right there.
if (!__DEV__ && Platform.OS === "web") installErrorCapture();

// Installable app / offline shell (public/sw.js). Production web builds only:
// in dev it would cache Metro's bundles, and Electron's app:// scheme has no
// service worker support (it's offline anyway). The Android app (mobile/,
// Capacitor) serves https://localhost from files inside the APK, so a worker
// would only keep a second copy of the models and could hand out an old one
// after an app update.
if (
  !__DEV__ &&
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.protocol.startsWith("http") &&
  !isAndroidApp()
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
  const [classroomFrom, setClassroomFrom] = useState<Screen>("start");
  const [setupPromptActive, setSetupPromptActive] = useState(false);
  const authGate = useAuthGate();
  // Is the server reachable? Checked everywhere but inside a working
  // dashboard (which has its own "check the internet" cards).
  const connection = useConnection(!(screen === "app" && authGate.status === "authenticated"));
  const offline = connection === "offline";
  const authSlow = useAfter(authGate.status === "loading", AUTH_WAIT_MS);
  // Too old for the server (app_release.min_version, 0018)? Then the
  // Translator still works, but nothing that needs an account.
  const appRelease = useAppRelease();

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
    if (authGate.status === "signedOut") setScreen((s) => (s === "translator" || s === "classroom" ? s : "start"));
  }, [authGate.status]);

  const openTranslator = (from: Screen) => {
    setTranslatorFrom(from);
    setScreen("translator");
  };
  const openClassroom = (from: Screen) => {
    setClassroomFrom(from);
    setScreen("classroom");
  };

  const spinner = (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primaryTeal} />
    </View>
  );
  if (!fontsLoaded) return spinner;

  // Neither needs an account, so neither waits for the session check.
  if (screen === "translator") {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <TranslatorHubScreen
          onBack={() => setScreen(translatorFrom)}
          backLabel={
            translatorFrom === "app" ? "Back to your dashboard" : translatorFrom === "classroom" ? "Back to the Classroom" : "Back to the log-in screen"
          }
          signerName={authGate.status === "authenticated" ? authGate.profile?.full_name ?? undefined : undefined}
        />
      </>
    );
  }
  if (screen === "classroom") {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <StudentDashboard
          guest
          accentColor={roleAccent.student}
          exitLabel={classroomFrom === "app" ? "Back to my account" : "Back to log in"}
          onExitToStart={() => setScreen(classroomFrom)}
          onOpenTranslator={() => openTranslator("classroom")}
        />
      </>
    );
  }

  if (appRelease.need === "required" && appRelease.release) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <UpdateRequiredScreen accentColor={colors.primaryTeal} release={appRelease.release} onOpenTranslator={() => openTranslator("start")} />
      </>
    );
  }

  if (authGate.status === "loading" && !offline && !authSlow) return spinner;

  // Opened from a password-reset email: the link signed the person in, and
  // the new password comes before anything else. A 2FA account's session is
  // still aal1, so its code comes first.
  if (authGate.recovering && authGate.status !== "signedOut" && authGate.status !== "loading") {
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
          offline={offline}
          onOpenClassroom={() => openClassroom("start")}
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

  // Admin accounts must use 2FA: since 0016 the database ignores an admin's
  // role until the session has entered an authenticator code, so an admin
  // without 2FA sets it up here first - no skipping, only logging out.
  if (profile?.role === "admin" && !authGate.aal2) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <Setup2FAScreen
          required
          accentColor={colors.primaryTeal}
          onDone={(enabled) => (enabled ? authGate.refresh() : authGate.signOut())}
        />
      </>
    );
  }
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
          onPracticeOffline={profile ? undefined : () => openClassroom("app")}
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
      {profile.role === "student" && (
        <StudentDashboard {...dashboardProps} onOpenTranslator={() => openTranslator("app")} onPracticeOffline={() => openClassroom("app")} />
      )}
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
