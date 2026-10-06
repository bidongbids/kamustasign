// Student dashboard: view assignments for the student's class, submit
// against one, view own scores. Real reads/writes against Supabase, scoped
// by RLS (supabase/migrations/0002_rls.sql) - not just by what this screen
// chooses to query for.
//
// Scope note: video_url is a placeholder string for now, not a real
// recording upload. Wiring actual camera capture (MediaRecorder) + Supabase
// Storage upload into this flow is a follow-up, not done here - see the
// note field below standing in for it. The point of this pass is the real
// CRUD/RLS loop (create a submission row, see it appear, get scored), not
// the recording pipeline.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import DashboardShell, { DashboardCard, dashboardStyles as ds } from "./DashboardShell";
import AuthButton from "../../components/auth/AuthButton";
import AuthTextField from "../../components/auth/AuthTextField";
import { colors, spacing } from "../../theme/theme";
import {
  getMyProfile,
  getAssignmentsForClass,
  getMySubmissions,
  getClassTeacher,
  createSubmission,
  toOne,
  type Profile,
  type AssignmentRow,
} from "../../lib/queries";
import { useVideoCall } from "../../hooks/useVideoCall";
import VideoCallScreen from "../videocall/VideoCallScreen";
import type { CallPeer } from "../../lib/callSignaling";

type ScoreJoin = { is_correct: boolean; confidence: number; predicted_sign: string };

type SubmissionWithJoins = {
  id: string;
  submitted_at: string;
  assignments: { target_sign: string } | { target_sign: string }[] | null;
  scores: ScoreJoin | ScoreJoin[] | null;
};

type Props = {
  accentColor: string;
  onSignOut: () => void;
  onExitToRoleSelect: () => void;
};

export default function StudentDashboard({ accentColor, onSignOut, onExitToRoleSelect }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionWithJoins[]>([]);
  const [teacher, setTeacher] = useState<CallPeer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingFor, setSubmittingFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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
    setProfile(me as Profile);

    if ((me as Profile).class_id) {
      const classId = (me as Profile).class_id as string;
      const [{ data: a, error: aErr }, { data: s, error: sErr }, { data: klass }] = await Promise.all([
        getAssignmentsForClass(classId),
        getMySubmissions(me.id),
        getClassTeacher(classId),
      ]);
      if (aErr) setError(aErr.message);
      else setAssignments((a as AssignmentRow[]) ?? []);
      if (sErr) setError((prev) => prev ?? sErr.message);
      else setSubmissions((s as unknown as SubmissionWithJoins[]) ?? []);
      const teacherProfile = toOne((klass as any)?.profiles ?? null);
      setTeacher(teacherProfile ? { id: teacherProfile.id, name: teacherProfile.full_name } : null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (assignmentId: string) => {
    if (!profile) return;
    setSaving(true);
    const { error: subErr } = await createSubmission(assignmentId, profile.id, note);
    setSaving(false);
    if (subErr) {
      setError(subErr.message);
      return;
    }
    setNote("");
    setSubmittingFor(null);
    load();
  };

  const submittedAssignmentIds = new Set(
    submissions.map((s) => (s as any).assignment_id).filter(Boolean)
  );

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
      roleLabel="Student"
      userName={profile?.full_name ?? "..."}
      onSignOut={onSignOut}
      onExitToRoleSelect={onExitToRoleSelect}
    >
      {error ? <Text style={ds.errorText}>{error}</Text> : null}

      {loading ? (
        <Text style={ds.emptyText}>Loading...</Text>
      ) : !profile?.class_id ? (
        <DashboardCard title="No class yet">
          <Text style={ds.emptyText}>
            Your account isn't assigned to a class yet - ask an admin to assign one.
          </Text>
        </DashboardCard>
      ) : (
        <>
          <Text style={ds.sectionTitle}>Video Call</Text>
          <DashboardCard>
            {teacher ? (
              <View style={ds.spaceBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={ds.itemTitle}>{teacher.name}</Text>
                  <Text style={ds.itemMeta}>Your teacher</Text>
                </View>
                <AuthButton
                  label="Call"
                  accentColor={accentColor}
                  onPress={() => call.startCall(teacher)}
                  style={styles.inlineButton}
                />
              </View>
            ) : (
              <Text style={ds.emptyText}>No teacher assigned to your class yet.</Text>
            )}
          </DashboardCard>

          <Text style={ds.sectionTitle}>Assignments</Text>
          <DashboardCard>
            {assignments.length === 0 ? (
              <Text style={ds.emptyText}>No assignments posted yet.</Text>
            ) : (
              assignments.map((a, i) => {
                const already = submittedAssignmentIds.has(a.id);
                return (
                  <View key={a.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                    <View style={ds.spaceBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={ds.itemTitle}>Sign: {a.target_sign}</Text>
                        <Text style={ds.itemMeta}>
                          {a.due_date ? `Due ${new Date(a.due_date).toLocaleDateString()}` : "No due date"}
                          {already ? " · Submitted" : ""}
                        </Text>
                      </View>
                      {!already && submittingFor !== a.id && (
                        <AuthButton
                          label="Submit"
                          variant="secondary"
                          accentColor={accentColor}
                          onPress={() => setSubmittingFor(a.id)}
                          style={styles.inlineButton}
                        />
                      )}
                    </View>

                    {submittingFor === a.id && (
                      <View style={styles.submitForm}>
                        <AuthTextField
                          label="Note (stand-in for a recorded video for now)"
                          value={note}
                          onChangeText={setNote}
                          placeholder="e.g. recorded on second try"
                        />
                        <View style={ds.row}>
                          <AuthButton
                            label={saving ? "Submitting..." : "Confirm submit"}
                            accentColor={accentColor}
                            loading={saving}
                            onPress={() => handleSubmit(a.id)}
                            style={styles.inlineButton}
                          />
                          <View style={{ width: spacing.sm }} />
                          <AuthButton
                            label="Cancel"
                            variant="secondary"
                            onPress={() => {
                              setSubmittingFor(null);
                              setNote("");
                            }}
                            style={styles.inlineButton}
                          />
                        </View>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </DashboardCard>

          <Text style={ds.sectionTitle}>My scores</Text>
          <DashboardCard>
            {submissions.length === 0 ? (
              <Text style={ds.emptyText}>No submissions yet.</Text>
            ) : (
              submissions.map((s, i) => {
                const assignment = toOne(s.assignments);
                const score = toOne(s.scores);
                return (
                  <View key={s.id} style={[ds.listItem, i === 0 && ds.listItemFirst]}>
                    <Text style={ds.itemTitle}>{assignment?.target_sign ?? "Assignment"}</Text>
                    <Text style={ds.itemMeta}>
                      Submitted {new Date(s.submitted_at).toLocaleDateString()} ·{" "}
                      {score
                        ? `${score.is_correct ? "Correct" : "Needs practice"} (${(score.confidence * 100).toFixed(0)}%)`
                        : "Not graded yet"}
                    </Text>
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
  inlineButton: { minWidth: 110 },
  submitForm: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
});
