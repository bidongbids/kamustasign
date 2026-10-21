// Teacher dashboard: run your classes (create / rename / delete), invite
// students (class code or ticking them from a list), author modules, call a
// student, and follow the class's progress. Real reads/writes against
// Supabase, scoped by RLS - a teacher only ever sees their own class's
// students because the database enforces that (0002/0006), and roster
// changes go through the owner-checked functions in
// 0009_teacher_classroom.sql.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import { colors, fonts, spacing } from "../../theme/theme";
import { useResponsive } from "../../theme/responsive";
import CurriculumTabs from "./CurriculumTabs";
import StudentProgressRow from "./StudentProgressRow";
import SignReviewRow from "./SignReviewRow";
import TeacherModules from "./TeacherModules";
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
import { PencilIcon, PlusIcon, TrashIcon, VideoIcon } from "../../components/icons/UiIcons";
import {
  getMyProfile,
  getMyClassesAsTeacher,
  createClass,
  renameClass,
  deleteClass,
  removeStudentFromClass,
  getClassProgressSummary,
  getClassGroupProgress,
  type Profile,
  type ClassRow,
  type StudentProgressSummary,
} from "../../lib/queries";
import {
  OVERALL_CAPTION,
  computeOverall,
  getGroup,
  groupFraction,
  type SignGroup,
  type SignLanguage,
} from "../../lib/curriculum";
import { signsToReview, type SignInsight } from "../../lib/classInsights";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import type { CallPeer } from "../../lib/callSignaling";

type SortKey = "overall" | "group" | "name";
type Section = "students" | "modules" | "progress";

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

