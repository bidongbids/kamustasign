// Shared chrome for the Student/Teacher/Admin dashboards. The header
// (design_handoff_classroom_theming §4), left to right: Back, the LCSign
// mark, the Translator (student and teacher dashboards), Appearance, and the
// account chip, whose menu holds "Your account" (the Account panel) and
// "Sign out".
//
// Optional slots (design_handoff_teacher_admin_videocall): `rail` - a
// column beside the content on desktop (>= 1100), full height, that doesn't
// scroll with it; `tabs` - a bottom tab bar below that width; `footer` -
// pinned under the scrolling content (a "Save changes" bar).
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import BackButton from "../../components/BackButton";
import { AppearanceButton } from "../../components/AppearancePanel";
import { ChevronDownIcon, SignOutIcon, UserIcon } from "../../components/icons/UiIcons";
import { VideoCameraIcon } from "../../components/icons/RoleIcons";
import AccountPanel from "./AccountPanel";
import { ConfirmInline } from "./ManageKit";
import type { Profile } from "../../lib/queries";
import { useBackHandler } from "../../lib/backNavigation";
import { colors as staticColors, fonts, spacing, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../theme/responsive";

export type ShellTab = { key: string; label: string; icon: (color: string) => React.ReactNode; badge?: number; badgeLabel?: string };

type Props = {
  accentColor: string;
  roleLabel: string;
  userName: string;
  onSignOut: () => void;
  onExitToStart: () => void;
  children: React.ReactNode;
  /** Desktop content width; the student learning plan uses 880 (default 720). */
  contentMaxWidth?: number;
  /** The signed-in profile - with it, the account menu offers the Account panel. */
  profile?: Profile | null;
  onProfileChange?: (p: Profile) => void;
  /** Desktop only: a column at the left, beside the scrolling content. */
  rail?: React.ReactNode;
  /** Below desktop width: a bottom tab bar. */
  tabs?: ShellTab[];
  activeTab?: string;
  onTab?: (key: string) => void;
  /** Pinned under the scrolling content. */
  footer?: React.ReactNode;
  /** Scroll back to the top whenever this changes (a section switch). */
  scrollKey?: string;
  /** Where Back goes; the start screen when not given. */
  onBack?: () => void;
  /** The word on the Back pill and where it goes, e.g. "Students". */
  backLabel?: string;
  /** Set while leaving would lose something: Back asks this first (handoff B1). */
  leaveGuard?: string | null;
  /** Shows the Translator button; it leaves the dashboard, so leaveGuard asks first. */
  onOpenTranslator?: () => void;
};

/** The role's colour in the scheme (handoff §4: primary / accent / neutral). */
function roleColor(colors: ThemeColors, roleLabel: string): string {
  if (roleLabel === "Teacher") return colors.primaryText;
  if (roleLabel === "Student") return colors.accentText;
  return colors.textSecondary;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export default function DashboardShell({
  accentColor,
  roleLabel,
  userName,
  onSignOut,
  onExitToStart,
  children,
  contentMaxWidth,
  profile,
  onProfileChange,
  rail,
  tabs,
  activeTab,
  onTab,
  footer,
  scrollKey,
  onBack,
  backLabel = "Back",
  leaveGuard,
  onOpenTranslator,
}: Props) {
  const theme = useTheme();
  const { colors } = theme;
  const styles = useThemedStyles(makeStyles);
  const { isDesktop, isMobile, width } = useResponsive();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  const insets = useSafeAreaInsets();
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Where a guarded leave goes once confirmed: Back, or the Translator.
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const canOpenAccount = Boolean(profile && onProfileChange);
  const showRail = Boolean(rail) && isDesktop;
  const showTabs = Boolean(tabs?.length) && !isDesktop;
  // 1100-1399 (a 1366 laptop): a narrower rail, so nothing in the content wraps.
  const railWidth = width >= 1400 ? 248 : 216;

  const leave = onBack ?? onExitToStart;
  const guarded = (go: () => void) => (leaveGuard ? setPendingLeave(() => go) : go());
  const back = () => guarded(leave);
  useBackHandler(back);
  useEffect(() => {
    if (!leaveGuard) setPendingLeave(null);
  }, [leaveGuard]);
  const backA11y = onBack ? `Back to ${backLabel === "Back" ? "the previous screen" : backLabel}` : "Back to the start screen";
  const role = roleColor(colors, roleLabel);

  return (
    <GradientBackground style={styles.root} variant="subtle">
      <GlassCard tint="sheer" radius={0} padding={0} style={styles.header} contentStyle={[styles.headerContent, HEADER_PADDING]}>
        <BackButton onPress={back} label={backLabel} accessibilityLabel={backA11y} iconOnly={isMobile} />
        <View style={styles.brandRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <HandLandmarkMark size={isMobile ? 20 : 22} color={colors.primaryText} dotColor={colors.accent} />
          <Text style={[styles.brandWordmark, isMobile && styles.brandWordmarkPhone]}>LCSign</Text>
        </View>
        <View style={styles.flex} />
        {onOpenTranslator ? (
          <Pressable
            onPress={() => guarded(onOpenTranslator)}
            accessibilityRole="button"
            accessibilityLabel="Open the Translator"
            hitSlop={4}
            style={(s: any) => [styles.translator, isMobile && styles.translatorIcon, s.pressed && styles.translatorOn, s.focused && styles.focused]}
          >
            <VideoCameraIcon size={18} color={colors.successText} />
            {isMobile ? null : <Text style={styles.translatorText}>Translator</Text>}
          </Pressable>
        ) : null}
        <AppearanceButton compact={isMobile} />
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={(s: any) => [styles.chip, isMobile && styles.chipPhone, s.pressed && styles.chipPressed, s.focused && styles.focused]}
          accessibilityRole="button"
          accessibilityLabel={`${userName}, ${roleLabel}. Account menu`}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(userName)}</Text>
          </View>
          {isMobile ? null : (
            <>
              <View style={styles.identity}>
                <Text style={styles.userName} numberOfLines={1}>
                  {userName}
                </Text>
                <Text style={[styles.roleText, { color: role }]}>{roleLabel}</Text>
              </View>
              <ChevronDownIcon size={15} color={colors.textSecondary} />
            </>
          )}
        </Pressable>
      </GlassCard>

      <Modal visible={menuOpen} transparent animationType="none" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.flex}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Close the account menu" />
          <View style={styles.menu} accessibilityRole="menu">
            <View style={styles.menuHead}>
              <Text style={styles.userName} numberOfLines={1}>
                {userName}
              </Text>
              <Text style={[styles.roleText, { color: role }]}>{roleLabel}</Text>
            </View>
            {canOpenAccount ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setAccountOpen(true);
                }}
                accessibilityRole="menuitem"
                accessibilityHint="Change your name, password or 2FA"
                style={(s: any) => [styles.menuItem, (s.pressed || s.hovered) && styles.menuItemOn, s.focused && styles.focused]}
              >
                <UserIcon size={18} color={colors.textPrimary} />
                <Text style={styles.menuText}>Your account</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              accessibilityRole="menuitem"
              style={(s: any) => [styles.menuItem, (s.pressed || s.hovered) && styles.menuItemOn, s.focused && styles.focused]}
            >
              <SignOutIcon size={18} color={colors.textPrimary} />
              <Text style={styles.menuText}>Sign out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {profile && onProfileChange && (
        <AccountPanel
          visible={accountOpen}
          onClose={() => setAccountOpen(false)}
          accentColor={accentColor}
          profile={profile}
          onProfileChange={onProfileChange}
        />
      )}

      <View style={styles.body}>
        {showRail ? <View style={[styles.rail, { width: railWidth }]}>{rail}</View> : null}
        <View style={styles.flex}>
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={[
              styles.content,
              isDesktop && styles.contentDesktop,
              isDesktop && contentMaxWidth ? { maxWidth: contentMaxWidth } : null,
              showRail && styles.contentWithRail,
              rail && !isDesktop && !isNarrow(width) ? styles.contentTablet : null,
            ]}
          >
            {children}
          </ScrollView>
          {pendingLeave && leaveGuard ? (
            <View style={styles.leaveBar} accessibilityLiveRegion="polite">
              <ConfirmInline
                message={leaveGuard}
                cancelLabel="Keep editing"
                confirmLabel="Leave"
                onCancel={() => setPendingLeave(null)}
                onConfirm={() => {
                  setPendingLeave(null);
                  pendingLeave();
                }}
              />
            </View>
          ) : (
            footer
          )}
        </View>
      </View>

      {showTabs ? (
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
          {tabs!.map((t) => {
            const active = t.key === activeTab;
            const color = active ? colors.textPrimary : colors.textOnGlass;
            return (
              <Pressable
                key={t.key}
                onPress={() => onTab?.(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t.badge ? `${t.label}, ${t.badgeLabel ?? `${t.badge} new`}` : t.label}
                // Three tabs get the student layout's wider targets (112, handoff H6).
                style={[styles.tab, tabs!.length <= 3 && styles.tabWide, active && [styles.tabActive, theme.shadows.neuInset("sm")], webCursor]}
              >
                <View>
                  {t.icon(active ? colors.primaryTealText : color)}
                  {t.badge ? (
                    <View style={styles.tabBadge}>
                      <Text style={styles.tabBadgeText}>{t.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.tabLabel, { color }]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </GradientBackground>
  );
}

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const isNarrow = (w: number) => w < 768;

// A plain object on purpose: GlassCard puts its own `{ padding }` on the same
// view as a plain (inline) style, and on the web inline styles beat
// StyleSheet classes - so a padding from StyleSheet.create never applied and
// the header had none. Inline after inline, this one wins.
const HEADER_PADDING = { paddingLeft: spacing.lg, paddingRight: spacing.lg, paddingTop: 12, paddingBottom: 12 };

// Shared card used by every dashboard section (list container, form panel).
export function DashboardCard({
  title,
  children,
  style,
  tint = "sheer",
}: {
  title?: string;
  children: React.ReactNode;
  style?: any;
  /**
   * Every dashboard sits on the ground (sheer); "frosted" is kept for a
   * light panel, and needs textOnFrosted text instead of dashboardStyles.
   */
  tint?: "frosted" | "sheer";
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <GlassCard tint={tint} radius={radii.lg} padding={20} style={style}>
      {title ? <Text style={[styles.cardTitle, tint === "frosted" && { color: colors.textOnFrosted }]}>{title}</Text> : null}
      {children}
    </GlassCard>
  );
}

// Still Graphite dark: moved to the theme with the screens that use it
// (handoff §10, steps 3-4).
const colors = staticColors;
export const dashboardStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  spaceBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.needsPractice,
    marginBottom: spacing.sm,
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingVertical: spacing.sm + 4,
  },
  listItemFirst: {
    borderTopWidth: 0,
  },
  itemTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  itemMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
});

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  // Graphite dark keeps its exact translucent rules; light uses the palette's border.
  const rule = dark ? "rgba(255,255,255,0.08)" : colors.border;
  return StyleSheet.create({
    root: { flex: 1 },
    flex: { flex: 1 },
    header: { borderBottomWidth: 1, borderBottomColor: rule },
    headerContent: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 68 },
    brandRow: { flexDirection: "row", alignItems: "center", marginLeft: 4 },
    brandWordmark: { fontFamily: fonts.heading, fontSize: 20, marginLeft: spacing.sm, color: colors.primaryText },
    brandWordmarkPhone: { fontSize: 18, marginLeft: 6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      height: 48,
      paddingLeft: 6,
      paddingRight: 14,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
      ...webCursor,
    },
    chipPhone: { width: 44, height: 44, paddingLeft: 0, paddingRight: 0, justifyContent: "center", borderWidth: 0 },
    // Same pill as the Appearance button next to it.
    translator: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      borderRadius: radii.pill,
      backgroundColor: colors.surfaceRaised,
      ...theme.shadows.neuRaised("sm"),
      ...webCursor,
    },
    translatorIcon: { width: 44, paddingHorizontal: 0, justifyContent: "center" },
    translatorOn: { backgroundColor: colors.well, ...theme.shadows.neuInset("sm") },
    translatorText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    chipPressed: { opacity: 0.75 },
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.well,
      borderWidth: 1.5,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
    },
    avatarText: { fontFamily: fonts.heading, fontSize: 14, color: colors.primaryText },
    identity: { maxWidth: 180, gap: 2 },
    userName: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    roleText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
    menu: {
      position: "absolute",
      top: 72,
      right: 24,
      width: 240,
      padding: 8,
      borderRadius: radii.md,
      backgroundColor: dark ? colors.surfaceElevated : colors.surfaceRaised,
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.08)" : colors.border,
      boxShadow: [{ offsetX: 0, offsetY: 14, blurRadius: 36, color: "rgba(0,0,0,0.28)" }],
    } as object,
    menuHead: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10, gap: 2, borderBottomWidth: 1, borderBottomColor: rule, marginBottom: 4 },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, borderRadius: radii.sm, ...webCursor },
    menuItemOn: { backgroundColor: colors.well },
    menuText: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    leaveBar: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: rule,
      backgroundColor: dark ? "rgba(20,23,30,0.97)" : colors.surface,
    },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: "100%", alignSelf: "center" },
    contentDesktop: { padding: spacing.xl },
    contentWithRail: { alignSelf: "stretch", paddingTop: 28 },
    contentTablet: { maxWidth: 1100, paddingHorizontal: spacing.lg },
    body: { flex: 1, flexDirection: "row", minHeight: 0 },
    rail: {
      borderRightWidth: 1,
      borderRightColor: rule,
      backgroundColor: dark ? "rgba(16,18,24,0.35)" : colors.surface,
    },
    tabBar: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingTop: 8,
      paddingHorizontal: 8,
      borderTopWidth: 1,
      borderTopColor: rule,
      backgroundColor: dark ? "rgba(20,23,30,0.97)" : colors.surface,
    },
    tab: { width: 80, minHeight: 50, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: radii.md },
    tabWide: { width: 112 },
    tabActive: { backgroundColor: colors.neuWell },
    tabLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
    tabBadge: {
      position: "absolute",
      top: -6,
      right: -12,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    tabBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textOnAccent },
    cardTitle: {
      fontFamily: fonts.heading,
      fontSize: 18,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
  });
};
