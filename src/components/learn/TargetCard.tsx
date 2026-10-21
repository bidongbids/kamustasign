// The sign the child is making, big, on a raised slab. Letters/numbers get
// the P4 hold ring: it fills while the target is held at PASS_CONFIDENCE and
// empties the moment it drops (LIVE_PASS_HOLD_MS, from the live screen).
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, kidTypography, radii, sizes } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";

type Props = {
  sign: string;
  /** Letters/numbers: show the hold ring. Words: no ring (nothing to hold). */
  showRing: boolean;
  /** 0-1. */
  holdProgress: number;
  compact?: boolean;
  reduceMotion?: boolean;
};

export default function TargetCard({ sign, showRing, holdProgress, compact, reduceMotion }: Props) {
  const size = compact ? sizes.targetSlabMobile : sizes.targetSlab;
  const p = Math.max(0, Math.min(1, reduceMotion ? Math.floor(holdProgress * 4) / 4 : holdProgress));
  const r = 88;
  const circ = 2 * Math.PI * r;
  const isGlyph = sign.length <= 2;
  const glyphSize = compact ? 72 : kidTypography.kidTarget.fontSize;
  // Size words so the longest single word fits on one line (Baloo 2 averages
  // ~0.58em per letter) - a word is never broken mid-word ("basketba / ll").
  const longest = Math.max(...sign.split(/\s+/).map((w) => w.length), 1);
  const maxWord = compact ? 28 : 40;
  const wordSize = Math.max(14, Math.min(maxWord, Math.floor((size - 28) / (longest * 0.58))));

  return (
    <View
      style={[styles.slab, { width: size, height: size }, neuRaised("lg")]}
      accessibilityRole="header"
      accessibilityLabel={`Target sign: ${sign}`}
    >
      {showRing && (
        <Svg width={size} height={size} viewBox="0 0 200 200" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Circle cx={100} cy={100} r={r} fill="none" stroke={colors.holdTrack} strokeWidth={10} />
          {p > 0 && (
            <Circle
              cx={100}
              cy={100}
              r={r}
              fill="none"
              stroke={colors.accentCoral}
              strokeWidth={10}
              strokeLinecap="round"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={circ * (1 - p)}
              transform="rotate(-90 100 100)"
            />
          )}
        </Svg>
      )}
      <Text
        style={[
          isGlyph ? kidTypography.kidTarget : kidTypography.kidTargetWord,
          {
            color: colors.accentCoral,
            fontSize: isGlyph ? glyphSize : wordSize,
            lineHeight: (isGlyph ? glyphSize : wordSize) * (isGlyph ? 1 : 1.1),
          },
          styles.text,
        ]}
        numberOfLines={isGlyph ? 1 : 3}
      >
        {sign}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slab: {
    backgroundColor: colors.neuBase,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: { textAlign: "center", paddingHorizontal: 14 },
});
