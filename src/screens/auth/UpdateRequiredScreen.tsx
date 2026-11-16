// Shown instead of logging in when this copy of LCSign is older than the
// oldest version the server still works with (app_release.min_version,
// src/lib/appRelease.ts). Without it an old copy would just fail in odd
// ways after a server change - like the 11-04 sign-ups stuck with no code
// screen. The Translator needs no server, so it stays open.
import React from "react";
import { Linking, Text, View, StyleSheet } from "react-native";
import AuthButton from "../../components/auth/AuthButton";
import AuthScreenShell from "./AuthScreenShell";
import { useAuthStyles } from "./authStyles";
import { DownloadIcon } from "../../components/icons/UiIcons";
import { fonts, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles } from "../../theme/ThemeProvider";
import { APP_VERSION } from "../../lib/appVersion";
import type { AppRelease } from "../../lib/appRelease";
import { desktopBridge, useDesktopUpdate } from "../../lib/desktopBridge";

type Props = {
  accentColor: string;
  release: AppRelease;
  onOpenTranslator: () => void;
};

export default function UpdateRequiredScreen({ accentColor, release, onOpenTranslator }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const s = useAuthStyles();
  const desktop = useDesktopUpdate();

  let action: React.ReactNode;
  if (desktop?.state === "ready") {
    action = <AuthButton label="Restart to update" accentColor={accentColor} onPress={() => void desktopBridge()?.installUpdate()} />;
  } else if (desktop?.state === "downloading") {
    action = (
      <Text style={styles.detail}>
        Downloading version {desktop.version}… {desktop.percent ?? 0}%
      </Text>
    );
  } else if (release.download_url) {
    const url = release.download_url;
    action = <AuthButton label={`Download LCSign ${release.latest_version}`} accentColor={accentColor} onPress={() => void Linking.openURL(url)} />;
  } else {
    action = <Text style={styles.detail}>Ask whoever looks after LCSign at your school for the new version.</Text>;
  }

  return (
    <AuthScreenShell accentColor={accentColor}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <DownloadIcon size={26} color={accentColor} />
      </View>
      <Text style={[s.title, { color: accentColor }]} accessibilityRole="header">
        Update LCSign
      </Text>
      <Text style={s.subtitle}>
        This copy of LCSign ({APP_VERSION}) is too old to log in. Install version {release.latest_version} to carry on. Your account,
        classes and stars are kept on the server and will be there.
      </Text>
      {release.notes ? <Text style={styles.detail}>{release.notes}</Text> : null}
      {action}
      <View style={{ marginTop: spacing.sm, width: "100%" }}>
        <AuthButton label="Use the Translator" onPress={onOpenTranslator} variant="secondary" />
      </View>
      <Text style={[styles.footnote, { color: colors.textOnFrosted }]}>The Translator works without logging in.</Text>
    </AuthScreenShell>
  );
}

const makeStyles = (colors: ThemeColors) =>
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
    detail: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, lineHeight: 20, color: colors.textOnFrosted, textAlign: "center", marginBottom: spacing.md },
    footnote: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: spacing.md },
  });
