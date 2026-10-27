// One sign in the learning plan - a raised neumorphic slab (tiles are
// controls). State is shape, not just colour: no stars (not started), stars
// filled by accuracy (tried - see starReference.ts), check + ring (learned),
// "Next" chip (next up).
// All from lesson_progress.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StarRow } from "./Stars";
import { CheckIcon } from "../icons/UiIcons";
import { colors, fonts, kidTypography, radii, sizes } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";
import { type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { starReference, starsText } from "../../lib/starReference";
import { starsFor, tileStatus, type ProgressLike } from "../../lib/practiceFlow";

type Props = {
  sign: string;
  language: SignLanguage;
  group: SignGroup;
  word?: boolean;
  row: ProgressLike | undefined;
  isNext?: boolean;
  onPress: () => void;
  /** Letter/number tile edge in px (default sizes.tileGlyph, never smaller). */
  size?: number;
  /** Word tiles: fixed width so a category reads as an even grid. */
  width?: number;
};

export default function SignTile({ sign, language, group, word, row, isNext, onPress, size, width }: Props) {
  const edge = Math.max(sizes.tileGlyph, size ?? sizes.tileGlyph);
  const glyphScale = edge / sizes.tileGlyph;
  const status = tileStatus(row);
  const stars = starsFor(row, starReference(language, group, sign));
  const learned = status === "learned";

  const stateWords =
    status === "not-started"
      ? "not started"
      : learned
        ? `learned, ${starsText(stars)}`
        : `${starsText(stars)}, not learned yet`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practise ${sign}, ${stateWords}${isNext ? ", next up" : ""}`}
      style={(state: any) => [
        styles.tile,
        word ? [styles.word, width ? { width, maxWidth: width, justifyContent: "space-between" } : null] : [styles.glyph, { width: edge, height: edge }],
        neuRaised("sm"),
        learned && styles.learned,
        isNext && styles.next,
        state.pressed && { transform: [{ scale: 0.97 }] },
        state.focused && styles.focused,
      ]}
    >
      {isNext && (
        <View style={[styles.nextChip, word && styles.nextChipWord]}>
          <Text style={styles.nextChipText}>NEXT</Text>
        </View>
      )}
      <Text
        style={[
          word ? styles.wordText : status === "not-started" ? styles.glyphText : styles.glyphTextSmall,
          status === "not-started" && { color: colors.textSecondary },
          !word && glyphScale > 1 && {
            fontSize: (status === "not-started" ? 30 : 26) * glyphScale,
            lineHeight: (status === "not-started" ? 30 : 28) * glyphScale,
          },
        ]}
        numberOfLines={1}
      >
        {sign}
      </Text>
      {status !== "not-started" && (
        <StarRow filled={stars} size={word ? sizes.starSm : Math.round(sizes.starSm * Math.min(glyphScale, 1.3))} />
      )}
      {learned ? (
        <View style={[styles.badge, styles.badgeCheck]}>
          <CheckIcon size={13} color={colors.textOnFrosted} strokeWidth={3.6} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    width: sizes.tileGlyph,
    height: sizes.tileGlyph,
    borderRadius: radii.md,
    gap: 4,
  },
  word: {
    minHeight: sizes.tileWordH,
    borderRadius: 999,
    flexDirection: "row",
    paddingLeft: 18,
    paddingRight: 16,
    gap: 10,
    maxWidth: 260,
  },
  learned: {
    borderWidth: 2,
    borderColor: colors.masteredRing,
  },
  next: {
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 6, color: "rgba(242,178,62,0.22)" },
      { offsetX: 0, offsetY: 0, blurRadius: 28, color: colors.celebrationGlow },
    ],
  } as any,
  focused: { outlineColor: colors.focusRing, outlineWidth: 2, outlineStyle: "solid", outlineOffset: 2 } as any,
  glyphText: { ...kidTypography.tileGlyph, color: colors.textPrimary },
  glyphTextSmall: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 28, color: colors.textPrimary, marginTop: 2 },
  wordText: { ...kidTypography.kidLabel, color: colors.textPrimary, flexShrink: 1 },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.neuBase,
  },
  badgeCheck: { backgroundColor: colors.success },
  nextChip: {
    position: "absolute",
    top: -10,
    alignSelf: "center",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.accentCoral,
    zIndex: 1,
  },
  nextChipWord: { left: 16, alignSelf: "auto" },
  nextChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10, lineHeight: 13, letterSpacing: 0.6, color: colors.textOnAccent },
});
