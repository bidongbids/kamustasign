// Shown after sign-in when the account can't use a dashboard yet: a teacher
// sign-up an admin hasn't approved (0011_auth_hardening.sql), or an account
// whose profile couldn't be loaded.
//
// Waiting for approval (design T9) says who has to act, what is blocked and
// how to continue - Check again re-reads the profile - with when and as whom
// the account signed up, and what to do if the role was picked by mistake.
import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { useAuthStyles } from "./authStyles";
import { AlertCircleIcon, ClockIcon } from "../../components/icons/UiIcons";
import { fonts, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

type Props = {
  accentColor: string;
  title: string;
  message: string;
  onCheckAgain: () => Promise<void>;
  onSignOut: () => void;
  /** "pending": a clock, "error": an alert. */
  kind?: "pending" | "error";
  /** One line under the message, e.g. "Signed up Oct 27 as liza@school.ph". */
  detail?: string;
  /** Small print at the end, e.g. what to do about a wrong role. */
  footnote?: string;
  /** A "Practice offline" button: the Classroom without an account (profile couldn't load). */
  onPracticeOffline?: () => void;
};

export default function AccountNoticeScreen({
  accentColor,
  title,
  message,
  onCheckAgain,
  onSignOut,
  kind = "pending",
  detail,
  footnote,
  onPracticeOffline,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = useAuthStyles();
  const [checking, setChecking] = useState(false);

  return (
    <AuthScreenShell accentColor={accentColor}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {kind === "pending" ? <ClockIcon size={26} color={colors.accentCoralDark} /> : <AlertCircleIcon size={26} color={colors.callDanger} />}
      </View>
      <Text style={[s.title, { color: accentColor }]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={s.subtitle}>{message}</Text>
      {detail ? <Text style={styles.detail}>◆ {detail}</Text> : null}
      <AuthButton
        label="Check again"
        loading={checking}
        accentColor={accentColor}
        onPress={async () => {
          setChecking(true);
          await onCheckAgain();
          setChecking(false);
        }}
      />
      {onPracticeOffline ? (
        <View style={{ marginTop: spacing.sm, width: "100%" }}>
          <AuthButton label="Practice offline" onPress={onPracticeOffline} variant="secondary" />
        </View>
      ) : null}
      <View style={{ marginTop: spacing.sm, width: "100%" }}>
        <AuthButton label="Sign out" onPress={onSignOut} variant="secondary" />
      </View>
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </AuthScreenShell>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(30,31,38,0.18)",
    marginBottom: spacing.sm,
  },
  // On the frosted card: dark text only (no gold text on frosted glass).
  detail: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textOnFrosted, textAlign: "center", marginBottom: spacing.md },
  footnote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textOnFrosted, textAlign: "center", marginTop: spacing.md },
});
