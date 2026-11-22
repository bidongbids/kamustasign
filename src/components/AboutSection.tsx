// "About LCSign" at the bottom of the Appearance panel, which every screen
// can open: the version and where it runs, whether an update is out, and
// the error report (errorLog.ts; also sent to the admins, 0019) - plus, in the desktop app, the folder
// holding lcsign.log (electron/main.js). The first thing to ask when
// someone says "it broke" is "which version?", so it lives where anyone can
// find it without logging in.
import React, { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, radii, type ThemeColors } from "../theme/theme";
import { useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { focusFromKeyboard } from "../lib/focusVisible";
import { APP_VERSION, PLATFORM_LABEL, appPlatform } from "../lib/appVersion";
import { useAppRelease } from "../lib/appRelease";
import { desktopBridge, useDesktopUpdate } from "../lib/desktopBridge";
import { errorReport, recentErrors } from "../lib/errorLog";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

export default function AboutSection() {
  const styles = useThemedStyles(makeStyles);
  const platform = appPlatform();
  const desktop = useDesktopUpdate();
  const { release, need } = useAppRelease();
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const errorCount = recentErrors().length;

  const copyReport = () => {
    const text = errorReport();
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clipboard) {
      setCopied("no");
      return;
    }
    clipboard.writeText(text).then(
      () => setCopied("yes"),
      () => setCopied("no")
    );
  };

  // What to say about updates. The desktop app's own updater knows best;
  // otherwise app_release says whether a newer version is out.
  let update: { text: string; button?: { label: string; onPress: () => void } } | null = null;
  if (desktop?.state === "ready") {
    update = {
      text: `Version ${desktop.version} is ready. It installs when you close LCSign.`,
      button: { label: "Restart to update", onPress: () => void desktopBridge()?.installUpdate() },
    };
  } else if (desktop?.state === "downloading") {
    update = { text: `Downloading version ${desktop.version}… ${desktop.percent ?? 0}%` };
  } else if (need !== "none" && release) {
    const url = release.download_url;
    update = {
      text: `Version ${release.latest_version} is out.`,
      button: url ? { label: "Download it", onPress: () => void Linking.openURL(url) } : undefined,
    };
  } else if (desktop?.state === "current" || (release && need === "none")) {
    update = { text: "Up to date." };
  }

  return (
    <View style={styles.group}>
      <Text style={styles.meta}>ABOUT LCSIGN</Text>
      <Text style={styles.version}>
        LCSign {APP_VERSION} · {PLATFORM_LABEL[platform]}
      </Text>
      {update ? <Text style={styles.note}>{update.text}</Text> : null}
      <View style={styles.row}>
        {update?.button ? <SmallButton label={update.button.label} onPress={update.button.onPress} strong /> : null}
        <SmallButton label={copied === "yes" ? "Copied" : "Copy error report"} onPress={copyReport} />
        {platform === "desktop" ? <SmallButton label="Open the log folder" onPress={() => void desktopBridge()?.openLogFolder()} /> : null}
      </View>
      <Text style={styles.note}>
        {copied === "no"
          ? "Couldn't copy. Take a photo of this panel instead."
          : `${errorCount ? `${errorCount} recent error${errorCount === 1 ? "" : "s"} on this device. ` : ""}While someone is signed in, errors also go to the school's LCSign admins by themselves, without emails or passwords, and are deleted after 30 days. If something goes wrong, you can still send this error report to whoever looks after LCSign.`}
      </Text>
    </View>
  );
}

function SmallButton({ label, onPress, strong }: { label: string; onPress: () => void; strong?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={(s: any) => [styles.button, strong && styles.buttonStrong, s.focused && focusFromKeyboard() && styles.focused]}
    >
      <Text style={[styles.buttonText, strong && styles.buttonTextStrong]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  return StyleSheet.create({
    group: { gap: 8 },
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, letterSpacing: 1.1, color: colors.textTertiary },
    version: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    note: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.textSecondary },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    button: {
      height: 38,
      paddingHorizontal: 14,
      borderRadius: radii.pill,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.16)" : colors.border,
      ...webCursor,
    },
    buttonStrong: { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill },
    buttonText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },
    buttonTextStrong: { color: colors.onPrimary },
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
  });
};
