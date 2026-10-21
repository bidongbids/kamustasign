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
// bounces the web page away and back (see LoginScreen's redirectTo).
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
    if (Platform.OS === "web" && typeof window !== "undefined" && window.location.search.includes("role=")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("role");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  if (!fontsLoaded || authGate.status === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primaryTeal} />
      </View>
    );
  }

  if (!role) {
    return (
      <>
        <StatusBar style={statusBarStyle} />
        <RoleSelectScreen
          onSelectRole={setRole}
          onOpenTranslator={() => setRole("translator")}
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

  const dashboardProps = {
    accentColor: roleAccent[role],
    onSignOut: () => authGate.signOut(),
    onExitToRoleSelect: () => setRole(null),
  };

  return (
    <>
      <StatusBar style={statusBarStyle} />
      {role === "student" && <StudentDashboard {...dashboardProps} />}
      {role === "teacher" && <TeacherDashboard {...dashboardProps} />}
      {role === "admin" && <AdminDashboard {...dashboardProps} />}
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
