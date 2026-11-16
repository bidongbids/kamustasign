// Progress: the class at a glance for one group (ASL Letters, FSL Words…),
// built to be read in a few seconds and without colour:
//  1. four numbers - the class average, and how many students finished, are
//     still learning, or haven't started;
//  2. Students: one row each - name, a bar and "12 of 26", lowest first, with
//     what they're stuck on in words. A tap opens the student. "Grid" swaps
//     in the student x sign grid (learned = filled + check, tried = ring +
//     dot, not tried = empty) for a teacher who wants every cell;
//  3. To review: the signs most of the class tried but hasn't learned, with
//     one "Make a module" and one "Practice in a call" for the whole list;
//  4. Each sign: a tile per sign with how many learned it (under 30% gets a
//     gold outline and "few"), and the class average for each group.
// On a phone: the numbers, To review and the students list.
import React, { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";
import SegmentedToggle from "../../components/SegmentedToggle";
import CurriculumTabs, { availableGroupFor } from "./CurriculumTabs";
import { ActionButton, Avatar } from "./ManageKit";
import { Bar } from "./TeacherToday";
import { CheckIcon, ChevronRightIcon, GridIcon, VideoIcon } from "../../components/icons/UiIcons";
import { fonts, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { PASS_CONFIDENCE, getGroup, groupKey, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { signsToReview, type SignInsight } from "../../lib/classInsights";
import { signName } from "../../lib/signNames";
import { shareLearned, signGrid, soonGroupsText, type Cell, type classGroupAverages } from "../../lib/teacherInsights";
import type { ProgressEmbed, StudentProgressSummary } from "../../lib/queries";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;
const LOW_SHARE = 0.3;
const NAME_W = 150;
const WORDS_SHOWN = 36;
const PASS_PCT = Math.round(PASS_CONFIDENCE * 100);

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
  onPracticeInCall: () => void;
  phone: boolean;
  compact: boolean;
};

const nounFor = (group: SignGroup, n = 2) =>
  group === "letters" ? (n === 1 ? "letter" : "letters") : group === "numbers" ? (n === 1 ? "number" : "numbers") : n === 1 ? "word" : "words";

type StudentLine = { id: string; name: string; learned: number; tried: string[]; started: boolean };
type Status = "finished" | "learning" | "notStarted";
const statusOf = (s: StudentLine, total: number): Status => (total > 0 && s.learned >= total ? "finished" : s.started ? "learning" : "notStarted");

export default function TeacherProgress(props: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { students, plan, language, group, onTabs, rows, phone, compact } = props;
  const [sort, setSort] = useState<"lowest" | "name">("lowest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [allWords, setAllWords] = useState(false);
  const gDef = getGroup(language, group);
  const signs = useMemo(() => planSigns(language, group, plan), [language, group, plan]);
  const total = signs.length;
  const noun = nounFor(group);
  const name = (s: string) => signName(language, s);

  // One line per student for this group. With the group's rows loaded the
  // grid knows each sign; before that, the summary's mastered count.
  const grid = useMemo(() => (rows ? signGrid(students.map((s) => ({ id: s.id, name: s.full_name })), rows, signs) : null), [rows, students, signs]);
  const lines: StudentLine[] = useMemo(() => {
    const byId = new Map((grid ?? []).map((g) => [g.id, g]));
    return students.map((s) => {
      const g = byId.get(s.id);
      const learned = g ? g.learned : Math.min(total, s.mastered[groupKey(language, group)] ?? 0);
      return { id: s.id, name: s.full_name || "(no name)", learned, tried: g?.tried ?? [], started: learned > 0 || (g?.tried.length ?? 0) > 0 };
    });
  }, [grid, students, total, language, group]);
  const ordered = useMemo(
    () =>
      [...lines].sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name) : a.learned - b.learned || b.tried.length - a.tried.length || a.name.localeCompare(b.name)
      ),
    [lines, sort]
  );
  const average = lines.length && total ? lines.reduce((n, s) => n + s.learned / total, 0) / lines.length : 0;
  const counts = { finished: 0, learning: 0, notStarted: 0 };
  for (const s of lines) counts[statusOf(s, total)] += 1;

  const share = useMemo(() => (grid ? shareLearned(grid, signs) : []), [grid, signs]);
  const review = useMemo(() => (rows ? signsToReview(rows, signs, 5) : []), [rows, signs]);

  const tabs = (
    <CurriculumTabs language={language} group={group} layout="row" note={false} onChange={(l, g) => onTabs(l, availableGroupFor(l, g))} />
  );

  if (students.length === 0) {
    return (
      <View>
        <Header phone={phone} tabs={tabs} />
        <View style={[styles.card, styles.empty]}>
          <View style={styles.emptyIcon}>
            <GridIcon size={22} color={colors.primaryTealText} />
          </View>
          <Text style={styles.body}>Progress shows up here once students are in your class.</Text>
        </View>
      </View>
    );
  }

  const stats = (
    <View style={[styles.stats, phone && styles.statsPhone]}>
      <Stat
        value={`${Math.round(average * 100)}%`}
        label="Class average"
        caption={`of ${total} ${gDef.label.toLowerCase()}`}
        color={colors.primaryTealText}
        phone={phone}
      />
      <Stat value={String(counts.finished)} label="Finished" caption={`learned every ${nounFor(group, 1)}`} color={colors.successText} phone={phone} />
      <Stat value={String(counts.learning)} label="Still learning" caption="started, not done" color={colors.accentCoralText} phone={phone} />
      <Stat value={String(counts.notStarted)} label="Not started" caption={`no ${noun} tried yet`} color={colors.textPrimary} phone={phone} />
    </View>
  );

  const reviewCard = (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        To review
      </Text>
      <Text style={styles.cardSub}>Tried by many, learned by few. Good for a class demo, a module or a call.</Text>
      {!rows ? <Text style={styles.muted}>Loading…</Text> : null}
      {rows && review.length === 0 ? <Text style={styles.muted}>Nobody is stuck on a {nounFor(group, 1)} right now.</Text> : null}
      {review.length > 0 ? (
        <View style={styles.reviewList}>
          {review.map((s) => (
            <ReviewRow key={s.sign} insight={s} name={name(s.sign)} classSize={students.length} />
          ))}
        </View>
      ) : null}
      {review.length > 0 ? (
        <View style={styles.reviewActions}>
          <ActionButton
            label="Make a module"
            size="md"
            variant="primary"
            icon={(c) => <GridIcon size={16} color={c} />}
            onPress={() => props.onMakeModule(review.map((r) => r.sign))}
          />
          <ActionButton label="Practice in a call" size="md" icon={(c) => <VideoIcon size={16} color={c} />} onPress={props.onPracticeInCall} />
        </View>
      ) : null}
    </View>
  );

  const studentsCard = (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            Students
          </Text>
          <Text style={styles.cardSub}>
            {gDef.label} learned, out of {total}. Tap a name for details.
          </Text>
        </View>
        <View style={styles.headControls}>
          <SegmentedToggle
            options={[
              { key: "lowest", label: "Lowest first" },
              { key: "name", label: "A–Z" },
            ]}
            value={sort}
            onChange={setSort}
          />
          {!phone ? (
            <SegmentedToggle
              options={[
                { key: "list", label: "List" },
                { key: "grid", label: "Grid" },
              ]}
              value={view}
              onChange={setView}
            />
          ) : null}
        </View>
      </View>
      {view === "grid" && !phone ? (
        rows && grid ? (
          <SignGridView
            language={language}
            group={group}
            signs={signs}
            rows={ordered.map((s) => grid.find((g) => g.id === s.id)!).filter(Boolean)}
            onOpenStudent={props.onOpenStudent}
          />
        ) : (
          <Text style={styles.muted}>Loading…</Text>
        )
      ) : (
        <View>
          {ordered.map((s, i) => (
            <StudentRow key={s.id} line={s} total={total} noun={noun} name={name} first={i === 0} phone={phone} onPress={() => props.onOpenStudent(s.id)} />
          ))}
        </View>
      )}
    </View>
  );

  if (phone) {
    return (
      <View style={styles.stack}>
        <Header phone tabs={tabs} />
        {stats}
        {reviewCard}
        {studentsCard}
      </View>
    );
  }

  const words = group === "words";
  const signsShown = words && !allWords ? signs.slice(0, WORDS_SHOWN) : signs;
  return (
    <View style={styles.stack}>
      <Header phone={false} tabs={tabs} />
      {stats}
      <View style={styles.cols}>
        <View style={styles.main}>{studentsCard}</View>
        <View style={[styles.side, { width: compact ? 340 : 380 }]}>
          {reviewCard}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, styles.mb]} accessibilityRole="header">
              By group
            </Text>
            {props.groups.map((g) => (
              <View key={g.key} style={styles.groupRow} accessible accessibilityLabel={`${g.label}: ${Math.round(g.value * 100)}%`}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                <View style={styles.flex}>
                  <Bar value={g.value} height={8} tone="violet" />
                </View>
                <Text style={styles.groupPct}>{Math.round(g.value * 100)}%</Text>
              </View>
            ))}
            {soonGroupsText() ? <Text style={[styles.muted, styles.mt]}>{soonGroupsText()}: soon.</Text> : null}
          </View>
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle} accessibilityRole="header">
              Each {nounFor(group, 1)}
            </Text>
            <Text style={styles.cardSub}>How many of the {students.length} students learned it. A gold outline means fewer than a third.</Text>
          </View>
        </View>
        {!rows ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : (
          <>
            <View style={styles.tiles}>
              {signsShown.map((s) => {
                const i = signs.indexOf(s);
                const learned = Math.round((share[i] ?? 0) * students.length);
                return <SignShareTile key={s} name={name(s)} learned={learned} classSize={students.length} low={(share[i] ?? 0) < LOW_SHARE} word={words} />;
              })}
            </View>
            {words && signs.length > WORDS_SHOWN ? (
              <View style={styles.mt}>
                <ActionButton
                  label={allWords ? "Show fewer" : `Show all ${signs.length} words`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setAllWords((v) => !v)}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  );
}

function Header({ phone, tabs }: { phone: boolean; tabs: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.head, phone && styles.headPhone]}>
      <View style={styles.flex}>
        <Text style={[styles.title, phone && styles.titlePhone]} accessibilityRole="header">
          Progress
        </Text>
        {!phone ? <Text style={styles.lede}>How your class is doing. The same figures students see. One good try learns a sign.</Text> : null}
      </View>
      {tabs}
    </View>
  );
}

