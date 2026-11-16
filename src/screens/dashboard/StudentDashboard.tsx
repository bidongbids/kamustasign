// Student dashboard: the classroom's fixed learning plan (docs/CLASSROOM_REDESIGN.md),
// laid out as in docs/design/design_handoff_classroom_theming (frames H1-H3b,
// H6): one thing at a time. A strip on top of every tab says hello, counts the
// signs learned and keeps the teacher one tap from Call; under it three tabs:
//   Today           - Next up (the hero), the nearest module, and a card per group
//   My signs        - ASL/FSL, Letters/Numbers/Words, the tile grid
//   From my teacher - the teacher's modules, and the teacher's card with Call
// On phones the tabs are the shell's bottom tab bar. The last tab used is
// remembered on the device.
//
// The data is unchanged: ASL/FSL, each split into Letters/Numbers/Words from
// src/lib/curriculum.ts; tapping a sign opens practice (PracticeScreen).
// Progress is read from and written to lesson_progress, scoped by RLS
// (0006_lesson_progress_rls.sql) - not just by what this screen asks for.
//
// Children see counts and stars, never percentages; the fill of every bar is
// still computeOverall()/groupFraction(), the same value teachers see as a %.
//
// The plan doesn't need a class: a student with no class can still practice,
// and joins one by typing their teacher's class code. The teacher's learning
// plan (class_word_plans, 0012) decides which words appear at all, and every
// count and bar here is over those words (curriculum.ts planSigns).
//
// `guest`: the offline Classroom - practice with no account, opened from the
// start screen when there's no internet. Today and My signs over every sign
// (no class plan), progress read from and saved on this device
// (localProgress.ts); nothing from a teacher, no calls, no account menu.
import React, { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DashboardShell from "./DashboardShell";
import CurriculumTabs from "./CurriculumTabs";
import PracticeScreen from "./PracticeScreen";
import GlassCard from "../../components/GlassCard";
import ProgressBar from "../../components/ProgressBar";
import KidButton from "../../components/learn/KidButton";
import SignTile from "../../components/learn/SignTile";
import WordCategoryList, { sectionsByCategory } from "../../components/learn/WordCategoryList";
import { StarRow } from "../../components/learn/Stars";
import JoinClassCard from "../../components/learn/JoinClassCard";
import CategoryFilter from "../../components/learn/CategoryFilter";
import { categoriesIn, filterByCategory, getWordCategory, type WordCategory } from "../../lib/wordCategories";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  HandIcon,
  HomeIcon,
  PhoneIcon,
  VideoIcon,
  WifiOffIcon,
} from "../../components/icons/UiIcons";
import { fonts, kidTypography, radii, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../theme/responsive";
import {
  getMyProfile,
  getClassTeacher,
  getAllLessonProgress,
  getClassPlan,
  getLessonProgress,
  getMissedCalls,
  getMyBookings,
  markMissedCallsSeen,
  type CallBooking,
  type MissedCallRow,
  getModulesForClass,
  moduleSigns,
  toOne,
  type LessonProgressRow,
  type ModuleRow,
  type Profile,
} from "../../lib/queries";
import { bookingWords, dayWords, studentCallGate, timeWords } from "../../lib/callSchedule";
import { useNow } from "../../hooks/useNow";
import { teacherShortName } from "../../lib/teacherInsights";
import {
  CURRICULUM,
  computeOverall,
  countMastered,
  getGroup,
  getLanguage,
  groupFraction,
  groupInPlan,
  groupKey,
  isMastered,
  passedSince,
  planSigns,
  type ClassPlan,
  type MasteredCounts,
  type SignGroup,
  type SignLanguage,
} from "../../lib/curriculum";
import { nextPracticeSign, type ProgressLike } from "../../lib/practiceFlow";
import { getLocalGroupProgress, getLocalProgress, recordLocalAttempt } from "../../lib/localProgress";
import { signName } from "../../lib/signNames";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import { formatWhen, PresenceDot } from "./CallHistory";
import type { CallPeer } from "../../lib/callSignaling";

type Props = {
  accentColor: string;
  /** Signed in: the account menu's Sign out. Not in guest mode. */
  onSignOut?: () => void;
  onExitToStart: () => void;
  /** The Account panel changed the name or 2FA - App reloads the profile. */
  onAccountChange?: () => void;
  /** The Translator button in the header. */
  onOpenTranslator: () => void;
  /** The offline Classroom: no account, progress on this device (see the top). */
  guest?: boolean;
  /** Guest mode: where onExitToStart goes, in words ("Back to log in"). */
  exitLabel?: string;
  /** Signed in: "Practice offline" on the can't-load card - the guest Classroom. */
  onPracticeOffline?: () => void;
};

type Tab = "today" | "signs" | "teacher";
const TAB_KEY = "kamustasign:studentTab";
const TABS: { key: Tab; label: string; icon: (color: string, size?: number) => React.ReactNode }[] = [
  { key: "today", label: "Today", icon: (c, s = 18) => <HomeIcon size={s} color={c} /> },
  { key: "signs", label: "My signs", icon: (c, s = 18) => <HandIcon size={s} color={c} /> },
  { key: "teacher", label: "From my teacher", icon: (c, s = 18) => <BookIcon size={s} color={c} /> },
];

const GROUP_PLURAL: Record<SignGroup, string> = { letters: "letters", numbers: "numbers", words: "words" };
const GROUP_ONE: Record<SignGroup, string> = { letters: "letter", numbers: "number", words: "word" };
const TILE_MAX = 76;
const TILE_GAP = 9;

type Target = { language: SignLanguage; group: SignGroup; sign: string };

/** "Sun, Nov 1" for a module's YYYY-MM-DD due date. */
function dueDay(date: string): { short: string; days: number } {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    short: day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    days: Math.round((day.getTime() - today.getTime()) / 86400000),
  };
}
const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : n > 1 ? `in ${n} days` : n === -1 ? "yesterday" : `${-n} days ago`);

