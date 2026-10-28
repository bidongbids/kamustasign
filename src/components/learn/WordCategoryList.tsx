// P8: Words by category (parts of speech, wordCategories.ts) instead of one
// wall of pills. Inside each category the order is the curriculum's -
// export_word_practice_order.py, the words the model recognises most
// reliably first - so a child starts each category with the signs the
// computer is best at checking. Nothing is locked; the category holding the
// "Next" sign starts open (or the only one, when there is just one).
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import SignTile from "./SignTile";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../icons/UiIcons";
import { fonts, kidTypography, radii, sizes, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { isMastered, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { type ProgressLike } from "../../lib/practiceFlow";
import { WORD_CATEGORIES, getWordCategory } from "../../lib/wordCategories";

export type WordSection = { key: string; title: string; signs: string[] };

/** Splits `signs` by category, in WORD_CATEGORIES order, keeping their order inside each. */
export function sectionsByCategory(language: SignLanguage, signs: string[]): WordSection[] {
  return WORD_CATEGORIES.map((c) => ({
    key: c.key,
    title: c.label,
    signs: signs.filter((s) => getWordCategory(language, s) === c.key),
  })).filter((s) => s.signs.length > 0);
}

type Props = {
  sections: WordSection[];
  language: SignLanguage;
  group: SignGroup;
  rows: Map<string, ProgressLike>;
  nextSign: string | null;
  onPressSign: (sign: string) => void;
  /** Wide screens: closed categories sit side by side (2), an open one spans the row. */
  columns?: 1 | 2;
};

const TILE_GAP = 14;

export default function WordCategoryList({ sections, language, group, rows, nextSign, onPressSign, columns = 1 }: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const initiallyOpen = useMemo(() => {
    if (sections.length === 1) return sections[0].key;
    return sections.find((s) => nextSign !== null && s.signs.includes(nextSign))?.key ?? sections[0]?.key ?? null;
    // Only on mount: the list is re-keyed by its parent when the filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [open, setOpen] = useState<Set<string>>(() => new Set(initiallyOpen ? [initiallyOpen] : []));
  // Equal-width word tiles in balanced rows instead of a ragged wrap.
  const [tilesWidth, setTilesWidth] = useState(0);
  const wordWidth = (n: number) => {
    if (!tilesWidth) return undefined;
    const maxCols = Math.max(1, Math.floor((tilesWidth + TILE_GAP) / (150 + TILE_GAP)));
    const rowsNeeded = Math.ceil(n / maxCols);
    const cols = Math.ceil(n / rowsNeeded);
    return Math.floor((tilesWidth - (cols - 1) * TILE_GAP) / cols);
  };

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <View style={styles.list}>
      {sections.map((section) => {
        const learned = section.signs.filter((s) => isMastered(rows.get(s))).length;
        const total = section.signs.length;
        const done = learned === total;
        const hasNext = nextSign !== null && section.signs.includes(nextSign);
        const expanded = open.has(section.key);
        return (
          <GlassCard
            key={section.key}
            radius={radii.lg}
            padding={16}
            style={[
              expanded || columns === 1 ? styles.full : styles.half,
              hasNext ? { borderColor: "rgba(242,178,62,0.45)" } : null,
            ]}
          >
            <Pressable
              onPress={() => toggle(section.key)}
              style={styles.header}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${section.title}${hasNext ? ", next sign is here" : ""}, ${learned} of ${total} learned`}
            >
              <View style={[styles.disc, done ? styles.discDone : hasNext ? styles.discNext : [styles.discAhead, shadows.neuInset("sm")]]}>
                {done ? (
                  <CheckIcon size={20} color={colors.textOnFrosted} strokeWidth={3.2} />
                ) : (
                  <Text style={[styles.discText, { color: hasNext ? colors.textOnAccent : colors.textSecondary }]}>
                    {section.title[0]}
                  </Text>
                )}
              </View>
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{section.title}</Text>
                  {hasNext && !done ? (
                    <View style={styles.tag}>
                      <Text style={styles.tagText}>Next sign here</Text>
                    </View>
                  ) : null}
                </View>
                <View style={[styles.track, shadows.neuInset("sm")]}>
                  <View style={[styles.fill, { width: `${total ? (learned / total) * 100 : 0}%` }]} />
                </View>
              </View>
              <Text style={styles.count}>
                {learned} of {total}
              </Text>
              <View style={[styles.chevron, shadows.neuRaised("sm")]}>
                {expanded ? <ChevronUpIcon size={20} color={colors.textSecondary} /> : <ChevronDownIcon size={20} color={colors.textSecondary} />}
              </View>
            </Pressable>
            {expanded && (
              <View style={styles.tiles} onLayout={(e) => setTilesWidth(e.nativeEvent.layout.width)}>
                {section.signs.map((sign) => (
                  <SignTile
                    key={sign}
                    sign={sign}
                    language={language}
                    group={group}
                    word
                    row={rows.get(sign)}
                    isNext={sign === nextSign}
                    width={wordWidth(Math.min(section.signs.length, 10))}
                    onPress={() => onPressSign(sign)}
                  />
                ))}
              </View>
            )}
          </GlassCard>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  list: { gap: 12, flexDirection: "row", flexWrap: "wrap" },
  full: { width: "100%" },
  half: { flexBasis: "40%", flexGrow: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: sizes.tapMin },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  discDone: { backgroundColor: colors.success },
  discNext: { backgroundColor: colors.accentCoral },
  discAhead: { backgroundColor: colors.neuWell },
  discText: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 22 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { ...kidTypography.kidTitle, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.accentCoral },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14, color: colors.textOnAccent },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.neuWell, marginTop: 8, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: colors.accentCoral },
  count: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  chevron: {
    width: sizes.tapMin,
    height: sizes.tapMin,
    borderRadius: 24,
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP, marginTop: 16, paddingTop: 6 },
});
