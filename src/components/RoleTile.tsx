// Phone role-select tile (KAMUSTASIGN_LIGHT_THEME_HANDOFF.md §5 "RoleCard"):
// one cell of the 2x2 grid - a raised slab with the role's icon in a small
// selected-tint tile, the role name and one short line. Desktop/tablet keep
// RoleCard's full-width rows.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { mobileTypography, radii, spacing, ThemeColors } from "../theme/theme";
import { Theme, useThemedStyles } from "../theme/ThemeProvider";

type Props = {
  label: string;
  description: string;
  icon: React.ReactNode;
  width: number;
  onPress: () => void;
  accessibilityLabel?: string;
};

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    tile: {
      minHeight: 140,
      borderRadius: radii.lg,
      padding: spacing.md,
      gap: spacing.sm,
      backgroundColor: colors.surface,
      ...theme.shadows.neuRaised("md"),
    },
    pressed: theme.shadows.neuPressed(),
    focused: {
      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2, color: colors.focusRing }],
    } as ViewStyle,
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceSelected,
    },
    label: { ...mobileTypography.heading, color: colors.textPrimary },
    description: { ...mobileTypography.caption, color: colors.textSecondary },
  });

export default function RoleTile({ label, description, icon, width, onPress, accessibilityLabel }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = React.useState(false);
  return (
    <Pressable
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Continue as ${label}`}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed, focused && Platform.OS === "web" && styles.focused]}
    >
      <View style={styles.iconTile}>{icon}</View>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>
    </Pressable>
  );
}