export default function TeacherDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const { isDesktop } = useResponsive();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [progress, setProgress] = useState<StudentProgressSummary[]>([]);
  const [language, setLanguage] = useState<SignLanguage>("asl");
  const [group, setGroup] = useState<SignGroup>("letters");
  const [sortBy, setSortBy] = useState<SortKey>("overall");
  const [section, setSection] = useState<Section>("students");
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [review, setReview] = useState<SignInsight[] | null>(null);

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

  const self: CallPeer | null = profile ? { id: profile.id, name: profile.full_name } : null;
  // Calls ring on the selected class's channel - a student in another of
  // this teacher's classes reaches them only while that class is selected.
  const call = useVideoCall(klass?.id ?? null, self);

  const loadRoster = useCallback(async (classId: string) => {
    setRosterLoading(true);
    const { data, error } = await getClassProgressSummary(classId);
    setRosterLoading(false);
    if (error) setNotice({ kind: "error", message: error.message });
    else setProgress(data ?? []);
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
      if (nextId) await loadRoster(nextId);
      else setProgress([]);
      setLoading(false);
    },
    [loadRoster]
  );

  useEffect(() => {
    load();
  }, [load]);

  // "Signs to review" for the group tab on screen; refetched when the class,
  // tab or roster changes. Only while the Progress section is open.
  useEffect(() => {
    if (section !== "progress" || !selectedClassId || !getGroup(language, group).available) {
      setReview(null);
      return;
    }
    let cancelled = false;
    getClassGroupProgress(selectedClassId, language, group).then(({ data, error }) => {
      if (cancelled) return;
      if (error) setNotice({ kind: "error", message: error.message });
      setReview(data ? signsToReview(data, getGroup(language, group).signs) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [section, selectedClassId, language, group, progress]);

  const selectClass = (id: string) => {
    if (id === selectedClassId) return;
    setSelectedClassId(id);
    setRenaming(false);
    setConfirmDelete(false);
    setConfirmRemoveId(null);
    setProgress([]);
    loadRoster(id);
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
  const sortedProgress = [...progress].sort((x, y) => {
    if (sortBy === "name") return x.full_name.localeCompare(y.full_name);
    const score = (p: StudentProgressSummary) =>
      sortBy === "group" ? groupFraction(language, group, p.mastered) : computeOverall(p.mastered);
    return score(x) - score(y) || x.full_name.localeCompare(y.full_name);
  });
  const roster = [...progress].sort((x, y) => x.full_name.localeCompare(y.full_name));
  const classAverage = progress.length
    ? progress.reduce((sum, p) => sum + computeOverall(p.mastered), 0) / progress.length
    : 0;

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
        role="teacher"
        remoteSettings={call.remoteSettings}
        sendSettings={call.sendSettings}
        requestSettings={call.requestSettings}
        accentColor={accentColor}
      />
    );
  }

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

  const classHeader = klass && (
    <DashboardCard>
      <View style={styles.headerTop}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>{classes.length > 1 ? "YOUR CLASSES" : "YOUR CLASS"}</Text>
          {renaming ? null : (
            <Text style={styles.className}>
              {klass.name}
            </Text>
          )}
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
            <ActionButton
              label="New class"
              variant="ghost"
              icon={(c) => <PlusIcon size={14} color={c} />}
              onPress={() => setShowNewClass((v) => !v)}
            />
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

      {classes.length > 1 && (
        <View style={styles.gapTop}>
          <ChoicePills
            options={classes.map((c) => ({ key: c.id, label: c.name }))}
            value={selectedClassId}
            onChange={selectClass}
            accentColor={accentColor}
          />
        </View>
      )}

      {showNewClass && <View style={styles.gapTop}>{newClassForm}</View>}

      <View style={[styles.stats, styles.gapTop]}>
        <StatTile label={progress.length === 1 ? "Student" : "Students"} value={rosterLoading ? "…" : progress.length} />
        <View style={styles.statWide}>
          <ProgressBar value={classAverage} label="Class average" caption={OVERALL_CAPTION} />
        </View>
      </View>
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
                  <Text style={ds.itemTitle} numberOfLines={1}>
                    {s.full_name || "(no name)"}
                  </Text>
                  <Text style={ds.itemMeta}>{Math.round(computeOverall(s.mastered) * 100)}% overall</Text>
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
          Overall is the {OVERALL_CAPTION} - the same figure each student sees on their own dashboard. Lowest first,
          so whoever needs help is at the top.
        </Text>
        {progress.length === 0 ? (
          <Text style={ds.emptyText}>Progress shows up here once students are in your class.</Text>
        ) : (
          sortedProgress.map((p, i) => (
            <StudentProgressRow
              key={p.id}
              name={p.full_name}
              mastered={p.mastered}
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

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Teacher"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
      contentMaxWidth={1200}
    >
      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      {loading && !profile ? (
        <DashboardCard>
          <Text style={ds.emptyText}>Loading your class…</Text>
        </DashboardCard>
      ) : !klass ? (
        <DashboardCard title="Create your class">
          <Text style={[ds.itemMeta, styles.gapBottom]}>
            You don't have a class yet. Create one, then invite students with its class code or by ticking them from
            the list - you'll be able to give them modules, follow their progress and video call them.
          </Text>
          {newClassForm}
        </DashboardCard>
      ) : (
        <>
          {classHeader}
          <View style={styles.sectionTabs}>
            <SegmentedToggle
              options={[
                { key: "students", label: "Students" },
                { key: "modules", label: "Modules" },
                { key: "progress", label: "Progress" },
              ]}
              value={section}
              onChange={setSection}
            />
          </View>
          {section === "students" &&
            (isDesktop ? (
              <View style={styles.columns}>
                <View style={styles.colRight}>{studentsCard}</View>
                <View style={styles.colLeft}>{inviteCards}</View>
              </View>
            ) : (
              <>
                {inviteCards}
                {studentsCard}
              </>
            ))}
          {section === "modules" && (
            <TeacherModules klass={klass} students={roster} accentColor={accentColor} setNotice={setNotice} />
          )}
          {section === "progress" && progressCard}
        </>
      )}
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row8: { flexDirection: "row", alignItems: "center", gap: 8 },
  gapTop: { marginTop: spacing.md },
  gapBottom: { marginBottom: spacing.md },
  card: { marginTop: spacing.md },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  // flexBasis lets the action buttons wrap underneath on a phone instead of
  // squeezing the class name into an ellipsis.
  titleBlock: { flexGrow: 1, flexShrink: 1, flexBasis: 240, minWidth: 0 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 11, letterSpacing: 1.1, color: colors.textSecondary },
  className: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.textPrimary, marginTop: 2 },
  stats: { flexDirection: "row", gap: 12, flexWrap: "wrap", alignItems: "stretch" },
  statWide: { flex: 3, minWidth: 220, justifyContent: "center" },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionTabs: { alignItems: "center", marginTop: spacing.md },
  columns: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  colLeft: { flex: 1, minWidth: 0 },
  colRight: { flex: 1.35, minWidth: 0 },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, flexWrap: "wrap" },
  sortLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary, paddingTop: 10 },
});
