// Pill toggle above a translator body - Letters/Numbers on Fingerspelling,
// ASL/FSL on Words. Owns only the control row; the screen beneath decides
// what switching means (both swap a classifier, never the camera). The
// classroom also uses it for ASL/FSL and Letters/Numbers/Words, where an
// option with no model behind it is shown but disabled rather than hidden.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { sizes, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { ClockIcon } from "./icons/UiIcons";
import { useResponsive } from "../theme/responsive";

type Props<K extends string> = {
  /** `count`: a small figure after the label, e.g. "21/26" (classroom theming H2). */
  options: { key: K; label: string; disabled?: boolean; badge?: "soon"; count?: string }[];
  value: K;
  onChange: (key: K) => void;
  /** "kid": 48px segments (tap-min) for the student learning plan. */
  size?: "default" | "kid";
  /** Sits in a row of other controls: no padding above, not centred. */
  inline?: boolean;
};

export default function SegmentedToggle<K extends string>({ options, value, onChange, size = "default", inline }: Props<K>) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const kid = size === "kid";
  const { isDesktop } = useResponsive();

  return (
    <View style={inline ? undefined : [styles.toggleRow, !isDesktop && styles.toggleRowMobile]}>
      <View style={[styles.track, shadows.neuInset("sm")]}>
        {options.map(({ key, label, disabled, badge, count }) => {
          const active = value === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              disabled={disabled}
              style={[styles.option, kid && styles.optionKid, active && [styles.optionActive, shadows.neuRaised("sm")]]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: !!disabled }}
              accessibilityLabel={badge === "soon" ? `${label}, coming soon` : count ? `${label}, ${count.replace("/", " of ")} learned` : undefined}
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
    </View>
  );
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
});
