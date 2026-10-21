// Student dashboard: the classroom's fixed learning plan (CLASSROOM_REDESIGN.md),
// in the Graphite Aurora student layout (design system: StudentPlanScreen).
// ASL/FSL, each split into Letters/Numbers/Words from src/lib/curriculum.ts;
// a tile per sign shows its stars / learned / resting state, and tapping one
// opens practice (PracticeScreen) with that sign as the target. Progress is
// read from and written to lesson_progress, scoped by RLS
// (0006_lesson_progress_rls.sql) - not just by what this screen asks for.
//
// Children see counts and stars, never percentages; the fill of every bar is
// still computeOverall()/groupFraction(), the same value teachers see as a %.
//
// The plan doesn't need a class: a student with no class can still practise,
// and joins one by typing their teacher's class code. In a class, the
// teacher's modules (0009_teacher_classroom.sql) appear above the tabs;
// picking one narrows the grid to its signs. Words can also be narrowed to
// one part of speech (CategoryFilter, wordCategories.ts).
import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import CurriculumTabs from "./CurriculumTabs";
import PracticeScreen from "./PracticeScreen";
import AuthButton from "../../components/auth/AuthButton";
import GlassCard from "../../components/GlassCard";
import ProgressBar from "../../components/ProgressBar";
import KidButton from "../../components/learn/KidButton";
import SignTile from "../../components/learn/SignTile";
import WordPath from "../../components/learn/WordPath";
import { StarRow } from "../../components/learn/Stars";
import JoinClassCard from "../../components/learn/JoinClassCard";
import ModuleStrip from "../../components/learn/ModuleStrip";
import CategoryFilter from "../../components/learn/CategoryFilter";
import { categoriesIn, filterByCategory, getWordCategory, type WordCategory } from "../../lib/wordCategories";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  MoonIcon,
  StarIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts, kidTypography, radii, sizes, spacing } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";
import {
  getMyProfile,
  getClassTeacher,
  getAllLessonProgress,
  getLessonProgress,
  getMasteredCounts,
  getModulesForClass,
  moduleSigns,
  toOne,
  type LessonProgressRow,
  type ModuleRow,
  type Profile,
} from "../../lib/queries";
import {
  CURRICULUM,
  computeOverall,
  getGroup,
  getLanguage,
  groupFraction,
  groupKey,
  isMastered,
  type MasteredCounts,
  type SignGroup,
  type SignLanguage,
  MASTERY_PASSES,
} from "../../lib/curriculum";
import { nextPracticeSign, starsFor, isResting } from "../../lib/practiceFlow";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import type { CallPeer } from "../../lib/callSignaling";

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

const GROUP_PLURAL: Record<SignGroup, string> = { letters: "letters", numbers: "numbers", words: "words" };

