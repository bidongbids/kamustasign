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

  textTertiary: "#8A93A6", // was #5F6878 (2.3-3.0:1, below WCAG AA for text)
  textDim: "#8A93A6", // was #6E7788 (2.9:1 on selected surfaces)
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

  // Teacher / admin / call redesign (design_handoff_teacher_admin_videocall
  // README, "Token additions"): aliases or one darker step of existing hues,
  // named by role.
  presenceOnline: "#3FB56A", // = success, always with the word "Online"
  presenceOnCall: "#F2B23E", // = accentCoral, drawn as a diamond (shape, not colour)
  presenceOffline: "#8A93A6", // = textTertiary, an outlined ring
  attention: "#F2B23E", // = accentCoral - approvals inbox, "Needs you" count, due chips
  callDanger: "#C23A47", // needsPractice darkened: white label 5.3:1 (needsPractice is 3.8:1)
  callAccept: "#3FB56A", // = success
  textOnCallAccept: "#1E1F26", // = textOnFrosted: 6.3:1 on green (white is 3.1:1)
  actionPrimaryFill: "#5A50A8", // = primaryTealDark: white on primaryTeal is only 3.95:1
  captionScrim: "rgba(10,12,16,0.78)", // floor for any caption over video
  ringHalo: "rgba(124,108,245,0.35)", // primaryTeal @ 35% - ringing halos
  qualityGood: "#5FD08A", // = successText
  qualityFair: "#F2B23E", // = accentCoral
  qualityPoor: "#FF7A85", // = needsPracticeText
  heatLearned: "#3FB56A", // = success, filled cell + check
  heatTried: "#F2B23E", // = accentCoral, ring + dot
  heatNone: "rgba(255,255,255,0.06)", // empty cell

  // Semantic names from the classroom theming handoff (README §2.2). The
  // older role tokens above hold the same values and keep working; new code
  // can use either.
  primary: "#7C6CF5", // = primaryTeal
  primaryFill: "#5A50A8", // = actionPrimaryFill
  primaryText: "#B3A8FF", // = primaryTealText
  accent: "#F2B23E", // = accentCoral
  accentText: "#F2B23E", // = accentCoralText
  surfaceRaised: "#2C3340",
  well: "#1D222B", // = neuWell
  backgroundEnd: "#171A21", // = gradientStart
  star: "#F2B23E", // = starFilled
  danger: "#E0525F", // = needsPractice
  dangerText: "#FF7A85", // = needsPracticeText
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
  // README §2.3: a step darker than the first phone palette so they pass on wells too.
  textSecondary: "#454D60",
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

  textTertiary: "#5A6276",
  textDim: "#5A6276",
  textOnGlass: "#4A5266",

  starFilled: "#B57B0A", // gold #F2B23E is 1.9:1 on white; this keeps 3:1 (README §2.1)
  starEmpty: "#737C92", // was #7F889E (2.9:1 on wells, below the 3:1 for UI parts)
  starResting: "#8A5A00",
  celebrationGlow: "rgba(242,178,62,0.35)",
  masteredRing: "#237F48",
  tipAccent: "#5241C9",
  holdTrack: "rgba(27,31,42,0.08)",

  surfaceInset: "#E4E8F0",
  surfacePressed: "#E6E9F1",
  surfaceSelected: "#EAE7FF",
  hairline: "#D5DAE5",
  controlBorder: "#737C92",
  textMuted: "#5A6276",
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

  presenceOnline: "#237F48",
  presenceOnCall: "#8A5A00",
  presenceOffline: "#5A6276",
  attention: "#8A5A00",
  callDanger: "#B3303D",
  callAccept: "#237F48",
  textOnCallAccept: "#FFFFFF",
  actionPrimaryFill: "#5241C9",
  captionScrim: "rgba(10,12,16,0.78)",
  ringHalo: "rgba(99,82,230,0.30)",
  qualityGood: "#1B713D",
  qualityFair: "#8A5A00",
  qualityPoor: "#B3303D",
  heatLearned: "#237F48",
  heatTried: "#8A5A00",
  heatNone: "rgba(27,31,42,0.06)",

  primary: "#6352E6",
  primaryFill: "#5A49D6",
  primaryText: "#4F3FC4",
  accent: "#F2B23E",
  accentText: "#8A5A00",
  surfaceRaised: "#FFFFFF",
  well: "#E6E9F1",
  backgroundEnd: "#E7EBF2",
  star: "#B57B0A",
  danger: "#C73A4C",
  dangerText: "#B3303D",
};

