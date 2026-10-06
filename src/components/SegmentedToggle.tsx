// Pill toggle above a translator body - Letters/Numbers on Fingerspelling,
// ASL/FSL on Words. Owns only the control row; the screen beneath decides
// what switching means (both swap a classifier, never the camera).
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, typography } from "../theme/theme";
import { neuInset, neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";

type Props<K extends string> = {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
};

export default function SegmentedToggle<K extends string>({ options, value, onChange }: Props<K>) {
  const { isDesktop } = useResponsive();

  return (
    <View style={[styles.toggleRow, !isDesktop && styles.toggleRowMobile]}>
      <View style={[styles.track, neuInset("sm")]}>
        {options.map(({ key, label }) => {
          const active = value === key;
          return (
            <Pressable
              key={key}
              onPress={() => onChange(key)}
              style={[styles.option, active && [styles.optionActive, neuRaised("sm")]]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
                {label}
              </Text>
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
});
