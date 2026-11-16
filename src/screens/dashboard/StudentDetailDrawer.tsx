// One student, from the roster, Today or Progress (design T3, T11c): a
// drawer from the right on desktop, a full-screen page on a phone. Overall
// and per group, the student's sign tiles at teacher size (read-only, the
// same states and stars the student sees - learned / tried / not yet), their
// modules, and the call notes the teacher saved with them. Opaque sheer
// glass, because it shows gold stars and green marks.
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SideDrawer, CloseButton, RowMenu } from "./Overlays";
import { ActionButton, Avatar, ConfirmInline } from "./ManageKit";
import { PresenceDot } from "./CallHistory";
import { Bar } from "./TeacherToday";
import CurriculumTabs, { availableGroupFor } from "./CurriculumTabs";
import { StarRow } from "../../components/learn/Stars";
import { BookIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, TrashIcon, VideoIcon } from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { computeOverall, getGroup, groupKey, passedSince, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { moduleSigns, type CallBooking, type CallNoteRow, type ClassRow, type ModuleRow, type ProgressEmbed, type StudentProgressSummary } from "../../lib/queries";
import { bookingWords } from "../../lib/callSchedule";
import { starReference, starsText } from "../../lib/starReference";
import { signName } from "../../lib/signNames";
import { starsFor, tileStatus, type ProgressLike } from "../../lib/practiceFlow";
import { availableGroups, dueInfo, firstNameOf, soonGroupsText } from "../../lib/teacherInsights";
import type { PresenceStatus } from "../../lib/callSignaling";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

type Props = {
  student: StudentProgressSummary | null;
  klass: ClassRow;
  plan: ClassPlan;
  presence: PresenceStatus | undefined;
  rowsFor: (language: SignLanguage, group: SignGroup) => Map<string, ProgressEmbed[]> | null;
  ensureGroup: (language: SignLanguage, group: SignGroup) => void;
  modules: ModuleRow[];
  notes: CallNoteRow[];
  phone: boolean;
  onClose: () => void;
  onCall: () => void;
  /** Their next booked call (0017); undefined hides booking (table not there yet). */
  booking?: CallBooking | null;
  /** Book a call with them, or move `booking`. */
  onBook?: (booking: CallBooking | null) => void;
  onRemove: () => Promise<boolean>;
};

const asRow = (r: ProgressEmbed | undefined): ProgressLike | undefined =>
  r ? { attempts: r.attempts ?? 0, passes: r.passes, last_passed_at: null, best_confidence: r.best_confidence } : undefined;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function StudentDetailDrawer(props: Props) {
  const { student, onClose } = props;
  return (
    <SideDrawer visible={!!student} onClose={onClose} width={600}>
      {student ? <Detail key={student.id} {...props} student={student} /> : null}
    </SideDrawer>
  );
}

function Detail({ student, klass, plan, presence, rowsFor, ensureGroup, modules, notes, phone, onClose, onCall, onRemove, booking, onBook }: Props & { student: StudentProgressSummary }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [group, setGroup] = useState<SignGroup>("letters");
  const [confirm, setConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [tilesOpen, setTilesOpen] = useState(!phone);
  const first = firstNameOf(student.full_name);
  const overall = computeOverall(student.mastered, plan);
  const groups = availableGroups(plan);
  const mine = notes.filter((n) => n.student_id === student.id).sort((a, b) => b.started_at.localeCompare(a.started_at));

  useEffect(() => {
    ensureGroup(language, group);
  }, [language, group, ensureGroup]);
  useEffect(() => {
    for (const m of modules) ensureGroup(m.language, m.sign_group);
  }, [modules, ensureGroup]);

  const remove = async () => {
    setRemoving(true);
    const ok = await onRemove();
    setRemoving(false);
    if (ok) setConfirm(false);
  };

  const callLabel = `Call ${first}`;
  const callButton = (
    <ActionButton
      label={callLabel}
      variant={presence === "available" ? "primary" : "secondary"}
      size={phone ? "lg" : "md"}
      disabled={presence === "busy"}
      icon={(c) => <VideoIcon size={17} color={c} />}
      onPress={onCall}
      style={phone ? styles.fullWidth : undefined}
    />
  );
  // Their next booked call: they can only call you then (0017).
  const bookingStrip =
    booking !== undefined && onBook ? (
      <View style={[styles.bookingStrip, shadows.neuInset("sm")]}>
        <CalendarIcon size={17} color={colors.textOnGlass} />
        <Text style={[styles.bookingText, styles.flex]}>
          {booking ? `Next call: ${bookingWords(booking, Date.now())}` : `No call booked. ${first} can only call you at a time you book.`}
        </Text>
        <ActionButton label={booking ? "Change" : "Book a call"} size="sm" onPress={() => onBook(booking)} />
      </View>
    ) : null;
  const menu = (
    <RowMenu
      label={`More for ${student.full_name}`}
      items={[{ key: "remove", label: "Remove from class…", destructive: true, icon: (c) => <TrashIcon size={17} color={c} />, onPress: () => setConfirm(true) }]}
    />
  );

  const groupLine = [
    ...groups.map((g) => `${g.label} ${student.mastered[groupKey(g.language, g.group)] ?? 0}/${planSigns(g.language, g.group, plan).length}`),
    ...(soonGroupsText() ? [`${soonGroupsText()}: soon`] : []),
  ].join(" · ");

  // ---- tiles for the chosen group ----
  const signs = planSigns(language, group, plan);
  const bySign = new Map((rowsFor(language, group)?.get(student.id) ?? []).map((r) => [r.sign, r]));
  const loaded = rowsFor(language, group) !== null;
  const learnedCount = signs.filter((s) => tileStatus(asRow(bySign.get(s))) === "learned").length;
  const gDef = getGroup(language, group);
  const noun = group === "words" ? "words" : group === "numbers" ? "numbers" : "letters";

  const tiles = (
    <View style={styles.section}>
      <CurriculumTabs
        language={language}
        group={group}
        layout="row"
        note={false}
        onChange={(l, g) => {
          setLanguage(l);
          setGroup(availableGroupFor(l, g));
        }}
      />
      {gDef.available ? (
        <>
          <View style={styles.tilesHead}>
            <Text style={styles.subTitle}>
              {loaded ? `${learnedCount} of ${signs.length} ${noun} learned` : "Loading…"}
            </Text>
            <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <CheckIcon size={12} color={colors.successText} />
              <Text style={styles.legendText}>learned</Text>
              <Text style={styles.legendStar}>★</Text>
              <Text style={styles.legendText}>how well</Text>
              <View style={styles.legendRing} />
              <Text style={styles.legendText}>tried</Text>
            </View>
          </View>
          {signs.length === 0 ? (
            <Text style={styles.muted}>No {gDef.label.toLowerCase()} in the plan.</Text>
          ) : (
            <View style={styles.tiles}>
              {signs.map((s) => (
                <TeacherTile key={s} sign={s} language={language} group={group} row={asRow(bySign.get(s))} />
              ))}
            </View>
          )}
        </>
      ) : (
        <Text style={styles.muted}>{gDef.label}: soon. No model yet.</Text>
      )}
    </View>
  );

  const modulesBlock = (
    <View style={[styles.col, phone && styles.cardPhone]}>
      <Text style={styles.subTitle}>Modules</Text>
      {modules.length === 0 ? (
        <Text style={styles.muted}>No modules in {klass.name} yet.</Text>
      ) : (
        modules.map((m) => {
          const ms = moduleSigns(m);
          const rows = rowsFor(m.language, m.sign_group)?.get(student.id) ?? [];
          const set = new Set(ms);
          // Only passes since the module was made count toward it.
          const learned = rows.filter((r) => set.has(r.sign) && passedSince(r, m.created_at)).length;
          const done = ms.length > 0 && learned >= ms.length;
          const due = dueInfo(m.due_date);
          const dueText = !done && due.days !== null ? ` · ${due.tone === "overdue" ? "was due" : "due"} ${new Date(`${m.due_date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "";
          return (
            <View key={m.id} style={styles.moduleRow} accessible accessibilityLabel={`${m.title}: ${learned} of ${ms.length} learned${dueText}`}>
              <View style={styles.moduleHead}>
                <Text style={styles.moduleTitle} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.moduleMeta}>
                  {learned} of {ms.length}
                  {done ? " ✓" : dueText}
                </Text>
              </View>
              <Bar value={ms.length ? learned / ms.length : 0} height={6} tone={done ? "green" : "violet"} />
            </View>
          );
        })
      )}
    </View>
  );

  const callsBlock = (
    <View style={[styles.col, phone && styles.cardPhone]}>
      <Text style={styles.subTitle}>Calls with {first}</Text>
      {mine.length === 0 ? <Text style={styles.muted}>No saved call notes with {first} yet.</Text> : null}
      {mine.map((n) => {
        const passed = n.practice.filter((p) => p.passed);
        const date = new Date(n.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const line = n.practice.length
          ? `Practiced ${n.practice.map((p) => signName(p.language, p.sign)).join(", ")}${passed.length ? ` · got ${passed.map((p) => `${signName(p.language, p.sign)} (${Math.round(p.confidence * 100)}%)`).join(", ")}` : ""}`
          : "No practice";
        const open = openNote === n.id;
        return (
          <View key={n.id} style={[styles.note, shadows.neuRaised("sm")]}>
            <Pressable
              onPress={() => setOpenNote(open ? null : n.id)}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`Call on ${date}, ${clock(n.duration_seconds)} long. ${line}`}
              style={[styles.noteHead, webCursor]}
            >
              <View style={styles.flex}>
                <Text style={styles.noteTitle}>
                  {date} · {clock(n.duration_seconds)}
                </Text>
                <Text style={styles.noteLine} numberOfLines={open ? undefined : 1}>
                  {line}
                </Text>
              </View>
              <View style={open ? undefined : styles.chevRight}>
                <ChevronDownIcon size={14} color={colors.textOnGlass} />
              </View>
            </Pressable>
            {open ? (
              <View style={styles.noteBody}>
                <Text style={styles.noteLine}>
                  <Text style={styles.noteLabel}>{first} signed: </Text>
                  {n.student_text || "-"}
                </Text>
                <Text style={styles.noteLine}>
                  <Text style={styles.noteLabel}>You signed: </Text>
                  {n.teacher_text || "-"}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
      <Text style={styles.caption}>Only notes you saved after a call appear here.</Text>
    </View>
  );

  if (phone) {
    return (
      <View style={styles.phoneStack}>
        <View style={styles.phoneTop}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to students" style={[styles.backBtn, shadows.neuRaised("sm"), webCursor]}>
            <ChevronLeftIcon size={16} color={colors.textPrimary} />
          </Pressable>
          {menu}
        </View>
        <View style={styles.identity}>
          <Avatar name={student.full_name} color={colors.accentCoralText} size={56} />
          <View style={styles.flex}>
            <Text style={styles.name} accessibilityRole="header">
              {student.full_name}
            </Text>
            <PresenceDot status={presence} />
          </View>
        </View>
        {callButton}
        {bookingStrip}
        {confirm ? <ConfirmInline message={removeText(student, klass)} confirmLabel="Remove" busy={removing} onCancel={() => setConfirm(false)} onConfirm={remove} /> : null}
        <View style={[styles.overall, shadows.neuInset("sm")]}>
          <Text style={styles.overallValue}>{Math.round(overall * 100)}%</Text>
          <View style={styles.flex}>
            <Bar value={overall} height={8} />
            <Text style={styles.overallLabel}>Overall</Text>
          </View>
        </View>
        <View style={styles.cardPhone}>
          {groups.map((g) => {
            const total = planSigns(g.language, g.group, plan).length;
            const n = student.mastered[groupKey(g.language, g.group)] ?? 0;
            return (
              <View key={g.key} style={styles.moduleRow}>
                <View style={styles.moduleHead}>
                  <Text style={styles.moduleTitle}>{g.label}</Text>
                  <Text style={styles.moduleMeta}>
                    {n} of {total}
                  </Text>
                </View>
                <Bar value={total ? n / total : 0} height={6} />
              </View>
            );
          })}
          {soonGroupsText() ? <Text style={styles.caption}>{soonGroupsText()}: soon</Text> : null}
        </View>
        {modulesBlock}
        <Pressable
          onPress={() => setTilesOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: tilesOpen }}
          style={[styles.tilesToggle, shadows.neuRaised("sm"), webCursor]}
        >
          <BookIcon size={17} color={colors.textPrimary} />
          <Text style={[styles.noteTitle, styles.flex]}>Letter tiles and stars</Text>
          <View style={tilesOpen ? undefined : styles.chevRight}>
            <ChevronDownIcon size={14} color={colors.textOnGlass} />
          </View>
        </Pressable>
        {tilesOpen ? tiles : null}
        {callsBlock}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.header}>
        <Avatar name={student.full_name} color={colors.accentCoralText} size={60} />
        <View style={styles.flex}>
          <Text style={styles.name} accessibilityRole="header" numberOfLines={1}>
            {student.full_name}
          </Text>
          <View style={styles.headMeta}>
            <PresenceDot status={presence} />
            <Text style={styles.className}>{klass.name}</Text>
          </View>
        </View>
        {callButton}
        {menu}
        <CloseButton onPress={onClose} />
      </View>
      {bookingStrip}
      {confirm ? <ConfirmInline message={removeText(student, klass)} confirmLabel="Remove" busy={removing} onCancel={() => setConfirm(false)} onConfirm={remove} /> : null}
      <View style={[styles.overall, shadows.neuInset("sm")]} accessible accessibilityLabel={`Overall ${Math.round(overall * 100)}%. ${groupLine}`}>
        <View>
          <Text style={styles.overallValue}>{Math.round(overall * 100)}%</Text>
          <Text style={styles.overallLabel}>Overall</Text>
        </View>
        <View style={styles.flex}>
          <Bar value={overall} height={8} />
          <Text style={styles.groupLine}>{groupLine}</Text>
        </View>
      </View>
      {tiles}
      <View style={styles.cols}>
        {modulesBlock}
        {callsBlock}
      </View>
    </View>
  );
}

const removeText = (s: StudentProgressSummary, k: ClassRow) =>
  `Remove ${s.full_name || "this student"} from ${k.name}? Their account and progress stay; they just won't be in your class.`;

/** The student's tile at teacher size (52 x 60), read-only. State is shape as well as colour. */
function TeacherTile({ sign, language, group, row }: { sign: string; language: SignLanguage; group: SignGroup; row: ProgressLike | undefined }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const status = tileStatus(row);
  const stars = starsFor(row, starReference(language, group, sign));
  const words = group === "words";
  const name = signName(language, sign);
  const label =
    status === "learned" ? `${name}, learned, ${starsText(stars)}` : status === "tried" ? `${name}, tried, ${starsText(stars)}, not learned yet` : `${name}, not tried yet`;
  return (
    <View
      style={[
        words ? styles.wordTile : styles.tile,
        status === "learned" && styles.tileLearned,
        status === "tried" && styles.tileTried,
        status === "not-started" && styles.tileNone,
      ]}
      accessible
      accessibilityLabel={label}
    >
      <Text style={[words ? styles.wordText : styles.glyph, status === "not-started" && styles.glyphDim]} numberOfLines={1}>
        {name}
      </Text>
      {status === "not-started" ? null : <StarRow filled={stars} size={words ? 9 : 10} gap={1} />}
      {status === "learned" ? (
        <View style={styles.tileBadge}>
          <CheckIcon size={10} color={colors.textOnFrosted} strokeWidth={3.6} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  fullWidth: { alignSelf: "stretch" },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  name: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  headMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  className: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },
  overall: { flexDirection: "row", alignItems: "center", gap: 20, padding: 16, borderRadius: radii.md, backgroundColor: colors.neuWell, marginBottom: 18 },
  overallValue: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.textPrimary },
  overallLabel: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textOnGlass, marginTop: 4 },
  groupLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textOnGlass, marginTop: 8 },
  section: { gap: 14, marginBottom: 20 },
  tilesHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  subTitle: { fontFamily: fonts.heading, fontSize: 16.5, color: colors.textPrimary },
  legend: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass, marginRight: 6 },
  legendStar: { fontSize: 12, color: colors.starFilled },
  legendRing: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textOnGlass },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tile: { width: 52, height: 60, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: colors.neuBase },
  wordTile: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.neuBase },
  tileLearned: { borderWidth: 2, borderColor: colors.masteredRing },
  tileTried: { borderWidth: 2, borderColor: colors.accentCoral },
  tileNone: { backgroundColor: colors.neuWell },
  glyph: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 22, color: colors.textPrimary },
  wordText: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.textPrimary },
  glyphDim: { color: colors.textOnGlass },
  tileBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: theme.name === "dark" ? "rgba(48,54,68,1)" : colors.surfaceElevated,
  },
  muted: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  cols: { flexDirection: "row", gap: 22, alignItems: "flex-start" },
  col: { flex: 1, minWidth: 0, gap: 12 },
  moduleRow: { gap: 7 },
  moduleHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  moduleTitle: { flexShrink: 1, fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  moduleMeta: { fontFamily: fonts.body, fontSize: 12.5, color: colors.textOnGlass },
  note: { borderRadius: 16, backgroundColor: colors.neuBase, overflow: "hidden" },
  noteHead: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  noteTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  noteLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textOnGlass, marginTop: 2 },
  noteLabel: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  noteBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 2 },
  chevRight: { transform: [{ rotate: "-90deg" }] },
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textOnGlass },
  phoneStack: { gap: 16 },
  phoneTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  bookingStrip: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.neuWell, marginBottom: 14 },
  bookingText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19, color: colors.textPrimary },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  cardPhone: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.name === "dark" ? "rgba(255,255,255,0.1)" : colors.border,
    backgroundColor: theme.name === "dark" ? "rgba(255,255,255,0.04)" : colors.surfacePressed,
  },
  tilesToggle: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingHorizontal: 16, borderRadius: 18, backgroundColor: colors.neuBase },
});
