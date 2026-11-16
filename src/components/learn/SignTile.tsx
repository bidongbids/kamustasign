// One sign in the learning plan (classroom theming handoff §3.5, H2). State
// is shape, not just colour, and the tiles stay calm so the signs are what
// you see first:
//   learned  - a raised tile, a small check inside its top-right corner, stars
//   tried    - a raised tile with stars, no check
//   not yet  - no fill, a dashed outline, the sign in grey, nothing under it
//   next     - raised, an accent ring and a "NEXT" pill, and "start"
// All from lesson_progress.
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StarRow } from "./Stars";
import { CheckIcon } from "../icons/UiIcons";
import { fonts, kidTypography, sizes, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { focusFromKeyboard } from "../../lib/focusVisible";
import { type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { signName } from "../../lib/signNames";
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
  /** Letter/number tile width in px (76 on desktop, 58 on phones; never under 48). The tile is 1.1x as tall. */
  size?: number;
  /** Word tiles: fixed width so a category reads as an even grid. */
  width?: number;
};

export default function SignTile({ sign, language, group, word, row, isNext, onPress, size, width }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const w = Math.max(sizes.tapMin, size ?? 76);
  const big = w >= 70;
  const status = tileStatus(row);
  const stars = starsFor(row, starReference(language, group, sign));
  const learned = status === "learned";
  const notYet = status === "not-started";
  const name = signName(language, sign);

  const stateWords = notYet ? "not started" : learned ? `learned, ${starsText(stars)}` : `${starsText(stars)}, not learned yet`;
  // Untried signs carry no caption (a full row of "not yet" was noise); the
  // next one says where to begin.
  const hint = notYet && isNext ? "start" : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Practice ${name}, ${stateWords}${isNext ? ", next up" : ""}`}
      style={(state: any) => [
        styles.tile,
        word ? [styles.word, width ? { width, maxWidth: width } : null] : [styles.glyph, { width: w, height: Math.round(w * 1.1) }],
        notYet && !isNext ? styles.notYet : styles.raised,
        isNext && styles.next,
        state.pressed && { transform: [{ scale: 0.97 }] },
        state.focused && focusFromKeyboard() && styles.focused,
      ]}
    >
      {isNext && (
        <View style={[styles.nextChip, word && styles.nextChipWord]}>
          <Text style={styles.nextChipText}>NEXT</Text>
        </View>
      )}
      <Text
        style={[word ? styles.wordText : [styles.glyphText, { fontSize: big ? 30 : 22, lineHeight: big ? 32 : 24 }], notYet && !isNext && { color: colors.textTertiary }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      {hint ? (
        <Text style={[styles.hint, !big && !word && styles.hintSmall]}>{hint}</Text>
      ) : notYet ? null : (
        <StarRow filled={stars} size={word ? sizes.starSm : big ? 12 : 9} gap={2} />
      )}
      {learned ? (
        <View style={[styles.check, word ? styles.checkWord : !big && styles.checkSmall]}>
          <CheckIcon size={big || word ? 12 : 9} color={colors.onStatus} strokeWidth={3.5} />
        </View>
      ) : null}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
    tile: { alignItems: "center", justifyContent: "center" },
    glyph: { borderRadius: 18, gap: 4 },
    word: {
      minHeight: sizes.tileWordH,
      borderRadius: 999,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingLeft: 18,
      paddingRight: 34,
      gap: 10,
      maxWidth: 260,
    },
    raised: { backgroundColor: colors.surfaceRaised, ...theme.shadows.neuRaised("sm") },
    notYet: { backgroundColor: "transparent", borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.name === "dark" ? "rgba(255,255,255,0.16)" : colors.border },
    // A 2.5px accent ring on top of the raised shadow.
    next: {
      boxShadow: [
        { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 2.5, color: colors.accentText },
        ...((theme.shadows.neuRaised("sm") as any).boxShadow ?? []),
      ],
    } as any,
    focused: { outlineColor: colors.focusRing, outlineWidth: 2, outlineStyle: "solid", outlineOffset: 3 } as any,
    glyphText: { fontFamily: fonts.heading, color: colors.textPrimary },
    wordText: { ...kidTypography.kidLabel, color: colors.textPrimary, flexShrink: 1 },
    hint: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: colors.textTertiary },
    hintSmall: { fontSize: 9.5, lineHeight: 12 },
    check: {
      position: "absolute",
      top: 7,
      right: 7,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.success,
    },
    checkSmall: { top: 5, right: 5, width: 14, height: 14, borderRadius: 7 },
    checkWord: { top: undefined, right: 12 },
    nextChip: {
      position: "absolute",
      top: -10,
      alignSelf: "center",
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.accent,
      zIndex: 1,
    },
    nextChipWord: { left: 16, alignSelf: "auto" },
    nextChipText: { fontFamily: fonts.bodySemiBold, fontSize: 10, lineHeight: 12, letterSpacing: 0.6, color: colors.textOnAccent },
  });