export default function StudentDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teacher, setTeacher] = useState<CallPeer | null>(null);
  const [mastered, setMastered] = useState<MasteredCounts>({});
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [group, setGroup] = useState<SignGroup>("letters");
  const [rows, setRows] = useState<Map<string, LessonProgressRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practising, setPractising] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  // Part-of-speech filter for Words; null = all. Cleared on any tab or module change.
  const [category, setCategory] = useState<WordCategory | null>(null);
  // Every progress row, keyed language:group:sign - the module cards count
  // across groups, unlike `rows` (the selected group only).
  const [allRows, setAllRows] = useState<Map<string, { passes: number }>>(new Map());
  const [joinedNote, setJoinedNote] = useState<string | null>(null);
  // Letter/number grid: tiles grow to fill the card in balanced full rows
  // (26 letters -> 2 rows of 13 on a wide screen) instead of a ragged wrap.
  const [gridWidth, setGridWidth] = useState(0);
  // Resting stars clear themselves as their cooldown ends.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const self: CallPeer | null = profile ? { id: profile.id, name: profile.full_name } : null;
  const call = useVideoCall(profile?.class_id ?? null, self);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setError(profileError?.message ?? "Couldn't load your profile.");
      setLoading(false);
      return;
    }
    const meProfile = me as Profile;
    setProfile(meProfile);

    const [counts, klass, mods, all] = await Promise.all([
      getMasteredCounts(meProfile.id),
      meProfile.class_id ? getClassTeacher(meProfile.class_id) : Promise.resolve({ data: null }),
      meProfile.class_id ? getModulesForClass(meProfile.class_id) : Promise.resolve({ data: [] as ModuleRow[], error: null }),
      getAllLessonProgress(meProfile.id),
    ]);
    if (counts.error) setError(counts.error.message);
    else setMastered(counts.data ?? {});
    const teacherProfile = toOne((klass.data as any)?.profiles ?? null);
    setTeacher(teacherProfile ? { id: teacherProfile.id, name: teacherProfile.full_name } : null);
    // A missing modules table (0009 not run yet) just means no modules.
    setModules(mods.error ? [] : mods.data.filter((m) => moduleSigns(m).length > 0));
    if (!all.error) {
      setAllRows(
        new Map(((all.data as any[]) ?? []).map((r) => [`${r.language}:${r.sign_group}:${r.sign}`, { passes: r.passes }]))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groupDef = getGroup(language, group);
  const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;
  // The signs on screen: the picked module's (teacher's order), else the
  // group's, narrowed to the chosen category for Words.
  const showCategories = !activeModule && group === "words";
  const signs = activeModule
    ? moduleSigns(activeModule)
    : filterByCategory(language, groupDef.signs, showCategories ? category : null);

  const selectModule = (id: string | null) => {
    setActiveModuleId(id);
    setCategory(null);
    const m = modules.find((x) => x.id === id);
    if (m) {
      setLanguage(m.language);
      setGroup(m.sign_group);
    }
  };

  const loadGroup = useCallback(async () => {
    if (!profile || !groupDef.available) {
      setRows(new Map());
      return;
    }
    setRows(new Map());
    setGroupLoading(true);
    const { data, error: err } = await getLessonProgress(profile.id, language, group);
    setGroupLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRows(new Map(((data as LessonProgressRow[]) ?? []).map((r) => [r.sign, r])));
  }, [profile, language, group, groupDef.available]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // Back from practice: re-read the bars, and (via the fresh profile ->
  // loadGroup effect) the tiles, so what the student sees is what the
  // database now holds - and what their teacher sees.
  const handlePracticeDone = () => {
    setPractising(null);
    load();
  };

  const handleRowUpdate = useCallback((row: LessonProgressRow) => {
    setRows((prev) => new Map(prev).set(row.sign, row));
    setAllRows((prev) => new Map(prev).set(`${row.language}:${row.sign_group}:${row.sign}`, { passes: row.passes }));
  }, []);

  if (call.callState !== "idle") {
    return (
      <VideoCallScreen
        callState={call.callState}
        incomingCallFrom={call.incomingCallFrom}
        peer={call.peer}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        error={call.error}
        acceptCall={call.acceptCall}
        declineCall={call.declineCall}
        hangUp={call.hangUp}
        role="student"
        remoteSettings={call.remoteSettings}
        sendSettings={call.sendSettings}
        requestSettings={call.requestSettings}
        accentColor={accentColor}
      />
    );
  }

  if (practising && profile) {
    return (
      <PracticeScreen
        studentId={profile.id}
        language={language}
        group={group}
        sign={practising}
        signs={signs}
        rows={rows}
        accentColor={accentColor}
        onRowUpdate={handleRowUpdate}
        onChangeSign={setPractising}
        onDone={handlePracticeDone}
      />
    );
  }

  const masteredHere = mastered[groupKey(language, group)] ?? 0;
  const totalLearned = CURRICULUM.reduce(
    (sum, l) => sum + l.groups.filter((g) => g.available).reduce((s, g) => s + (mastered[groupKey(l.language, g.group)] ?? 0), 0),
    0
  );
  const nextUp = groupDef.available && !groupLoading ? nextPracticeSign(signs, rows, null, now) : null;
  const masteredInModule = activeModule ? signs.filter((s) => (rows.get(s)?.passes ?? 0) >= MASTERY_PASSES).length : 0;
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const lang = getLanguage(language);
  const availableHere = lang.groups.filter((g) => g.available).map((g) => g.label);
  const GRID_GAP = 14;
  const tileSize = (() => {
    const n = signs.length;
    if (!gridWidth || n === 0) return sizes.tileGlyph;
    const maxCols = Math.max(1, Math.floor((gridWidth + GRID_GAP) / (sizes.tileGlyph + GRID_GAP)));
    const rowsNeeded = Math.ceil(n / maxCols);
    const cols = Math.ceil(n / rowsNeeded);
    return Math.min(96, Math.floor((gridWidth - (cols - 1) * GRID_GAP) / cols));
  })();

  const helloCard = (
    <GlassCard
      radius={radii.lg}
      padding={isDesktop ? 22 : 18}
      style={isDesktop ? styles.fill : styles.helloMobile}
      contentStyle={isDesktop ? styles.helloContent : undefined}
    >
      <Text style={styles.hello}>Hi{firstName ? `, ${firstName}` : ""}!</Text>
      <ProgressBar
        value={computeOverall(mastered)}
        label={`${totalLearned} sign${totalLearned === 1 ? "" : "s"} learned`}
        caption="All your groups together."
        readout="count"
        size="kid"
      />
    </GlassCard>
  );

  const nextUpCard = (
    <>
      {nextUp ? (
        isDesktop ? (
          <GlassCard radius={radii.lg} padding={18} style={styles.fill} contentStyle={styles.nextContent}>
            <Text style={styles.eyebrow}>NEXT UP</Text>
            <View style={styles.nextRow}>
              <View style={[styles.nextGlyph, neuRaised("sm")]}>
                <Text style={[styles.nextGlyphText, nextUp.length > 2 && { fontSize: 15, lineHeight: 18 }]} numberOfLines={2}>
                  {nextUp}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.nextLabel}>
                  {activeModule ? activeModule.title : `${lang.label} ${groupDef.label}`}
                </Text>
                <StarRow filled={starsFor(rows.get(nextUp))} resting={isResting(rows.get(nextUp), now)} size={16} />
              </View>
            </View>
            <KidButton
              variant="primary"
              label={`Practise ${nextUp}`}
              onPress={() => setPractising(nextUp)}
              iconRight={<ArrowRightIcon size={20} color={colors.textOnAccent} />}
            />
          </GlassCard>
        ) : (
          <KidButton
            variant="primary"
            label={`Next up: ${nextUp}`}
            onPress={() => setPractising(nextUp)}
            iconRight={<ArrowRightIcon size={20} color={colors.textOnAccent} />}
          />
        )
      ) : null}
    </>
  );

  const tabsBlock = (
    <View style={styles.tabs}>
      <CurriculumTabs
        audience="student"
        layout={isDesktop ? "row" : "stacked"}
        language={language}
        group={group}
        onChange={(l, g) => {
          setActiveModuleId(null);
          setCategory(null);
          setLanguage(l);
          setGroup(g);
        }}
      />
    </View>
  );

  const moduleStrip = (
    <ModuleStrip
      modules={modules}
      activeId={activeModuleId}
      onSelect={selectModule}
      lookup={(l, g, s) => allRows.get(`${l}:${g}:${s}`)}
      accentColor={accentColor}
    />
  );

  const groupBlock = (
    <>
    {groupDef.available ? (
      <DashboardCard tint="sheer" style={styles.groupCard}>
        {activeModule ? (
          <ProgressBar
            value={signs.length ? masteredInModule / signs.length : 0}
            label={`${activeModule.title}: ${masteredInModule} of ${signs.length} learned`}
            caption={activeModule.description ?? undefined}
            readout="count"
            size="kid"
          />
        ) : (
          <ProgressBar
            value={groupFraction(language, group, mastered)}
            label={`${masteredHere} of ${groupDef.signs.length} ${GROUP_PLURAL[group]} learned`}
            readout="count"
            size="kid"
          />
        )}
        <View style={styles.legend}>
          <LegendItem icon={<StarIcon size={15} color={colors.starEmpty} filled={false} />} label="Not yet" />
          <LegendItem icon={<StarIcon size={15} color={colors.starFilled} />} label="Star = 1 good try" />
          <LegendItem
            icon={
              <View style={[styles.legendBadge, { backgroundColor: colors.success }]}>
                <CheckIcon size={11} color={colors.textOnFrosted} strokeWidth={3.6} />
              </View>
            }
            label="Learned"
          />
          <LegendItem
            icon={
              <View style={[styles.legendBadge, styles.legendMoon]}>
                <MoonIcon size={11} color={colors.starResting} />
              </View>
            }
            label="Resting"
          />
        </View>

        {groupLoading && rows.size === 0 ? (
          <View style={styles.skeletonRow}>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={[styles.skeletonTile, neuInset("sm")]} />
            ))}
          </View>
        ) : group === "words" ? (
          <View style={styles.pathWrap}>
            {showCategories ? (
              <View style={styles.categoryWrap}>
                <CategoryFilter
                  options={categoriesIn(language, groupDef.signs).map((c) => ({
                    ...c,
                    learned: groupDef.signs.filter(
                      (sg) => getWordCategory(language, sg) === c.key && isMastered(rows.get(sg))
                    ).length,
                  }))}
                  value={category}
                  onChange={setCategory}
                  total={groupDef.signs.length}
                  accentColor={accentColor}
                />
              </View>
            ) : null}
            <WordPath
              key={`${language}:${group}:${activeModuleId ?? "all"}:${category ?? "all"}`}
              signs={signs}
              rows={rows}
              nextSign={nextUp}
              now={now}
              onPressSign={setPractising}
              columns={isDesktop ? 2 : 1}
            />
          </View>
        ) : (
          <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
            {signs.map((sign) => (
              <SignTile
                key={sign}
                sign={sign}
                row={rows.get(sign)}
                isNext={sign === nextUp}
                now={now}
                size={tileSize}
                onPress={() => setPractising(sign)}
              />
            ))}
          </View>
        )}
      </DashboardCard>
    ) : (
      <DashboardCard tint="sheer" style={styles.groupCard}>
        <View style={styles.soonHead}>
          <ClockIcon size={18} color={colors.accentCoral} />
          <Text style={styles.soonTitle}>
            {lang.label} {groupDef.label} are coming soon
          </Text>
        </View>
        <Text style={styles.msgBody}>
          The computer is still learning these signs.
          {availableHere.length ? ` You can practise ${availableHere.join(" and ")} now.` : ""}
        </Text>
        <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {groupDef.signs.map((sign) => (
            <View key={sign} style={styles.ghostTile}>
              <Text style={styles.ghostText}>{sign}</Text>
            </View>
          ))}
        </View>
      </DashboardCard>
    )}
    </>
  );

  const callCard = (
    <>
    {profile?.class_id ? (
      <>
        {!isDesktop && <Text style={ds.sectionTitle}>Call your teacher</Text>}
        <GlassCard radius={radii.lg} padding={18} style={isDesktop ? styles.fill : undefined} contentStyle={isDesktop ? styles.nextContent : undefined}>
          {isDesktop && <Text style={styles.eyebrow}>CALL YOUR TEACHER</Text>}
          {teacher ? (
            <View style={styles.callCol}>
              <View>
                <Text style={styles.msgTitle}>{teacher.name}</Text>
                <Text style={styles.msgBody}>Your teacher</Text>
              </View>
              <AuthButton label="Call" accentColor={accentColor} onPress={() => call.startCall(teacher)} />
            </View>
          ) : (
            <Text style={styles.msgBody}>Your class doesn't have a teacher yet.</Text>
          )}
        </GlassCard>
      </>
    ) : (
      <JoinClassCard
        style={isDesktop ? styles.fill : styles.noClass}
        onJoined={(name) => {
          setJoinedNote(`You joined ${name}!`);
          load();
        }}
      />
    )}
    </>
  );

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Student"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
      contentMaxWidth={1600}
    >
      {error ? (
        <GlassCard radius={radii.lg} padding={18} style={styles.errorCard} contentStyle={styles.msgRow}>
          <View style={[styles.msgIcon, neuInset("sm")]}>
            <AlertCircleIcon size={24} color={colors.needsPractice} />
          </View>
          <View style={styles.flex} accessibilityHint={error}>
            <Text style={styles.msgTitle}>We couldn't load your signs</Text>
            <Text style={styles.msgBody}>Check the internet, then try again.</Text>
            <KidButton small label="Try again" onPress={load} style={styles.msgAction} />
          </View>
        </GlassCard>
      ) : null}

      {joinedNote ? (
        <GlassCard radius={radii.lg} padding={14} style={styles.errorCard} contentStyle={styles.msgRow}>
          <CheckIcon size={20} color={colors.success} />
          <Text style={[styles.msgBody, styles.flex]}>{joinedNote}</Text>
          <KidButton small variant="ghost" label="OK" onPress={() => setJoinedNote(null)} />
        </GlassCard>
      ) : null}

      {loading && !profile ? (
        <GlassCard radius={radii.lg} padding={20} style={styles.top}>
          <View style={styles.skeletonBar} />
          <View style={styles.skeletonRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.skeletonTile, neuInset("sm")]} />
            ))}
          </View>
          <Text style={[styles.msgBody, { marginTop: 14 }]}>Getting your signs…</Text>
        </GlassCard>
      ) : (
        <>
          {isDesktop ? (
            // Desktop: one summary row of three equal-height cards across the
            // full width, centred tabs, then the signs - every block shares
            // the same left and right edges.
            <View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryHello}>{helloCard}</View>
                {nextUp ? <View style={styles.summaryCell}>{nextUpCard}</View> : null}
                <View style={styles.summaryCell}>{callCard}</View>
              </View>
              {moduleStrip}
              <View style={styles.tabsCentered}>{tabsBlock}</View>
              {groupBlock}
            </View>
          ) : (
            <>
              {helloCard}
              {nextUpCard}
              {moduleStrip}
              {tabsBlock}
              {groupBlock}
              {callCard}
            </>
          )}
        </>
      )}
    </DashboardShell>
  );
}

function LegendItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {icon}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  top: { marginTop: spacing.sm },
  hero: { flexDirection: "row", gap: 20, marginTop: spacing.sm, alignItems: "stretch" },
  heroMobile: { flexDirection: "column", gap: 12 },
  hello: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.textPrimary, marginBottom: 12 },
  nextCard: {},
  helloMobile: { marginTop: spacing.sm, marginBottom: 12 },
  fill: { flex: 1 },
  helloContent: { flex: 1, justifyContent: "center" },
  summaryRow: { flexDirection: "row", alignItems: "stretch", gap: 20, marginTop: spacing.sm },
  summaryHello: { flex: 1.3, minWidth: 0 },
  summaryCell: { flex: 1, minWidth: 0 },
  tabsCentered: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  msgRowCentered: { flex: 1, alignItems: "center" },
  nextContent: { gap: 12, flex: 1, justifyContent: "space-between" },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1.1, color: colors.textSecondary },
  nextRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  nextGlyph: {
    width: sizes.tileGlyph,
    height: sizes.tileGlyph,
    borderRadius: radii.md,
    backgroundColor: colors.neuBase,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  nextGlyphText: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 36, color: colors.accentCoral, textAlign: "center" },
  nextLabel: { ...kidTypography.kidBody, color: colors.textPrimary, marginBottom: 4 },
  tabs: { marginTop: 0, marginBottom: 4 },
  groupCard: { marginTop: spacing.md },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 14, marginBottom: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  legendBadge: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  legendMoon: { backgroundColor: colors.neuWell, borderWidth: 1.5, borderColor: colors.starResting },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 14, paddingTop: 8 },
  pathWrap: { marginTop: 14 },
  categoryWrap: { marginBottom: 12 },
  ghostTile: {
    width: sizes.tileGlyph,
    height: sizes.tileGlyph,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { ...kidTypography.tileGlyph, fontSize: 24, color: colors.textTertiary },
  soonHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  soonTitle: { ...kidTypography.kidTitle, fontSize: 20, color: colors.textPrimary, flexShrink: 1 },
  errorCard: { marginBottom: spacing.md, borderColor: "rgba(224,82,95,0.5)" },
  noClass: { marginTop: spacing.lg },
  msgRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  msgIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
  },
  msgTitle: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 24, color: colors.textPrimary },
  msgBody: { ...kidTypography.kidBody, color: colors.textSecondary },
  msgAction: { alignSelf: "flex-start", marginTop: 12 },
  callCol: { gap: 12 },
  skeletonBar: { height: 16, borderRadius: 999, backgroundColor: colors.neuWell },
  skeletonRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 14 },
  skeletonTile: { width: sizes.tileGlyph, height: sizes.tileGlyph, borderRadius: radii.md, backgroundColor: colors.neuWell },
});
