// Shared layout for the auth screens (Login / Register / 2FA / password
// reset) and the Account panel — same visual language, just different
// content, so one stylesheet.
import { StyleSheet } from "react-native";
import { colors, fonts, spacing } from "../../theme/theme";

export const authStyles = StyleSheet.create({
  title: {
    fontFamily: fonts.heading,
    fontSize: 24,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textOnFrostedMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.needsPractice,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  switchText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textOnFrostedMuted,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  switchLink: {
    fontFamily: fonts.bodySemiBold,
  },
  divider: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textOnFrostedMuted,
    textAlign: "center",
    marginVertical: spacing.md,
  },
  // Right under the password field, pulled up into the field's bottom margin.
  forgotLink: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    alignSelf: "flex-end",
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
  },
  helpText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textOnFrostedMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  // The privacy note on the sign-up form: a quiet bordered box, left-aligned
  // because it's a paragraph, not a heading.
  notice: {
    width: "100%",
    borderWidth: 1,
    borderColor: "rgba(30,31,38,0.16)",
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textOnFrosted,
    marginBottom: spacing.xs,
  },
  noticeText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textOnFrostedMuted,
  },
  consentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: spacing.sm + 2,
  },
  consentText: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textOnFrosted,
  },
  qr: {
    width: 180,
    height: 180,
    marginBottom: spacing.md,
    // Always light regardless of palette — this is a loading-state fallback
    // behind a QR code image (which bakes in its own white quiet zone), not
    // themed chrome.
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    alignSelf: "center",
  },
  secret: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textOnFrostedMuted,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
});
