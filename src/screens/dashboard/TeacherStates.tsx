// The teacher dashboard's whole-page states (design T9): the first run - a
// teacher with no class yet - as a centred card with a three-step strip, so
// it's clear what comes next; and the static skeleton shown while the
// dashboard loads (no shimmer). Plus the error card a failed load shows in
// place of its content.
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import HandLandmarkMark from "../../components/HandLandmarkMark";
import { AlertCircleIcon, RetryIcon } from "../../components/icons/UiIcons";
import { ActionButton } from "./ManageKit";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";

export function FirstRunCard({ onCreate }: { onCreate: (name: string) => Promise<boolean> }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const ok = await onCreate(name.trim());
    setBusy(false);
    if (ok) setName("");
  };
  const steps = ["Create the class", "Invite students", "Choose what they learn"];
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={[styles.mark, shadows.neuRaised("sm")]}>
          <HandLandmarkMark size={30} color={colors.primaryTealLight} dotColor={colors.accentCoral} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Create your first class
        </Text>
        <Text style={styles.body}>
          Give it a name. Then students can join with its class code, or you can add students who've signed up.
        </Text>
        <View style={styles.formRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Grade 6 – Rizal"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Class name"
            onSubmitEditing={submit}
            autoFocus
            style={[styles.input, shadows.neuInset("sm")]}
          />
          <ActionButton label="Create class" variant="primary" size="lg" onPress={submit} loading={busy} disabled={!name.trim()} />
        </View>
        <View style={styles.steps} accessible accessibilityLabel="Step 1 of 3: create the class. Then invite students, then choose what they learn.">
          {steps.map((s, i) => (
            <View key={s} style={styles.step}>
              <View style={[styles.stepNo, i === 0 ? styles.stepNoOn : shadows.neuRaised("sm")]}>
                <Text style={[styles.stepNoText, i === 0 && styles.stepNoTextOn]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, i === 0 && styles.stepTextOn]}>{s}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * A load that failed, in place of the content it was meant to fill - so a
 * dropped connection never reads as "nothing here yet" (an empty class, no
 * modules, no accounts). Teacher and admin dashboards.
 */
export function LoadErrorCard({
  title,
  message = "Check the internet connection, then try again. Nothing you saved was lost.",
  onRetry,
  compact,
}: {
  title: string;
  message?: string;
  onRetry: () => void | Promise<void>;
  /** Inside a card or drawer: no outer card of its own. */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={compact ? styles.errorCompact : styles.wrap}>
      <View style={compact ? styles.errorCompactInner : [styles.card, styles.errorCard]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <View style={[styles.errorIcon, compact && styles.errorIconSm]}>
          <AlertCircleIcon size={compact ? 20 : 26} color={colors.needsPracticeText} />
        </View>
        <Text style={[styles.title, compact && styles.errorTitleSm]}>{title}</Text>
        <Text style={styles.body}>{message}</Text>
        <ActionButton
          label="Try again"
          variant="primary"
          size={compact ? "sm" : "md"}
          icon={(c) => <RetryIcon size={14} color={c} />}
          onPress={() => void retry()}
          loading={busy}
        />
      </View>
    </View>
  );
}

/** Static placeholder blocks while the dashboard loads. */
export function PageSkeleton() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View accessibilityLabel="Loading your class…" accessibilityLiveRegion="polite" style={styles.skel}>
      <View style={[styles.bar, { width: 220, height: 30 }]} />
      <View style={[styles.bar, { width: 420, maxWidth: "100%", height: 12 }]} />
      {Array.from({ length: 5 }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <View style={styles.dot} />
          <View style={[styles.bar, { width: 160 }]} />
          <View style={[styles.bar, styles.flex]} />
          <View style={[styles.bar, { width: 64, height: 32, borderRadius: 16 }]} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1 },
  wrap: { alignItems: "center", paddingVertical: 32 },
  card: {
    width: "100%",
    maxWidth: 640,
    alignItems: "center",
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.05)" : colors.surface,
    gap: 14,
  },
  mark: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, marginBottom: 6 },
  title: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 32, color: colors.textPrimary, textAlign: "center" },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textOnGlass, textAlign: "center", maxWidth: 460 },
  formRow: { flexDirection: "row", alignItems: "center", gap: 12, alignSelf: "stretch", flexWrap: "wrap", marginTop: 6 },
  input: {
    flex: 1,
    minWidth: 220,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radii.pill,
    backgroundColor: colors.neuWell,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textPrimary,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  steps: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 18, marginTop: 10 },
  step: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepNo: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  stepNoOn: { backgroundColor: colors.actionPrimaryFill },
  stepNoText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textOnGlass },
  stepNoTextOn: { color: "#FFFFFF" },
  stepText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textOnGlass },
  stepTextOn: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  errorCard: { maxWidth: 520, gap: 10 },
  errorIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.needsPractice + "1F",
    marginBottom: 4,
  },
  errorIconSm: { width: 40, height: 40, borderRadius: 12, marginBottom: 0 },
  errorTitleSm: { fontSize: 18, lineHeight: 24 },
  errorCompact: { paddingVertical: 20 },
  errorCompactInner: { alignItems: "center", gap: 8 },
  skel: { gap: 14 },
  skelRow: { flexDirection: "row", alignItems: "center", gap: 16, height: 56 },
  dot: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.07)" : colors.well },
  bar: { height: 12, borderRadius: 6, backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.07)" : colors.well },
});
