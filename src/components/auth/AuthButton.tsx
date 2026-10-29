import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Platform, Pressable, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { fonts, spacing, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useReduceMotion } from "../../hooks/useReduceMotion";

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
};

const webTransition =
  Platform.OS === "web"
    ? ({ transitionProperty: "box-shadow, opacity", transitionDuration: "140ms" } as any)
    : null;

export default function AuthButton({
  label,
  onPress,
  loading,
  disabled,
  variant = "primary",
  accentColor: accentColorProp,
  style,
}: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const accentColor = accentColorProp ?? colors.primaryTeal;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isPrimary = variant === "primary";
  const isDisabled = Boolean(disabled || loading);
  const lifted = (hovered || focused) && !isDisabled;

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    if (isDisabled || reduceMotion) return;
    Animated.spring(scaleAnim, { toValue: lifted ? 1.015 : 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [lifted, isDisabled, reduceMotion, scaleAnim]);

  const animatePress = (toValue: number) => {
    if (isDisabled || reduceMotion) return;
    Animated.spring(scaleAnim, { toValue, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPressIn={() => animatePress(0.97)}
      onPressOut={() => animatePress(lifted ? 1.015 : 1)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.base,
          isPrimary
            ? { backgroundColor: accentColor }
            : { backgroundColor: colors.surfaceElevated, borderWidth: 1.5, borderColor: colors.border },
          !isDisabled && shadows.shadow(lifted ? "md" : "sm", isPrimary ? accentColor : colors.primaryTealDark),
          focused && { outlineWidth: 2, outlineColor: colors.focusRing, outlineOffset: 2 },
          isDisabled && styles.disabled,
          { transform: [{ scale: scaleAnim }] },
          webTransition,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={isPrimary ? colors.textOnPrimary : colors.primaryTeal} />
        ) : (
          <Text style={[styles.label, { color: isPrimary ? colors.textOnPrimary : colors.textPrimary }]}>
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  pressable: {
    width: "100%",
  },
  base: {
    borderRadius: radii.pill,
    paddingVertical: spacing.sm + 4,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  disabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
  },
});
