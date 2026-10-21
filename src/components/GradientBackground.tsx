// src/components/GradientBackground.tsx
// The vibrant "Tropical Sunrise" backdrop glass panels float on. Wrap a
// screen's root content in this instead of a flat colors.background View
// wherever the glassmorphism treatment applies (translator screens, auth,
// dashboards). Falls back to a plain flex:1 container with no visual loss
// on platforms where LinearGradient can't render (it can everywhere Expo
// targets, including web).
import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeProvider";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  // Most screens want the full diagonal three-stop sunrise. Pass "subtle"
  // for chrome-heavy screens (dashboards) where a quieter version keeps
  // dense text/list content readable without competing for attention.
  variant?: "full" | "subtle";
};

export default function GradientBackground({ children, style, variant = "full" }: Props) {
  // Light (phones only) is a near-flat pale ground: the gradient tokens are
  // set almost equal there, so the same code draws it.
  const { colors } = useTheme();
  const gradientColors: [string, string, string] =
    variant === "full"
      ? [colors.gradientStart, colors.gradientMid, colors.gradientEnd]
      : [colors.gradientStart, colors.gradientMid, colors.gradientMid];

  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
