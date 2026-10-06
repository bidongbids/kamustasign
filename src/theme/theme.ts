// src/theme/theme.ts
// KamustaSign design tokens — "Graphite Aurora" glassmorphism/neumorphism
// palette (proposed replacement for "Violet Dusk", see
// design_handoff_kamustasign_material_pass/README.md). Same token NAMES as
// every previous revision so none of the files that import `colors` needed
// to change structurally — only the values (and a handful of new tokens for
// the neumorphic/skeuomorphic material system) moved. If you're hunting for
// why `primaryTeal` isn't teal-colored: that's why — the name is a stable
// role ("main brand action color"), the hue underneath is free to evolve.
//
// Graphite Aurora trades Violet Dusk's saturated indigo->magenta gradient for
// a mid-tone, low-chroma dark ground — neumorphism needs that so soft double
// shadows read as raised/inset instead of disappearing into a too-saturated
// backdrop.

export const colors = {
  // Primary brand — teacher role accent
  primaryTeal: "#7C6CF5",
  primaryTealDark: "#5A50A8",
  primaryTealLight: "#9A8DF8",

  // Accent — student role accent + CTA pop color
  accentCoral: "#F2B23E",
  accentCoralDark: "#C08420",
  // Readable label color for text sitting ON TOP of accentCoral (buttons,
  // active pills/tabs) - kept as its own token instead of hardcoding a dark
  // shade per-screen, since it has to be re-picked by hand every time the
  // accent hue changes across a palette swap otherwise.
  textOnAccent: "#2A1E05",

  // Background / surface
  background: "#1A1E26",
  surface: "#232936",
  surfaceMuted: "#20252F",

  // Feedback tokens (kept intentionally palette-independent — green/red for
  // correct/needs-practice is a universal convention, not a brand color)
  success: "#3FB56A",
  needsPractice: "#E0525F",

  // Admin-specific accent (kept visually distinct from violet/gold; cooled
  // toward a neutral steel blue-gray)
  adminGray: "#7D8799",
  adminGrayLight: "#9AA3B2",

  // Text
  textPrimary: "#EDEFF4",
  textSecondary: "#98A1B2",
  textOnPrimary: "#FFFFFF",
  // Dark-neutral text pair for content sitting on the FROSTED glass variant
  // (an opaque-ish white fill, used on auth + dashboard chrome) — frosted
  // glass stays light regardless of the base palette's mode, so text on it
  // needs to stay dark even though `textPrimary`/`textSecondary` above are
  // tuned for the dark ground. Not part of the original handoff token list;
  // added so the Graphite Aurora swap doesn't wash out auth/dashboard text.
  textOnFrosted: "#1E1F26",
  textOnFrostedMuted: "#5B6472",

  border: "rgba(255,255,255,0.16)",

  // Depth & state
  surfaceElevated: "#252B38",
  overlay: "rgba(10,12,16,0.62)",
  focusRing: "#F2B23E",
  disabledSurface: "#20252F",
  disabledText: "#5F6878",

  // Glassmorphism-specific tokens — the hero gradient backdrop that glass
  // panels float on, plus the frosted panel treatment itself. Use
  // GradientBackground / GlassCard (src/components) rather than reaching for
  // these raw values directly.
  gradientStart: "#171A21",
  gradientMid: "#1E2430",
  gradientEnd: "#262C3A",
  glassTint: "rgba(255,255,255,0.11)",
  glassTintFrosted: "rgba(255,255,255,0.58)",
  glassBorder: "rgba(255,255,255,0.16)",

  // Neumorphic material — controls (anything pressed/toggled) are drawn as a
  // raised or inset double-shadow slab on these fills. See
  // src/theme/shadows.ts (`neuRaised` / `neuInset`).
  neuBase: "#232936",
  neuShadowDark: "#12151B",
  neuShadowLight: "#2E3644",
  neuWell: "#1D222B",
  neuWellLight: "#2A3140",

  textTertiary: "#5F6878",
  textDim: "#6E7788",
  textOnGlass: "#C3CAD6",
};

// Layout breakpoints — one desk/laptop-width tier, one tablet tier, mobile
// is "everything below tablet". See src/theme/responsive.ts.
export const breakpoints = {
  tablet: 768,
  desktop: 1100,
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

// Formalized type scale (design_handoff README: "PROPOSAL: formalize the
// type scale") — draw from this instead of picking ad hoc fontSize/
// lineHeight per screen. Only Baloo2 (700/600) and Inter (400/500/600) are
// loaded via expo-font in App.tsx, so `display`/`h1`/`h2`/`h3`/`hero` all use
// the same Baloo2_700Bold family — there is no separate ExtraBold weight
// loaded, the mocks' 800-weight hero letter is approximated at 700.
export const typography = {
  display: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 49 },
  h1: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 30 },
  h2: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 23 },
  h3: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 20 },
  hero: { fontFamily: fonts.heading, fontSize: 62, lineHeight: 62 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 26 },
  bodySm: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 14, lineHeight: 14 },
  labelSm: { fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 13 },
  caption: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 18 },
  meta: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 10,
    letterSpacing: 1.1,
    textTransform: "uppercase" as const,
  },
};

export const theme = {
  colors,
  fonts,
  spacing,
  radii,
  typography,
};

export default theme;
