// src/components/ClipLengthControl.tsx
// Companion to HoldDurationControl for the Words screen's control-strip
// "Clip length" cell — a PROPOSAL from the design handoff ("UI mockups
// combining design styles" - 4b control strip, cell 3): this setting does
// not exist today. Short/Standard/Long map to a frame-count window the
// record buffer classifies against once recording stops (Standard = 60
// frames, the fixed value the pipeline used before this control existed).
// Same construction and persistence pattern as HoldDurationControl/
// HandednessPicker - set once, applies to every recording after that.
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fonts, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";

const STORAGE_KEY = "kamustasign:clipLengthFrames";

export const CLIP_LENGTH_PRESETS = [
  { label: "Short", frames: 40 },
  { label: "Standard", frames: 60 },
  { label: "Long", frames: 90 },
] as const;

const DEFAULT_FRAMES = 60;

export function useClipLength(): [number, (value: number) => void] {
  const [frames, setFrames] = useState<number>(DEFAULT_FRAMES);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved != null) setFrames(Number(saved));
    });
  }, []);

  function update(value: number) {
    setFrames(value);
    AsyncStorage.setItem(STORAGE_KEY, String(value));
  }

  return [frames, update];
}

type Props = {
  value: number;
  onChange: (value: number) => void;
};

export default function ClipLengthControl({ value, onChange }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      {CLIP_LENGTH_PRESETS.map((preset) => {
        const active = value === preset.frames;
        return (
          <Pressable
            key={preset.label}
            onPress={() => onChange(preset.frames)}
            style={[
              styles.pill,
              { backgroundColor: active ? colors.surfaceElevated : colors.neuWell },
              active ? shadows.neuRaised("sm") : shadows.neuInset("sm"),
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${preset.label} clip length, ${preset.frames} frames`}
          >
            <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>{preset.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  row: {
    flexDirection: "row",
    borderRadius: 999,
    height: 50,
    padding: 5,
    gap: 5,
  } as ViewStyle,
  pill: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  pillLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: theme.name === "dark" ? "#8A93A3" : colors.textTertiary,
  },
  pillLabelActive: {
    color: colors.textPrimary,
  },
});
