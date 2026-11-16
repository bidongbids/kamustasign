// Teacher dashboard: run your classes (create / rename / delete), invite
// students (class code or ticking them from a list), choose the class's
// learning plan (which word categories and words it learns), author modules,
// call a student, and follow the class's progress. Real reads/writes against
// Supabase, scoped by RLS - a teacher only ever sees their own class's
// students because the database enforces that (0002/0006), and roster
// changes go through the owner-checked functions in
// 0009_teacher_classroom.sql.
//
// Layout (design_handoff_teacher_admin_videocall T1-T11): a rail - the class
// switcher, Today · Students · What they learn · Progress, the class code -
// beside the section on desktop; below desktop width the sections are a
// bottom tab bar and the switcher sits at the top. The class's figures live
// on Today only, so each section starts with its own content.
//
// The dashboard owns the data: the roster, the plan, the modules, missed
// calls and call notes, students waiting for a class, and each group's
// lesson_progress rows (loaded once per group, shared by Today, the modules,
// Progress and the student drawer).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import DashboardShell from "./DashboardShell";
import { fonts, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../theme/responsive";
import { Notice, type NoticeState } from "./ManageKit";
import { CloseButton, SideDrawer } from "./Overlays";
import { ClassSwitcher, SECTIONS, TeacherRail, type ClassActions, type TeacherSection } from "./TeacherRail";
import TeacherToday from "./TeacherToday";
import TeacherStudents, { printClassCode } from "./TeacherStudents";
import StudentDetailDrawer from "./StudentDetailDrawer";
import TeacherLearn, { type LearnStep } from "./TeacherLearn";
import TeacherProgress from "./TeacherProgress";
import { FirstRunCard, LoadErrorCard, PageSkeleton } from "./TeacherStates";
import { SaveBar, type SaveBarState } from "./ClassPlanEditor";
import type { ModuleEditorState } from "./TeacherModules";
import { InviteStudentsCard, JoinCodeCard } from "./InviteStudents";
import { CallNotesCard } from "./CallHistory";
import { BookedCallsCard, CallScheduleDrawer, type ScheduleState } from "./CallSchedule";
import {
  addStudentsToClass,
  createClass,
  deleteCallNote,
  deleteClass,
  getCallNotes,
  getClassGroupProgress,
  getClassPlan,
  getClassProgressSummary,
  getMissedCalls,
  getModulesForClass,
  getTeacherBookings,
  getMyClassesAsTeacher,
  getMyProfile,
  listUnassignedStudents,
  markMissedCallsSeen,
  moduleSigns,
  removeStudentFromClass,
  renameClass,
  type CallBooking,
  type CallNoteRow,
  type ClassRow,
  type MissedCallRow,
  type ModuleRow,
  type Profile,
  type ProgressEmbed,
  type StudentProgressSummary,
  type UnassignedStudent,
} from "../../lib/queries";
import { computeOverall, countMastered, getGroup, planSigns, type ClassPlan, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { signsToReview } from "../../lib/classInsights";
import {
  availableGroups,
  classGroupAverages,
  groupLabel,
  isOnline,
  moduleCompletion,
  needsYou,
  stuckSigns,
  type NeedsYouItem,
  type RosterFilter,
} from "../../lib/teacherInsights";
import { useVideoCall } from "../../hooks/useVideoCall";
import { CLOCK_SLACK_MS, nextBooking, openBooking } from "../../lib/callSchedule";
import VideoCallScreen from "../videocall/VideoCallScreen";
import type { CallPeer, PresenceStatus } from "../../lib/callSignaling";
import { isAndroidApp } from "../../lib/androidApp";

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToStart: () => void;
  /** The Account panel changed the name or 2FA - App reloads the profile. */
  onAccountChange: () => void;
  /** The Translator button in the header. */
  onOpenTranslator: () => void;
};

const LOAD_ERROR = { title: "Couldn't load your students", message: "Check the internet connection, then try again. Nothing you saved was lost." };

export default function TeacherDashboard({ accentColor, onSignOut, onExitToStart, onAccountChange, onOpenTranslator }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { width, isDesktop } = useResponsive();
  const phone = width < 768;
  const compact = isDesktop && width < 1400;
  const railWidth = width >= 1400 ? 248 : 216;
  const contentWidth = isDesktop ? width - railWidth - 64 : width - 48;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [rawProgress, setProgress] = useState<StudentProgressSummary[]>([]);
  const [plan, setPlan] = useState<ClassPlan>({});
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [missedCalls, setMissedCalls] = useState<MissedCallRow[]>([]);
  const [callNotes, setCallNotes] = useState<CallNoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  // Failed loads, shown as an error card where the data would be (not as an
  // empty state): the account / class list, the roster, modules, call notes.
  const [loadError, setLoadError] = useState<{ title: string; retry: () => void | Promise<void> } | null>(null);
  const [rosterError, setRosterError] = useState(false);
  const [modulesError, setModulesError] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [waiting, setWaiting] = useState<UnassignedStudent[]>([]);
  const [groupRows, setGroupRows] = useState<Record<string, Map<string, ProgressEmbed[]>>>({});

  const [section, setSection] = useState<TeacherSection>("today");
  const [learnStep, setLearnStep] = useState<LearnStep>("plan");
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ModuleEditorState | null>(null);
  const [planning, setPlanning] = useState(false);
  const [saveBar, setSaveBar] = useState<SaveBarState>(null);
  const [progressTab, setProgressTab] = useState<{ language: SignLanguage; group: SignGroup }>({ language: "asl", group: "letters" });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Booked calls (0017), across all this teacher's classes.
  const [bookings, setBookings] = useState<CallBooking[]>([]);
  const [bookingsMissing, setBookingsMissing] = useState(false);
  const [bookingsReady, setBookingsReady] = useState(false);
  const [bookingsError, setBookingsError] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleState | null>(null);

  const klass = classes.find((c) => c.id === selectedClassId) ?? null;

  // Every figure on this screen counts only the class plan's words - the
  // same numbers each student sees on their own dashboard.
  const progress = useMemo(
    () => rawProgress.map((p) => ({ ...p, mastered: countMastered(p.masteredRows, plan) })),
    [rawProgress, plan]
  );

  const self: CallPeer | null = profile ? { id: profile.id, name: profile.full_name } : null;
  // Calls ring on the selected class's students' channels - a student in
  // another of this teacher's classes reaches them only while that class is
  // selected.
  const rosterIds = useMemo(() => progress.map((p) => p.id), [progress]);
  // A student can only ring during their booked time (0017); the teacher's
  // app turns other rings down. Until the bookings have loaded - or without
  // the 0017 table - rings get through as before.
  const bookingGate = useRef({ bookings, on: false });
  bookingGate.current = { bookings, on: bookingsReady && !bookingsMissing };
  const canBeRungBy = useCallback(
    (studentId: string) => !bookingGate.current.on || !!openBooking(bookingGate.current.bookings, studentId, Date.now(), CLOCK_SLACK_MS),
    []
  );
  const call = useVideoCall(klass?.id ?? null, self, rosterIds, canBeRungBy);
  const presence = call.presence as Record<string, PresenceStatus>;

  // ---- each group's lesson_progress rows, loaded once per class ----
  const classIdRef = useRef<string | null>(null);
  classIdRef.current = selectedClassId;
  const groupRowsRef = useRef(groupRows);
  groupRowsRef.current = groupRows;
  const inFlight = useRef(new Set<string>());
  // Bumped by resetGroups, so a fetch that started before a refresh can't
  // put its (older) rows back afterwards.
  const generation = useRef(0);
  const ensureGroup = useCallback((language: SignLanguage, group: SignGroup) => {
    const classId = classIdRef.current;
    if (!classId || !getGroup(language, group).available) return;
    const key = `${classId}|${language}:${group}`;
    if (groupRowsRef.current[key] || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    const gen = generation.current;
    getClassGroupProgress(classId, language, group).then(({ data, error }) => {
      if (gen !== generation.current) return;
      inFlight.current.delete(key);
      if (error || !data) {
        setNotice({ kind: "error", message: error?.message ?? "Couldn't load progress." });
        return;
      }
      setGroupRows((prev) => ({ ...prev, [key]: data }));
    });
  }, []);
  const rowsFor = useCallback(
    (language: SignLanguage, group: SignGroup) => groupRows[`${selectedClassId}|${language}:${group}`] ?? null,
    [groupRows, selectedClassId]
  );
  const resetGroups = useCallback(() => {
    generation.current += 1;
    inFlight.current.clear();
    groupRowsRef.current = {};
    setGroupRows({});
  }, []);

  // ---- loading ----
  const profileId = profile?.id ?? null;
  const loadCallHistory = useCallback(async () => {
    if (!profileId) return;
    const missed = await getMissedCalls(profileId);
    setMissedCalls(missed.data);
    const classId = classIdRef.current;
    if (!classId) return;
    setNotesLoading(true);
    setNotesError(false);
    const notes = await getCallNotes(classId);
    setNotesLoading(false);
    if (notes.error) setNotesError(true);
    else setCallNotes(notes.data);
  }, [profileId]);

  // Every minute too, so a booking made on another device shows up.
  const loadBookings = useCallback(async () => {
    if (!profileId) return;
    const res = await getTeacherBookings(profileId);
    setBookingsError(!!res.error);
    if (res.error) return; // keep the last list
    setBookings(res.data);
    setBookingsMissing(res.missing);
    setBookingsReady(true);
  }, [profileId]);
  useEffect(() => {
    void loadBookings();
    const id = setInterval(() => void loadBookings(), 60_000);
    return () => clearInterval(id);
  }, [loadBookings]);

  const loadRoster = useCallback(async (classId: string) => {
    setRosterLoading(true);
    setRosterError(false);
    const { data, error } = await getClassProgressSummary(classId);
    setRosterLoading(false);
    if (error) setRosterError(true);
    else setProgress(data ?? []);
  }, []);

  const loadPlan = useCallback(async (classId: string) => {
    setPlan({});
    const { data, error } = await getClassPlan(classId);
    if (error) setNotice({ kind: "error", message: error.message });
    setPlan(data);
  }, []);

  const loadModules = useCallback(async (classId: string) => {
    setModulesLoading(true);
    setModulesError(false);
    const { data, error } = await getModulesForClass(classId);
    setModulesLoading(false);
    if (error) setModulesError(true);
    else setModules(data);
  }, []);

  const loadWaiting = useCallback(async () => {
    const { data, error } = await listUnassignedStudents();
    if (!error) setWaiting(data);
  }, []);

  const openClass = useCallback(
    async (classId: string) => {
      resetGroups();
      setProgress([]);
      setModules([]);
      setCallNotes([]);
      await Promise.all([loadRoster(classId), loadPlan(classId), loadModules(classId), loadWaiting()]);
    },
    [resetGroups, loadRoster, loadPlan, loadModules, loadWaiting]
  );

  const load = useCallback(
    async (preferClassId?: string | null) => {
      setLoading(true);
      setLoadError(null);
      const { data: me, error: profileError } = await getMyProfile();
      if (profileError || !me) {
        setLoadError({ title: "Couldn't load your account", retry: () => load(preferClassId) });
        setLoading(false);
        return;
      }
      setProfile(me as Profile);
      const { data: mine, error: classErr } = await getMyClassesAsTeacher(me.id);
      if (classErr) {
        setLoadError({ title: "Couldn't load your classes", retry: () => load(preferClassId) });
        setLoading(false);
        return;
      }
      const list = (mine as ClassRow[]) ?? [];
      setClasses(list);
      const nextId = list.find((c) => c.id === preferClassId)?.id ?? list[0]?.id ?? null;
      setSelectedClassId(nextId);
      classIdRef.current = nextId;
      if (nextId) await openClass(nextId);
      else setProgress([]);
      setLoading(false);
    },
    [openClass]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Today needs every group's rows (stuck signs, module completion).
  useEffect(() => {
    if (!selectedClassId) return;
    for (const g of availableGroups()) ensureGroup(g.language, g.group);
  }, [selectedClassId, groupRows, ensureGroup]);

  // Missed calls and notes on load, on a class switch and after a call; a
  // call can also change progress (practice in the call), so then the
  // roster and progress rows are re-read too.
  const prevCallState = useRef(call.callState);
  useEffect(() => {
    const was = prevCallState.current;
    prevCallState.current = call.callState;
    if (call.callState !== "idle") return;
    void loadCallHistory();
    if (was !== "idle" && classIdRef.current) {
      resetGroups();
      void loadRoster(classIdRef.current);
    }
  }, [call.callState, loadCallHistory, loadRoster, resetGroups]);
  useEffect(() => {
    void loadCallHistory();
  }, [selectedClassId, loadCallHistory]);

  // ---- class actions ----
  const selectClass = (id: string) => {
    if (id === selectedClassId) return;
    setSelectedClassId(id);
    classIdRef.current = id;
    setDetailId(null);
    setEditor(null);
    setRosterFilter("all");
    void openClass(id);
  };

  const classActions: ClassActions = {
    onSelect: selectClass,
    onCreate: async (name) => {
      if (!profile) return false;
      const { data, error } = await createClass(name, profile.id);
      if (error) {
        setNotice({ kind: "error", message: error.message });
        return false;
      }
      setNotice({ kind: "success", message: `Created "${name}". Share its class code or add students who signed up.` });
      setSection("students");
      await load((data as ClassRow).id);
      return true;
    },
    onRename: async (name) => {
      if (!klass) return false;
      const { error } = await renameClass(klass.id, name);
      if (error) {
        setNotice({ kind: "error", message: error.message });
        return false;
      }
      setClasses((prev) => prev.map((c) => (c.id === klass.id ? { ...c, name } : c)));
      setNotice({ kind: "success", message: "Class renamed." });
      return true;
    },
    onDelete: async () => {
      if (!klass) return false;
      const { error } = await deleteClass(klass.id);
      if (error) {
        setNotice({ kind: "error", message: error.message });
        return false;
      }
      setNotice({ kind: "success", message: `Deleted "${klass.name}".` });
      await load();
      return true;
    },
  };

  const copyCode = () => {
    if (!klass || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(klass.join_code)
      .then(() => setNotice({ kind: "success", message: `Copied the class code ${klass.join_code}.` }))
      .catch(() => setNotice({ kind: "error", message: "Couldn't copy. Select the code instead." }));
  };
  const print = () => {
    if (klass && !printClassCode(klass))
      setNotice({
        kind: "error",
        message: isAndroidApp()
          ? "The Android app can't print. Copy the class code instead, or print it from a computer."
          : "Allow pop-ups for LCSign to print the class code.",
      });
  };

  const removeStudent = async (student: StudentProgressSummary) => {
    if (!klass) return false;
    const { error } = await removeStudentFromClass(student.id);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return false;
    }
    setProgress((prev) => prev.filter((p) => p.id !== student.id));
    if (detailId === student.id) setDetailId(null);
    setNotice({ kind: "success", message: `Removed ${student.full_name || "the student"} from ${klass.name}.` });
    void loadWaiting();
    return true;
  };

  const addWaiting = async (ids: string[]) => {
    if (!klass) return;
    const { data, error } = await addStudentsToClass(klass.id, ids);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    const skipped = ids.length - data.length;
    setNotice({
      kind: "success",
      message: `Added ${data.length} student${data.length === 1 ? "" : "s"} to ${klass.name}.${skipped ? ` ${skipped} had already joined another class.` : ""}`,
    });
    resetGroups();
    await Promise.all([loadRoster(klass.id), loadWaiting()]);
  };

  const startCall = (s: { id: string; name: string }) => call.startCall({ id: s.id, name: s.name });
  const dismissMissed = (ids: string[]) => {
    setMissedCalls((prev) => prev.filter((c) => !ids.includes(c.id)));
    void markMissedCallsSeen(ids);
  };
  const removeNote = async (id: string) => {
    const { error } = await deleteCallNote(id);
    if (error) setNotice({ kind: "error", message: error.message });
    else setCallNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const openModuleEditor = (state: ModuleEditorState) => {
    setSection("learn");
    setLearnStep("modules");
    setEditor(state);
  };

  // ---- figures ----
  const overallOf = (p: StudentProgressSummary) => computeOverall(p.mastered, plan);
  const classAverage = progress.length ? progress.reduce((sum, p) => sum + overallOf(p), 0) / progress.length : 0;
  const groups = classGroupAverages(progress, plan);
  const nameOf = (id: string) => progress.find((p) => p.id === id)?.full_name || "A student";
  const online = progress
    .filter((p) => isOnline(presence[p.id]))
    .map((p) => ({ id: p.id, name: p.full_name, status: presence[p.id] }))
    .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "available" ? -1 : 1));

  const stuck = useMemo(() => {
    let best: { language: SignLanguage; group: SignGroup; signs: ReturnType<typeof stuckSigns> } | null = null;
    for (const g of availableGroups()) {
      const rows = groupRows[`${selectedClassId}|${g.language}:${g.group}`];
      if (!rows) continue;
      const signs = stuckSigns(signsToReview(rows, planSigns(g.language, g.group, plan), 8), progress.length);
      if (signs.length && (!best || signs[0].stuck > best.signs[0].stuck)) best = { language: g.language, group: g.group, signs };
    }
    return best;
  }, [groupRows, selectedClassId, plan, progress.length]);

  const studentIds = rosterIds;
  const moduleFacts = modules.map((m) => {
    const signs = moduleSigns(m);
    return { id: m.id, title: m.title, due_date: m.due_date, signs: signs.length, finished: moduleCompletion(signs, studentIds, rowsFor(m.language, m.sign_group), m.created_at).finished };
  });

  const missedHere = missedCalls.filter((c) => c.class_id === klass?.id);
  const items: NeedsYouItem[] = klass
    ? needsYou({
        missed: missedHere,
        nameOf: (id) => progress.find((p) => p.id === id)?.full_name ?? null,
        students: progress.map((p) => ({ id: p.id, name: p.full_name, overall: overallOf(p) })),
        stuck,
        modules: moduleFacts,
        waiting: waiting.map((w) => ({ id: w.id, name: w.full_name || w.email || "A student" })),
      })
    : [];

  if (call.callState !== "idle" && self && klass) {
    return <VideoCallScreen role="teacher" call={call} self={self} classId={klass.id} className={klass.name} plan={plan} accentColor={accentColor} />;
  }

  const shell = {
    accentColor,
    roleLabel: "Teacher",
    userName: profile?.full_name ?? "...",
    onSignOut,
    onExitToStart,
    onOpenTranslator,
    profile,
    onProfileChange: (p: Profile) => {
      setProfile(p);
      onAccountChange();
    },
  };

  if (!klass) {
    return (
      <DashboardShell {...shell} contentMaxWidth={1100}>
        <Notice notice={notice} onDismiss={() => setNotice(null)} />
        {loading ? (
          <PageSkeleton />
        ) : loadError ? (
          <LoadErrorCard title={loadError.title} onRetry={loadError.retry} />
        ) : (
          <FirstRunCard onCreate={classActions.onCreate} />
        )}
      </DashboardShell>
    );
  }

  const detailStudent = progress.find((p) => p.id === detailId) ?? null;
  // No roster to show: Today, Students and Progress show the error instead
  // of an empty class. Learn still works (plan and modules), with a notice.
  const rosterBlocked = rosterError && progress.length === 0 && section !== "learn";
  const retryRoster = () => loadRoster(klass.id);
  const tabs = SECTIONS.map((s) => ({
    key: s.key,
    label: s.short,
    icon: (c: string) => s.icon(c, 20),
    badge: s.key === "today" && items.length ? items.length : undefined,
    badgeLabel: `${items.length} thing${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} you`,
  }));

  return (
    <DashboardShell
      {...shell}
      contentMaxWidth={1600}
      scrollKey={`${section}:${klass.id}`}
      rail={
        <TeacherRail
          classes={classes}
          klass={klass}
          studentCount={rosterLoading && progress.length === 0 ? null : progress.length}
          section={section}
          onSection={setSection}
          needsCount={items.length}
          actions={classActions}
          onCopyCode={copyCode}
        />
      }
      tabs={tabs}
      activeTab={section}
      onTab={(k) => setSection(k as TeacherSection)}
      footer={section === "learn" && learnStep === "plan" && saveBar ? <SaveBar bar={saveBar} /> : null}
      leaveGuard={saveBar?.leaveMessage ?? null}
    >
      {!isDesktop ? (
        <View style={styles.switcherRow}>
          <ClassSwitcher classes={classes} klass={klass} studentCount={progress.length} actions={classActions} fullWidth />
        </View>
      ) : null}
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      {rosterError && !rosterBlocked ? (
        <Notice notice={{ kind: "error", ...LOAD_ERROR, retry: retryRoster }} onDismiss={() => setRosterError(false)} />
      ) : null}

      {loading && progress.length === 0 && rosterLoading ? (
        <PageSkeleton />
      ) : rosterBlocked ? (
        <LoadErrorCard title={LOAD_ERROR.title} message={LOAD_ERROR.message} onRetry={retryRoster} />
      ) : section === "today" ? (
        <TeacherToday
          klass={klass}
          phone={phone}
          compact={compact || !isDesktop}
          items={items}
          classSize={progress.length}
          classAverage={classAverage}
          groups={groups}
          online={online}
          presenceOf={(id) => presence[id]}
          lastNote={callNotes[0] ?? null}
          nameOf={nameOf}
          onCallBack={(item) => {
            dismissMissed(item.ids);
            startCall({ id: item.callerId, name: item.name });
          }}
          onDismissMissed={dismissMissed}
          onSeeUnder25={() => {
            setRosterFilter("under25");
            setSection("students");
          }}
          onMakeModule={(item) =>
            openModuleEditor({
              module: null,
              preset: { language: item.language, group: item.group, signs: item.signs.map((s) => s.sign), title: `${groupLabel(item.language, item.group)} to review` },
            })
          }
          onOpenModule={(id) => {
            const m = modules.find((x) => x.id === id);
            if (m) openModuleEditor({ module: m });
          }}
          onAddWaiting={addWaiting}
          onCall={startCall}
          booked={
            <BookedCallsCard
              bookings={bookings}
              missing={bookingsMissing}
              error={bookingsError}
              onRetry={() => void loadBookings()}
              klass={klass}
              classes={classes}
              nameOf={nameOf}
              onBook={() => setSchedule({ mode: "form" })}
              onOpenAll={() => setSchedule({ mode: "list" })}
              onCall={startCall}
              onOpenClass={selectClass}
            />
          }
          onAllNotes={() => setNotesOpen(true)}
          onGoStudents={() => setSection("students")}
        />
      ) : section === "students" ? (
        <TeacherStudents
          klass={klass}
          students={progress}
          plan={plan}
          presence={presence}
          loading={rosterLoading}
          filter={rosterFilter}
          onFilter={setRosterFilter}
          table={contentWidth >= 880}
          onOpen={setDetailId}
          onCall={startCall}
          onRemove={removeStudent}
          onInvite={() => setInviteOpen(true)}
          onPrint={print}
          onCopyCode={copyCode}
        />
      ) : section === "learn" ? (
        <TeacherLearn
          klass={klass}
          plan={plan}
          onPlanSaved={setPlan}
          step={learnStep}
          onStep={setLearnStep}
          modules={modules}
          modulesLoading={modulesLoading}
          modulesError={modulesError}
          reloadModules={() => void loadModules(klass.id)}
          setModules={setModules}
          students={progress}
          rowsFor={rowsFor}
          ensureGroup={ensureGroup}
          setNotice={setNotice}
          onSaveBar={setSaveBar}
          editor={editor}
          setEditor={setEditor}
          planning={planning}
          setPlanning={setPlanning}
          accentColor={accentColor}
          phone={phone}
          wide={isDesktop}
        />
      ) : (
        <TeacherProgress
          students={progress}
          plan={plan}
          language={progressTab.language}
          group={progressTab.group}
          onTabs={(language, group) => {
            setProgressTab({ language, group });
            ensureGroup(language, group);
          }}
          rows={rowsFor(progressTab.language, progressTab.group)}
          groups={groups}
          onOpenStudent={setDetailId}
          onMakeModule={(signs) =>
            openModuleEditor({
              module: null,
              preset: { language: progressTab.language, group: progressTab.group, signs, title: `${groupLabel(progressTab.language, progressTab.group)} to review` },
            })
          }
          onPracticeInCall={() => {
            setRosterFilter("online");
            setSection("students");
          }}
          phone={phone}
          compact={compact}
        />
      )}

      <StudentDetailDrawer
        student={detailStudent}
        klass={klass}
        plan={plan}
        presence={detailStudent ? presence[detailStudent.id] : undefined}
        rowsFor={rowsFor}
        ensureGroup={ensureGroup}
        modules={modules}
        notes={callNotes}
        phone={phone}
        onClose={() => setDetailId(null)}
        onCall={() => detailStudent && startCall({ id: detailStudent.id, name: detailStudent.full_name })}
        booking={bookingsMissing || !detailStudent ? undefined : nextBooking(bookings, detailStudent.id, Date.now())}
        onBook={(b) => {
          if (!detailStudent) return;
          setDetailId(null);
          setSchedule(b ? { mode: "form", booking: b } : { mode: "form", studentId: detailStudent.id });
        }}
        onRemove={() => (detailStudent ? removeStudent(detailStudent) : Promise.resolve(false))}
      />

      {profile ? (
        <CallScheduleDrawer
          state={schedule}
          onState={setSchedule}
          teacherId={profile.id}
          klass={klass}
          classes={classes}
          students={progress}
          bookings={bookings}
          missing={bookingsMissing}
          nameOf={nameOf}
          onChanged={loadBookings}
          setNotice={setNotice}
        />
      ) : null}

      <SideDrawer visible={inviteOpen} onClose={() => setInviteOpen(false)} width={560}>
        <View style={styles.drawerHead}>
          <Text style={styles.drawerTitle} accessibilityRole="header">
            Invite students
          </Text>
          <CloseButton onPress={() => setInviteOpen(false)} />
        </View>
        <JoinCodeCard klass={klass} setNotice={setNotice} onCodeChanged={(code) => setClasses((prev) => prev.map((c) => (c.id === klass.id ? { ...c, join_code: code } : c)))} />
        <InviteStudentsCard
          klass={klass}
          accentColor={accentColor}
          setNotice={setNotice}
          onAdded={() => {
            resetGroups();
            void loadRoster(klass.id);
            void loadWaiting();
          }}
        />
      </SideDrawer>

      <SideDrawer visible={notesOpen} onClose={() => setNotesOpen(false)} width={600}>
        <View style={styles.drawerHead}>
          <Text style={styles.drawerTitle} accessibilityRole="header">
            Call notes
          </Text>
          <CloseButton onPress={() => setNotesOpen(false)} />
        </View>
        <CallNotesCard notes={callNotes} nameOf={nameOf} onDelete={removeNote} loading={notesLoading} onRetry={notesError ? loadCallHistory : undefined} />
      </SideDrawer>
    </DashboardShell>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  switcherRow: { marginBottom: 16 },
  drawerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  drawerTitle: { fontFamily: fonts.heading, fontSize: 24, color: colors.textPrimary },
});
