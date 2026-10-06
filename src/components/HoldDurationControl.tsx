// src/components/HoldDurationControl.tsx
// Companion timer to COMMIT_THRESHOLD in LiveTranslatorScreen: how long a
// handshape must hold steady above the confidence threshold before it's
// committed to the reading strip. An instant commit logs transient/unsure
// shapes the moment confidence crosses the threshold for even one frame -
// this adds a deliberate pause so an uncertain sign can be corrected before
// it locks in. Persisted the same way as handedness (see HandednessPicker.tsx)
// - set once, applies to every recognition after that.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, fonts } from "../theme/theme";
import { neuRaised, neuInset } from "../theme/shadows";

const STORAGE_KEY = "kamustasign:holdDurationMs";

export const HOLD_PRESETS = [
  { label: "Fast", ms: 150 },
  { label: "Balanced", ms: 450 },
  { label: "Careful", ms: 900 },
] as const;

const DEFAULT_MS = 450;

export function useHoldDuration(): [number, (value: number) => void] {
  const [holdMs, setHoldMs] = useState<number>(DEFAULT_MS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved != null) setHoldMs(Number(saved));
    });
  }, []);

  function update(value: number) {
    setHoldMs(value);
    AsyncStorage.setItem(STORAGE_KEY, String(value));
  }

  return [holdMs, update];
}

type Props = {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
};

export default function HoldDurationControl({ value, onChange, compact = false }: Props) {
  // Non-compact height/padding/gap match the control-strip segmented-control
  // spec (design handoff: "UI mockups combining design styles" - 4a control
  // strip, cell 2): 50 high, padding 5, gap 5. Compact (mobile) is untouched.
  return (
    <View style={[styles.row, { height: compact ? 40 : 50, padding: compact ? 4 : 5, gap: compact ? 4 : 5 }]}>
      {HOLD_PRESETS.map((preset) => {
        const active = value === preset.ms;
        return (
          <Pressable
            key={preset.label}
            onPress={() => onChange(preset.ms)}
            style={[
              styles.pill,
              { backgroundColor: active ? colors.surfaceElevated : colors.neuWell },
              active ? neuRaised("sm") : neuInset("sm"),
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${preset.label} commit speed, ${preset.ms} milliseconds`}
          >
            <Text style={[styles.pillLabel, !compact && styles.pillLabelStrip, active && styles.pillLabelActive, compact && styles.pillLabelCompact]}>
              {preset.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: 999,
  } as ViewStyle,
  pill: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: "#8A93A3",
  },
  pillLabelStrip: {
    fontSize: 12,
  },
  pillLabelActive: {
    color: colors.textPrimary,
  },
  pillLabelCompact: {
    fontSize: 11,
  },
});
