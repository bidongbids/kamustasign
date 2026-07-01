// src/components/RoleCard.tsx
// Big tappable icon-led card for role selection — visual communication
// carries more weight than text, matching the product's DHH-first premise.

import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { colors, fonts, spacing, radii } from "../theme/theme";

type Props = {
  label: string;
  description: string;
  accentColor: string;
  icon: React.ReactNode;
  onPress: () => void;
};

export default function RoleCard({
  label,
  description,
  accentColor,
  icon,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: accentColor, opacity: pressed ? 0.85 : 1 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Continue as ${label}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: accentColor + "22" }]}>
        {icon}
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.description}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
    width: "100%",
    maxWidth: 320,
    marginBottom: spacing.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