function Stat({ value, label, caption, color, phone }: { value: string; label: string; caption: string; color: string; phone: boolean }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.card, styles.stat, phone && styles.statPhone]} accessible accessibilityLabel={`${label}: ${value}, ${caption}`}>
      <Text style={[styles.statValue, phone && styles.statValuePhone, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!phone ? <Text style={styles.statCaption}>{caption}</Text> : null}
    </View>
  );
}

function StudentRow({
  line,
  total,
  noun,
  name,
  first,
  phone,
  onPress,
}: {
  line: StudentLine;
  total: number;
  noun: string;
  name: (s: string) => string;
  first: boolean;
  phone: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const status = statusOf(line, total);
  const value = total ? line.learned / total : 0;
  const stuck = line.tried.map(name);
  const detail =
    status === "finished"
      ? `Learned every one`
      : status === "notStarted"
        ? "Hasn't tried any yet"
        : stuck.length
          ? `Still trying: ${stuck.slice(0, 5).join(", ")}${stuck.length > 5 ? ` +${stuck.length - 5}` : ""}`
          : "Learning";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${line.name}: learned ${line.learned} of ${total} ${noun}. ${detail}. Open details`}
      style={({ pressed, hovered }: any) => [styles.row, !first && styles.rule, hovered && styles.rowHover, pressed && styles.rowPressed, webCursor]}
    >
      <Avatar name={line.name} size={36} />
      <View style={[styles.rowName, phone && styles.flex]}>
        <Text style={styles.nameText} numberOfLines={1}>
          {line.name}
        </Text>
        <Text style={[styles.detailText, status === "finished" && { color: colors.successText }]} numberOfLines={1}>
          {detail}
        </Text>
        {phone ? (
          <View style={styles.rowBarPhone}>
            <Bar value={value} height={8} />
          </View>
        ) : null}
      </View>
      {!phone ? (
        <View style={styles.rowBar}>
          <Bar value={value} height={10} />
        </View>
      ) : null}
      <View style={styles.rowCount}>
        {status === "finished" ? <CheckIcon size={14} color={colors.successText} strokeWidth={3.2} /> : null}
        <Text style={styles.countText}>
          {line.learned}
          <Text style={styles.countOf}> / {total}</Text>
        </Text>
      </View>
      <ChevronRightIcon size={14} color={colors.textTertiary} />
    </Pressable>
  );
}

function ReviewRow({ insight, name, classSize }: { insight: SignInsight; name: string; classSize: number }) {
  const styles = useThemedStyles(makeStyles);
  const total = Math.max(1, classSize);
  const best = insight.stuckBest !== null ? Math.round(insight.stuckBest * 100) : null;
  const words = `${insight.learned} of ${classSize} learned, ${insight.stuck} still trying${best !== null ? `, their best ${best}% (needs ${PASS_PCT}%)` : ""}`;
  return (
    <View style={styles.reviewRow} accessible accessibilityLabel={`${name}: ${words}`}>
      <View style={styles.reviewTile}>
        <Text style={[styles.reviewGlyph, name.length > 2 && styles.reviewWord]} numberOfLines={1} adjustsFontSizeToFit>
          {name}
        </Text>
      </View>
      <View style={styles.flex}>
        <Strip learned={insight.learned / total} stuck={insight.stuck / total} />
        <Text style={styles.reviewText} numberOfLines={1}>
          {insight.learned} learned · {insight.stuck} still trying
          {best !== null ? <Text style={styles.reviewBest}>{` · best ${best}%`}</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function SignShareTile({ name, learned, classSize, low, word }: { name: string; learned: number; classSize: number; low: boolean; word: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const value = classSize ? learned / classSize : 0;
  return (
    <View
      style={[styles.tile, word && styles.tileWord, low && styles.tileLow]}
      accessible
      accessibilityLabel={`${name}: ${learned} of ${classSize} learned${low ? ", few" : ""}`}
    >
      <Text style={[styles.tileGlyph, word && styles.tileGlyphWord]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.tileCount}>
        {learned}/{classSize}
        {low ? <Text style={styles.tileLowText}> · few</Text> : null}
      </Text>
      <View style={styles.tileBar}>
        <Bar value={value} height={5} tone={low ? "gold" : undefined} />
      </View>
    </View>
  );
}

/** The detailed student x sign grid ("Grid" view). */
function SignGridView({
  language,
  group,
  signs,
  rows,
  onOpenStudent,
}: {
  language: SignLanguage;
  group: SignGroup;
  signs: string[];
  rows: ReturnType<typeof signGrid>;
  onOpenStudent: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const words = group === "words";
  const [gridW, setGridW] = useState(0);
  // Letters and numbers fit the card (18-32px a cell); words scroll sideways.
  const pitch = !words && gridW > 0 ? Math.max(18, Math.min(32, Math.floor(gridW / Math.max(1, signs.length)))) : 28;
  const cellSize = pitch - 4;
  return (
    <View>
      <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <CellView cell="learned" size={16} />
        <Text style={styles.legendText}>Learned</Text>
        <CellView cell="tried" size={16} />
        <Text style={styles.legendText}>Tried, not yet</Text>
        <CellView cell="none" size={16} />
        <Text style={styles.legendText}>Not tried</Text>
      </View>
      <View style={styles.gridWrap}>
        <View style={{ width: NAME_W }}>
          <View style={{ height: words ? 92 : 30 }} />
          {rows.map((g) => (
            <Pressable
              key={g.id}
              onPress={() => onOpenStudent(g.id)}
              accessibilityRole="button"
              accessibilityLabel={`${g.name}: learned ${g.learned} of ${signs.length}.${g.tried.length ? ` Tried, not learned: ${g.tried.map((s) => signName(language, s)).join(", ")}.` : ""} Open details`}
              style={({ hovered }: any) => [styles.gridName, { height: pitch }, hovered && styles.rowHover, webCursor]}
            >
              <Text style={styles.gridNameText} numberOfLines={1}>
                {g.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView horizontal style={styles.flex} onLayout={(e) => setGridW(Math.floor(e.nativeEvent.layout.width) - 6)}>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={[styles.gridLabels, words && styles.gridLabelsWords]}>
              {signs.map((s) => (
                <View key={s} style={[styles.gridLabelCell, { width: pitch }, words && styles.gridLabelCellWords]}>
                  <Text style={[styles.gridLabel, words && styles.gridLabelWord]} numberOfLines={1}>
                    {signName(language, s)}
                  </Text>
                </View>
              ))}
            </View>
            {rows.map((g) => (
              <View key={g.id} style={[styles.cellRow, { height: pitch }]}>
                {g.cells.map((c, i) => (
                  <View key={signs[i]} style={{ width: pitch, alignItems: "center" }}>
                    <CellView cell={c} size={cellSize} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** Learned: filled + check. Tried, not yet: ring + dot. Not tried: an empty well. */
function CellView({ cell, size }: { cell: Cell; size: number }) {
  const styles = useThemedStyles(makeStyles);
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

/** Learned (green) / still trying (gold, striped) / not tried (empty): shape and pattern, not colour alone. */
function Strip({ learned, stuck }: { learned: number; stuck: number }) {
  const { colors } = useTheme();
  const l = Math.max(0, Math.min(1, learned)) * 100;
  const s = Math.max(0, Math.min(1 - learned, stuck)) * 100;
  return (
    <Svg width="100%" height={10} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <Pattern id="stillLearning" patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
          <Rect x={0} y={0} width={7} height={7} fill="rgba(242,178,62,0.45)" />
          <Rect x={0} y={0} width={3.5} height={7} fill={colors.accentCoral} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height={10} rx={5} fill={colors.neuWell} />
      {s > 0 ? <Rect x={`${l}%`} y={0} width={`${s}%`} height={10} fill="url(#stillLearning)" /> : null}
      {l > 0 ? <Rect x={0} y={0} width={`${l}%`} height={10} rx={3} fill={colors.success} /> : null}
    </Svg>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  const line = dark ? "rgba(255,255,255,0.08)" : colors.border;
  return StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    mb: { marginBottom: 12 },
    mt: { marginTop: 12 },
    stack: { gap: 20 },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 16, flexWrap: "wrap" },
    headPhone: { flexDirection: "column", gap: 12 },
    title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary },
    titlePhone: { fontSize: 26, lineHeight: 32 },
    lede: { fontFamily: fonts.body, fontSize: 14.5, color: colors.textOnGlass, marginTop: 6 },
    cols: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
    main: { flex: 1, minWidth: 0 },
    side: { gap: 20 },
    card: {
      padding: 20,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: dark ? "rgba(255,255,255,0.1)" : colors.border,
      backgroundColor: dark ? "rgba(255,255,255,0.05)" : colors.surface,
    },
    empty: { alignItems: "center", gap: 12, paddingVertical: 36 },
    emptyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
    cardHead: { flexDirection: "row", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 10 },
    headControls: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    cardTitle: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 25, color: colors.textPrimary },
    cardSub: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass, marginTop: 3 },
    body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass },
    muted: { fontFamily: fonts.body, fontSize: 13.5, color: colors.textOnGlass, paddingVertical: 8 },

    stats: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
    statsPhone: { gap: 10 },
    stat: { flex: 1, minWidth: 150, paddingVertical: 18, gap: 2 },
    statPhone: { minWidth: "45%" as any, flexBasis: "45%" as any, padding: 14 },
    statValue: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40 },
    statValuePhone: { fontSize: 26, lineHeight: 32 },
    statLabel: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    statCaption: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass },

    row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12 },
    rule: { borderTopWidth: 1, borderTopColor: line },
    rowHover: { backgroundColor: dark ? "rgba(255,255,255,0.04)" : "rgba(27,31,42,0.03)" },
    rowPressed: { opacity: 0.85 },
    rowName: { width: 260, minWidth: 0 },
    nameText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
    detailText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginTop: 2 },
    rowBar: { flex: 1, minWidth: 80 },
    rowBarPhone: { marginTop: 8 },
    rowCount: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 5, minWidth: 62 },
    countText: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary },
    countOf: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },

    reviewList: { marginTop: 8 },
    reviewRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 },
    reviewTile: {
      width: 46,
      height: 46,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 4,
      borderWidth: 1.5,
      borderColor: colors.accentCoral,
      backgroundColor: dark ? "rgba(242,178,62,0.08)" : "rgba(242,178,62,0.1)",
    },
    reviewGlyph: { fontFamily: fonts.heading, fontSize: 21, color: colors.textPrimary },
    reviewWord: { fontSize: 11 },
    reviewText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textOnGlass, marginTop: 6 },
    reviewBest: { color: colors.textTertiary },
    reviewActions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: line },

    groupRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7 },
    groupLabel: { width: 104, fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
    groupPct: { width: 44, textAlign: "right", fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },

    tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
    tile: {
      width: 74,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 14,
      alignItems: "center",
      gap: 3,
      borderWidth: 1.5,
      borderColor: dark ? "rgba(255,255,255,0.08)" : colors.border,
      backgroundColor: dark ? "rgba(255,255,255,0.03)" : colors.surfaceElevated,
    },
    tileWord: { width: 136, alignItems: "flex-start", paddingHorizontal: 12 },
    tileLow: { borderColor: colors.accentCoral },
    tileGlyph: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
    tileGlyphWord: { fontSize: 15, lineHeight: 21, fontFamily: fonts.bodySemiBold },
    tileCount: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass },
    tileLowText: { fontFamily: fonts.bodySemiBold, color: colors.accentCoralText },
    tileBar: { alignSelf: "stretch", marginTop: 4 },

    legend: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
    legendText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass, marginRight: 10 },
    gridWrap: { flexDirection: "row" },
    gridName: { justifyContent: "center", paddingRight: 8, paddingLeft: 4, borderRadius: 6 },
    gridNameText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textPrimary },
    gridLabels: { flexDirection: "row", height: 30, alignItems: "center" },
    gridLabelsWords: { height: 92, alignItems: "flex-end" },
    gridLabelCell: { alignItems: "center" },
    gridLabelCellWords: { height: 92, justifyContent: "flex-end", overflow: "visible" },
    gridLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
    gridLabelWord: { width: 86, textAlign: "left", fontSize: 11.5, transform: [{ rotate: "-90deg" }, { translateX: 36 }] },
    cellRow: { flexDirection: "row", alignItems: "center" },
    cell: { alignItems: "center", justifyContent: "center" },
    cellLearned: { backgroundColor: colors.heatLearned },
    cellTried: { borderWidth: 2, borderColor: colors.heatTried },
    cellDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.heatTried },
    cellNone: { backgroundColor: colors.heatNone },
  });
};
