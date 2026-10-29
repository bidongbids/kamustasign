// src/screens/auth/StartLayout.tsx
// The start screen's frame, around the login card (LoginScreen). It used to
// be the role select (design_handoff_kamustasign_material_pass/README.md
// "1. Role Select"); there's no role to pick before signing in any more, so
// the role cards became the login card and the rest stayed: the Translator
// as a ghost button below an "OR SKIP SIGN-IN" rule, since skipping sign-in
// is a categorically different action from signing in.
// Desktop gets a two-pane split (432px brand pane + the card); tablet is a
// single scrolling column with the ghost button pinned to the bottom. Phones
// (<768) get the docs/KAMUSTASIGN_LIGHT_THEME_HANDOFF.md layout (PhoneStart):
// a "Kamusta!" greeting over the card and a full-width Translator button, in
// the light or dark theme.

import React, { useEffect, useRef } from "react";
import { Animated, View, Text, StyleSheet, ScrollView, Pressable, Platform, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import Wordmark from "../../components/Wordmark";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import { AppearanceButton } from "../../components/AppearancePanel";
import { VideoCameraIcon } from "../../components/icons/RoleIcons";
import { ChevronRightIcon } from "../../components/icons/UiIcons";
import { colors, typography, spacing, radii, mobileTypography, ThemeColors } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import { Theme, useTheme, useThemedStyles } from "../../theme/ThemeProvider";

type Props = {
  onOpenTranslator: () => void;
  /** The login form, or whose session this is; shown in a frosted card. */
  children: React.ReactNode;
};

// Ambient background glow — RN has no `filter: blur()`, so the softness is
// baked into the radial gradient's own stops (transparent well before the
// outer edge) instead of blurring a hard-edged circle. See the README's RN
// implementation notes #6.
function AmbientBlob({ id, size, color, style }: { id: string; size: number; color: string; style: ViewStyle }) {
  return (
    <View style={[{ width: size, height: size, position: "absolute" }, style]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} />
            <Stop offset="0.68" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

function LogoTile({ size, radius, markSize }: { size: number; radius: number; markSize: number }) {
  return (
    <View style={[styles.logoTile, { width: size, height: size, borderRadius: radius }, neuRaised("sm")]}>
      <HandLandmarkMark size={markSize} color={colors.primaryTeal} dotColor={colors.accentCoral} animated={false} />
    </View>
  );
}

function LoginCard({ children, padding }: { children: React.ReactNode; padding: number }) {
  return (
    <GlassCard tint="frosted" dropShadow radius={radii.lg} padding={padding}>
      {children}
    </GlassCard>
  );
}

function TranslatorGhostButtonDesktop({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.translatorGhostDesktop}
      accessibilityRole="button"
      accessibilityLabel="Open the Translator — no account needed"
    >
      <View style={styles.translatorDot} />
      <Text style={[typography.label, styles.translatorLabel]}>Open the Translator</Text>
      <Text style={[typography.bodySm, styles.translatorHint]}>no account needed</Text>
    </Pressable>
  );
}

function SkipDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerRule} />
      <Text style={[typography.meta, styles.dividerLabel]}>OR SKIP SIGN-IN</Text>
      <View style={styles.dividerRule} />
    </View>
  );
}

// ── phone layout ────────────────────────────────────────────────────────
const PHONE_GUTTER = spacing.md;

