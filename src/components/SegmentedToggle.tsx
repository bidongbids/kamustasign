// Pill toggle above a translator body - Letters/Numbers on Fingerspelling,
// ASL/FSL on Words. Owns only the control row; the screen beneath decides
// what switching means (both swap a classifier, never the camera). The
// classroom also uses it for ASL/FSL and Letters/Numbers/Words, where an
// option with no model behind it is shown but disabled rather than hidden.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, sizes, typography } from "../theme/theme";
import { ClockIcon } from "./icons/UiIcons";
import { neuInset, neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";

type Props<K extends string> = {
  options: { key: K; label: string; disabled?: boolean; badge?: "soon" }[];
  value: K;
  onChange: (key: K) => void;
  /** "kid": 48px segments (tap-min) for the student learning plan. */
  size?: "default" | "kid";
};

export default function SegmentedToggle<K extends string>({ options, value, onChange, size = "default" }: Props<K>) {
  const kid = size === "kid";
  const { isDesktop } = useResponsive();

  return (
    <View style={[styles.toggleRow, !isDesktop && styles.toggleRowMobile]}>
      <View style={[styles.track, neuInset("sm")]}>
        {options.map(({ key, label, disabled, badge }) => {
          const active = value === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              disabled={disabled}
              style={[styles.option, kid && styles.optionKid, active && [styles.optionActive, neuRaised("sm")]]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active, disabled: !!disabled }}
              accessibilityLabel={badge === "soon" ? `${label}, coming soon` : undefined}
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

const styles = StyleSheet.create({
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
  labelDisabled: {
    color: colors.disabledText,
  },
});
