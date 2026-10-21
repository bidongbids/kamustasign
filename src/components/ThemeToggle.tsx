// Light/dark switch for phone headers (KAMUSTASIGN_LIGHT_THEME_HANDOFF.md
// §4). Renders nothing on desktop/tablet, which are always dark. A 44pt
// raised button: the icon shows the theme a tap switches TO.
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { ThemeColors } from "../theme/theme";
import { Theme, useTheme, useThemedStyles } from "../theme/ThemeProvider";
import { MoonIcon, SunIcon } from "./icons/UiIcons";

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      ...theme.shadows.neuRaised("sm"),
    },
    pressed: theme.shadows.neuPressed(),
  });

export default function ThemeToggle() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!theme.isMobile) return null;
  const toLight = theme.name === "dark";
  return (
    <Pressable
      onPress={() => theme.setPreference(toLight ? "light" : "dark")}
      accessibilityRole="switch"
      accessibilityState={{ checked: !toLight }}
      accessibilityLabel={toLight ? "Switch to light theme" : "Switch to dark theme"}
      hitSlop={4}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {toLight ? <SunIcon size={20} color={theme.colors.accentCoral} /> : <MoonIcon size={18} color={theme.colors.primaryTealText} />}
    </Pressable>
  );
}
