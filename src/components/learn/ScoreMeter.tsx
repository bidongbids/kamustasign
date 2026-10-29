// One try's score on the practice screen and in a call: the same inset track
// as ProgressBar, filled gold below the pass mark and green at or above it,
// with a tick at PASS_CONFIDENCE and "80% to pass" under it, so a child sees
// how far they are from passing, not just a number.
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { fonts, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { PASS_CONFIDENCE } from "../../lib/curriculum";
import { PASS_PERCENT, percent } from "../../lib/learnCopy";

type Props = {
  /** 0-1; clamped. */
  value: number;
  style?: StyleProp<ViewStyle>;
};

export default function ScoreMeter({ value, style }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = percent(clamped);
  const passed = clamped >= PASS_CONFIDENCE;
  const fill: [string, string] = passed ? [colors.success, colors.success] : [colors.accentCoralDark, colors.accentCoral];

  return (
    <View
      style={[styles.wrap, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityLabel={`Score ${pct}%. ${PASS_PERCENT}% to pass.`}
    >
      <View style={[styles.track, shadows.neuInset("sm")]}>
        {pct > 0 && (
          <LinearGradient
            colors={fill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            // A sliver under ~3% would render as a dot; keep it a visible pill.
            style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]}
          />
        )}
      </View>
      <View style={[styles.mark, { left: `${PASS_PERCENT}%` }]} />
      {/* Ends at the tick, so it never runs past the track. */}
      <Text style={[styles.markLabel, { right: `${100 - PASS_PERCENT}%` }]} numberOfLines={1}>
        {PASS_PERCENT}% to pass
      </Text>
    </View>
  );
}

const TRACK_H = 12;

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    wrap: { height: TRACK_H + 18, justifyContent: "flex-start" },
    track: { height: TRACK_H, padding: 2, borderRadius: 999, backgroundColor: colors.neuWell, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 999 },
    mark: { position: "absolute", top: -3, width: 2, height: TRACK_H + 6, marginLeft: -1, borderRadius: 1, backgroundColor: colors.textSecondary },
    markLabel: {
      position: "absolute",
      top: TRACK_H + 3,
      marginRight: -1,
      fontFamily: fonts.bodySemiBold,
      fontSize: 11,
      lineHeight: 14,
      color: colors.textSecondary,
    },
  });
