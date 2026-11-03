// The Translator's buttons (design_handoff_translator_fingerspelling): one
// pill in four looks, so the header, the word card, the phone's bottom bar
// and the Show-to-someone view can't drift apart.
//   accent  - Speak it aloud (the one main action)
//   neu     - raised neumorphic (Show to someone, header buttons)
//   ghost   - 1px outline (Space · Delete letter · Clear word)
// Sizes: lg 52, md 44, sm 38. `square` makes an icon button that size wide.
import React from "react";
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import { fonts, radii, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { focusFromKeyboard } from "../lib/focusVisible";

type Props = {
  label?: string;
  icon?: (color: string) => React.ReactNode;
  /** After the label (a dropdown chevron). */
  iconRight?: (color: string) => React.ReactNode;
  onPress: () => void;
  tone?: "accent" | "neu" | "ghost";
  size?: "lg" | "md" | "sm";
  /** Takes the free width in its row. */
  grow?: boolean;
  /** An icon button as wide as it is tall. */
  square?: boolean;
  disabled?: boolean;
  /** neu only: shown pressed in (its popover is open). */
  active?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  /** Text instead of an icon on a square button ("?", "␣"). */
  glyph?: string;
};

const HEIGHT = { lg: 52, md: 44, sm: 38 } as const;
const FONT = { lg: 16, md: 14, sm: 13 } as const;
const PAD = { lg: 24, md: 18, sm: 14 } as const;

export default function TranslatorButton({
  label,
  icon,
  iconRight,
  onPress,
  tone = "neu",
  size = "md",
  grow,
  square,
  disabled,
  active,
  accessibilityLabel,
  accessibilityHint,
  style,
  glyph,
}: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const h = HEIGHT[size];
  const fg = tone === "accent" ? colors.textOnAccent : active ? colors.accentCoralText : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...(active != null ? { expanded: active } : null) }}
      hitSlop={size === "sm" ? 4 : undefined}
      style={(state: any) => [
        styles.base,
        { height: h, paddingHorizontal: square ? 0 : PAD[size] },
        square && { width: h },
        grow && styles.grow,
        tone === "accent" && styles.accent,
        tone === "neu" && [styles.neu, shadows.neuRaised("sm")],
        tone === "neu" && active && [styles.neuActive, shadows.neuInset("sm")],
        tone === "ghost" && styles.ghost,
        state.pressed && !disabled && (tone === "neu" ? shadows.neuPressed() : styles.pressed),
        disabled && styles.disabled,
        state.focused && focusFromKeyboard() && styles.focused,
        style,
      ]}
    >
      {icon ? icon(fg) : null}
      {glyph ? <Text style={[styles.glyph, { color: fg }]}>{glyph}</Text> : null}
      {label && !square ? (
        <Text style={[styles.label, { fontSize: FONT[size], color: fg }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
      {iconRight ? iconRight(tone === "accent" ? fg : colors.textSecondary) : null}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    base: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: radii.pill,
      flexShrink: 0,
      ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
    },
    grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
    accent: { backgroundColor: colors.accent },
    neu: { backgroundColor: colors.surfaceRaised },
    neuActive: { backgroundColor: colors.well },
    ghost: { borderWidth: 1, borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.45 },
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
    label: { fontFamily: fonts.bodySemiBold, lineHeight: 20, flexShrink: 1 },
    glyph: { fontFamily: fonts.bodySemiBold, fontSize: 16, lineHeight: 20 },
  });
