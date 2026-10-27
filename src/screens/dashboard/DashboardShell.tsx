// Shared chrome for the Student/Teacher/Admin dashboards: brand row, role
// label, sign-out, and the Account panel (tap your name). Mirrors
// AuthScreenShell's visual language (same brand mark, same card/shadow
// system) but laid out for scrollable content lists instead of a centered
// form.
//
// Optional slots (design_handoff_teacher_admin_videocall): `rail` - a
// column beside the content on desktop (>= 1100), full height, that doesn't
// scroll with it; `tabs` - a bottom tab bar below that width; `footer` -
// pinned under the scrolling content (a "Save changes" bar).
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import { GearIcon } from "../../components/icons/UiIcons";
import AccountPanel from "./AccountPanel";
import type { Profile } from "../../lib/queries";
import { colors, fonts, spacing, radii } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";

export type ShellTab = { key: string; label: string; icon: (color: string) => React.ReactNode; badge?: number; badgeLabel?: string };

type Props = {
  accentColor: string;
  roleLabel: string;
  userName: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
  children: React.ReactNode;
  /** Desktop content width; the student learning plan uses 880 (default 720). */
  contentMaxWidth?: number;
  /** The signed-in profile - with it, the name in the header opens the Account panel. */
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
};

export default function DashboardShell({
  accentColor,
  roleLabel,
  userName,
  onSignOut,
  onExitToRoleSelect,
  children,
  contentMaxWidth,
  profile,
  onProfileChange,
  rail,
  tabs,
  activeTab,
  onTab,
  footer,
}: Props) {
  const { isDesktop, width } = useResponsive();
  const insets = useSafeAreaInsets();
  const [accountOpen, setAccountOpen] = useState(false);
  const canOpenAccount = Boolean(profile && onProfileChange);
  const showRail = Boolean(rail) && isDesktop;
  const showTabs = Boolean(tabs?.length) && !isDesktop;
  // 1100-1399 (a 1366 laptop): a narrower rail, so nothing in the content wraps.
  const railWidth = width >= 1400 ? 248 : 216;

  return (
    <GradientBackground style={styles.root} variant="subtle">
      <GlassCard
        tint="sheer"
        radius={0}
        padding={0}
        style={[styles.header, { borderBottomColor: accentColor + "33" }]}
        contentStyle={styles.headerContent}
      >
        <Pressable style={styles.brandRow} onPress={onExitToRoleSelect} hitSlop={8}>
          <HandLandmarkMark size={24} color={accentColor} dotColor={colors.accentCoral} />
          <Text style={[styles.brandWordmark, { color: accentColor }]}>LCSign</Text>
        </Pressable>

        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setAccountOpen(true)}
            disabled={!canOpenAccount}
            style={({ pressed }) => [styles.identityBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`Account settings for ${userName}`}
            accessibilityHint="Change your name, password or 2FA"
          >
            <View style={styles.identity}>
              <Text style={styles.userName} numberOfLines={1}>
                {userName}
              </Text>
              <Text style={[styles.roleBadge, { color: accentColor }]}>{roleLabel}</Text>
            </View>
            {canOpenAccount && <GearIcon size={16} color={colors.textSecondary} />}
          </Pressable>
          <Pressable
            onPress={onSignOut}
            style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </GlassCard>

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
          {footer}
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
                style={[styles.tab, active && [styles.tabActive, neuInset("sm")], webCursor]}
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
   * Every dashboard sits on the dark ground (sheer); "frosted" is kept for a
   * light panel, and needs textOnFrosted text instead of dashboardStyles.
   */
  tint?: "frosted" | "sheer";
}) {
  return (
    <GlassCard tint={tint} radius={radii.lg} padding={20} style={style}>
      {title ? <Text style={[styles.cardTitle, tint === "frosted" && { color: colors.textOnFrosted }]}>{title}</Text> : null}
      {children}
    </GlassCard>
  );
}

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

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  brandWordmark: { fontFamily: fonts.heading, fontSize: 16, marginLeft: spacing.xs },
  headerRight: { flexDirection: "row", alignItems: "center" },
  identityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginRight: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
  },
  identity: { alignItems: "flex-end", maxWidth: 160 },
  userName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
  roleBadge: { fontFamily: fonts.bodyMedium, fontSize: 11, marginTop: 1 },
  signOutBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  signOutText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 720, width: "100%", alignSelf: "center" },
  contentDesktop: { padding: spacing.xl },
  contentWithRail: { alignSelf: "stretch", paddingTop: 28 },
  contentTablet: { maxWidth: 1100, paddingHorizontal: spacing.lg },
  body: { flex: 1, flexDirection: "row", minHeight: 0 },
  rail: {
    borderRightWidth: 1,
    borderRightColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(16,18,24,0.35)",
  },
  tabBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(20,23,30,0.97)",
  },
  tab: { width: 80, minHeight: 50, alignItems: "center", justifyContent: "center", gap: 3, borderRadius: radii.md },
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
    backgroundColor: colors.attention,
  },
  tabBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.textOnAccent },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
