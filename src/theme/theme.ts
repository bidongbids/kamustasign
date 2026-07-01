// src/theme/theme.ts
// KamustaSign design tokens — approved palette + typography.

export const colors = {
  // Primary brand
  primaryTeal: "#1D6F66",
  primaryTealDark: "#154F49",
  primaryTealLight: "#3E8F85",

  // Accent
  accentMarigold: "#F2A93B",
  accentMarigoldDark: "#D6901F",

  // Background / surface
  background: "#FBF7EF", // warm paper
  surface: "#FFFFFF",
  surfaceMuted: "#F1ECE1",

  // Feedback tokens (used by the classroom auto-scoring UI later)
  success: "#3F9142", // sign performed correctly
  needsPractice: "#D9603B", // sign needs more practice

  // Admin-specific accent (kept visually distinct from teal/marigold)
  adminGray: "#5B6570",
  adminGrayLight: "#8A93A0",

  // Text
  textPrimary: "#2B2621",
  textSecondary: "#6B6459",
  textOnPrimary: "#FFFFFF",

  border: "#E4DCC9",
};

export const fonts = {
  heading: "Baloo2_700Bold",
  headingSemiBold: "Baloo2_600SemiBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radii = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
};

export const theme = {
  colors,
  fonts,
  spacing,
  radii,
};

export default theme;