// ---- colour schemes (design_handoff_classroom_theming README §2) ----
// Graphite Aurora is the two palettes above. Ocean, Forest and Sunset set the
// README's table values (role colours and the ground) and derive every other
// token from them the way Graphite's are related, so each existing token name
// works in every scheme. Text, success, danger, stars and the camera colours
// come from the Graphite palette of the same mode: they mean the same thing
// in every scheme.
export type SchemeName = "graphite" | "ocean" | "forest" | "sunset";

export const SCHEMES: { key: SchemeName; label: string }[] = [
  { key: "graphite", label: "Graphite Aurora" },
  { key: "ocean", label: "Ocean" },
  { key: "forest", label: "Forest" },
  { key: "sunset", label: "Sunset" },
];

type SchemeSpec = {
  background: string;
  backgroundEnd: string;
  surface: string;
  surfaceRaised: string;
  well: string;
  border: string;
  primary: string;
  primaryFill: string;
  primaryText: string;
  accent: string;
  accentText: string;
  onAccent: string;
  focusRing: string;
};

const SPECS: Record<Exclude<SchemeName, "graphite">, Record<ThemeName, SchemeSpec>> = {
  ocean: {
    dark: {
      background: "#111A24", backgroundEnd: "#0E151E", surface: "#1A2634", surfaceRaised: "#20303F", well: "#132030", border: "#2A3A4C",
      primary: "#4C9AFF", primaryFill: "#2563C9", primaryText: "#8CC0FF", accent: "#2EC4B6", accentText: "#5FE0D3", onAccent: "#04221E", focusRing: "#5FE0D3",
    },
    light: {
      background: "#EDF3F9", backgroundEnd: "#E5EDF6", surface: "#FFFFFF", surfaceRaised: "#FFFFFF", well: "#E1EAF3", border: "#CFDCEA",
      primary: "#2563C9", primaryFill: "#2563C9", primaryText: "#1D53AD", accent: "#14A698", accentText: "#0B6F65", onAccent: "#022420", focusRing: "#1D53AD",
    },
  },
  forest: {
    dark: {
      background: "#131B18", backgroundEnd: "#101714", surface: "#1D2823", surfaceRaised: "#24312B", well: "#16201C", border: "#2C3A33",
      primary: "#4DB08F", primaryFill: "#23735C", primaryText: "#86D4B8", accent: "#E8A33D", accentText: "#F0B45A", onAccent: "#2A1B03", focusRing: "#F0B45A",
    },
    light: {
      background: "#EEF3EF", backgroundEnd: "#E6EDE8", surface: "#FFFFFF", surfaceRaised: "#FFFFFF", well: "#E1EAE4", border: "#CEDCD3",
      primary: "#1F7A60", primaryFill: "#1F7A60", primaryText: "#1A6A53", accent: "#E8A33D", accentText: "#8A5300", onAccent: "#2A1B03", focusRing: "#1A6A53",
    },
  },
  sunset: {
    dark: {
      background: "#1E1820", backgroundEnd: "#19141B", surface: "#2A222D", surfaceRaised: "#322938", well: "#211A24", border: "#3C3141",
      primary: "#E07AAE", primaryFill: "#A8407A", primaryText: "#F3A8CC", accent: "#F5A65B", accentText: "#F7B57A", onAccent: "#2E1704", focusRing: "#F7B57A",
    },
    light: {
      background: "#F7F0F1", backgroundEnd: "#F1E7E9", surface: "#FFFFFF", surfaceRaised: "#FFFFFF", well: "#F0E4E7", border: "#E3D2D7",
      primary: "#B03A78", primaryFill: "#A8376F", primaryText: "#962F64", accent: "#F5A65B", accentText: "#99500B", onAccent: "#2E1704", focusRing: "#962F64",
    },
  },
};

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** `a` moved `t` (0-1) of the way to `b`; both #RRGGBB. */
export function mixHex(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const alpha = (c: string, a: number) => `rgba(${rgb(c).join(",")},${a})`;

function derive(mode: ThemeName, s: SchemeSpec): ThemeColors {
  const dark = mode === "dark";
  const base = dark ? darkColors : lightColors;
  const between = mixHex(s.background, s.surface, 0.5);
  const card = dark ? s.surface : mixHex("#FFFFFF", s.background, 0.4);
  const lighterPrimary = dark ? mixHex(s.primary, s.primaryText, 0.5) : s.primaryText;
  // The accent where it marks a state on the ground (on call, attention, tried).
  const accentMark = dark ? s.accent : s.accentText;
  return {
    ...base,
    // The README's dark greys, a step lighter than Graphite's own (which
    // stays as it was), so they read on the raised tiles too.
    ...(dark ? { textSecondary: "#B0B8C8", textTertiary: "#949DB0", textDim: "#949DB0" } : null),
    primary: s.primary,
    primaryFill: s.primaryFill,
    primaryText: s.primaryText,
    primaryTeal: s.primary,
    primaryTealDark: s.primaryFill,
    primaryTealLight: lighterPrimary,
    primaryTealText: s.primaryText,
    tipAccent: lighterPrimary,
    actionPrimaryFill: s.primaryFill,
    ringHalo: alpha(s.primary, dark ? 0.35 : 0.3),
    surfaceSelected: mixHex(dark ? s.surface : "#FFFFFF", s.primary, dark ? 0.16 : 0.13),

    accent: s.accent,
    accentText: s.accentText,
    accentCoral: s.accent,
    accentCoralDark: dark ? mixHex(s.accent, "#000000", 0.22) : s.accentText,
    accentCoralText: s.accentText,
    textOnAccent: s.onAccent,
    onAccent: s.onAccent,
    celebrationGlow: alpha(s.accent, 0.35),
    presenceOnCall: accentMark,
    attention: accentMark,
    heatTried: accentMark,
    focusRing: s.focusRing,

    background: s.background,
    backgroundEnd: s.backgroundEnd,
    gradientStart: dark ? s.backgroundEnd : s.background,
    gradientMid: dark ? between : s.background,
    gradientEnd: dark ? s.surface : s.backgroundEnd,
    surface: card,
    surfaceElevated: dark ? s.surface : "#FFFFFF",
    surfaceRaised: s.surfaceRaised,
    surfaceMuted: dark ? between : s.well,
    disabledSurface: dark ? between : s.well,
    surfacePressed: dark ? between : mixHex(s.well, "#FFFFFF", 0.2),
    neuBase: card,
    neuWell: s.well,
    neuWellLight: mixHex(s.well, "#FFFFFF", dark ? 0.07 : 0.4),
    surfaceInset: s.well,
    well: s.well,
    neuShadowDark: dark ? mixHex(s.background, "#000000", 0.35) : base.neuShadowDark,
    neuShadowLight: dark ? mixHex(s.surface, "#FFFFFF", 0.06) : base.neuShadowLight,
    hairline: dark ? mixHex(s.surface, "#FFFFFF", 0.06) : s.border,
    border: dark ? base.border : s.border,
    glassTint: dark ? base.glassTint : card,
    glassTintFrosted: dark ? base.glassTintFrosted : card,
    glassBorder: dark ? base.glassBorder : mixHex(s.border, "#FFFFFF", 0.3),
  };
}

export const palettes: Record<SchemeName, Record<ThemeName, ThemeColors>> = {
  graphite: { dark: darkColors, light: lightColors },
  ocean: { dark: derive("dark", SPECS.ocean.dark), light: derive("light", SPECS.ocean.light) },
  forest: { dark: derive("dark", SPECS.forest.dark), light: derive("light", SPECS.forest.light) },
  sunset: { dark: derive("dark", SPECS.sunset.dark), light: derive("light", SPECS.sunset.light) },
};

// Graphite dark under its original name: screens not yet moved to
// useTheme() (src/theme/ThemeProvider.tsx) keep importing this.
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
