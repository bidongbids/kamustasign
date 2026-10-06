// src/components/GlassCard.tsx
// Frosted-glass panel — the other half of the glassmorphism pairing with
// GradientBackground. Layers a real backdrop blur (expo-blur's BlurView,
// which uses CSS backdrop-filter on web and native blur on iOS/Android)
// under a translucent diagonal gradient tint and a soft light border, so
// content sitting on top of the gradient reads as glass rather than a flat
// tinted box. Only reads correctly over a colorful/gradient backdrop - don't
// use this over colors.background (flat), there's nothing to blur.
//
// `tint` unifies what used to be two separately-inlined patterns (a sheer
// tint on the translator/role-select screens, a much stronger "frosted"
// tint hand-copied into AuthScreenShell/DashboardShell) into one prop, per
// design_handoff_kamustasign_material_pass/README.md ("Required change").
// Frosted is opaque enough for normal dark-on-light text — pair it with
// `colors.textOnFrosted` / `textOnFrostedMuted`, not `textPrimary`, since
// `textPrimary` is tuned for the dark ground the sheer variant floats on.
import React from "react";
import { StyleSheet, View, ViewStyle, StyleProp } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radii, spacing } from "../theme/theme";

type Tint = "sheer" | "frosted";

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: number;
  radius?: number;
  padding?: number;
  tint?: Tint;
  // Panels drawn directly over the live camera feed need a slightly
  // stronger border/fill to stay legible against unpredictable video
  // content underneath (README: "Over video: ... border rgba(255,255,255,
  // 0.22), fill 0.14 -> 0.06, blur 18").
  overVideo?: boolean;
  // The one drop shadow used on glass panels that float free of the camera
  // device or another elevated surface (README: "0 10px 30px rgba(0,0,0,
  // 0.28)"). Needs its own non-clipped wrapper since the card's rounded
  // content view has overflow:hidden for the blur/gradient.
  dropShadow?: boolean;
};

const GRADIENT_STOPS: Record<"sheer" | "frosted" | "overVideo", [string, string]> = {
  sheer: ["rgba(255,255,255,0.13)", "rgba(255,255,255,0.035)"],
  frosted: ["rgba(255,255,255,0.58)", "rgba(255,255,255,0.44)"],
  overVideo: ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.06)"],
};

export default function GlassCard({
  children,
  style,
  contentStyle,
  intensity,
  radius = radii.lg,
  padding = spacing.lg,
  tint = "sheer",
  overVideo = false,
  dropShadow = false,
}: Props) {
  const stops = overVideo ? GRADIENT_STOPS.overVideo : GRADIENT_STOPS[tint];
  const borderColor = overVideo ? "rgba(255,255,255,0.22)" : colors.glassBorder;
  const resolvedIntensity = intensity ?? (overVideo ? 18 : tint === "frosted" ? 26 : 16);

  const card = (
    <View style={[styles.outer, { borderRadius: radius, borderColor }, style]}>
      <BlurView intensity={resolvedIntensity} tint="light" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={stops}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.55, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[{ padding }, contentStyle]}>{children}</View>
    </View>
  );

  if (!dropShadow) return card;

  return <View style={styles.shadowWrap}>{card}</View>;
}

const styles = StyleSheet.create({
  outer: {
    overflow: "hidden",
    borderWidth: 1,
  },
  shadowWrap: {
    boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: "rgba(0,0,0,0.28)" }],
  } as ViewStyle,
});