const makePhoneStyles = (c: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    scroll: { flexGrow: 1, paddingHorizontal: PHONE_GUTTER, paddingBottom: spacing.lg },
    header: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    brand: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    logoTile: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surface,
      ...theme.shadows.neuRaised("sm"),
    },
    wordmark: { ...mobileTypography.heading, color: c.textPrimary },
    greeting: { marginTop: spacing.lg, marginBottom: spacing.lg, gap: spacing.xs },
    hero: { ...mobileTypography.hero, color: c.textPrimary },
    sub: { ...mobileTypography.body, color: c.textSecondary },
    divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.md },
    rule: { flex: 1, height: 1, backgroundColor: c.border },
    dividerLabel: { ...mobileTypography.caption, color: c.textMuted, letterSpacing: 1 },
    // The old 2x2 role grid's Translator tile, as one full-width row.
    translator: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 72,
      paddingHorizontal: spacing.md,
      borderRadius: radii.lg,
      backgroundColor: c.surface,
      ...theme.shadows.neuRaised("md"),
    },
    translatorPressed: theme.shadows.neuPressed(),
    iconTile: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.surfaceSelected,
    },
    translatorText: { flex: 1, gap: 2 },
    translatorLabel: { ...mobileTypography.heading, color: c.textPrimary },
    translatorHint: { ...mobileTypography.caption, color: c.textSecondary },
    footer: { ...mobileTypography.caption, color: c.textMuted, marginTop: "auto", paddingTop: spacing.xl, textAlign: "center" },
  });

function PhoneStart({ onOpenTranslator, children }: Props) {
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makePhoneStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brand}>
            <View style={styles.logoTile}>
              <HandLandmarkMark size={24} color={c.primaryTeal} dotColor={c.accentCoral} animated={false} />
            </View>
            <Wordmark style={styles.wordmark} accentColor={c.accentCoralText} />
          </View>
          <AppearanceButton compact />
        </View>

        <View style={styles.greeting}>
          <Text style={styles.hero} accessibilityRole="header">
            Kamusta!
          </Text>
          <Text style={styles.sub}>Log in to LCSign.</Text>
        </View>

        <LoginCard padding={spacing.lg}>{children}</LoginCard>

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerLabel}>OR SKIP SIGN-IN</Text>
          <View style={styles.rule} />
        </View>
        <Pressable
          onPress={onOpenTranslator}
          accessibilityRole="button"
          accessibilityLabel="Open the Translator, no account needed"
          style={({ pressed }) => [styles.translator, pressed && styles.translatorPressed]}
        >
          <View style={styles.iconTile}>
            <VideoCameraIcon color={c.successText} />
          </View>
          <View style={styles.translatorText}>
            <Text style={styles.translatorLabel}>Translator</Text>
            <Text style={styles.translatorHint}>No account needed</Text>
          </View>
          <ChevronRightIcon size={16} color={c.textSecondary} />
        </Pressable>

        <Text style={styles.footer}>Real-time ASL and FSL interpretation for Liloan Central School.</Text>
      </ScrollView>
    </View>
  );
}

export default function StartLayout(props: Props) {
  const { isMobile } = useResponsive();
  if (isMobile) return <PhoneStart {...props} />;
  return <WideStart {...props} />;
}

