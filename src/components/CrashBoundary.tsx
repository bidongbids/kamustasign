// Catches a crash anywhere below it and shows "Something went wrong" with a
// Reload button, instead of leaving a blank window. Copy details puts the
// error on the clipboard so a teacher can send it to whoever looks after
// LCSign - nothing is sent anywhere by itself. The details start with the
// version and end with the errors just before the crash (errorLog.ts).
//
// App.tsx uses two: a themed one around the screens, and a plain one outside
// the theme in case the themed screen (or the theme itself) is what broke.
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AuthButton from "./auth/AuthButton";
import AuthScreenShell from "../screens/auth/AuthScreenShell";
import { useAuthStyles } from "../screens/auth/authStyles";
import { AlertCircleIcon } from "./icons/UiIcons";
import { spacing } from "../theme/theme";
import { useTheme } from "../theme/ThemeProvider";
import { APP_VERSION, PLATFORM_LABEL, appPlatform } from "../lib/appVersion";
import { recentErrors, recordError, type ErrorEntry } from "../lib/errorLog";

type Props = {
  children: React.ReactNode;
  /** No theme, fonts or shared components - for the outermost boundary. */
  plain?: boolean;
};

type State = { error: Error | null; componentStack: string };

export default class CrashBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: "" };
  /** Errors recorded before this crash, for Copy details. */
  before: ErrorEntry[] = [];

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Taken before console.error, which the error log also copies.
    this.before = recentErrors();
    recordError("crash", error);
    console.error("[crash]", error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? "" });
  }

  reload = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") window.location.reload();
    else this.setState({ error: null, componentStack: "" });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    const details = crashDetails(error, componentStack, this.before);
    return this.props.plain ? (
      <PlainCrashScreen details={details} onReload={this.reload} />
    ) : (
      <CrashScreen details={details} onReload={this.reload} />
    );
  }
}

function crashDetails(error: Error, componentStack: string, before: ErrorEntry[]) {
  const where = Platform.OS === "web" && typeof navigator !== "undefined" ? navigator.userAgent : Platform.OS;
  const trim = (text: string | undefined, lines: number) => (text ?? "").trim().split("\n").slice(0, lines).join("\n");
  const earlier = before.slice(-5).flatMap((e) => [`${e.at} [${e.source}]${e.count > 1 ? ` (x${e.count})` : ""}`, trim(e.message, 4)]);
  return [
    `LCSign ${APP_VERSION} (${PLATFORM_LABEL[appPlatform()]}) crash, ${new Date().toISOString()}`,
    `Where: ${where}`,
    `${error.name}: ${error.message}`,
    "",
    trim(error.stack, 12),
    "",
    "Screen:",
    trim(componentStack, 12),
    ...(earlier.length ? ["", "Errors just before:", ...earlier] : []),
  ].join("\n");
}

const canCopy = Platform.OS === "web" && typeof navigator !== "undefined" && !!navigator.clipboard;

function useCopy(details: string) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const copy = () => {
    navigator.clipboard.writeText(details).then(
      () => setCopied(true),
      () => setCopied(false)
    );
  };
  return { copied, copy };
}

const MESSAGE =
  "LCSign ran into a problem and stopped this screen. Reload to carry on. If it keeps happening, press Copy details and send them to whoever looks after LCSign at your school.";

function CrashScreen({ details, onReload }: { details: string; onReload: () => void }) {
  const { colors } = useTheme();
  const s = useAuthStyles();
  const { copied, copy } = useCopy(details);
  return (
    <AuthScreenShell accentColor={colors.primaryTeal}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <AlertCircleIcon size={26} color={colors.callDanger} />
      </View>
      <Text style={[s.title, { color: colors.primaryTeal }]} accessibilityRole="header">
        Something went wrong
      </Text>
      <Text style={s.subtitle}>{MESSAGE}</Text>
      <AuthButton label="Reload LCSign" onPress={onReload} accentColor={colors.primaryTeal} />
      {canCopy && (
        <View style={{ marginTop: spacing.sm, width: "100%" }}>
          <AuthButton label={copied ? "Copied" : "Copy details"} onPress={copy} variant="secondary" />
        </View>
      )}
      {copied === false && <Text style={s.errorText}>Couldn't copy. Take a photo of this screen instead.</Text>}
    </AuthScreenShell>
  );
}

function PlainCrashScreen({ details, onReload }: { details: string; onReload: () => void }) {
  const { copied, copy } = useCopy(details);
  return (
    <View style={plain.page}>
      <View style={plain.card}>
        <Text style={plain.title} accessibilityRole="header">
          Something went wrong
        </Text>
        <Text style={plain.body}>{MESSAGE}</Text>
        <Pressable accessibilityRole="button" onPress={onReload} style={[plain.button, plain.primary]}>
          <Text style={[plain.buttonText, { color: "#FFFFFF" }]}>Reload LCSign</Text>
        </Pressable>
        {canCopy && (
          <Pressable accessibilityRole="button" onPress={copy} style={plain.button}>
            <Text style={plain.buttonText}>{copied ? "Copied" : "Copy details"}</Text>
          </Pressable>
        )}
        {copied === false && <Text style={plain.body}>Couldn't copy. Take a photo of this screen instead.</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});

// Fixed colours on purpose: this one can't count on the theme having loaded.
const plain = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "#EEF1F6" },
  card: { width: "100%", maxWidth: 440, padding: 24, borderRadius: 16, backgroundColor: "#FFFFFF", gap: 12 },
  title: { fontSize: 22, fontWeight: "700", color: "#1E1F26", textAlign: "center" },
  body: { fontSize: 15, lineHeight: 22, color: "#3A3B44", textAlign: "center" },
  button: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: "#1E1F26", alignItems: "center" },
  primary: { backgroundColor: "#6352E6", borderColor: "#6352E6" },
  buttonText: { fontSize: 15, fontWeight: "600", color: "#1E1F26" },
});
