// Shared layout for the Login / Register / Verify2FA / Setup2FA screens —
// same visual language, just different content, so one stylesheet.
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