function WideStart({ onOpenTranslator, children }: Props) {
  const { isDesktop } = useResponsive();

  const fade = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (reduceMotion) fade.setValue(1);
    else Animated.timing(fade, { toValue: 1, duration: 480, useNativeDriver: true }).start();
  }, [fade, reduceMotion]);

  if (isDesktop) {
    return (
      <GradientBackground variant="full" style={styles.desktopRoot}>
        <AmbientBlob id="blobPrimary" size={520} color="rgba(124,108,245,0.30)" style={{ left: -120, top: 280 }} />
        <AmbientBlob id="blobAccent" size={420} color="rgba(242,178,62,0.16)" style={{ right: 60, top: -140 }} />

        <Animated.View style={[styles.brandPane, { opacity: fade }]}>
          <View style={styles.brandTop}>
            <LogoTile size={64} radius={20} markSize={34} />
            <Wordmark style={styles.wordmarkDesktop} accentColor={colors.accentCoral} />
          </View>

          <View>
            <Text style={[typography.display, styles.headline]}>
              Sign, and be{"\n"}understood.
            </Text>
            <Text style={[typography.body, styles.subhead]}>
              Real-time ASL & FSL Interpretation for Liloan Central School.
            </Text>
          </View>

          <View>
            <View style={styles.footerRule} />
            <Text style={[typography.meta, styles.footerMeta]}>BSIT Capstone · Liloan, Misamis Occidental</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.rightPaneScroll} keyboardShouldPersistTaps="handled">
          <Animated.View
            style={[
              styles.rightPaneInner,
              { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
            ]}
          >
            <LoginCard padding={spacing.xl}>{children}</LoginCard>
            <SkipDivider />
            <TranslatorGhostButtonDesktop onPress={onOpenTranslator} />
          </Animated.View>
        </ScrollView>
        <View style={styles.appearanceCorner}>
          <AppearanceButton />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground variant="full" style={styles.mobileRoot}>
      <ScrollView contentContainerStyle={styles.mobileScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.statusBarSpacer} />

        <Animated.View style={[styles.mobileBrand, { opacity: fade }]}>
          <LogoTile size={56} radius={18} markSize={30} />
          <Wordmark style={styles.wordmarkMobile} accentColor={colors.accentCoral} />
          <Text style={[typography.body, styles.mobileSub]}>
            Real-time ASL and FSL interpretation for Liloan Central School.
          </Text>
        </Animated.View>

        <View style={styles.mobileCard}>
          <LoginCard padding={spacing.lg}>{children}</LoginCard>
        </View>

        <View style={styles.mobileBottom}>
          <SkipDivider />
          <Pressable
            onPress={onOpenTranslator}
            style={styles.translatorGhostMobile}
            accessibilityRole="button"
            accessibilityLabel="Open the Translator — no account needed"
          >
            <Text style={[typography.label, styles.translatorLabel]}>Open the Translator</Text>
          </Pressable>
          <Text style={[typography.caption, styles.mobileHint]}>No account needed</Text>
        </View>
      </ScrollView>
      <View style={styles.appearanceCorner}>
        <AppearanceButton />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  // Appearance before signing in (handoff §9: a child can pick dark mode first).
  appearanceCorner: { position: "absolute", top: spacing.lg, right: spacing.lg },
  // ── desktop split layout ─────────────────────────────────────────────
  desktopRoot: {
    flexDirection: "row",
    overflow: "hidden",
  },
  brandPane: {
    width: 432,
    paddingVertical: 56,
    paddingHorizontal: 48,
    justifyContent: "space-between",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.09)",
  },
  brandTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  logoTile: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.neuBase,
  },
  wordmarkDesktop: {
    ...typography.h1,
    color: colors.textPrimary,
  },
  wordmarkMobile: {
    ...typography.h1,
    fontSize: 26,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  headline: {
    color: colors.textPrimary,
    marginBottom: 18,
  },
  subhead: {
    color: colors.textSecondary,
    maxWidth: 300,
  },
  footerRule: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
    marginBottom: spacing.sm,
  },
  footerMeta: {
    color: colors.textTertiary,
  },
  rightPaneScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 56,
    paddingHorizontal: 52,
  },
  rightPaneInner: {
    width: "100%",
    maxWidth: 460,
  },

  // ── shared: divider + translator ghost ──────────────────────────────
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  dividerRule: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  dividerLabel: {
    color: colors.textTertiary,
  },
  translatorGhostDesktop: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    paddingVertical: 13,
    paddingHorizontal: 20,
  },
  translatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: colors.success }],
  } as ViewStyle,
  translatorLabel: {
    color: colors.textPrimary,
  },
  translatorHint: {
    color: colors.textTertiary,
  },

  // ── tablet ───────────────────────────────────────────────────────────
  mobileRoot: {
    flex: 1,
  },
  mobileScroll: {
    flexGrow: 1,
  },
  statusBarSpacer: {
    height: Platform.OS === "web" ? 24 : 52,
  },
  // One centred column, as wide as the card: a full-width form is too wide
  // on a tablet.
  mobileBrand: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  mobileSub: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    maxWidth: 250,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  mobileCard: {
    alignSelf: "center",
    paddingHorizontal: 22,
    width: "100%",
    maxWidth: 504,
  },
  mobileBottom: {
    alignSelf: "center",
    marginTop: "auto",
    paddingHorizontal: 22,
    paddingBottom: 34,
    paddingTop: spacing.lg,
    width: "100%",
    maxWidth: 504,
  },
  translatorGhostMobile: {
    width: "100%",
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
  },
  mobileHint: {
    color: colors.textTertiary,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
