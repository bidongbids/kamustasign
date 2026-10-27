import React, { forwardRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View, StyleSheet, TextInputProps } from "react-native";
import { colors, fonts, spacing, radii } from "../../theme/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** "dark" when the field sits on the dark ground / sheer glass (dashboards). */
  tone?: "frosted" | "dark";
};

const webTransition =
  Platform.OS === "web" ? ({ transitionProperty: "border-color", transitionDuration: "140ms" } as any) : null;

// forwardRef so a form can move focus to the next field when Enter is
// pressed (onSubmitEditing) - there is no <form> on react-native-web.
const AuthTextField = forwardRef<TextInput, Props>(function AuthTextField(
  { label, error, tone = "frosted", style, onFocus, onBlur, secureTextEntry, ...inputProps },
  ref
) {
  const [focused, setFocused] = useState(false);
  // Password fields get a Show/Hide switch: typing a password blind is hard
  // for a child, and a typo costs a failed sign-in.
  const [revealed, setRevealed] = useState(false);
  const canReveal = Boolean(secureTextEntry);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, tone === "dark" && styles.labelDark]}>{label}</Text>
      <View>
        <TextInput
          ref={ref}
          style={[
            styles.input,
            canReveal && styles.inputWithToggle,
            focused && styles.inputFocused,
            error ? styles.inputError : null,
            webTransition,
            style,
          ]}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          // The visible label above isn't tied to the input for screen
          // readers, so name the input itself.
          accessibilityLabel={label}
          secureTextEntry={canReveal && !revealed}
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
        {canReveal && (
          <Pressable
            onPress={() => setRevealed((r) => !r)}
            style={styles.toggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${revealed ? "Hide" : "Show"} ${label.toLowerCase()}`}
          >
            <Text style={styles.toggleText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

export default AuthTextField;

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
  inputWithToggle: {
    paddingRight: 64,
  },
  inputFocused: {
    borderColor: colors.focusRing,
  },
  inputError: {
    borderColor: colors.needsPractice,
  },
  toggle: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
  },
  toggleText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.needsPractice,
    marginTop: spacing.xs,
  },
});
