// P8: Words as stages of 10 instead of one wall of pills. The order is the
// curriculum's (export_word_practice_order.py, easiest first) - this only
// slices it. Nothing is locked; only the current stage starts open.
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import GlassCard from "../GlassCard";
import SignTile from "./SignTile";
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "../icons/UiIcons";
import { colors, fonts, kidTypography, radii, sizes } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { isMastered, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { chunk, type ProgressLike } from "../../lib/practiceFlow";

type Props = {
  signs: string[];
  language: SignLanguage;
  group: SignGroup;
  rows: Map<string, ProgressLike>;
  nextSign: string | null;
  now: number;
  onPressSign: (sign: string) => void;
  chunkSize?: number;
  /** Wide screens: closed stages sit side by side (2), the open stage spans the row. */
  columns?: 1 | 2;
};

const CHALLENGE_STAGES = 4;

export default function WordPath({ signs, language, group, rows, nextSign, now, onPressSign, chunkSize = 10, columns = 1 }: Props) {
  const stages = useMemo(() => chunk(signs, chunkSize), [signs, chunkSize]);
  const doneCounts = stages.map((st) => st.filter((s) => isMastered(rows.get(s))).length);
  const firstOpen = doneCounts.findIndex((d, i) => d < stages[i].length);
  const current = firstOpen === -1 ? stages.length - 1 : firstOpen;
  const [open, setOpen] = useState<Set<number>>(() => new Set([current]));
  // Open stage: equal-width word tiles in balanced rows (10 -> 2 rows of 5)
  // instead of a ragged wrap of pills.
  const [tilesWidth, setTilesWidth] = useState(0);
  const TILE_GAP = 14;
  const wordWidth = (n: number) => {
    if (!tilesWidth) return undefined;
    const maxCols = Math.max(1, Math.floor((tilesWidth + TILE_GAP) / (150 + TILE_GAP)));
    const rowsNeeded = Math.ceil(n / maxCols);
    const cols = Math.ceil(n / rowsNeeded);
    return Math.floor((tilesWidth - (cols - 1) * TILE_GAP) / cols);
  };

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  return (
    <View style={styles.path}>
      {stages.map((stage, i) => {
        const done = doneCounts[i] === stage.length;
        const isCurrent = i === current && !done;
        const expanded = open.has(i);
        const tag = isCurrent
          ? "You are here"
          : i === 0
            ? "Start here"
            : stages.length > CHALLENGE_STAGES + 1 && i >= stages.length - CHALLENGE_STAGES
              ? "Challenge"
              : null;
        return (
          <GlassCard
            key={i}
            radius={radii.lg}
            padding={16}
            style={[
              expanded || columns === 1 ? styles.full : styles.half,
              isCurrent ? { borderColor: "rgba(242,178,62,0.45)" } : null,
            ]}
          >
            <Pressable
              onPress={() => toggle(i)}
              style={styles.header}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`Stage ${i + 1}${tag ? `, ${tag}` : ""}, ${doneCounts[i]} of ${stage.length} learned`}
            >
              <View style={[styles.disc, done ? styles.discDone : isCurrent ? styles.discCurrent : [styles.discAhead, neuInset("sm")]]}>
                {done ? (
                  <CheckIcon size={20} color={colors.textOnFrosted} strokeWidth={3.2} />
                ) : (
                  <Text style={[styles.discText, { color: isCurrent ? colors.textOnAccent : colors.textSecondary }]}>{i + 1}</Text>
                )}
              </View>
              <View style={styles.titleBlock}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>Stage {i + 1}</Text>
                  {tag && (
                    <View
                      style={[
                        styles.tag,
                        tag === "You are here" && styles.tagHere,
                        tag === "Start here" && styles.tagStart,
                        tag === "Challenge" && styles.tagChallenge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          tag === "You are here" && { color: colors.textOnAccent },
                          tag === "Start here" && { color: colors.success },
                          tag === "Challenge" && { color: colors.primaryTealLight },
                        ]}
                      >
                        {tag}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.pips}>
                  {stage.map((s) => (
                    <View key={s} style={[styles.pip, isMastered(rows.get(s)) && styles.pipOn]} />
                  ))}
                </View>
              </View>
              <Text style={styles.count}>
                {doneCounts[i]} of {stage.length}
              </Text>
              <View style={[styles.chevron, neuRaised("sm")]}>
                {expanded ? <ChevronUpIcon size={20} color={colors.textSecondary} /> : <ChevronDownIcon size={20} color={colors.textSecondary} />}
              </View>
            </Pressable>
            {expanded && (
              <View style={styles.tiles} onLayout={(e) => setTilesWidth(e.nativeEvent.layout.width)}>
                {stage.map((sign) => (
                  <SignTile
                    key={sign}
                    sign={sign}
                    language={language}
                    group={group}
                    word
                    row={rows.get(sign)}
                    isNext={sign === nextSign}
                    now={now}
                    width={wordWidth(stage.length)}
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

const styles = StyleSheet.create({
  path: { gap: 12, flexDirection: "row", flexWrap: "wrap" },
  full: { width: "100%" },
  half: { flexBasis: "40%", flexGrow: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: sizes.tapMin },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  discDone: { backgroundColor: colors.success },
  discCurrent: { backgroundColor: colors.accentCoral },
  discAhead: { backgroundColor: colors.neuWell },
  discText: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 22 },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { ...kidTypography.kidTitle, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  tagHere: { backgroundColor: colors.accentCoral },
  tagStart: { backgroundColor: "rgba(63,181,106,0.16)" },
  tagChallenge: { borderWidth: 1, borderColor: colors.primaryTealLight },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 14 },
  pips: { flexDirection: "row", gap: 4, marginTop: 6, flexWrap: "wrap" },
  pip: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neuWell, borderWidth: 1.5, borderColor: colors.adminGray },
  pipOn: { backgroundColor: colors.accentCoral, borderColor: colors.accentCoral },
  count: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  chevron: {
    width: sizes.tapMin,
    height: sizes.tapMin,
    borderRadius: 24,
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
  },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 16, paddingTop: 6 },
});
