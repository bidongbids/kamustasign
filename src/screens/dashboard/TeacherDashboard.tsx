// Teacher dashboard: create/own a class, post assignments, review
// submissions, grade them. Real reads/writes against Supabase, scoped by
// RLS - a teacher only ever sees their own class/assignments/submissions
// because the database enforces that, not because this screen filters for it.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import AuthButton from "../../components/auth/AuthButton";
import AuthTextField from "../../components/auth/AuthTextField";
import { colors, spacing } from "../../theme/theme";
import {
  getMyProfile,
  getMyClassAsTeacher,
  createClass,
  createAssignment,
  deleteAssignment,
  getAssignmentsForClass,
  getSubmissionsForTeacher,
  getStudentsForClass,
  upsertScore,
  toOne,
  type Profile,
  type ClassRow,
  type AssignmentRow,
} from "../../lib/queries";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import type { CallPeer } from "../../lib/callSignaling";

type ScoreJoin = { is_correct: boolean; confidence: number; predicted_sign: string };

type SubmissionWithJoins = {
  id: string;
  submitted_at: string;
  video_url: string;
  assignments: { target_sign: string } | { target_sign: string }[] | null;
  profiles: { full_name: string } | { full_name: string }[] | null;
  scores: ScoreJoin | ScoreJoin[] | null;
};

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

