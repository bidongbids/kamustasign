// Pill toggle above a translator body - ASL/FSL and Letters/Numbers/Words in
// the Translator header, ASL/FSL and Letters/Numbers/Words in the classroom.
// Owns only the control row; the screen beneath decides what switching
// means. An option with no model behind it is shown but disabled rather than
// hidden.
//
// Sizes: "default" and "kid" are the classroom's (unchanged). "lg" (44px
// segments), "md" (40) and "sm" (36) are the Translator's
// (design_handoff_translator_fingerspelling): raised selected segment on a
// well, an optional icon, and an optional second line (`sub`, e.g. "0.45 s").
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, sizes, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { ClockIcon } from "./icons/UiIcons";
import { useResponsive } from "../theme/responsive";
import { focusFromKeyboard } from "../lib/focusVisible";

type Size = "default" | "kid" | "lg" | "md" | "sm";

export type SegmentOption<K extends string> = {
  key: K;
  label: string;
  disabled?: boolean;
  badge?: "soon";
  /** `count`: a small figure after the label, e.g. "21/26" (classroom theming H2). */
  count?: string;
  /** Translator sizes: drawn before the label in the label's colour. */
  icon?: (color: string) => React.ReactNode;
  /** Translator sizes: a second, smaller line under the label. */
  sub?: string;
  /** Overrides the screen-reader name of this segment. */
  accessibilityLabel?: string;
};

type Props<K extends string> = {
  options: SegmentOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** "kid": 48px segments (tap-min) for the student learning plan. */
  size?: Size;
  /** Sits in a row of other controls: no padding above, not centred. */
  inline?: boolean;
  /** Fills its row; the segments share the width equally. */
  stretch?: boolean;
  /** "tabs" switches what's shown (tablist); "radio" is a setting (radiogroup). */
  kind?: "tabs" | "radio";
  /** Names the whole group for screen readers ("Sign language"). */
  accessibilityLabel?: string;
  /** Segment height override (Translator sizes). */
  height?: number;
  /** Horizontal padding override per segment (Translator sizes). */
  itemPadding?: number;
  fontSize?: number;
};

const SEG_HEIGHT: Record<"lg" | "md" | "sm", number> = { lg: 44, md: 40, sm: 36 };
const SEG_PAD: Record<"lg" | "md" | "sm", number> = { lg: 30, md: 16, sm: 14 };
const SEG_FONT: Record<"lg" | "md" | "sm", number> = { lg: 15, md: 14, sm: 13.5 };

