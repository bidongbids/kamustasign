// src/screens/RoleSelectScreen.tsx
// Approved entry screen: hand-landmark logo, KamustaSign wordmark,
// "Liloan Central School" subtitle, three tappable role cards.

import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import HandLandmarkMark from "../components/HandLandmarkMark";
import RoleCard from "../components/RoleCard";
import { colors, fonts, spacing } from "../theme/theme";

type Role = "student" | "teacher" | "admin";

type Props = {
  onSelectRole: (role: Role) => void;
};

export default function RoleSelectScreen({ onSelectRole }: Props) {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      style={{ backgroundColor: colors.background }}
    >
      <View style={styles.header}>
        <HandLandmarkMark size={88} />
        <Text style={styles.wordmark}>KamustaSign</Text>
        <Text style={styles.subtitle}>Liloan Central School</Text>
      </View>

      <View style={styles.cards}>
        <RoleCard
          label="Student"
          description="Practice signs and submit assignments"
          accentColor={colors.accentMarigold}
          icon={<Text style={{ fontSize: 28 }}>🎓</Text>}
          onPress={() => onSelectRole("student")}
        />
        <RoleCard
          label="Teacher"
          description="Post assignments and review submissions"
          accentColor={colors.primaryTeal}
          icon={<Text style={{ fontSize: 28 }}>📋</Text>}
          onPress={() => onSelectRole("teacher")}
        />
        <RoleCard
          label="Admin"
          description="Manage classes and accounts"
          accentColor={colors.adminGray}
          icon={<Text style={{ fontSize: 28 }}>⚙️</Text>}
          onPress={() => onSelectRole("admin")}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.primaryTeal,
    marginTop: spacing.md,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cards: {
    width: "100%",
    alignItems: "center",
  },
});