export default function StudentDashboard({
  accentColor,
  onSignOut,
  onExitToStart,
  onAccountChange,
  onOpenTranslator,
  guest = false,
  exitLabel = "Back to log in",
  onPracticeOffline,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { isDesktop, isMobile } = useResponsive();
  const [tab, setTabState] = useState<Tab>("today");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teacher, setTeacher] = useState<CallPeer | null>(null);
  const [mastered, setMastered] = useState<MasteredCounts>({});
  const [plan, setPlan] = useState<ClassPlan>({});
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [group, setGroup] = useState<SignGroup>("letters");
  const [rows, setRows] = useState<Map<string, LessonProgressRow>>(new Map());
  // Which group `rows` holds, once loaded - practice waits for it (see `pending`).
  const [rowsKey, setRowsKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [groupLoading, setGroupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [practicing, setPracticing] = useState<string | null>(null);
  // A sign to practice in another group: opens once that group's rows are in.
  const [pending, setPending] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  // The module being practiced from (its signs are practice's "Next sign" order).
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  // Part-of-speech filter for Words; null = all. Cleared on any tab change.
  const [category, setCategory] = useState<WordCategory | null>(null);
  // Every progress row, keyed language:group:sign - for the cards and modules
  // that count across groups, unlike `rows` (the selected group only).
  // last_passed_at: a module only counts passes since it was made.
  const [allRows, setAllRows] = useState<Map<string, { passes: number; last_passed_at: string | null }>>(new Map());
  const [joinedNote, setJoinedNote] = useState<string | null>(null);
  const [missedCalls, setMissedCalls] = useState<MissedCallRow[]>([]);
  // Booked calls (0017): the student can only call in their booked time.
  // null = not loaded, or no 0017 table - then calls work as before.
  const [bookings, setBookings] = useState<CallBooking[] | null>(null);
  const now = useNow();
  const [gridWidth, setGridWidth] = useState(0);
  // Guest mode has no profile to wait for: this says the first read is done.
  const [guestLoaded, setGuestLoaded] = useState(false);
  // No teacher without an account, so no "From my teacher".
  const tabs = guest ? TABS.filter((t) => t.key !== "teacher") : TABS;

  useEffect(() => {
    AsyncStorage.getItem(TAB_KEY)
      .then((t) => {
        if (t === "today" || t === "signs" || (t === "teacher" && !guest)) setTabState(t);
      })
      .catch(() => {});
  }, [guest]);
  const setTab = (t: Tab) => {
    setTabState(t);
    AsyncStorage.setItem(TAB_KEY, t).catch(() => {});
  };

  const self: CallPeer | null = profile ? { id: profile.id, name: profile.full_name } : null;
  const call = useVideoCall(profile?.class_id ?? null, self);

  // Missed calls: on load, and again whenever a call (or an unanswered
  // ring) is over, since the teacher may have just left one.
  const profileId = profile?.id ?? null;
  const loadMissed = useCallback(async () => {
    if (!profileId) return;
    const { data } = await getMissedCalls(profileId);
    setMissedCalls(data);
  }, [profileId]);
  // Every minute too, so a call the teacher just booked shows up.
  const loadBookings = useCallback(async () => {
    if (!profileId) return;
    const res = await getMyBookings(profileId);
    if (res.missing) setBookings(null);
    else if (!res.error) setBookings(res.data);
  }, [profileId]);
  useEffect(() => {
    if (call.callState === "idle") {
      void loadMissed();
      void loadBookings();
    }
  }, [call.callState, loadMissed, loadBookings]);
  useEffect(() => {
    const id = setInterval(() => void loadBookings(), 60_000);
    return () => clearInterval(id);
  }, [loadBookings]);
  const dismissMissed = (ids: string[]) => {
    setMissedCalls((prev) => prev.filter((c) => !ids.includes(c.id)));
    void markMissedCallsSeen(ids);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (guest) {
      // Every sign, no plan: the same bars and counts as a student with no class.
      const local = await getLocalProgress();
      if (local.error) setError(local.error.message);
      else {
        setMastered(countMastered(local.data, {}));
        setAllRows(new Map(local.data.map((r) => [`${r.language}:${r.sign_group}:${r.sign}`, { passes: r.passes, last_passed_at: r.last_passed_at }])));
      }
      setGuestLoaded(true);
      setLoading(false);
      return;
    }
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setError(profileError?.message ?? "Couldn't load your profile.");
      setLoading(false);
      return;
    }
    const meProfile = me as Profile;
    setProfile(meProfile);

    const [klass, mods, all, planRes] = await Promise.all([
      meProfile.class_id ? getClassTeacher(meProfile.class_id) : Promise.resolve({ data: null }),
      meProfile.class_id ? getModulesForClass(meProfile.class_id) : Promise.resolve({ data: [] as ModuleRow[], error: null }),
      getAllLessonProgress(meProfile.id),
      meProfile.class_id ? getClassPlan(meProfile.class_id) : Promise.resolve({ data: {} as ClassPlan, error: null }),
    ]);
    const classPlan = planRes.data;
    setPlan(classPlan);
    if (all.error) setError(all.error.message);
    else setMastered(countMastered(((all.data as any[]) ?? []) as LessonProgressRow[], classPlan));
    const teacherProfile = toOne((klass.data as any)?.profiles ?? null);
    setTeacher(teacherProfile ? { id: teacherProfile.id, name: teacherProfile.full_name } : null);
    // A missing modules table (0009 not run yet) just means no modules.
    setModules(mods.error ? [] : mods.data.filter((m) => moduleSigns(m).length > 0));
    if (!all.error) {
      setAllRows(
        new Map(((all.data as any[]) ?? []).map((r) => [`${r.language}:${r.sign_group}:${r.sign}`, { passes: r.passes, last_passed_at: r.last_passed_at ?? null }]))
      );
    }
    setLoading(false);
  }, [guest]);

  useEffect(() => {
    load();
  }, [load]);

  // A group the class plan switches off (or leaves empty) isn't shown to the
  // student at all; groups with no model yet still show as "soon".
  const shownGroup = useCallback(
    (l: SignLanguage, g: SignGroup) => !getGroup(l, g).available || groupInPlan(l, g, plan),
    [plan]
  );
  // The open group got switched off: land on the first one the class learns.
  useEffect(() => {
    if (shownGroup(language, group)) return;
    const first = CURRICULUM.flatMap((l) => l.groups.filter((g) => g.available && shownGroup(l.language, g.group)).map((g) => ({ l: l.language, g: g.group })))[0];
    if (first) {
      setLanguage(first.l);
      setGroup(first.g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownGroup]);

  const groupDef = getGroup(language, group);
  // The group's signs under the teacher's plan (every sign without one).
  const groupSigns = planSigns(language, group, plan);
  const activeModule = modules.find((m) => m.id === activeModuleId) ?? null;
  // Practice's "Next sign" order: the module's when practicing from one, else
  // the group's, narrowed to the chosen category for Words.
  const signs = activeModule ? moduleSigns(activeModule) : filterByCategory(language, groupSigns, group === "words" ? category : null);

  const loadGroup = useCallback(async () => {
    const key = `${language}:${group}`;
    if ((!profile && !guest) || !groupDef.available) {
      setRows(new Map());
      setRowsKey(key);
      return;
    }
    setRows(new Map());
    setRowsKey(null);
    setGroupLoading(true);
    const { data, error: err } = guest ? await getLocalGroupProgress(language, group) : await getLessonProgress(profile!.id, language, group);
    setGroupLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setRows(new Map(((data as LessonProgressRow[]) ?? []).map((r) => [r.sign, r])));
    setRowsKey(key);
  }, [profile, guest, language, group, groupDef.available]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  // A sign picked in another group opens once that group's rows are loaded,
  // so practice starts from the right stars and the right "Next sign".
  useEffect(() => {
    if (pending && rowsKey === `${language}:${group}`) {
      setPracticing(pending);
      setPending(null);
    }
  }, [pending, rowsKey, language, group]);

  const practice = (t: Target, moduleId: string | null = null) => {
    setActiveModuleId(moduleId);
    setCategory(null);
    if (t.language === language && t.group === group && rowsKey === `${language}:${group}`) {
      setPracticing(t.sign);
      return;
    }
    setLanguage(t.language);
    setGroup(t.group);
    setPending(t.sign);
  };

  const openGroup = (l: SignLanguage, g: SignGroup) => {
    setActiveModuleId(null);
    setCategory(null);
    setLanguage(l);
    setGroup(g);
    setTab("signs");
  };

  // Back from practice: re-read the bars, and (via the fresh profile ->
  // loadGroup effect) the tiles, so what the student sees is what the
  // database now holds - and what their teacher sees.
  const handlePracticeDone = () => {
    setPracticing(null);
    setActiveModuleId(null);
    load();
    // Guest mode has no fresh profile to re-trigger loadGroup.
    if (guest) void loadGroup();
  };

  const handleRowUpdate = useCallback((row: LessonProgressRow) => {
    setRows((prev) => new Map(prev).set(row.sign, row));
    setAllRows((prev) => new Map(prev).set(`${row.language}:${row.sign_group}:${row.sign}`, { passes: row.passes, last_passed_at: row.last_passed_at }));
  }, []);

  if (call.callState !== "idle" && self && profile?.class_id) {
    return <VideoCallScreen role="student" call={call} self={self} classId={profile.class_id} accentColor={accentColor} />;
  }

  if (practicing && (profile || guest)) {
    return (
      <PracticeScreen
        studentId={profile?.id ?? ""}
        saveAttempt={guest ? recordLocalAttempt : undefined}
        language={language}
        group={group}
        sign={practicing}
        signs={signs}
        rows={rows}
        doneSince={activeModule?.created_at ?? null}
        accentColor={accentColor}
        onRowUpdate={handleRowUpdate}
        onChangeSign={setPracticing}
        onDone={handlePracticeDone}
      />
    );
  }

  // ---- figures ----
  const passesOf = (l: SignLanguage, g: SignGroup, s: string) => allRows.get(`${l}:${g}:${s}`);
  const learnedIn = (l: SignLanguage, g: SignGroup, list: string[]) => list.filter((s) => isMastered(passesOf(l, g, s))).length;
  const masteredHere = mastered[groupKey(language, group)] ?? 0;
  const availableGroups = CURRICULUM.flatMap((l) => l.groups.filter((g) => g.available && shownGroup(l.language, g.group)).map((g) => ({ lang: l, g })));
  const soonGroups = CURRICULUM.flatMap((l) => l.groups.filter((g) => !g.available).map((g) => `${l.label} ${g.label}`));
  const totalLearned = availableGroups.reduce((s, { lang: l, g }) => s + (mastered[groupKey(l.language, g.group)] ?? 0), 0);
  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const lang = getLanguage(language);
  const groupDone = groupDef.available && groupSigns.length > 0 && masteredHere >= groupSigns.length;

  // Next up: the open group first, then every other group in curriculum order.
  const nextUp: Target | null = (() => {
    const order = [{ l: language, g: group }, ...availableGroups.map(({ lang: l, g }) => ({ l: l.language, g: g.group }))];
    for (const { l, g } of order) {
      const list = planSigns(l, g, plan);
      const map =
        l === language && g === group && rowsKey === `${language}:${group}`
          ? (rows as Map<string, ProgressLike>)
          : new Map(list.map((s): [string, ProgressLike] => [s, { attempts: 0, passes: passesOf(l, g, s)?.passes ?? 0, last_passed_at: null }]));
      const sign = nextPracticeSign(list, map, null);
      if (sign) return { language: l, group: g, sign };
    }
    return null;
  })();
  const nextInGroup = groupDef.available && !groupLoading ? nextPracticeSign(signs, rows, null) : null;
  // After a finished group: the next group (in this language first) with signs left.
  const nextGroup = (() => {
    const all = availableGroups.map(({ lang: l, g }) => ({ l: l.language, g: g.group, label: g.label }));
    const left = all.filter(({ l, g }) => !(l === language && g === group) && learnedIn(l, g, planSigns(l, g, plan)) < planSigns(l, g, plan).length);
    return left.find((x) => x.l === language) ?? left[0] ?? null;
  })();

  // A module counts only passes since the teacher made it: a sign learned
  // before still has to be done for the module (passedSince).
  const doneInModule = (m: ModuleRow, s: string) => passedSince(passesOf(m.language, m.sign_group, s), m.created_at);
  const moduleProgress = (m: ModuleRow) => {
    const list = moduleSigns(m);
    const learned = list.filter((s) => doneInModule(m, s)).length;
    return { list, learned, done: learned >= list.length };
  };
  // Due soon: the nearest due date among unfinished modules, else the first unfinished one.
  const dueModule = (() => {
    const open = modules.filter((m) => !moduleProgress(m).done);
    const dated = open.filter((m) => m.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
    return dated[0] ?? open[0] ?? null;
  })();
  const continueModule = (m: ModuleRow) => {
    const { list } = moduleProgress(m);
    const sign = list.find((s) => !doneInModule(m, s)) ?? list[0];
    if (sign) practice({ language: m.language, group: m.sign_group, sign }, m.id);
  };

  const presence = teacher ? call.presence[teacher.id] : undefined;
  // Their booked call with this class's teacher: open now, later, or none.
  const gate = bookings && profile?.class_id ? studentCallGate(bookings.filter((b) => b.class_id === profile.class_id), profile.id, now) : null;
  const canCall = !gate || gate.kind === "open";
  const laterStart = gate?.kind === "later" ? Date.parse(gate.booking.starts_at) : null;
  const laterWords =
    laterStart === null ? "" : dayWords(laterStart, now) === "Today" ? timeWords(laterStart) : `${dayWords(laterStart, now)} ${timeWords(laterStart)}`;
  const callLabel = !canCall
    ? gate?.kind === "later"
      ? `Call at ${laterWords}`
      : "No call booked"
    : presence === "busy"
      ? "Call (they're on a call)"
      : "Call";
  const startCall = () => {
    if (teacher && canCall) call.startCall(teacher);
  };
  const latestMissed = missedCalls[0] ?? null;

  // ---- pieces ----
  const callButton = (big?: boolean, label = callLabel) => (
    <Pressable
      onPress={startCall}
      disabled={!canCall}
      accessibilityRole="button"
      accessibilityState={{ disabled: !canCall }}
      accessibilityLabel={
        !canCall
          ? gate?.kind === "later"
            ? `Call ${teacher?.name}. Your call is ${bookingWords(gate.booking, now)}`
            : `Call ${teacher?.name}. No call booked yet`
          : presence === "busy"
            ? `Call ${teacher?.name}, they're on a call`
            : `Call ${teacher?.name}`
      }
      style={(s: any) => [styles.callBtn, big && styles.callBtnBig, !canCall && styles.callBtnOff, canCall && s.pressed && styles.pressed, s.focused && styles.focused]}
    >
      <VideoIcon size={big ? 18 : 16} color={canCall ? colors.onPrimary : colors.textSecondary} />
      <Text style={[styles.callText, big && styles.callTextBig, !canCall && styles.callTextOff]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  // What the booking means, in words (teacher card and Today).
  const teacherFirst = teacher ? teacherShortName(teacher.name) : "your teacher";
  const callTimeText = !gate
    ? null
    : gate.kind === "open"
      ? `It's your call time! You can call ${teacherFirst} until ${timeWords(Date.parse(gate.booking.ends_at))}.`
      : gate.kind === "later"
        ? `Your next call: ${bookingWords(gate.booking, now)}. The Call button turns on 5 minutes before.`
        : `${teacherFirst} books a time for your call. It will show here.`;
  // On Today: only when the call is on now or later today.
  const callTimeNotice =
    teacher && gate && (gate.kind === "open" || (laterStart !== null && dayWords(laterStart, now) === "Today")) ? (
      <View style={styles.notice}>
        <CalendarIcon size={16} color={colors.accentText} />
        <Text style={[styles.noticeText, styles.flex]}>
          {gate.kind === "open" ? `It's your call time with ${teacherFirst}!` : `Your call with ${teacherFirst} is today at ${laterWords}.`}
        </Text>
        {gate.kind === "open" ? callButton(false, "Call") : null}
      </View>
    ) : null;

  const teacherPill = profile?.class_id ? (
    <GlassCard radius={999} padding={0} contentStyle={[styles.pill, isMobile && styles.pillPhone]}>
      <Avatar name={teacher?.name ?? "?"} size={isMobile ? 34 : 40} />
      {teacher ? (
        <>
          {isMobile ? null : (
            <View style={styles.pillText}>
              <Text style={styles.pillName} numberOfLines={1}>
                {teacher.name}
              </Text>
              <View style={styles.row6}>
                <Text style={styles.pillRole}>Your teacher ·</Text>
                <PresenceDot status={presence} />
              </View>
            </View>
          )}
          {callButton(false, isMobile ? (canCall ? "Call" : laterWords || "No call") : callLabel)}
        </>
      ) : (
        <Text style={[styles.pillRole, styles.pillNone]}>No teacher yet</Text>
      )}
    </GlassCard>
  ) : null;

  const guestPill = guest ? (
    <GlassCard radius={999} padding={0} contentStyle={[styles.pill, styles.guestPill, isMobile && styles.pillPhone]}>
      <WifiOffIcon size={isMobile ? 16 : 18} color={colors.textSecondary} />
      <Text style={styles.pillRole} numberOfLines={1}>
        {isMobile ? "Offline" : "Offline practice"}
      </Text>
    </GlassCard>
  ) : null;

  const topStrip = (
    <View style={styles.strip}>
      <View style={styles.stripLeft}>
        <Text style={[styles.hello, isMobile && styles.helloPhone]}>Hi{firstName ? `, ${firstName}` : ""}!</Text>
        <View style={styles.stripBarRow}>
          <Text style={[styles.stripCount, isMobile && styles.stripCountPhone]}>
            {totalLearned} {isMobile ? "learned" : `sign${totalLearned === 1 ? "" : "s"} learned`}
          </Text>
          <ProgressBar value={computeOverall(mastered, plan)} label={`${totalLearned} signs learned`} compact readout="none" color="accent" style={styles.flex} />
        </View>
      </View>
      {guest ? guestPill : teacherPill}
    </View>
  );

  const pageTabs = (
    <View style={styles.pageTabs} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.key === tab;
        const count = t.key === "signs" ? String(totalLearned) : t.key === "teacher" && modules.length ? String(modules.length) : null;
        return (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={(s: any) => [styles.pageTab, on && styles.pageTabOn, s.focused && styles.focused]}
            {...({
              onKeyDown: (e: any) => {
                const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (step) setTab(tabs[(tabs.findIndex((x) => x.key === tab) + step + tabs.length) % tabs.length].key);
              },
            } as object)}
          >
            {t.icon(on ? colors.primaryText : colors.textSecondary)}
            <Text style={[styles.pageTabText, on && styles.pageTabTextOn]}>{t.label}</Text>
            {count ? (
              <View style={[styles.pageTabCount, on && styles.pageTabCountOn]}>
                <Text style={styles.pageTabCountText}>{count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const missedNotice = latestMissed ? (
    <View style={styles.notice}>
      <PhoneIcon size={16} color={colors.accentText} />
      <Text style={[styles.noticeText, styles.flex]}>
        You missed a call from {teacher && latestMissed.caller_id === teacher.id ? teacherShortName(teacher.name) : "your teacher"} · {formatWhen(latestMissed.created_at)}
      </Text>
      <KidButton small variant="ghost" label="OK" accessibilityLabel="Dismiss the missed call" onPress={() => dismissMissed(missedCalls.map((c) => c.id))} />
    </View>
  ) : null;

  // ---- Today ----
  const nextTitle = nextUp
    ? `Practice the ${GROUP_ONE[nextUp.group]} ${signName(nextUp.language, nextUp.sign)}`
    : "You've learned every sign!";
  const nextLine = (() => {
    if (!nextUp) return "Practice any sign again to earn more stars.";
    const total = planSigns(nextUp.language, nextUp.group, plan).length;
    const learned = mastered[groupKey(nextUp.language, nextUp.group)] ?? 0;
    const noun = GROUP_PLURAL[nextUp.group];
    if (learned === 0) return `Your first of ${total} ${getLanguage(nextUp.language).label} ${noun}.`;
    const left = total - learned;
    return `You've learned ${learned} of ${total} ${noun}.${left <= 5 ? ` Only ${left} to go!` : ""}`;
  })();
  const nextName = nextUp ? signName(nextUp.language, nextUp.sign) : "";

  const nextCard = (
    <GlassCard radius={22} padding={isMobile ? 18 : 26} style={styles.flex} contentStyle={[styles.nextCard, isMobile && styles.nextCardPhone]}>
      {nextUp ? (
        <View style={[styles.slab, isMobile && styles.slabPhone]}>
          <Text style={[styles.slabText, isMobile && styles.slabTextPhone, nextName.length > 2 && styles.slabWord]} numberOfLines={2} adjustsFontSizeToFit>
            {nextName}
          </Text>
        </View>
      ) : null}
      <View style={[styles.nextBody, isMobile && styles.nextBodyPhone]}>
        {nextUp ? (
          <Text style={styles.meta}>
            {`Next up · ${getLanguage(nextUp.language).label} ${getGroup(nextUp.language, nextUp.group).label}`.toUpperCase()}
          </Text>
        ) : null}
        {isMobile ? null : <Text style={styles.nextTitle}>{nextTitle}</Text>}
        <Text style={[styles.nextLine, isMobile && styles.center]}>{nextLine}</Text>
        <View style={[styles.row10, isMobile && styles.fullWidth]}>
          {nextUp ? (
            <KidButton
              variant="primary"
              label={`Practice ${nextName}`}
              onPress={() => practice(nextUp)}
              iconRight={<ArrowRightIcon size={18} color={colors.textOnAccent} />}
              style={isMobile ? styles.flex : undefined}
            />
          ) : null}
          {isMobile ? null : <KidButton variant="ghost" label={nextUp ? "Pick another sign" : "Go to My signs"} onPress={() => setTab("signs")} />}
        </View>
      </View>
    </GlassCard>
  );

  const dueCard = dueModule
    ? (() => {
        const { list, learned } = moduleProgress(dueModule);
        const due = dueModule.due_date ? dueDay(dueModule.due_date) : null;
        const where = `${getLanguage(dueModule.language).label} ${getGroup(dueModule.language, dueModule.sign_group).label}`;
        return isMobile ? (
          <GlassCard radius={radii.md} padding={14} contentStyle={styles.dueRow}>
            <CalendarIcon size={18} color={colors.accentText} />
            <View style={styles.flex}>
              <Text style={styles.dueTitleSm} numberOfLines={1}>
                {dueModule.title}
              </Text>
              <Text style={styles.caption}>
                {learned} of {list.length}
                {due ? ` · due ${due.short}` : ""}
              </Text>
            </View>
            <KidButton small label="Continue" onPress={() => continueModule(dueModule)} />
          </GlassCard>
        ) : (
          <GlassCard radius={22} padding={20} style={styles.dueCard} contentStyle={styles.dueContent}>
            <View style={styles.between}>
              <Text style={styles.meta}>{due ? "DUE SOON" : "FROM YOUR TEACHER"}</Text>
              {due ? <DueChip label={due.short} /> : null}
            </View>
            <Text style={styles.h2}>{dueModule.title}</Text>
            <Text style={styles.caption}>
              {teacher ? `From ${teacher.name} · ` : ""}
              {where}
            </Text>
            <View style={styles.row10}>
              <ProgressBar value={list.length ? learned / list.length : 0} label={`${learned} of ${list.length} learned`} compact readout="none" color="accent" style={styles.flex} />
              <Text style={styles.countText}>
                {learned} of {list.length}
              </Text>
            </View>
            <View style={styles.flex} />
            <KidButton label="Continue" onPress={() => continueModule(dueModule)} iconRight={<ArrowRightIcon size={16} color={colors.textPrimary} />} />
          </GlassCard>
        );
      })()
    : null;

  const groupCards = (
    <View style={styles.section}>
      <Text style={styles.h3}>How you're doing</Text>
      {isMobile ? (
        <GlassCard radius={radii.md} padding={14}>
          {availableGroups.map(({ lang: l, g }) => {
            const total = planSigns(l.language, g.group, plan).length;
            const n = mastered[groupKey(l.language, g.group)] ?? 0;
            return (
              <Pressable
                key={`${l.language}:${g.group}`}
                onPress={() => openGroup(l.language, g.group)}
                accessibilityRole="button"
                accessibilityLabel={`${l.label} ${g.label}: ${n} of ${total} learned. Open`}
                style={styles.groupLine}
              >
                <View style={styles.between}>
                  <Text style={styles.groupName}>
                    {l.label} {g.label}
                  </Text>
                  <Text style={styles.caption}>
                    {n}/{total}
                  </Text>
                </View>
                <ProgressBar value={groupFraction(l.language, g.group, mastered, plan)} compact readout="none" color="success" />
              </Pressable>
            );
          })}
        </GlassCard>
      ) : (
        <View style={styles.groupGrid}>
          {availableGroups.map(({ lang: l, g }) => {
            const total = planSigns(l.language, g.group, plan).length;
            const n = mastered[groupKey(l.language, g.group)] ?? 0;
            return (
              <Pressable
                key={`${l.language}:${g.group}`}
                onPress={() => openGroup(l.language, g.group)}
                accessibilityRole="button"
                accessibilityLabel={`${l.label} ${g.label}: ${n} of ${total} learned. Open`}
                style={(s: any) => [styles.groupCardWrap, s.focused && styles.focused]}
              >
                <GlassCard radius={18} padding={16} contentStyle={styles.groupCard}>
                  <View style={styles.between}>
                    <Text style={styles.groupName}>
                      {l.label} {g.label}
                    </Text>
                    <ChevronRightIcon size={16} color={colors.textSecondary} />
                  </View>
                  <Text>
                    <Text style={styles.bigCount}>{n}</Text>
                    <Text style={styles.ofText}> of {total} learned</Text>
                  </Text>
                  <ProgressBar value={groupFraction(l.language, g.group, mastered, plan)} compact readout="none" color="success" />
                </GlassCard>
              </Pressable>
            );
          })}
          {soonGroups.length ? (
            <View style={styles.soonCard}>
              <View style={styles.soonBadge}>
                <Text style={styles.soonBadgeText}>SOON</Text>
              </View>
              <Text style={[styles.caption, styles.center]}>{soonGroups.join(", ")}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  // Guest mode, beside Next up: what practicing without an account means.
  const guestCard = (
    <GlassCard radius={22} padding={20} style={isMobile ? undefined : styles.dueCard} contentStyle={styles.dueContent}>
      <View style={styles.row10}>
        <WifiOffIcon size={18} color={colors.accentText} />
        <Text style={styles.meta}>No account needed</Text>
      </View>
      <Text style={styles.h2}>Practicing offline</Text>
      <Text style={styles.body}>Your stars are saved on this device only, so your teacher won't see them.</Text>
      <Text style={styles.body}>When the internet is back, log in to practice for your class.</Text>
      <View style={styles.flex} />
      <KidButton label={exitLabel} onPress={onExitToStart} />
    </GlassCard>
  );

  const todayTab = (
    <View style={styles.tabBody}>
      {callTimeNotice}
      {missedNotice}
      <View style={[styles.todayRow, isMobile && styles.col12]}>
        {nextCard}
        {guest ? guestCard : profile?.class_id ? dueCard : <JoinClassCard style={isMobile ? undefined : styles.dueCard} onJoined={joined} />}
      </View>
      {groupCards}
    </View>
  );

  // ---- My signs ----
  const cols = Math.max(5, Math.floor((gridWidth + TILE_GAP) / (TILE_MAX + TILE_GAP)));
  const tileSize = gridWidth ? Math.min(TILE_MAX, Math.floor((gridWidth - (cols - 1) * TILE_GAP) / cols)) : TILE_MAX;
  const counts = Object.fromEntries(
    lang.groups.map((g) => [g.group, `${mastered[groupKey(language, g.group)] ?? 0}/${planSigns(language, g.group, plan).length}`])
  ) as Partial<Record<SignGroup, string>>;

  const signsTab = (
    <GlassCard radius={22} padding={isMobile ? 14 : 22} contentStyle={styles.signsCard}>
      <View style={styles.signsTop}>
        <CurriculumTabs
          audience="student"
          layout={isMobile ? "stacked" : "row"}
          inline
          language={language}
          group={group}
          counts={isMobile ? undefined : counts}
          shown={shownGroup}
          onChange={(l, g) => {
            setActiveModuleId(null);
            setCategory(null);
            setLanguage(l);
            setGroup(g);
          }}
        />
        {isDesktop ? (
          <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.row6}>
              <View style={styles.legendCheck}>
                <CheckIcon size={10} color={colors.onStatus} strokeWidth={3.5} />
              </View>
              <Text style={styles.caption}>Learned</Text>
            </View>
            <View style={styles.row6}>
              <StarRow filled={3} size={12} gap={2} />
              <Text style={styles.caption}>How well you sign it</Text>
            </View>
          </View>
        ) : null}
      </View>

      {!groupDef.available ? (
        <View style={styles.soonPanel}>
          <View style={styles.row10}>
            <ClockIcon size={18} color={colors.accentText} />
            <Text style={styles.h3}>
              {lang.label} {groupDef.label} are coming soon
            </Text>
          </View>
          <Text style={styles.body}>The computer is still learning these signs.</Text>
        </View>
      ) : (
        <>
          {groupDone ? (
            <View style={styles.doneBanner}>
              <View style={styles.doneCheck}>
                <CheckIcon size={20} color={colors.onStatus} strokeWidth={3} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.doneTitle}>
                  All {groupSigns.length} {GROUP_PLURAL[group]} learned. Great work!
                </Text>
                <Text style={styles.caption}>Practice any {GROUP_ONE[group]} again to earn more stars.</Text>
              </View>
              {nextGroup ? (
                <KidButton
                  small
                  label={`Go to ${nextGroup.l === language ? nextGroup.label : `${getLanguage(nextGroup.l).label} ${nextGroup.label}`}`}
                  onPress={() => openGroup(nextGroup.l, nextGroup.g)}
                  iconRight={<ArrowRightIcon size={15} color={colors.textPrimary} />}
                />
              ) : null}
            </View>
          ) : (
            <View style={styles.row14}>
              <Text style={styles.learnedLine}>
                {masteredHere} of {groupSigns.length} {GROUP_PLURAL[group]} learned
              </Text>
              <ProgressBar value={groupFraction(language, group, mastered, plan)} label={`${masteredHere} of ${groupSigns.length} learned`} compact readout="none" color="success" style={styles.flex} />
            </View>
          )}

          {groupLoading && rows.size === 0 ? (
            <View style={styles.tileGrid}>
              {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={[styles.skeletonTile, { width: tileSize, height: Math.round(tileSize * 1.1) }]} />
              ))}
            </View>
          ) : group === "words" && groupSigns.length === 0 ? (
            <Text style={styles.body}>Your teacher hasn't added any {lang.label} words to your plan yet.</Text>
          ) : group === "words" ? (
            <View>
              <View style={styles.categoryWrap}>
                <CategoryFilter
                  options={categoriesIn(language, groupSigns).map((c) => ({
                    ...c,
                    learned: groupSigns.filter((sg) => getWordCategory(language, sg) === c.key && isMastered(rows.get(sg))).length,
                  }))}
                  value={category}
                  onChange={setCategory}
                  total={groupSigns.length}
                  accentColor={accentColor}
                />
              </View>
              <WordCategoryList
                key={`${language}:${group}:${category ?? "all"}`}
                sections={sectionsByCategory(language, signs)}
                language={language}
                group={group}
                rows={rows}
                nextSign={nextInGroup}
                onPressSign={setPracticing}
                columns={isDesktop ? 2 : 1}
              />
            </View>
          ) : (
            <View style={styles.tileGrid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
              {signs.map((sign) => (
                <SignTile
                  key={sign}
                  sign={sign}
                  language={language}
                  group={group}
                  row={rows.get(sign)}
                  isNext={sign === nextInGroup}
                  size={tileSize}
                  onPress={() => setPracticing(sign)}
                />
              ))}
            </View>
          )}
          <Text style={styles.caption}>Tap a {GROUP_ONE[group]} to practice it.</Text>
        </>
      )}
    </GlassCard>
  );

  // ---- From my teacher ----
  const moduleCards = modules.length ? (
    modules.map((m) => {
      const { list, learned, done } = moduleProgress(m);
      const due = m.due_date ? dueDay(m.due_date) : null;
      const where = `${getLanguage(m.language).label} ${getGroup(m.language, m.sign_group).label}`;
      return (
        <GlassCard key={m.id} radius={20} padding={isMobile ? 14 : 18} contentStyle={[styles.moduleCard, isMobile && styles.moduleCardPhone]}>
          <View style={[styles.flex, styles.gap9]}>
            <View style={styles.moduleHead}>
              <Text style={isMobile ? styles.h3 : styles.h2}>{m.title}</Text>
              {isMobile ? null : (
                <Text style={styles.caption}>
                  {where} · {list.length} sign{list.length === 1 ? "" : "s"}
                </Text>
              )}
              {done ? <DoneChip /> : due ? <DueChip label={`Due ${due.short} · ${inDays(due.days)}`} /> : null}
            </View>
            {isMobile ? (
              <Text style={styles.caption}>
                {where} · {learned} of {list.length} learned
              </Text>
            ) : (
              <View style={styles.chips}>
                {list.slice(0, 14).map((s) => {
                  const ok = doneInModule(m, s);
                  return (
                    <View key={s} style={[styles.signChip, ok ? styles.signChipOk : styles.signChipNo]}>
                      {ok ? <CheckIcon size={11} color={colors.successText} strokeWidth={3} /> : null}
                      <Text style={[styles.signChipText, !ok && { color: colors.textSecondary }]}>{signName(m.language, s)}</Text>
                    </View>
                  );
                })}
                {list.length > 14 ? <Text style={styles.caption}>+{list.length - 14} more</Text> : null}
              </View>
            )}
            <View style={[styles.row10, !isMobile && styles.moduleBar]}>
              <ProgressBar value={list.length ? learned / list.length : 0} label={`${m.title}: ${learned} of ${list.length} learned`} compact readout="none" color={done ? "success" : "accent"} style={styles.flex} />
              {isMobile ? null : (
                <Text style={styles.countText}>
                  {learned} of {list.length} learned
                </Text>
              )}
            </View>
          </View>
          {done ? (
            <KidButton small label="Practice again" onPress={() => practice({ language: m.language, group: m.sign_group, sign: list[0] }, m.id)} style={isMobile ? styles.fullWidth : undefined} />
          ) : (
            <KidButton
              small
              variant="primary"
              label={learned ? "Continue" : "Start"}
              onPress={() => continueModule(m)}
              iconRight={<ArrowRightIcon size={15} color={colors.textOnAccent} />}
              style={isMobile ? styles.fullWidth : undefined}
            />
          )}
        </GlassCard>
      );
    })
  ) : (
    <GlassCard radius={20} padding={20} contentStyle={styles.gap12}>
      <Text style={styles.body}>
        {profile?.class_id
          ? "Your teacher hasn't added any modules yet. You can still practice everything in My signs."
          : "Join your class to see what your teacher picks for you. You can still practice everything in My signs."}
      </Text>
      <KidButton small label="Go to My signs" onPress={() => setTab("signs")} style={styles.selfStart} />
    </GlassCard>
  );

  const teacherCard = profile?.class_id ? (
    <GlassCard radius={22} padding={20} style={styles.teacherCard} contentStyle={styles.gap14}>
      <Text style={styles.meta}>YOUR TEACHER</Text>
      {teacher ? (
        <>
          <View style={styles.row12}>
            <Avatar name={teacher.name} size={52} />
            <View style={styles.gap5}>
              <Text style={styles.h3}>{teacher.name}</Text>
              <PresenceDot status={presence} />
            </View>
          </View>
          <Text style={styles.body}>Call to practice signs together. Your teacher can ask you to sign and help you.</Text>
          {callTimeText ? (
            <View style={[styles.callTime, gate?.kind === "open" && styles.callTimeOn]}>
              <CalendarIcon size={16} color={gate?.kind === "open" ? colors.successText : colors.textSecondary} />
              <Text style={[styles.callTimeText, styles.flex]}>{callTimeText}</Text>
            </View>
          ) : null}
          {callButton(true, !canCall || presence === "busy" ? callLabel : `Call ${teacherShortName(teacher.name)}`)}
        </>
      ) : (
        <Text style={styles.body}>Your class doesn't have a teacher yet.</Text>
      )}
      {missedNotice}
    </GlassCard>
  ) : (
    <JoinClassCard style={styles.teacherCard} onJoined={joined} />
  );

  const teacherTab = isMobile ? (
    <View style={styles.tabBody}>
      {callTimeNotice}
      {missedNotice}
      {moduleCards}
      {profile?.class_id ? null : <JoinClassCard onJoined={joined} />}
    </View>
  ) : (
    <View style={styles.teacherRow}>
      <View style={[styles.flex, styles.gap12]}>{moduleCards}</View>
      {teacherCard}
    </View>
  );

  function joined(name: string) {
    setJoinedNote(`You joined ${name}!`);
    load();
  }

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Student"
      userName={profile?.full_name ?? "..."}
      onSignOut={guest ? undefined : onSignOut}
      onExitToStart={onExitToStart}
      backAccessibilityLabel={guest ? exitLabel : undefined}
      onOpenTranslator={onOpenTranslator}
      profile={guest ? null : profile}
      onProfileChange={(p) => {
        setProfile(p);
        onAccountChange?.();
      }}
      contentMaxWidth={1248}
      tabs={tabs.map((t) => ({ key: t.key, label: t.label, icon: (c: string) => t.icon(c, 20) }))}
      activeTab={tab}
      onTab={(k) => setTab(k as Tab)}
      scrollKey={tab}
    >
      <View style={styles.page}>
        {error ? (
          <GlassCard radius={radii.lg} padding={18} contentStyle={styles.msgRow}>
            <AlertCircleIcon size={24} color={colors.dangerText} />
            <View style={styles.flex} accessibilityHint={error}>
              <Text style={styles.h3}>We couldn't load your signs</Text>
              <Text style={styles.body}>
                {guest
                  ? "Something went wrong on this device. Try again."
                  : onPracticeOffline
                    ? "Check the internet, then try again. No internet? You can still practice offline."
                    : "Check the internet, then try again."}
              </Text>
              <View style={[styles.row10, styles.msgAction]}>
                <KidButton small label="Try again" onPress={load} />
                {!guest && onPracticeOffline ? <KidButton small variant="ghost" label="Practice offline" onPress={onPracticeOffline} /> : null}
              </View>
            </View>
          </GlassCard>
        ) : null}

        {joinedNote ? (
          <View style={styles.notice}>
            <CheckIcon size={18} color={colors.successText} />
            <Text style={[styles.noticeText, styles.flex]}>{joinedNote}</Text>
            <KidButton small variant="ghost" label="OK" onPress={() => setJoinedNote(null)} />
          </View>
        ) : null}

        {/* A failed load shows only the card above: "0 signs learned" and
            untried tiles would read as lost progress. */}
        {error ? null : topStrip}
        {error || !isDesktop ? null : pageTabs}

        {error ? null : loading && (guest ? !guestLoaded : !profile) ? (
          <GlassCard radius={22} padding={20}>
            <View style={styles.tileGrid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={[styles.skeletonTile, { width: 58, height: 64 }]} />
              ))}
            </View>
            <Text style={[styles.body, { marginTop: 14 }]}>Getting your signs…</Text>
          </GlassCard>
        ) : tab === "signs" ? (
          signsTab
        ) : tab === "teacher" && !guest ? (
          teacherTab
        ) : (
          todayTab
        )}
      </View>
    </DashboardShell>
  );
}

function Avatar({ name, size }: { name: string; size: number }) {
  const styles = useThemedStyles(makeStyles);
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
    </View>
  );
}

function DueChip({ label }: { label: string }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.chip, styles.dueChip]}>
      <CalendarIcon size={12} color={colors.accentText} />
      <Text style={[styles.chipText, { color: colors.accentText }]}>{label}</Text>
    </View>
  );
}

function DoneChip() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.chip, styles.doneChip]}>
      <CheckIcon size={12} color={colors.onStatus} strokeWidth={3.2} />
      <Text style={[styles.chipText, { color: colors.onStatus }]}>Done</Text>
    </View>
  );
}

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

const makeStyles = (colors: ThemeColors, theme: Theme) => {
  const dark = theme.name === "dark";
  const line = dark ? "rgba(255,255,255,0.16)" : colors.border;
  return StyleSheet.create({
    flex: { flex: 1, minWidth: 0 },
    page: { gap: 18 },
    tabBody: { gap: 18 },
    center: { textAlign: "center" },
    fullWidth: { alignSelf: "stretch" },
    selfStart: { alignSelf: "flex-start" },
    between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    row6: { flexDirection: "row", alignItems: "center", gap: 6 },
    row10: { flexDirection: "row", alignItems: "center", gap: 10 },
    row12: { flexDirection: "row", alignItems: "center", gap: 12 },
    row14: { flexDirection: "row", alignItems: "center", gap: 14 },
    col12: { flexDirection: "column", gap: 12 },
    gap5: { gap: 5 },
    gap9: { gap: 9 },
    gap12: { gap: 12 },
    gap14: { gap: 14 },
    pressed: { opacity: 0.85 },
    focused: { outlineColor: colors.focusRing, outlineStyle: "solid", outlineWidth: 2, outlineOffset: 2 } as object,

    h2: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 24, color: colors.textPrimary },
    h3: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 21, color: colors.textPrimary },
    body: { ...kidTypography.kidBody, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
    caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
    meta: { fontFamily: fonts.bodyMedium, fontSize: 10.5, letterSpacing: 1.1, textTransform: "uppercase", color: colors.textTertiary },
    countText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },

    // top strip
    strip: { flexDirection: "row", alignItems: "center", gap: 20 },
    stripLeft: { flex: 1, minWidth: 0, gap: 8 },
    hello: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 33, color: colors.textPrimary },
    helloPhone: { fontSize: 24, lineHeight: 27 },
    stripBarRow: { flexDirection: "row", alignItems: "center", gap: 14, maxWidth: 460 },
    stripCount: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
    stripCountPhone: { fontSize: 13 },
    pill: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingLeft: 10, paddingRight: 8 },
    pillPhone: { gap: 6, paddingVertical: 5, paddingLeft: 5, paddingRight: 6 },
    pillText: { gap: 4, maxWidth: 200 },
    pillName: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    pillRole: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textSecondary },
    pillNone: { paddingRight: 10 },
    guestPill: { paddingLeft: 14, paddingRight: 16, paddingVertical: 11 },
    callBtn: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: radii.pill,
      backgroundColor: colors.primaryFill,
      ...webCursor,
    },
    callBtnBig: { height: 52, paddingHorizontal: 24, alignSelf: "stretch" },
    callText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.onPrimary },
    callTextBig: { fontSize: 16 },
    callBtnOff: { backgroundColor: colors.neuWell, ...(Platform.OS === "web" ? ({ cursor: "not-allowed" } as object) : null) },
    callTextOff: { color: colors.textSecondary },
    callTime: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.neuWell },
    callTimeOn: { backgroundColor: colors.success + "1F" },
    callTimeText: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
    avatar: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.well,
      borderWidth: 1.5,
      borderColor: line,
    },
    avatarText: { fontFamily: fonts.heading, color: colors.primaryText },

    // page tabs (desktop)
    pageTabs: {
      flexDirection: "row",
      alignSelf: "flex-start",
      gap: 6,
      padding: 5,
      borderRadius: radii.pill,
      backgroundColor: colors.well,
      ...theme.shadows.neuInset("sm"),
    },
    pageTab: { height: 48, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 20, borderRadius: radii.pill, ...webCursor },
    pageTabOn: { backgroundColor: colors.surfaceRaised, ...theme.shadows.neuRaised("sm") },
    pageTabText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textSecondary },
    pageTabTextOn: { color: colors.textPrimary },
    pageTabCount: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill },
    pageTabCountOn: { backgroundColor: colors.well },
    pageTabCountText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary },

    notice: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: 14, backgroundColor: colors.well },
    noticeText: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textPrimary },
    msgRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
    msgAction: { alignSelf: "flex-start", marginTop: 12, flexWrap: "wrap" },

    // Today
    todayRow: { flexDirection: "row", gap: 18, alignItems: "stretch" },
    nextCard: { flexDirection: "row", alignItems: "center", gap: 28, flex: 1 },
    nextCardPhone: { flexDirection: "column", gap: 12 },
    slab: {
      width: 150,
      height: 150,
      borderRadius: 34,
      alignItems: "center",
      justifyContent: "center",
      padding: 10,
      backgroundColor: colors.surfaceRaised,
      ...theme.shadows.neuRaised("md"),
    },
    slabPhone: { width: 110, height: 110, borderRadius: 28 },
    slabText: { fontFamily: fonts.heading, fontSize: 92, lineHeight: 100, color: colors.accentText, textAlign: "center" },
    slabTextPhone: { fontSize: 66, lineHeight: 72 },
    slabWord: { fontSize: 26, lineHeight: 30 },
    nextBody: { flex: 1, minWidth: 0, gap: 10 },
    nextBodyPhone: { alignItems: "center", alignSelf: "stretch" },
    nextTitle: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 38, color: colors.textPrimary },
    nextLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24, color: colors.textSecondary, marginBottom: 6 },
    dueCard: { width: 340 },
    dueContent: { flex: 1, gap: 12 },
    dueRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    dueTitleSm: { fontFamily: fonts.bodySemiBold, fontSize: 14.5, color: colors.textPrimary },
    section: { gap: 10 },
    groupGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
    groupCardWrap: { flexGrow: 1, flexBasis: 170, borderRadius: 18, ...webCursor } as object,
    groupCard: { gap: 10 },
    groupName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
    bigCount: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 30, color: colors.textPrimary },
    ofText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
    groupLine: { gap: 6, paddingVertical: 7 },
    soonCard: {
      flexBasis: 180,
      flexGrow: 0,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: 16,
      borderRadius: 18,
      borderWidth: 1.5,
      borderStyle: "dashed",
      borderColor: line,
    },
    soonBadge: { borderWidth: 1, borderColor: colors.textTertiary, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
    soonBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 9.5, letterSpacing: 0.6, color: colors.textTertiary },

    // My signs
    signsCard: { gap: 18 },
    signsTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, justifyContent: "space-between" },
    legend: { flexDirection: "row", alignItems: "center", gap: 14 },
    legendCheck: { width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.success },
    learnedLine: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.textPrimary },
    doneBanner: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.md, backgroundColor: colors.well, flexWrap: "wrap" },
    doneCheck: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.success },
    doneTitle: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 23, color: colors.textPrimary },
    tileGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14, columnGap: TILE_GAP, paddingTop: 10 },
    skeletonTile: { borderRadius: 18, backgroundColor: colors.well },
    categoryWrap: { marginBottom: 12 },
    soonPanel: { gap: 8 },

    // From my teacher
    teacherRow: { flexDirection: "row", gap: 18, alignItems: "flex-start" },
    teacherCard: { width: 330 },
    moduleCard: { flexDirection: "row", alignItems: "center", gap: 18 },
    moduleCardPhone: { flexDirection: "column", alignItems: "stretch", gap: 10 },
    moduleHead: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
    moduleBar: { maxWidth: 520 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 26, paddingHorizontal: 10, borderRadius: radii.pill },
    chipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5 },
    dueChip: { borderWidth: 1, borderColor: colors.accentText },
    doneChip: { backgroundColor: colors.success },
    signChip: { flexDirection: "row", alignItems: "center", gap: 5, height: 28, paddingHorizontal: 12, borderRadius: radii.pill },
    signChipOk: { backgroundColor: colors.well },
    signChipNo: { borderWidth: 1, borderStyle: "dashed", borderColor: line },
    signChipText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textPrimary },
  });
};
