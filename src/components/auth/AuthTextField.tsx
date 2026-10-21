import React, { useState } from "react";
import { Platform, Text, TextInput, View, StyleSheet, TextInputProps } from "react-native";
import { colors, fonts, spacing, radii } from "../../theme/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** "dark" when the field sits on the dark ground / sheer glass (dashboards). */
  tone?: "frosted" | "dark";
};

const webTransition =
  Platform.OS === "web" ? ({ transitionProperty: "border-color", transitionDuration: "140ms" } as any) : null;

export default function AuthTextField({ label, error, tone = "frosted", style, onFocus, onBlur, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, tone === "dark" && styles.labelDark]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          webTransition,
          style,
        ]}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...inputProps}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginBottom: spacing.md,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    // Sits directly on the frosted auth card, not inside the (dark) input
    // box below it — needs the on-frosted dark-text pair, not `textPrimary`.
    color: colors.textOnFrosted,
    marginBottom: spacing.xs,
  },
  labelDark: {
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    minHeight: 48,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
  },
  inputFocused: {
    borderColor: colors.focusRing,
  },
  inputError: {
    borderColor: colors.needsPractice,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.needsPractice,
    marginTop: spacing.xs,
  },
});
