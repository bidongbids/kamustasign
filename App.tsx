// App.tsx
// Entry point: loads fonts, shows RoleSelectScreen, placeholder role routing.
// Real navigation (@react-navigation/native) gets wired in next — this just
// proves the fonts + theme + role-select flow work end to end.

import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useFonts, Baloo2_700Bold, Baloo2_600SemiBold } from "@expo-google-fonts/baloo-2";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import RoleSelectScreen from "./src/screens/RoleSelectScreen";
import TestModelScreen from "./src/screens/TestModelScreen";
import { colors, fonts as themeFonts } from "./src/theme/theme";

type Role = "student" | "teacher" | "admin" | null;

export default function App() {
  const [fontsLoaded] = useFonts({
    Baloo2_700Bold,
    Baloo2_600SemiBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  const [role, setRole] = useState<Role>(null);

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primaryTeal} />
      </View>
    );
  }

  // Placeholder routing — replace with @react-navigation/native once
  // auth (Supabase) is wired up. For now this just proves the role
  // select screen and design tokens render correctly.
  if (!role) {
    return (
      <>
        <StatusBar style="dark" />
        <RoleSelectScreen onSelectRole={setRole} />
      </>
    );
  }

  return (
    <View style={styles.placeholder}>
      <StatusBar style="dark" />
      <Text style={{ fontFamily: themeFonts.heading, fontSize: 24, color: colors.primaryTeal }}>
        {role.charAt(0).toUpperCase() + role.slice(1)} dashboard — coming next
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
});
