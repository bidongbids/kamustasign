// The Translator's "Now signing" ring (design_handoff_translator_fingerspelling
// §2.4, §4): the recognised letter on a raised disc, inside a ring that IS the
// hold timer. It replaces the old letter tile, the confidence dial and the
// "Hold progress 0/450 ms" bar - one gauge for one moment.
//   idle    - no letter yet: an empty ring and "?"
//   holding - gold arc filling with holdMs / commitMs
//   added   - full green ring
// Each state differs by text and ring, not by colour alone. With reduced
// motion the arc moves in 25% steps instead of following every frame.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { fonts, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";

export type HoldTone = "idle" | "holding" | "added";

type Props = {
  /** 0-1, the hold timer. */
  progress: number;
  glyph: string;
  size?: number;
  tone: HoldTone;
  reduceMotion?: boolean;
};

export default function HoldRing({ progress, glyph, size = 150, tone, reduceMotion }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const p = tone === "added" ? 1 : tone === "idle" ? 0 : reduceMotion ? Math.floor(clamped * 4) / 4 : clamped;
  const stroke = 8;
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const inset = size >= 110 ? 16 : 14;
  const disc = size - inset * 2;
  const base = Math.round(size * 0.47);
  // "space" / "delete" and two-digit numbers still fit the disc.
  const glyphSize =
    glyph.length <= 1 ? base : glyph.length === 2 ? Math.round(base * 0.78) : Math.min(base * 0.6, (disc * 0.84) / (glyph.length * 0.56));
  const unknown = glyph === "?";
  const pct = Math.round(p * 100);

  return (
    <View
      style={{ width: size, height: size, flexShrink: 0 }}
      accessibilityRole="progressbar"
      accessibilityLabel={unknown ? "No letter yet" : tone === "added" ? `${glyph}, added` : `${glyph}, holding`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.well} strokeWidth={stroke} />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone === "added" ? colors.success : colors.accentCoralText}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View
        style={[
          styles.disc,
          { top: inset, left: inset, width: disc, height: disc, borderRadius: disc / 2 },
          shadows.neuRaised("sm"),
        ]}
      >
        <Text
          style={[styles.glyph, { fontSize: glyphSize, lineHeight: Math.round(glyphSize * 1.05) }, unknown && styles.glyphUnknown]}
          numberOfLines={1}
        >
          {glyph}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    disc: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceRaised,
    },
    glyph: { fontFamily: fonts.heading, color: colors.textPrimary, textAlign: "center", includeFontPadding: false } as object,
    glyphUnknown: { color: colors.textTertiary },
  });
