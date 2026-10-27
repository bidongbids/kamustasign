// Teacher dashboard: run your classes (create / rename / delete), invite
// students (class code or ticking them from a list), choose the class's
// learning plan (which word categories and words it learns), author modules,
// call a student, and follow the class's progress. Real reads/writes against
// Supabase, scoped by RLS - a teacher only ever sees their own class's
// students because the database enforces that (0002/0006), and roster
// changes go through the owner-checked functions in
// 0009_teacher_classroom.sql.
//
// Desktop: a side rail (classes, then the sections) beside the selected
// class. Phones: the same pieces stacked, sections as a segmented toggle.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { colors, fonts, radii, spacing } from "../../theme/theme";
import { neuInset } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";
import CurriculumTabs from "./CurriculumTabs";
import StudentProgressRow from "./StudentProgressRow";
import SignReviewRow from "./SignReviewRow";
import TeacherModules from "./TeacherModules";
import ClassPlanEditor from "./ClassPlanEditor";
import { InviteStudentsCard, JoinCodeCard } from "./InviteStudents";
import SegmentedToggle from "../../components/SegmentedToggle";
import ProgressBar from "../../components/ProgressBar";
import {
  ActionButton,
  Avatar,
  ChoicePills,
  ConfirmInline,
  InlineField,
  Notice,
  StatTile,
  type NoticeState,
} from "./ManageKit";
import {
  BookIcon,
  ChartIcon,
  LayersIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  UsersIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import {
  getMyProfile,
  getMyClassesAsTeacher,
  createClass,
  renameClass,
  deleteClass,
  removeStudentFromClass,
  getClassPlan,
  getClassProgressSummary,
  getClassGroupProgress,
  getMissedCalls,
  markMissedCallsSeen,
  getCallNotes,
  deleteCallNote,
  type CallNoteRow,
  type MissedCallRow,
  type Profile,
  type ClassRow,
  type StudentProgressSummary,
} from "../../lib/queries";
import {
  CURRICULUM,
  OVERALL_CAPTION,
  computeOverall,
  countMastered,
  getGroup,
  groupFraction,
  planSigns,
  type ClassPlan,
  type SignGroup,
  type SignLanguage,
} from "../../lib/curriculum";
import { signsToReview, type SignInsight } from "../../lib/classInsights";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import { CallNotesCard, MissedCallsCard, PresenceDot } from "./CallHistory";
import type { CallPeer } from "../../lib/callSignaling";

type SortKey = "overall" | "group" | "name";
type Section = "students" | "plan" | "modules" | "progress";

const webCursor = Platform.OS === "web" ? ({ cursor: "pointer" } as any) : null;

const SECTIONS: { key: Section; label: string; icon: (color: string) => React.ReactNode }[] = [
  { key: "students", label: "Students", icon: (c) => <UsersIcon size={18} color={c} /> },
  { key: "plan", label: "Learning plan", icon: (c) => <BookIcon size={18} color={c} /> },
  { key: "modules", label: "Modules", icon: (c) => <LayersIcon size={18} color={c} /> },
  { key: "progress", label: "Progress", icon: (c) => <ChartIcon size={18} color={c} /> },
];

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
  /** The Account panel changed the name or 2FA - App reloads the profile. */
  onAccountChange: () => void;
};