export default function SegmentedToggle<K extends string>({
  options,
  value,
  onChange,
  size = "default",
  inline,
  stretch,
  kind = "tabs",
  accessibilityLabel,
  height,
  itemPadding,
  fontSize,
}: Props<K>) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const kid = size === "kid";
  const { isDesktop } = useResponsive();
  const modern = size === "lg" || size === "md" || size === "sm";
  const role = kind === "radio" ? "radio" : "tab";

  // Arrow keys move the choice (web keyboards), as a tablist / radio group does.
  const enabled = options.filter((o) => !o.disabled).map((o) => o.key);
  const onKeyDown = (e: any) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step || enabled.length < 2) return;
    e.preventDefault?.();
    const i = Math.max(0, enabled.indexOf(value));
    onChange(enabled[(i + step + enabled.length) % enabled.length]);
  };

  const track = (
    <View
      style={[
        styles.track,
        modern && styles.trackModern,
        stretch && styles.trackStretch,
        shadows.neuInset("sm"),
      ]}
      accessibilityRole={(kind === "radio" ? "radiogroup" : "tablist") as any}
      accessibilityLabel={accessibilityLabel}
      {...(Platform.OS === "web" ? ({ onKeyDown } as object) : null)}
    >
      {options.map(({ key, label, disabled, badge, count, icon, sub, accessibilityLabel: optLabel }) => {
        const active = value === key;
        if (modern) {
          const s = size as "lg" | "md" | "sm";
          const h = height ?? (sub ? 54 : SEG_HEIGHT[s]);
          const textColor = disabled ? colors.disabledText : active ? colors.textPrimary : colors.textSecondary;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              disabled={disabled}
              style={(state: any) => [
                styles.modernOption,
                { height: h, paddingHorizontal: itemPadding ?? SEG_PAD[s] },
                sub && styles.modernOptionTwoLine,
                stretch && styles.modernOptionStretch,
                active && styles.modernOptionActive,
                active && shadows.neuRaised("sm"),
                state.focused && focusFromKeyboard() && styles.focused,
              ]}
              accessibilityRole={role as any}
              accessibilityState={kind === "radio" ? { checked: active, disabled: !!disabled } : { selected: active, disabled: !!disabled }}
              accessibilityLabel={optLabel ?? (sub ? `${label}, ${sub}` : undefined)}
            >
              {icon ? icon(textColor) : null}
              <Text style={[styles.modernLabel, { fontSize: fontSize ?? SEG_FONT[s], color: textColor }]} numberOfLines={1}>
                {label}
              </Text>
              {sub ? <Text style={[styles.modernSub, active && styles.modernSubActive]}>{sub}</Text> : null}
            </Pressable>
          );
        }
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            disabled={disabled}
            style={[styles.option, kid && styles.optionKid, active && [styles.optionActive, shadows.neuRaised("sm")]]}
            accessibilityRole={role as any}
            accessibilityState={kind === "radio" ? { checked: active, disabled: !!disabled } : { selected: active, disabled: !!disabled }}
            accessibilityLabel={
              optLabel ?? (badge === "soon" ? `${label}, coming soon` : count ? `${label}, ${count.replace("/", " of ")} learned` : undefined)
            }
          >
            <Text
              style={[
                styles.label,
                kid && styles.labelKid,
                active ? styles.labelActive : styles.labelInactive,
                disabled && styles.labelDisabled,
              ]}
            >
              {label}
            </Text>
            {count ? <Text style={[styles.count, active && styles.countActive]}>{count}</Text> : null}
            {badge === "soon" && (
              // The word + clock carry the state, not disabledText alone (2.84:1).
              <View style={styles.soonBadge}>
                <ClockIcon size={11} color={colors.textSecondary} />
                <Text style={styles.soonText}>SOON</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  if (modern) return track;
  return <View style={inline ? undefined : [styles.toggleRow, !isDesktop && styles.toggleRowMobile]}>{track}</View>;
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  toggleRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 2,
  },
  toggleRowMobile: {
    paddingTop: 10,
  },
  track: {
    flexDirection: "row",
    backgroundColor: colors.neuWell,
    borderRadius: 999,
    padding: 4,
  },
  trackModern: {
    gap: 2,
    alignSelf: "flex-start",
  },
  trackStretch: {
    alignSelf: "stretch",
  },
  optionKid: {
    minHeight: sizes.tapMin,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelKid: {
    fontSize: 15,
    lineHeight: 18,
  },
  soonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.textTertiary,
  },
  soonText: {
    ...typography.meta,
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  option: {
    paddingVertical: 7,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  optionActive: {
    backgroundColor: colors.surfaceElevated,
  },
  label: {
    ...typography.labelSm,
  },
  labelActive: {
    color: colors.textPrimary,
  },
  labelInactive: {
    color: colors.adminGray,
  },
  count: { fontFamily: typography.labelSm.fontFamily, fontSize: 12, lineHeight: 16, color: colors.textTertiary },
  countActive: { color: colors.textSecondary },
  labelDisabled: {
    color: colors.disabledText,
  },

  // Translator sizes.
  modernOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 999,
    ...(Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null),
  },
  modernOptionTwoLine: { flexDirection: "column", gap: 3 },
  modernOptionStretch: { flex: 1, minWidth: 0 },
  modernOptionActive: { backgroundColor: colors.surfaceRaised },
  modernLabel: { fontFamily: fonts.bodySemiBold, lineHeight: 18 },
  modernSub: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, lineHeight: 14, color: colors.textTertiary },
  modernSubActive: { color: colors.textSecondary },
  focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,
});
