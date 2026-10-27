// Progress (design T8, T11d): the class at a glance, readable without
// colour. A column chart of the share of the class that learned each sign
// (columns under 30% turn gold and are listed in "to review"), and a student
// x sign grid in three shapes - learned (filled + check), tried but not
// learned (ring + dot), not tried (empty well). Each student row is one
// screen-reader sentence; the cells are skipped. Beside it: the signs to
// review as a three-part strip (learned / still learning, striped / not
// tried) with the counts in words, and each group's class average.
// On a phone: "to review" and a lowest-first list; a tap opens the student.
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import SegmentedToggle from "../../components/SegmentedToggle";
import CurriculumTabs, { availableGroupFor } from "./CurriculumTabs";
import { RowMenu } from "./Overlays";
import { Bar } from "./TeacherToday";
import { CheckIcon, GridIcon, VideoIcon } from "../../components/icons/UiIcons";
import { colors, fonts, radii } from "../../theme/theme";
import { neuRaised } from "../../theme/shadows";
import { computeOverall, getGroup, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { signsToReview, type SignInsight } from "../../lib/classInsights";
import { shareLearned, signGrid, soonGroupsText, type Cell, type classGroupAverages } from "../../lib/teacherInsights";
import type { ProgressEmbed, StudentProgressSummary } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const PITCH = 23;
const CELL = 20;
const CHART_H = 40;
const NAME_W = 96;
const LOW_SHARE = 0.3;

type Props = {
  students: StudentProgressSummary[];
  plan: ClassPlan;
  language: SignLanguage;
  group: SignGroup;
  onTabs: (language: SignLanguage, group: SignGroup) => void;
  rows: Map<string, ProgressEmbed[]> | null;
  groups: ReturnType<typeof classGroupAverages>;
  onOpenStudent: (id: string) => void;
  onMakeModule: (signs: string[]) => void;
  onPractiseInCall: () => void;
  phone: boolean;
  compact: boolean;
};

const nounFor = (group: SignGroup, n = 2) => (group === "letters" ? (n === 1 ? "letter" : "letters") : group === "numbers" ? (n === 1 ? "number" : "numbers") : n === 1 ? "word" : "words");

export default function TeacherProgress(props: Props) {
  const { students, plan, language, group, onTabs, rows, phone, compact } = props;
  const [sort, setSort] = useState<"overall" | "name">("overall");
  const gDef = getGroup(language, group);
  const signs = useMemo(() => planSigns(language, group, plan), [language, group, plan]);
  const ordered = useMemo(
    () =>
      [...students].sort((a, b) =>
        sort === "name" ? a.full_name.localeCompare(b.full_name) : computeOverall(a.mastered, plan) - computeOverall(b.mastered, plan) || a.full_name.localeCompare(b.full_name)
      ),
    [students, sort, plan]
  );
  const grid = useMemo(() => (rows ? signGrid(ordered.map((s) => ({ id: s.id, name: s.full_name })), rows, signs) : []), [rows, ordered, signs]);
  const share = useMemo(() => shareLearned(grid, signs), [grid, signs]);
  const review = useMemo(() => (rows ? signsToReview(rows, signs, 6) : []), [rows, signs]);
  const groupTitle = gDef.label;
  // Letters and numbers fit the card: the cells size to the space (18-26px
  // pitch). Words (80+) keep 23px and scroll sideways.
  const [gridW, setGridW] = useState(0);
  const pitch = group !== "words" && gridW > 0 ? Math.max(18, Math.min(26, Math.floor(gridW / Math.max(1, signs.length)))) : PITCH;
  const cellSize = pitch - 3;

  const tabs = (
    <CurriculumTabs
      language={language}
      group={group}
      layout="row"
      note={false}
      onChange={(l, g) => onTabs(l, availableGroupFor(l, g))}
    />
  );

  const reviewCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        {groupTitle} to review
      </Text>
      {!phone ? <Text style={styles.body}>Most tried but not learned. Good for a whole-class demo, a module or a call.</Text> : null}
      {!rows ? <Text style={styles.muted}>Loading…</Text> : null}
      {rows && review.length === 0 ? <Text style={styles.muted}>Nobody is stuck on a {nounFor(group, 1)} right now.</Text> : null}
      {review.map((s, i) => (
        <ReviewSignRow
          key={s.sign}
          insight={s}
          classSize={students.length}
          first={i === 0}
          phone={phone}
          onMakeModule={() => props.onMakeModule(review.map((r) => r.sign))}
          onPractise={props.onPractiseInCall}
        />
      ))}
    </View>
  );

  if (students.length === 0) {
    return (
      <View>
        <Header phone={phone} tabs={tabs} />
        <View style={[styles.card, styles.empty]}>
          <View style={[styles.emptyIcon, neuRaised("sm")]}>
            <GridIcon size={22} color={colors.primaryTealText} />
          </View>
          <Text style={styles.body}>Progress shows up here once students are in your class.</Text>
        </View>
      </View>
    );
  }

  if (phone) {
    return (
      <View style={styles.stack}>
        <Header phone tabs={tabs} />
        {reviewCard}
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            Lowest first
          </Text>
          {[...students]
            .sort((a, b) => computeOverall(a.mastered, plan) - computeOverall(b.mastered, plan))
            .map((s) => {
              const o = computeOverall(s.mastered, plan);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => props.onOpenStudent(s.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.full_name}, ${Math.round(o * 100)}% overall. Open details`}
                  style={({ pressed }) => [styles.lowRow, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.lowName} numberOfLines={1}>
                    {s.full_name}
                  </Text>
                  <View style={styles.lowBar}>
                    <Bar value={o} height={6} />
                  </View>
                  <Text style={styles.lowPct}>{Math.round(o * 100)}%</Text>
                </Pressable>
              );
            })}
        </View>
      </View>
    );
  }

  const words = group === "words";
  return (
    <View>
      <Header phone={false} tabs={tabs} />
      <View style={styles.cols}>
        <View style={[styles.card, styles.main]}>
          <View style={styles.gridHead}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              Who learned which {nounFor(group, 1)}
            </Text>
            <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <CellView cell="learned" />
              <Text style={styles.legendText}>Learned</Text>
              <CellView cell="tried" />
              <Text style={styles.legendText}>Tried, not yet</Text>
              <CellView cell="none" />
              <Text style={styles.legendText}>Not tried</Text>
            </View>
            <View style={styles.flex} />
            <SegmentedToggle
              options={[
                { key: "overall", label: "Sort: Overall" },
                { key: "name", label: "Name" },
              ]}
              value={sort}
              onChange={setSort}
            />
          </View>
          {!rows ? (
            <Text style={styles.muted}>Loading…</Text>
          ) : (
            <View style={styles.gridWrap}>
              <View style={{ width: NAME_W }}>
                <View style={{ height: CHART_H + (words ? 84 : 26) }}>
                  <Text style={styles.chartLabel}>% of class learned</Text>
                </View>
                {grid.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => props.onOpenStudent(g.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.name}: learned ${g.learned} of ${signs.length} ${nounFor(group)}.${
                      g.tried.length ? ` Tried, not learned: ${g.tried.join(", ")}.` : ""
                    } Open details`}
                    style={({ hovered }: any) => [styles.nameCell, { height: pitch }, hovered && styles.nameHover, webCursor]}
                  >
                    <Text style={styles.nameText} numberOfLines={1}>
                      {g.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ScrollView
                horizontal
                style={styles.flex}
                contentContainerStyle={styles.gridScroll}
                onLayout={(e) => setGridW(Math.floor(e.nativeEvent.layout.width) - 6)}
              >
                <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Svg width={signs.length * pitch} height={CHART_H}>
                    {share.map((v, i) => {
                      const h = Math.max(3, v * CHART_H);
                      return (
                        <Rect
                          key={signs[i]}
                          x={i * pitch + 1}
                          y={CHART_H - h}
                          width={cellSize}
                          height={h}
                          rx={3}
                          fill={v < LOW_SHARE ? colors.accentCoral : colors.primaryTeal}
                        />
                      );
                    })}
                  </Svg>
                  <View style={[styles.labels, words && styles.labelsWords]}>
                    {signs.map((s) => (
                      <View key={s} style={[styles.labelCell, { width: pitch }, words && styles.labelCellWords]}>
                        <Text style={[styles.label, words && styles.labelWord]} numberOfLines={1}>
                          {s}
                        </Text>
                      </View>
                    ))}
                  </View>
                  {grid.map((g) => (
                    <View key={g.id} style={[styles.cellRow, { height: pitch }]}>
                      {g.cells.map((c, i) => (
                        <View key={signs[i]} style={[styles.cellSlot, { width: pitch }]}>
                          <CellView cell={c} size={cellSize} />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
        <View style={[styles.side, { width: compact ? 340 : 400 }]}>
          {reviewCard}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, styles.mb]} accessibilityRole="header">
              By group
            </Text>
            {props.groups.map((g) => (
              <View key={g.key} style={styles.groupRow} accessible accessibilityLabel={`${g.label}: ${Math.round(g.value * 100)}%`}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                <View style={styles.flex}>
                  <Bar value={g.value} height={7} tone="violet" />
                </View>
                <Text style={styles.groupPct}>{Math.round(g.value * 100)}%</Text>
              </View>
            ))}
            <Text style={[styles.muted, styles.mt]}>{soonGroupsText()}: soon.</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Header({ phone, tabs }: { phone: boolean; tabs: React.ReactNode }) {
  return (
    <View style={[styles.head, phone && styles.headPhone]}>
      <View style={styles.flex}>
        <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
          Progress
        </Text>
        {!phone ? <Text style={styles.lede}>The same figures students see on their own dashboard. One good try learns a sign.</Text> : null}
      </View>
      {tabs}
    </View>
  );
}

/** Learned: filled + check. Tried, not yet: ring + dot. Not tried: an empty well. */
function CellView({ cell, size = CELL }: { cell: Cell; size?: number }) {
  const box = { width: size, height: size, borderRadius: Math.round(size / 4) };
  if (cell === "learned") {
    return (
      <View style={[styles.cell, box, styles.cellLearned]}>
        <CheckIcon size={Math.round(size * 0.6)} color="#FFFFFF" strokeWidth={3.2} />
      </View>
    );
  }
  if (cell === "tried") {
    return (
      <View style={[styles.cell, box, styles.cellTried]}>
        <View style={styles.cellDot} />
      </View>
    );
  }
  return <View style={[styles.cell, box, styles.cellNone]} />;
}

function ReviewSignRow({
  insight,
  classSize,
  first,
  phone,
  onMakeModule,
  onPractise,
}: {
  insight: SignInsight;
  classSize: number;
  first: boolean;
  phone: boolean;
  onMakeModule: () => void;
  onPractise: () => void;
}) {
  const learned = insight.learned;
  const stuck = insight.stuck;
  const notTried = Math.max(0, classSize - insight.tried);
  const total = Math.max(1, classSize);
  const best = insight.stuckBest !== null ? Math.round(insight.stuckBest * 100) : null;
  const words = `${learned} of ${classSize} learned · ${stuck} still learning · ${insight.attempts} tries${best !== null ? ` · best ${best}% (pass 80%)` : ""}`;
  return (
    <View style={[styles.reviewRow, !first && styles.rule]}>
      <View style={[styles.reviewTile, neuRaised("sm")]}>
        <Text style={[styles.reviewGlyph, insight.sign.length > 2 && styles.reviewWord]} numberOfLines={1} adjustsFontSizeToFit>
          {insight.sign}
        </Text>
      </View>
      <View style={styles.flex} accessible accessibilityLabel={`${insight.sign}: ${words}. ${notTried} haven't tried it.`}>
        <Strip learned={learned / total} stuck={stuck / total} />
        <Text style={styles.reviewText} numberOfLines={phone ? 1 : 2}>
          {phone ? `${learned} of ${classSize} learned` : words}
        </Text>
      </View>
      {!phone ? (
        <RowMenu
          label={`More for ${insight.sign}`}
          items={[
            { key: "module", label: "Make a module from these", icon: (c) => <GridIcon size={16} color={c} />, onPress: onMakeModule },
            { key: "call", label: "Practise in a call", icon: (c) => <VideoIcon size={16} color={c} />, onPress: onPractise },
          ]}
        />
      ) : null}
    </View>
  );
}

/** Learned (green) / still learning (gold, striped) / not tried (dark): shape and pattern, not colour alone. */
function Strip({ learned, stuck }: { learned: number; stuck: number }) {
  const l = Math.max(0, Math.min(1, learned)) * 100;
  const s = Math.max(0, Math.min(1 - learned, stuck)) * 100;
  return (
    <Svg width="100%" height={12} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id="stillLearning" patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <Rect x={0} y={0} width={7} height={7} fill="rgba(242,178,62,0.45)" />
          <Rect x={0} y={0} width={3.5} height={7} fill={colors.accentCoral} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height={12} rx={6} fill={colors.neuWell} />
      {s > 0 ? <Rect x={`${l}%`} y={0} width={`${s}%`} height={12} fill="url(#stillLearning)" /> : null}
      {l > 0 ? <Rect x={0} y={0} width={`${l}%`} height={12} rx={3} fill={colors.success} /> : null}
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  mb: { marginBottom: 12 },
  mt: { marginTop: 12 },
  stack: { gap: 16 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  headPhone: { flexDirection: "column", gap: 12, marginBottom: 0 },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
  titlePhone: { fontSize: 26, lineHeight: 32 },
  lede: { fontFamily: fonts.body, fontSize: 14.5, color: colors.textOnGlass, marginTop: 6 },
  cols: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
  main: { flex: 1, minWidth: 0 },
  side: { gap: 18 },
  card: {
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  empty: { alignItems: "center", gap: 12, paddingVertical: 36 },
  emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass, marginTop: 6, marginBottom: 4 },
  muted: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass, paddingVertical: 8 },
  gridHead: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass, marginRight: 8 },
  gridWrap: { flexDirection: "row" },
  gridScroll: { paddingRight: 6 },
  chartLabel: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.textOnGlass, marginTop: 4, marginRight: 8 },
  labels: { flexDirection: "row", height: 26, alignItems: "center" },
  labelsWords: { height: 84, alignItems: "flex-end" },
  labelCell: { width: PITCH, alignItems: "center" },
  labelCellWords: { height: 84, justifyContent: "flex-end", overflow: "visible" },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.textPrimary },
  labelWord: { width: 80, textAlign: "left", fontSize: 11, transform: [{ rotate: "-90deg" }, { translateX: 34 }] },
  nameCell: { height: PITCH, justifyContent: "center", paddingRight: 8, borderRadius: 6 },
  nameHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  nameText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textPrimary },
  cellRow: { flexDirection: "row", height: PITCH, alignItems: "center" },
  cellSlot: { width: PITCH, alignItems: "center" },
  cell: { width: CELL, height: CELL, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  cellLearned: { backgroundColor: colors.heatLearned },
  cellTried: { borderWidth: 2, borderColor: colors.heatTried },
  cellDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.heatTried },
  cellNone: { backgroundColor: colors.heatNone },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12 },
  rule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  reviewTile: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase, paddingHorizontal: 4 },
  reviewGlyph: { fontFamily: fonts.heading, fontSize: 20, color: colors.textPrimary },
  reviewWord: { fontSize: 11 },
  reviewText: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnGlass, marginTop: 6 },
  groupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  groupLabel: { width: 96, fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  groupPct: { width: 40, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  lowRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  lowName: { flex: 1.2, minWidth: 0, fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  lowBar: { flex: 1 },
  lowPct: { width: 40, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
});
