// The Back pill (design_handoff_classroom_theming §4.1): always top-left,
// always an arrow and a word naming where it goes. On phones it's an icon
// button whose accessibility label still names the destination.
import React from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { ChevronLeftIcon } from "./icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";

type Props = {
  onPress: () => void;
  /** The word on the pill: "Back", or where it goes ("My signs"). */
  label?: string;
  /** "Back to the start screen", "Back to My signs"... */
  accessibilityLabel?: string;
  iconOnly?: boolean;
};

export default function BackButton({ onPress, label = "Back", accessibilityLabel, iconOnly }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (label === "Back" ? "Back" : `Back to ${label}`)}
      hitSlop={4}
      style={(state: any) => [styles.pill, iconOnly && styles.icon, state.pressed && styles.pressed, state.focused && styles.focused]}
    >
      <ChevronLeftIcon size={iconOnly ? 20 : 18} color={colors.textPrimary} />
      {iconOnly ? null : <Text style={styles.label}>{label}</Text>}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    pill: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 10,
      paddingRight: 14,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceRaised,
      ...theme.shadows.neuRaised("sm"),
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
    },
    icon: { width: 44, paddingLeft: 0, paddingRight: 0, justifyContent: "center" },
    pressed: theme.shadows.neuPressed(),
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
    label: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  });
