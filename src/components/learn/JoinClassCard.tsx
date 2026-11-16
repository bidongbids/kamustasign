// Student with no class: type the code your teacher gives you to join their
// class (join_class_with_code, 0009_teacher_classroom.sql). Codes are six
// letters/digits; the input upper-cases as you type and ignores spaces.
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from "react-native";
import GlassCard from "../GlassCard";
import KidButton from "./KidButton";
import { HandIcon } from "../icons/UiIcons";
import { fonts, kidTypography, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { joinClassWithCode } from "../../lib/queries";

const CODE_LENGTH = 6;

export default function JoinClassCard({
  onJoined,
  style,
  contentStyle,
}: {
  onJoined: (className: string) => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = code.length === CODE_LENGTH;

  const join = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await joinClassWithCode(code);
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? "That didn't work. Try again.");
      return;
    }
    onJoined(data.class_name);
  };

  return (
    <GlassCard radius={radii.lg} padding={18} style={style} contentStyle={contentStyle}>
      <View style={styles.head}>
        <View style={[styles.icon, shadows.neuInset("sm")]}>
          <HandIcon size={24} color={colors.accentCoralText} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>Join your class</Text>
          <Text style={styles.body}>Type the code your teacher gives you.</Text>
        </View>
      </View>
      <View style={styles.row}>
        <TextInput
          value={code}
          onChangeText={(t) => {
            setError(null);
            setCode(t.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, CODE_LENGTH));
          }}
          onSubmitEditing={join}
          placeholder="ABC123"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel="Class code"
          maxLength={CODE_LENGTH}
          style={[styles.input, error ? styles.inputError : null]}
        />
        <KidButton small variant="primary" label="Join" onPress={join} disabled={!ready || busy} />
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : (
        <Text style={styles.hint}>You can still practice every sign while you wait.</Text>
      )}
    </GlassCard>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: "row", gap: 14, alignItems: "center" },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  body: { ...kidTypography.kidBody, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  input: {
    flex: 1,
    minWidth: 150,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontFamily: fonts.heading,
    fontSize: 24,
    letterSpacing: 5,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  inputError: { borderColor: colors.needsPractice },
  error: { ...kidTypography.kidBody, fontSize: 15, color: colors.needsPractice, marginTop: 8 },
  hint: { ...kidTypography.kidBody, fontSize: 15, color: colors.textSecondary, marginTop: 8 },
});