export default function TeacherDashboard({ accentColor, onSignOut, onExitToRoleSelect, onAccountChange }: Props) {
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [rawProgress, setProgress] = useState<StudentProgressSummary[]>([]);
  const [plan, setPlan] = useState<ClassPlan>({});
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [group, setGroup] = useState<SignGroup>("letters");
  const [sortBy, setSortBy] = useState<SortKey>("overall");
  const [section, setSection] = useState<Section>("students");
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [review, setReview] = useState<SignInsight[] | null>(null);
  const [missedCalls, setMissedCalls] = useState<MissedCallRow[]>([]);
  const [callNotes, setCallNotes] = useState<CallNoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);

  // Forms / pending actions
  const [newClassName, setNewClassName] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);
  const [showNewClass, setShowNewClass] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

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
  const call = useVideoCall(klass?.id ?? null, self, rosterIds);

  // Missed calls and call notes: on load, on a class switch, and whenever a
  // call (or an unanswered ring) is over.
  const profileId = profile?.id ?? null;
  const classIdForNotes = klass?.id ?? null;
  const loadCallHistory = useCallback(async () => {
    if (!profileId) return;
    const missed = await getMissedCalls(profileId);
    setMissedCalls(missed.data);
    if (!classIdForNotes) return;
    setNotesLoading(true);
    const notes = await getCallNotes(classIdForNotes);
    setNotesLoading(false);
    if (notes.error) setNotice({ kind: "error", message: notes.error.message });
    setCallNotes(notes.data);
  }, [profileId, classIdForNotes]);
  useEffect(() => {
    if (call.callState === "idle") void loadCallHistory();
  }, [call.callState, loadCallHistory]);
  const dismissMissed = (ids: string[]) => {
    setMissedCalls((prev) => prev.filter((c) => !ids.includes(c.id)));
    void markMissedCallsSeen(ids);
  };
  const removeNote = async (id: string) => {
    const { error } = await deleteCallNote(id);
    if (error) setNotice({ kind: "error", message: error.message });
    else setCallNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const loadRoster = useCallback(async (classId: string) => {
    setRosterLoading(true);
    const { data, error } = await getClassProgressSummary(classId);
    setRosterLoading(false);
    if (error) setNotice({ kind: "error", message: error.message });
    else setProgress(data ?? []);
  }, []);

  const loadPlan = useCallback(async (classId: string) => {
    setPlan({});
    const { data, error } = await getClassPlan(classId);
    if (error) setNotice({ kind: "error", message: error.message });
    setPlan(data);
  }, []);

  const load = useCallback(
    async (preferClassId?: string | null) => {
      setLoading(true);
      const { data: me, error: profileError } = await getMyProfile();
      if (profileError || !me) {
        setNotice({ kind: "error", message: profileError?.message ?? "Couldn't load your profile." });
        setLoading(false);
        return;
      }
      setProfile(me as Profile);

      const { data: mine, error: classErr } = await getMyClassesAsTeacher(me.id);
      if (classErr) {
        setNotice({ kind: "error", message: classErr.message });
        setLoading(false);
        return;
      }
      const list = (mine as ClassRow[]) ?? [];
      setClasses(list);
      const nextId =
        list.find((c) => c.id === preferClassId)?.id ?? list[0]?.id ?? null;
      setSelectedClassId(nextId);
      if (nextId) await Promise.all([loadRoster(nextId), loadPlan(nextId)]);
      else setProgress([]);
      setLoading(false);
    },
    [loadRoster, loadPlan]
  );

  useEffect(() => {
    load();
  }, [load]);

  // "Signs to review" for the group tab on screen; refetched when the class,
  // tab, plan or roster changes. Only while the Progress section is open.
  useEffect(() => {
    if (section !== "progress" || !selectedClassId || !getGroup(language, group).available) {
      setReview(null);
      return;
    }
    let cancelled = false;
    getClassGroupProgress(selectedClassId, language, group).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setNotice({ kind: "error", message: error.message });
      setReview(data ? signsToReview(data, planSigns(language, group, plan)) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [section, selectedClassId, language, group, rawProgress, plan]);

  const selectClass = (id: string) => {
    if (id === selectedClassId) return;
    setSelectedClassId(id);
    setRenaming(false);
    setConfirmDelete(false);
    setConfirmRemoveId(null);
    setProgress([]);
    loadRoster(id);
    loadPlan(id);
  };

  // ---- class CRUD ----

  const handleCreateClass = async () => {
    const name = newClassName.trim();
    if (!profile || !name) return;
    setCreatingClass(true);
    const { data, error } = await createClass(name, profile.id);
    setCreatingClass(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setNewClassName("");
    setShowNewClass(false);
    setNotice({ kind: "success", message: `Created "${name}". Share its class code or tick students to invite them.` });
    setSection("students");
    load((data as ClassRow).id);
  };

  const handleRename = async () => {
    const name = renameValue.trim();
    if (!klass || !name) return;
    setSavingRename(true);
    const { error } = await renameClass(klass.id, name);
    setSavingRename(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setClasses((prev) => prev.map((c) => (c.id === klass.id ? { ...c, name } : c)));
    setRenaming(false);
    setNotice({ kind: "success", message: "Class renamed." });
  };

  const handleDelete = async () => {
    if (!klass) return;
    setDeleting(true);
    const { error } = await deleteClass(klass.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setNotice({ kind: "success", message: `Deleted "${klass.name}".` });
    load();
  };

  // ---- roster ----

  const setJoinCode = (code: string) =>
    setClasses((prev) => prev.map((c) => (c.id === selectedClassId ? { ...c, join_code: code } : c)));

  const handleRemoveStudent = async (student: StudentProgressSummary) => {
    if (!klass) return;
    setRemoving(true);
    const { error } = await removeStudentFromClass(student.id);
    setRemoving(false);
    setConfirmRemoveId(null);
    if (error) {
      setNotice({ kind: "error", message: error.message });
      return;
    }
    setProgress((prev) => prev.filter((p) => p.id !== student.id));
    setNotice({ kind: "success", message: `Removed ${student.full_name || "the student"} from ${klass.name}.` });
  };

  // The same overall figure the student sees (computeOverall). Lowest first,
  // so whoever is stuck surfaces at the top without hunting; "group" ranks by
  // the group tab currently selected instead.
  const groupDef = getGroup(language, group);
  const sortOptions: { key: SortKey; label: string; disabled?: boolean }[] = [
    { key: "overall", label: "Overall" },
    { key: "group", label: groupDef.label, disabled: !groupDef.available },
    { key: "name", label: "Name" },
  ];
  const overallOf = (p: StudentProgressSummary) => computeOverall(p.mastered, plan);
  const sortedProgress = [...progress].sort((x, y) => {
    if (sortBy === "name") return x.full_name.localeCompare(y.full_name);
    const score = (p: StudentProgressSummary) =>
      sortBy === "group" ? groupFraction(language, group, p.mastered, plan) : overallOf(p);
    return score(x) - score(y) || x.full_name.localeCompare(y.full_name);
  });
  const roster = [...progress].sort((x, y) => x.full_name.localeCompare(y.full_name));
  const classAverage = progress.length ? progress.reduce((sum, p) => sum + overallOf(p), 0) / progress.length : 0;
  // Students under a quarter of the plan - the ones to check on first.
  const needHelp = progress.filter((p) => overallOf(p) < 0.25).length;
  const planWords = CURRICULUM.filter((l) => getGroup(l.language, "words").available).map((l) => ({
    label: l.label,
    planned: planSigns(l.language, "words", plan).length,
    total: getGroup(l.language, "words").signs.length,
  }));
  const planSummary = planWords
    .map((w) => (w.planned === w.total ? `${w.label}: all ${w.total}` : `${w.label}: ${w.planned}/${w.total}`))
    .join(" · ");

  if (call.callState !== "idle" && self && klass) {
    return <VideoCallScreen role="teacher" call={call} self={self} classId={klass.id} className={klass.name} plan={plan} accentColor={accentColor} />;
  }

  const nameOfStudent = (id: string) => progress.find((p) => p.id === id)?.full_name || "A student";
  // This class's missed calls (a teacher with several classes sees each
  // class's under that class).
  const missedHere = missedCalls.filter((c) => c.class_id === klass?.id);

  const newClassForm = (
    <InlineField
      label="Class name"
      value={newClassName}
      onChangeText={setNewClassName}
      placeholder="e.g. Grade 6 - Rizal"
      actionLabel="Create class"
      onSubmit={handleCreateClass}
      busy={creatingClass}
      accentColor={accentColor}
      autoFocus={classes.length > 0}
      onCancel={classes.length > 0 ? () => setShowNewClass(false) : undefined}
    />
  );

  // ---- desktop rail: classes, then sections ----
  const rail = (
    <View style={styles.rail}>
      <DashboardCard>
        <Text style={styles.eyebrow}>YOUR CLASSES</Text>
        <View style={styles.railList}>
          {classes.map((c) => {
            const active = c.id === selectedClassId;
            return (
              <Pressable
                key={c.id}
                onPress={() => selectClass(c.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ hovered }: any) => [
                  styles.railItem,
                  active ? [styles.railItemActive, neuInset("sm")] : hovered && styles.railItemHover,
                  webCursor,
                ]}
              >
                <View style={[styles.railDot, { backgroundColor: active ? accentColor : colors.border }]} />
                <Text style={[styles.railText, active && styles.railTextActive]} numberOfLines={1}>
                  {c.name}
                </Text>
                {active ? <Text style={styles.railMeta}>{rosterLoading ? "…" : progress.length}</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.gapTopSm}>
          {showNewClass ? (
            newClassForm
          ) : (
            <ActionButton
              label="New class"
              variant="ghost"
              icon={(c) => <PlusIcon size={14} color={c} />}
              onPress={() => setShowNewClass(true)}
            />
          )}
        </View>
      </DashboardCard>
      <DashboardCard style={styles.gapTopSm}>
        <Text style={styles.eyebrow}>THIS CLASS</Text>
        <View style={styles.railList}>
          {SECTIONS.map((s) => {
            const active = s.key === section;
            const color = active ? colors.textPrimary : colors.textSecondary;
            return (
              <Pressable
                key={s.key}
                onPress={() => setSection(s.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={({ hovered }: any) => [
                  styles.railItem,
                  active ? [styles.railItemActive, neuInset("sm")] : hovered && styles.railItemHover,
                  webCursor,
                ]}
              >
                {s.icon(active ? accentColor : color)}
                <Text style={[styles.railText, active && styles.railTextActive]}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </DashboardCard>
    </View>
  );

  const classHeader = klass && (
    <DashboardCard>
      <View style={styles.headerTop}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>{isDesktop ? "CLASS" : classes.length > 1 ? "YOUR CLASSES" : "YOUR CLASS"}</Text>
          {renaming ? null : <Text style={styles.className}>{klass.name}</Text>}
          {!renaming ? (
            <Text style={ds.itemMeta}>
              Class code <Text style={styles.code}>{klass.join_code}</Text>
            </Text>
          ) : null}
        </View>
        {!renaming && (
          <View style={styles.row8}>
            <ActionButton
              label="Rename class"
              iconOnly
              icon={(c) => <PencilIcon size={16} color={c} />}
              onPress={() => {
                setRenameValue(klass.name);
                setRenaming(true);
                setConfirmDelete(false);
              }}
            />
            <ActionButton
              label="Delete class"
              iconOnly
              variant="danger"
              icon={(c) => <TrashIcon size={16} color={c} />}
              onPress={() => {
                setConfirmDelete(true);
                setRenaming(false);
              }}
            />
            {!isDesktop ? (
              <ActionButton
                label="New class"
                variant="ghost"
                icon={(c) => <PlusIcon size={14} color={c} />}
                onPress={() => setShowNewClass((v) => !v)}
              />
            ) : null}
          </View>
        )}
      </View>

      {renaming && (
        <View style={styles.gapTop}>
          <InlineField
            label="Class name"
            value={renameValue}
            onChangeText={setRenameValue}
            actionLabel="Save"
            onSubmit={handleRename}
            busy={savingRename}
            accentColor={accentColor}
            autoFocus
            onCancel={() => setRenaming(false)}
          />
        </View>
      )}

      {confirmDelete && (
        <ConfirmInline
          message={`Delete "${klass.name}"? Its ${progress.length} student${progress.length === 1 ? "" : "s"} will be left without a class (their progress is kept). This can't be undone.`}
          confirmLabel="Delete class"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          busy={deleting}
        />
      )}

      {!isDesktop && classes.length > 1 && (
        <View style={styles.gapTop}>
          <ChoicePills
            options={classes.map((c) => ({ key: c.id, label: c.name }))}
            value={selectedClassId}
            onChange={selectClass}
            accentColor={accentColor}
          />
        </View>
      )}

      {!isDesktop && showNewClass && <View style={styles.gapTop}>{newClassForm}</View>}

      <View style={[styles.stats, styles.gapTop]}>
        <StatTile label={progress.length === 1 ? "Student" : "Students"} value={rosterLoading ? "…" : progress.length} />
        <StatTile
          label="Under 25%"
          value={rosterLoading ? "…" : needHelp}
          color={needHelp > 0 ? colors.accentCoral : colors.textPrimary}
        />
        <View style={styles.statWide}>
          <ProgressBar value={classAverage} label="Class average" caption={`${OVERALL_CAPTION}, over the learning plan`} />
        </View>
      </View>
      <Pressable onPress={() => setSection("plan")} accessibilityRole="button" style={[styles.planLine, webCursor]}>
        <BookIcon size={15} color={colors.textSecondary} />
        <Text style={ds.itemMeta}>
          Words in the plan - {planSummary}. <Text style={styles.link}>Change</Text>
        </Text>
      </Pressable>
    </DashboardCard>
  );

  const studentsCard = klass && (
    <DashboardCard title={`Students (${roster.length})`} style={styles.card}>
      {rosterLoading && roster.length === 0 ? (
        <Text style={ds.emptyText}>Loading students…</Text>
      ) : roster.length === 0 ? (
        <Text style={ds.emptyText}>No students yet. Share the class code, or tick students under Invite students.</Text>
      ) : (
        <View style={styles.gapTop}>
          {roster.map((s, i) => (
            <View key={s.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
              <View style={styles.personRow}>
                <Avatar name={s.full_name} color={colors.accentCoral} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={[ds.itemTitle, styles.flexShrink]} numberOfLines={1}>
                      {s.full_name || "(no name)"}
                    </Text>
                    <PresenceDot status={call.presence[s.id]} />
                  </View>
                  <View style={styles.personBar}>
                    <ProgressBar compact value={overallOf(s)} label={`${s.full_name} overall progress`} />
                  </View>
                </View>
                <ActionButton
                  label="Call"
                  variant="primary"
                  accentColor={accentColor}
                  icon={(c) => <VideoIcon size={16} color={c} />}
                  onPress={() => call.startCall({ id: s.id, name: s.full_name })}
                />
                <ActionButton
                  label={`Remove ${s.full_name || "student"} from class`}
                  iconOnly
                  variant="ghost"
                  icon={(c) => <TrashIcon size={16} color={c} />}
                  onPress={() => setConfirmRemoveId(s.id)}
                />
              </View>
              {confirmRemoveId === s.id && (
                <ConfirmInline
                  message={`Remove ${s.full_name || "this student"} from ${klass.name}? Their account and progress stay; they just won't be in your class.`}
                  confirmLabel="Remove"
                  onConfirm={() => handleRemoveStudent(s)}
                  onCancel={() => setConfirmRemoveId(null)}
                  busy={removing}
                />
              )}
            </View>
          ))}
        </View>
      )}
    </DashboardCard>
  );

  const inviteCards = klass && (
    <>
      <JoinCodeCard klass={klass} setNotice={setNotice} onCodeChanged={setJoinCode} />
      <InviteStudentsCard klass={klass} accentColor={accentColor} setNotice={setNotice} onAdded={() => loadRoster(klass.id)} />
    </>
  );

  const progressCard = klass && (
    <View style={styles.card}>
      <CurriculumTabs
        language={language}
        group={group}
        onChange={(l, g) => {
          setLanguage(l);
          setGroup(g);
        }}
      />
      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort by</Text>
        <SegmentedToggle options={sortOptions} value={sortBy} onChange={setSortBy} />
      </View>
      <DashboardCard style={styles.gapTop}>
        <Text style={ds.itemMeta}>
          Overall is the {OVERALL_CAPTION} over this class's learning plan - the same figure each student sees on
          their own dashboard. Lowest first, so whoever needs help is at the top.
        </Text>
        {progress.length === 0 ? (
          <Text style={ds.emptyText}>Progress shows up here once students are in your class.</Text>
        ) : (
          sortedProgress.map((p, i) => (
            <StudentProgressRow
              key={p.id}
              name={p.full_name}
              mastered={p.mastered}
              plan={plan}
              language={language}
              highlightGroup={group}
              first={i === 0}
            />
          ))
        )}
      </DashboardCard>
      {review && (
        <DashboardCard title={`${groupDef.label} to review`} style={styles.gapTop}>
          <Text style={[ds.itemMeta, styles.gapBottom]}>
            Signs the most students have tried but not learned yet, then the ones they are furthest from passing.
            Good candidates for a whole-class demo or a module.
          </Text>
          {review.length === 0 ? (
            <Text style={ds.emptyText}>Nobody is stuck on a {groupDef.label.toLowerCase()} sign right now.</Text>
          ) : (
            review.map((s, i) => <SignReviewRow key={s.sign} insight={s} first={i === 0} />)
          )}
        </DashboardCard>
      )}
    </View>
  );

  const notesCard = klass && (
    <CallNotesCard notes={callNotes} nameOf={nameOfStudent} onDelete={removeNote} loading={notesLoading} />
  );

  const sectionBody = klass && (
    <>
      {section === "students" &&
        (isDesktop ? (
          <View style={styles.columns}>
            <View style={styles.colRight}>
              {studentsCard}
              {notesCard}
            </View>
            <View style={styles.colLeft}>{inviteCards}</View>
          </View>
        ) : (
          <>
            {inviteCards}
            {studentsCard}
            {notesCard}
          </>
        ))}
      {section === "plan" && (
        <ClassPlanEditor klass={klass} plan={plan} accentColor={accentColor} setNotice={setNotice} onSaved={setPlan} />
      )}
      {section === "modules" && (
        <TeacherModules klass={klass} students={roster} accentColor={accentColor} setNotice={setNotice} />
      )}
      {section === "progress" && progressCard}
    </>
  );

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Teacher"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
      profile={profile}
      onProfileChange={(p) => {
        setProfile(p);
        onAccountChange();
      }}
      contentMaxWidth={isDesktop ? 1400 : 1200}
    >
      <Notice notice={notice} onDismiss={() => setNotice(null)} />
      <MissedCallsCard
        calls={missedHere}
        nameOf={(id) => progress.find((p) => p.id === id)?.full_name ?? null}
        onCallBack={(c) => {
          const student = progress.find((p) => p.id === c.caller_id);
          if (student) call.startCall({ id: student.id, name: student.full_name });
        }}
        onDismiss={dismissMissed}
        accentColor={accentColor}
      />

      {loading && !profile ? (
        <DashboardCard>
          <Text style={ds.emptyText}>Loading your class…</Text>
        </DashboardCard>
      ) : !klass ? (
        <DashboardCard title="Create your class">
          <Text style={[ds.itemMeta, styles.gapBottom]}>
            You don't have a class yet. Create one, then invite students with its class code or by ticking them from
            the list - you'll be able to choose what they learn, give them modules, follow their progress and video
            call them.
          </Text>
          {newClassForm}
        </DashboardCard>
      ) : isDesktop ? (
        <View style={styles.desktop}>
          {rail}
          <View style={styles.main}>
            {classHeader}
            {sectionBody}
          </View>
        </View>
      ) : (
        <>
          {classHeader}
          {/* Pills wrap on a narrow phone; four segments wouldn't fit. */}
          <View style={styles.sectionTabs}>
            <ChoicePills
              options={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
              value={section}
              onChange={setSection}
              accentColor={accentColor}
            />
          </View>
          {sectionBody}
        </>
      )}
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  gapTop: { marginTop: spacing.md },
  gapTopSm: { marginTop: spacing.sm },
  gapBottom: { marginBottom: spacing.md },
  card: { marginTop: spacing.md },
  desktop: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  rail: { width: 260, flexShrink: 0 },
  main: { flex: 1, minWidth: 0 },
  railList: { marginTop: spacing.sm, gap: 4 },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: radii.md,
  },
  railItemActive: { backgroundColor: colors.neuWell },
  railItemHover: { backgroundColor: "rgba(255,255,255,0.05)" },
  railDot: { width: 8, height: 8, borderRadius: 4 },
  railText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  railTextActive: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  railMeta: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  // flexBasis lets the action buttons wrap underneath on a phone instead of
  // squeezing the class name into an ellipsis.
  titleBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1.1, color: colors.textSecondary },
  className: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.textPrimary, marginTop: 2 },
  code: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary, letterSpacing: 1.5 },
  stats: { flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "stretch" },
  statWide: { flex: 3, minWidth: 220, justifyContent: "center" },
  planLine: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: spacing.md, alignSelf: "flex-start" },
  link: { fontFamily: fonts.bodySemiBold, color: colors.primaryTealLight, textDecorationLine: "underline" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  flexShrink: { flexShrink: 1 },
  personBar: { marginTop: 6, maxWidth: 360 },
  sectionTabs: { alignItems: "center", marginTop: spacing.md },
  columns: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  colLeft: { flex: 1, minWidth: 0 },
  colRight: { flex: 1.35, minWidth: 0 },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, flexWrap: "wrap" },
  sortLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary, paddingTop: 10 },
});
