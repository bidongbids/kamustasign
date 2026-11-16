// The student layer's button: 56 high (48 for "small"), pill, label in
// kidLabel. "primary" is the one gold action per view; "raised" is the
// neumorphic control; "ghost" a hairline outline for the quiet way out.
import React, { forwardRef } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { kidTypography, sizes, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { focusFromKeyboard } from "../../lib/focusVisible";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "raised" | "ghost";
  small?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Icon-only (still needs `label` for the screen reader). */
  iconOnly?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

const KidButton = forwardRef<View, Props>(function KidButton(
  { label, onPress, variant = "raised", small, iconLeft, iconRight, iconOnly, disabled, accessibilityLabel, style },
  ref
) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const h = small ? sizes.tapMin : sizes.buttonKidH;
  const textColor = variant === "primary" ? colors.textOnAccent : colors.textPrimary;
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={(state: any) => [
        styles.base,
        { minHeight: h, borderRadius: h / 2 },
        iconOnly ? { width: h, paddingHorizontal: 0 } : { paddingHorizontal: small ? 16 : 24 },
        variant === "primary" && styles.primary,
        variant === "raised" && [styles.raised, shadows.neuRaised(small ? "sm" : "md")],
        variant === "ghost" && styles.ghost,
        state.pressed && { transform: [{ scale: 0.98 }] },
        state.focused && focusFromKeyboard() && styles.focused,
        disabled && styles.disabled,
        style,
      ]}
    >
      {iconLeft}
      {!iconOnly && (
        <Text style={[small ? styles.labelSmall : kidTypography.kidLabel, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {iconRight}
    </Pressable>
  );
});

export default KidButton;

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primary: {
    backgroundColor: colors.accentCoral,
    // The accent's glow (celebrationGlow is the accent at 0.35): rgba(242,178,62,0.28) in Graphite.
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: colors.celebrationGlow.replace(/0\.35\)$/, "0.28)") }],
  } as any,
  raised: { backgroundColor: colors.neuBase },
  ghost: { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" },
  focused: { outlineColor: colors.focusRing, outlineWidth: 2, outlineStyle: "solid", outlineOffset: 2 } as any,
  disabled: { opacity: 0.5 },
  labelSmall: { ...kidTypography.kidLabel, fontSize: 14 },
});