export default function TeacherDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [klass, setKlass] = useState<ClassRow | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithJoins[]>([]);
  const [students, setStudents] = useState<CallPeer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const self: CallPeer | null = profile ? { id: profile.id, name: profile.full_name } : null;
  const call = useVideoCall(klass?.id ?? null, self);

  const [className, setClassName] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);

  const [targetSign, setTargetSign] = useState("");
  const [addingAssignment, setAddingAssignment] = useState(false);

  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeSign, setGradeSign] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: me, error: profileError } = await getMyProfile();
    if (profileError || !me) {
      setError(profileError?.message ?? "Couldn't load your profile.");
      setLoading(false);
      return;
    }
    setProfile(me as Profile);

    const { data: myClass, error: classErr } = await getMyClassAsTeacher(me.id);
    if (classErr) {
      setError(classErr.message);
      setLoading(false);
      return;
    }
    setKlass((myClass as ClassRow) ?? null);

    if (myClass) {
      const [{ data: a, error: aErr }, { data: s, error: sErr }, { data: st }] = await Promise.all([
        getAssignmentsForClass((myClass as ClassRow).id),
        getSubmissionsForTeacher(),
        getStudentsForClass((myClass as ClassRow).id),
      ]);
      if (aErr) setError(aErr.message);
      else setAssignments((a as AssignmentRow[]) ?? []);
      if (sErr) setError((prev) => prev ?? sErr.message);
      else setSubmissions((s as unknown as SubmissionWithJoins[]) ?? []);
      setStudents(((st as { id: string; full_name: string }[]) ?? []).map((p) => ({ id: p.id, name: p.full_name })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreateClass = async () => {
    if (!profile || !className.trim()) return;
    setCreatingClass(true);
    const { error: err } = await createClass(className.trim(), profile.id);
    setCreatingClass(false);
    if (err) {
      setError(err.message);
      return;
    }
    setClassName("");
    load();
  };

  const handleAddAssignment = async () => {
    if (!profile || !klass || !targetSign.trim()) return;
    setAddingAssignment(true);
    const { error: err } = await createAssignment(klass.id, profile.id, targetSign.trim(), null);
    setAddingAssignment(false);
    if (err) {
      setError(err.message);
      return;
    }
    setTargetSign("");
    load();
  };

  const handleDeleteAssignment = async (id: string) => {
    const { error: err } = await deleteAssignment(id);
    if (err) {
      setError(err.message);
      return;
    }
    load();
  };

  const handleGrade = async (submissionId: string, isCorrect: boolean) => {
    if (!gradeSign.trim()) {
      setError("Enter what sign was actually recognized before grading.");
      return;
    }
    setSaving(true);
    const { error: err } = await upsertScore(submissionId, gradeSign.trim(), isCorrect, isCorrect ? 0.95 : 0.4);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setGradingId(null);
    setGradeSign("");
    load();
  };

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
        accentColor={accentColor}
      />
    );
  }

  return (
    <DashboardShell
      accentColor={accentColor}
      roleLabel="Teacher"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
    >
      {error ? <Text style={ds.errorText}>{error}</Text> : null}

      {loading ? (
        <Text style={ds.emptyText}>Loading...</Text>
      ) : !klass ? (
        <DashboardCard title="Create your class">
          <Text style={ds.emptyText}>You don't have a class yet - create one to start posting assignments.</Text>
          <View style={{ height: spacing.sm }} />
          <AuthTextField label="Class name" value={className} onChangeText={setClassName} placeholder="e.g. Grade 6 - Rizal" />
          <AuthButton
            label={creatingClass ? "Creating..." : "Create class"}
            accentColor={accentColor}
            loading={creatingClass}
            onPress={handleCreateClass}
          />
        </DashboardCard>
      ) : (
        <>
          <DashboardCard title={klass.name}>
            <Text style={ds.itemMeta}>Your class - assignments below are scoped to it.</Text>
          </DashboardCard>

          <Text style={ds.sectionTitle}>Video Call</Text>
          <DashboardCard>
            {students.length === 0 ? (
              <Text style={ds.emptyText}>No students in your class yet.</Text>
            ) : (
              students.map((s, i) => (
                <View key={s.id} style={[ds.listItem, i === 0 && ds.listItemFirst, ds.spaceBetween]}>
                  <Text style={ds.itemTitle}>{s.name}</Text>
                  <AuthButton
                    label="Call"
                    accentColor={accentColor}
                    onPress={() => call.startCall(s)}
                    style={styles.inlineButton}
                  />
                </View>
              ))
            )}
          </DashboardCard>

          <Text style={ds.sectionTitle}>Assignments</Text>
          <DashboardCard>
            <AuthTextField label="Post a new assignment (target sign)" value={targetSign} onChangeText={setTargetSign} placeholder="e.g. THANK YOU" />
            <AuthButton
              label={addingAssignment ? "Posting..." : "Post assignment"}
              accentColor={accentColor}
              loading={addingAssignment}
              onPress={handleAddAssignment}
            />
            <View style={{ height: spacing.sm }} />
            {assignments.length === 0 ? (
              <Text style={ds.emptyText}>No assignments posted yet.</Text>
            ) : (
              assignments.map((a, i) => (
                <View key={a.id} style={[ds.listItem, i === 0 && ds.listItemFirst, ds.spaceBetween]}>
                  <View>
                    <Text style={ds.itemTitle}>Sign: {a.target_sign}</Text>
                    <Text style={ds.itemMeta}>Posted {new Date(a.created_at).toLocaleDateString()}</Text>
                  </View>
                  <AuthButton
                    label="Delete"
                    variant="secondary"
                    onPress={() => handleDeleteAssignment(a.id)}
                    style={styles.inlineButton}
                  />
                </View>
              ))
            )}
          </DashboardCard>

          <Text style={ds.sectionTitle}>Submissions</Text>
          <DashboardCard>
            {submissions.length === 0 ? (
              <Text style={ds.emptyText}>No submissions yet.</Text>
            ) : (
              submissions.map((s, i) => {
                const studentProfile = toOne(s.profiles);
                const assignment = toOne(s.assignments);
                const score = toOne(s.scores);
                return (
                <View key={s.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                  <Text style={ds.itemTitle}>
                    {studentProfile?.full_name ?? "Student"} - {assignment?.target_sign ?? "Assignment"}
                  </Text>
                  <Text style={ds.itemMeta}>
                    Submitted {new Date(s.submitted_at).toLocaleDateString()} ·{" "}
                    {score
                      ? `Graded: ${score.is_correct ? "Correct" : "Needs practice"}`
                      : "Not graded yet"}
                  </Text>

                  {gradingId === s.id ? (
                    <View style={styles.submitForm}>
                      <AuthTextField
                        label="Recognized sign"
                        value={gradeSign}
                        onChangeText={setGradeSign}
                        placeholder="what the model/you saw"
                      />
                      <View style={ds.row}>
                        <AuthButton
                          label="Mark correct"
                          accentColor={colors.success}
                          loading={saving}
                          onPress={() => handleGrade(s.id, true)}
                          style={styles.inlineButton}
                        />
                        <View style={{ width: spacing.sm }} />
                        <AuthButton
                          label="Needs practice"
                          accentColor={colors.needsPractice}
                          loading={saving}
                          onPress={() => handleGrade(s.id, false)}
                          style={styles.inlineButton}
                        />
                        <View style={{ width: spacing.sm }} />
                        <AuthButton label="Cancel" variant="secondary" onPress={() => setGradingId(null)} style={styles.inlineButton} />
                      </View>
                    </View>
                  ) : (
                    <AuthButton
                      label={score ? "Re-grade" : "Grade"}
                      variant="secondary"
                      accentColor={accentColor}
                      onPress={() => setGradingId(s.id)}
                      style={styles.inlineButton}
                    />
                  )}
                </View>
                );
              })
            )}
          </DashboardCard>
        </>
      )}
    </DashboardShell>
  );
}

const styles = StyleSheet.create({
  inlineButton: { minWidth: 110, marginTop: spacing.xs },
  submitForm: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
});
