// src/screens/RoleSelectScreen.tsx
// Entry screen. Per docs/design/design_handoff_kamustasign_material_pass/README.md
// ("1. Role Select"): the Translator is no longer a 4th peer card — it's
// demoted to a bordered ghost button below an "OR SKIP SIGN-IN" rule, since
// skipping sign-in entirely is a categorically different action from
// choosing a role. Same destination (`onOpenTranslator`), no routing change.
// Desktop gets a two-pane split (432px brand pane + role cards); tablet is a
// single scrolling column with the ghost button pinned to the bottom. Phones
// (<768) get the docs/KAMUSTASIGN_LIGHT_THEME_HANDOFF.md layout (PhoneRoleSelect):
// a "Kamusta!" greeting over a 2x2 grid of role tiles, Translator in the
// bottom-right cell, in the light or dark theme.

import React, { useEffect, useRef } from "react";
import { Animated, View, Text, StyleSheet, ScrollView, Pressable, Platform, ViewStyle, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import RoleCard from "../components/RoleCard";
import HandLandmarkMark from "../components/HandLandmarkMark";
import Wordmark from "../components/Wordmark";
import GradientBackground from "../components/GradientBackground";
import RoleTile from "../components/RoleTile";
import { AppearanceButton } from "../components/AppearancePanel";
import { GraduationCapIcon, ClipboardCheckIcon, GearIcon, VideoCameraIcon } from "../components/icons/RoleIcons";
import { colors, typography, spacing, mobileTypography, ThemeColors } from "../theme/theme";
import { neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { Theme, useTheme, useThemedStyles } from "../theme/ThemeProvider";

type Role = "student" | "teacher" | "admin";

type Props = {
  onSelectRole: (role: Role) => void;
  onOpenTranslator: () => void;
  /** Someone is still signed in on this device (sessions survive reloads). */
  signedInAs?: { name: string; role: Role } | null;
  onContinueSignedIn?: () => void;
  onSignOut?: () => void;
  /** A one-off message, e.g. an expired email link. */
  notice?: string | null;
  onDismissNotice?: () => void;
};

const ROLES: { role: Role; label: string; description: string; mobileDescription: string; accentColor: string }[] = [
  {
    role: "student",
    label: "Student",
    description: "Practice signs with your camera and earn stars",
    mobileDescription: "Practice signs, earn stars",
    accentColor: colors.accentCoral,
  },
  {
    role: "teacher",
    label: "Teacher",
    description: "Run classes, choose what to learn, follow progress, call students",
    mobileDescription: "Classes, progress, calls",
    accentColor: colors.primaryTeal,
  },
  {
    role: "admin",
    label: "Administrator",
    description: "Manage accounts and approve teachers",
    mobileDescription: "Accounts and approvals",
    accentColor: colors.adminGray,
  },
];

const ROLE_LABELS: Record<Role, string> = { student: "Student", teacher: "Teacher", admin: "Admin" };

const makeBannerStyles = (c: ThemeColors) =>
  StyleSheet.create({
    stack: { gap: spacing.sm, marginBottom: spacing.md },
    card: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: spacing.sm,
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    who: { flex: 1, minWidth: 150 },
    label: { ...typography.meta, color: c.textSecondary },
    name: { ...typography.label, color: c.textPrimary, marginTop: 2 },
    text: { ...typography.bodySm, flex: 1, minWidth: 150, color: c.textPrimary },
    actions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    continueBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 999,
      backgroundColor: c.primaryTeal,
    },
    continueText: { ...typography.label, color: c.onPrimary },
    link: { ...typography.bodySm, color: c.primaryTealText, textDecorationLine: "underline" },
  });

// A session survives reloads, so on a shared classroom computer the next
// child would tap "Student" and land in the previous child's account. Say
// who is signed in, with the way out right next to it.
function SessionBanner({ signedInAs, onContinueSignedIn, onSignOut, notice, onDismissNotice }: Props) {
  const styles = useThemedStyles(makeBannerStyles);
  if (!signedInAs && !notice) return null;
  return (
    <View style={styles.stack}>
      {notice ? (
        <View style={styles.card} accessibilityRole="alert">
          <Text style={styles.text}>{notice}</Text>
          <Pressable onPress={onDismissNotice} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.link}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
      {signedInAs ? (
        <View style={styles.card}>
          <View style={styles.who}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.name} numberOfLines={1}>
              {signedInAs.name || "Your account"} · {ROLE_LABELS[signedInAs.role]}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={onContinueSignedIn}
              style={styles.continueBtn}
              accessibilityRole="button"
              accessibilityLabel={`Continue as ${signedInAs.name || "this account"}`}
            >
              <Text style={styles.continueText}>Continue</Text>
            </Pressable>
            <Pressable onPress={onSignOut} accessibilityRole="button" hitSlop={8}>
              <Text style={styles.link}>Not you? Sign out</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

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
const PHONE_GAP = spacing.md;

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
    grid: { flexDirection: "row", flexWrap: "wrap", gap: PHONE_GAP },
    footer: { ...mobileTypography.caption, color: c.textMuted, marginTop: "auto", paddingTop: spacing.xl, textAlign: "center" },
  });

function PhoneRoleSelect(props: Props) {
  const { onSelectRole, onOpenTranslator } = props;
  const { colors: c } = useTheme();
  const styles = useThemedStyles(makePhoneStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - 2 * PHONE_GUTTER - PHONE_GAP) / 2);
  const tiles = [
    { key: "student", label: "Student", description: "Practice signs and see your stars", icon: <GraduationCapIcon color={c.accentCoralText} />, onPress: () => onSelectRole("student") },
    { key: "teacher", label: "Teacher", description: "Classes, modules and calls", icon: <ClipboardCheckIcon color={c.primaryTealText} />, onPress: () => onSelectRole("teacher") },
    { key: "admin", label: "Admin", description: "Accounts and approvals", icon: <GearIcon color={c.adminGray} />, onPress: () => onSelectRole("admin") },
    {
      key: "translator",
      label: "Translator",
      description: "No account needed",
      icon: <VideoCameraIcon color={c.successText} />,
      onPress: onOpenTranslator,
      accessibilityLabel: "Open the Translator, no account needed",
    },
  ];
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: spacing.lg + insets.bottom }]}>
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
          <Text style={styles.sub}>Who's using LCSign?</Text>
        </View>

        <SessionBanner {...props} />

        <View style={styles.grid}>
          {tiles.map(({ key, ...t }) => (
            <RoleTile key={key} width={tileWidth} {...t} />
          ))}
        </View>

        <Text style={styles.footer}>Real-time ASL and FSL interpretation for Liloan Central School.</Text>
      </ScrollView>
    </View>
  );
}

