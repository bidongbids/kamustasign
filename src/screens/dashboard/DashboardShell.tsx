// Shared chrome for the Student/Teacher/Admin dashboards: brand row, role
// label, sign-out, and the Account panel (tap your name). Mirrors
// AuthScreenShell's visual language (same brand mark, same card/shadow
// system) but laid out for scrollable content lists instead of a centered
// form.
import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import { GearIcon } from "../../components/icons/UiIcons";
import AccountPanel from "./AccountPanel";
import type { Profile } from "../../lib/queries";
import { colors, fonts, spacing, radii } from "../../theme/theme";
import { useResponsive } from "../../theme/responsive";

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
}: Props) {
  const { isDesktop } = useResponsive();
  const [accountOpen, setAccountOpen] = useState(false);
  const canOpenAccount = Boolean(profile && onProfileChange);

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

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          isDesktop && styles.contentDesktop,
          isDesktop && contentMaxWidth ? { maxWidth: contentMaxWidth } : null,
        ]}
      >
        {children}
      </ScrollView>
    </GradientBackground>
  );
}

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
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
});
