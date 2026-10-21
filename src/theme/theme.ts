// src/theme/theme.ts
// KamustaSign design tokens — "Graphite Aurora" glassmorphism/neumorphism
// palette (proposed replacement for "Violet Dusk", see
// docs/design/design_handoff_kamustasign_material_pass/README.md). Same token NAMES as
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

export const darkColors = {
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

  // Student learning layer (Graphite Aurora design system, "Kids" tokens).
  // Every value is an existing hue named by its role - see the design
  // system's RN implementation notes. Gold/green NEVER sit on frosted glass
  // (1.35:1 / 1.03:1), so the student plan uses sheer glass.
  starFilled: "#F2B23E", // = accentCoral - a counted pass
  starEmpty: "#7D8799", // = adminGray - outline of a star not earned yet
  starResting: "#C08420", // = accentCoralDark - newest star during cooldown (always with the moon)
  celebrationGlow: "rgba(242,178,62,0.35)", // accentCoral @35%
  masteredRing: "#3FB56A", // = success
  tipAccent: "#9A8DF8", // = primaryTealLight - tip lightbulb + label
  holdTrack: "rgba(255,255,255,0.08)",

  // Added for the phone light theme (docs/KAMUSTASIGN_LIGHT_THEME_HANDOFF.md §2.1).
  // Where the handoff's guessed key already existed under another name, the
  // existing token is reused (surfaceInset = neuWell, hairline =
  // neuShadowLight, onPrimary = textOnPrimary, onAccent = textOnAccent);
  // the rest are new and only used by phone-layout components.
  surfaceInset: "#1D222B",
  surfacePressed: "#1F2430",
  surfaceSelected: "#2A2F45",
  hairline: "#2E3644",
  controlBorder: "#717A8F",
  textMuted: "#909AAE",
  primaryTealText: "#B3A8FF",
  onPrimary: "#FFFFFF",
  onAccent: "#1B2029",
  accentCoralText: "#F2B23E",
  successText: "#5FD08A",
  needsPracticeText: "#FF7A85",
  onStatus: "#1B2029",
  cameraBezel: "#12151B",
  onCamera: "#FFFFFF",
  cameraScrim: "rgba(18,21,27,0.62)",
};

export type ThemeColors = typeof darkColors;
export type ThemeName = "dark" | "light";

// Phone-only light palette (the handoff's "light" column). Every dark key has
// a value here so a screen can swap palettes without missing tokens. Tokens
// whose dark meaning was "lighter shade for text on the dark ground"
// (primaryTealLight, tipAccent, adminGrayLight, textOnGlass) take the
// readable dark-on-light shade instead, and the glass tokens become opaque
// surfaces - light GlassCards are solid cards (handoff §5).
export const lightColors: ThemeColors = {
  primaryTeal: "#6352E6",
  primaryTealDark: "#5241C9",
  primaryTealLight: "#5241C9",

  accentCoral: "#F2B23E",
  accentCoralDark: "#8A5A00",
  textOnAccent: "#3A2A00",

  background: "#EEF1F6",
  surface: "#F8F9FC",
  surfaceMuted: "#E4E8F0",

  // success/needsPractice/successText are a shade darker than the handoff's
  // #2A9152/#D9475A/#1E7B42 so white badge text and inset-well text reach 4.5:1.
  success: "#237F48",
  needsPractice: "#C73A4C",

  adminGray: "#5A6478",
  adminGrayLight: "#4A5266",

  textPrimary: "#1B1F2A",
  textSecondary: "#4A5266",
  textOnPrimary: "#FFFFFF",
  textOnFrosted: "#1B1F2A",
  textOnFrostedMuted: "#4A5266",

  border: "#D5DAE5",

  surfaceElevated: "#FFFFFF",
  overlay: "rgba(27,31,42,0.45)",
  focusRing: "#4F3FD0",
  disabledSurface: "#E4E8F0",
  disabledText: "#7F889E",

  gradientStart: "#EEF1F6",
  gradientMid: "#EEF1F6",
  gradientEnd: "#E9EDF4",
  glassTint: "#F8F9FC",
  glassTintFrosted: "#F8F9FC",
  glassBorder: "#DCE0EA",

  neuBase: "#F8F9FC",
  neuShadowDark: "rgba(102,114,146,0.28)",
  neuShadowLight: "rgba(255,255,255,0.9)",
  neuWell: "#E4E8F0",
  neuWellLight: "#ECEFF5",

  textTertiary: "#5D6579",
  textDim: "#5D6579",
  textOnGlass: "#4A5266",

  starFilled: "#F2B23E",
  starEmpty: "#7F889E",
  starResting: "#8A5A00",
  celebrationGlow: "rgba(242,178,62,0.35)",
  masteredRing: "#237F48",
  tipAccent: "#5241C9",
  holdTrack: "rgba(27,31,42,0.08)",

  surfaceInset: "#E4E8F0",
  surfacePressed: "#E6E9F1",
  surfaceSelected: "#EAE7FF",
  hairline: "#D5DAE5",
  controlBorder: "#7F889E",
  textMuted: "#5D6579",
  primaryTealText: "#5241C9",
  onPrimary: "#FFFFFF",
  onAccent: "#3A2A00",
  accentCoralText: "#8A5A00",
  successText: "#1B713D",
  needsPracticeText: "#B3303D",
  onStatus: "#FFFFFF",
  cameraBezel: "#12151B",
  onCamera: "#FFFFFF",
  cameraScrim: "rgba(18,21,27,0.62)",
};

export const palettes: Record<ThemeName, ThemeColors> = { dark: darkColors, light: lightColors };

// The dark palette under its original name: screens not yet moved to
// useTheme() (src/theme/ThemeProvider.tsx) keep importing this, and desktop/
// tablet are always dark.
export const colors = darkColors;

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

// Kid-size type for the student learning layer. Every sentence a child reads
// is kidBody; nothing child-facing uses caption/meta.
export const kidTypography = {
  kidTarget: { fontFamily: fonts.heading, fontSize: 104, lineHeight: 104 },
  kidTargetWord: { fontFamily: fonts.heading, fontSize: 44, lineHeight: 48 },
  kidHeadline: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32 },
  kidTitle: { fontFamily: fonts.headingSemiBold, fontSize: 22, lineHeight: 26 },
  tileGlyph: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 30 },
  kidBody: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 26 },
  kidLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 },
};

// Phone type scale (handoff §2.2) - used only on the isMobile branch;
// desktop/tablet keep `typography` / `kidTypography` above.
export const mobileTypography = {
  hero: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 36 },
  title: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fonts.headingSemiBold, fontSize: 20, lineHeight: 26 },
  transcript: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  kidTitle: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36 },
  kidBody: { fontFamily: fonts.bodyMedium, fontSize: 18, lineHeight: 26 },
  kidLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 22 },
};

// Fixed sizes for young hands - never shrink below these.
export const sizes = {
  // Phone layout sizes (handoff §2.3).
  touchMin: 44,
  recordButton: 72,
  tabBarHeight: 52,
  progressHeight: 10,
  progressHeightHero: 14,
  dialSize: 64,
  tapMin: 48,
  tileGlyph: 64,
  tileWordH: 52,
  buttonKidH: 56,
  starSm: 14,
  starLg: 40,
  targetSlab: 200,
  targetSlabMobile: 132,
};

export const theme = {
  colors,
  fonts,
  spacing,
  radii,
  typography,
  kidTypography,
  mobileTypography,
  sizes,
};

export default theme;