export default function RoleSelectScreen(props: Props) {
  const { isMobile } = useResponsive();
  if (isMobile) return <PhoneRoleSelect {...props} />;
  return <WideRoleSelect {...props} />;
}

function WideRoleSelect(props: Props) {
  const { onSelectRole, onOpenTranslator } = props;
  const { isDesktop, isMobile } = useResponsive();

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

        <ScrollView contentContainerStyle={styles.rightPaneScroll}>
          <Animated.View
            style={[
              styles.rightPaneInner,
              { opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] },
            ]}
          >
            <SessionBanner {...props} />
            <Text style={[typography.meta, styles.eyebrow]}>SIGN IN AS</Text>

            <View style={styles.cardsCol}>
              {ROLES.map((r, i) => (
                <RoleCard
                  key={r.role}
                  index={i}
                  label={r.label}
                  description={r.description}
                  accentColor={r.accentColor}
                  isPrimary={i === 0}
                  onPress={() => onSelectRole(r.role)}
                />
              ))}
            </View>

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
      <ScrollView contentContainerStyle={styles.mobileScroll}>
        <View style={styles.statusBarSpacer} />

        <Animated.View style={[styles.mobileBrand, { opacity: fade }]}>
          <LogoTile size={56} radius={18} markSize={30} />
          <Wordmark style={styles.wordmarkMobile} accentColor={colors.accentCoral} />
          <Text style={[typography.body, styles.mobileSub]}>
            Real-time ASL and FSL interpretation for Liloan Central School.
          </Text>
        </Animated.View>

        <SessionBanner {...props} />

        <View style={styles.mobileCards}>
          {ROLES.map((r, i) => (
            <RoleCard
              key={r.role}
              index={i}
              isMobile
              label={r.label}
              description={r.mobileDescription}
              accentColor={r.accentColor}
              isPrimary={i === 0}
              onPress={() => onSelectRole(r.role)}
            />
          ))}
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
    maxWidth: 620,
  },
  eyebrow: {
    color: colors.textTertiary,
    marginBottom: spacing.md,
  },
  cardsCol: {
    gap: 14,
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

  // ── mobile / tablet ──────────────────────────────────────────────────
  mobileRoot: {
    flex: 1,
  },
  mobileScroll: {
    flexGrow: 1,
  },
  statusBarSpacer: {
    height: Platform.OS === "web" ? 24 : 52,
  },
  mobileBrand: {
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  mobileSub: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textSecondary,
    maxWidth: 250,
    marginTop: spacing.sm,
  },
  mobileCards: {
    paddingHorizontal: 22,
    gap: spacing.md,
  },
  mobileBottom: {
    marginTop: "auto",
    paddingHorizontal: 22,
    paddingBottom: 34,
    paddingTop: spacing.lg,
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
