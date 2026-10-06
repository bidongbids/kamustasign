// src/lib/queries.ts
// Centralized CRUD calls against the classroom schema
// (supabase/migrations/0001_schema.sql). Kept out of the screens so each
// dashboard focuses on rendering, not query shape. Every function mirrors
// supabase-js's own { data, error } return shape, so screens can destructure
// the same way LoginScreen.tsx already does.
//
// Row Level Security (0002_rls.sql) is the real access-control boundary, not
// these functions - e.g. getSubmissionsForTeacher() has no "where teacher_id
// = me" filter because the database already refuses to return anyone else's
// rows to a teacher, regardless of what a client asks for.
import { supabase } from "./supabase";

export type ProfileRole = "student" | "teacher" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  role: ProfileRole;
  class_id: string | null;
  created_at: string;
};

export type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
  created_at: string;
};

export type AssignmentRow = {
  id: string;
  teacher_id: string;
  class_id: string;
  target_sign: string;
  due_date: string | null;
  created_at: string;
};

// PostgREST embeds a to-one relationship (like scores, which is unique per
// submission) as either a single object or a one-element array depending on
// how the schema cache resolved the join direction - this normalizes either
// shape so screens don't have to guess or crash on the wrong one.
export function toOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ---- current user ----

export async function getMyProfile() {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    return { data: null, error: { message: "Not signed in" } as { message: string } };
  }
  return supabase.from("profiles").select("*").eq("id", userId).single();
}

// ---- student ----

export async function getAssignmentsForClass(classId: string) {
  return supabase
    .from("assignments")
    .select("*")
    .eq("class_id", classId)
    .order("due_date", { ascending: true });
}

// Who the student's "Call your teacher" button in the video call feature
// (Section 5.3) rings. Needs the profiles/0004_rls_call.sql migration
// applied - without it, the embedded teacher profile comes back null under
// RLS even though the class row itself is readable.
export async function getClassTeacher(classId: string) {
  return supabase
    .from("classes")
    .select("id, name, profiles!classes_teacher_id_fkey(id, full_name)")
    .eq("id", classId)
    .single();
}

export async function getMySubmissions(studentId: string) {
  return supabase
    .from("submissions")
    .select("*, assignments(target_sign), scores(is_correct, confidence, predicted_sign)")
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false });
}

// video_url is a placeholder for now - real recording capture/upload to
// Supabase Storage is a follow-up (see FEATURE_REQUEST_translate_tts.md-
// style scope note in the dashboard screen itself). This still exercises a
// real insert against the real submissions table, RLS-scoped to the caller.
export async function createSubmission(assignmentId: string, studentId: string, note: string) {
  return supabase
    .from("submissions")
    .insert({
      assignment_id: assignmentId,
      student_id: studentId,
      video_url: `pending-recording:${note || "no note"}`,
    })
    .select()
    .single();
}

// ---- teacher ----

export async function getMyClassAsTeacher(teacherId: string) {
  return supabase.from("classes").select("*").eq("teacher_id", teacherId).maybeSingle();
}

export async function createClass(name: string, teacherId: string) {
  return supabase.from("classes").insert({ name, teacher_id: teacherId }).select().single();
}

export async function createAssignment(
  classId: string,
  teacherId: string,
  targetSign: string,
  dueDate: string | null
) {
  return supabase
    .from("assignments")
    .insert({ class_id: classId, teacher_id: teacherId, target_sign: targetSign, due_date: dueDate })
    .select()
    .single();
}

export async function deleteAssignment(assignmentId: string) {
  return supabase.from("assignments").delete().eq("id", assignmentId);
}

// Roster the teacher's video call "Call a student" list is built from -
// already covered by the existing "profiles: teacher reads own class
// roster" RLS policy, no new migration needed for this direction.
export async function getStudentsForClass(classId: string) {
  return supabase
    .from("profiles")
    .select("id, full_name")
    .eq("class_id", classId)
    .eq("role", "student")
    .order("full_name", { ascending: true });
}

export async function getSubmissionsForTeacher() {
  return supabase
    .from("submissions")
    .select("*, assignments(target_sign), profiles(full_name), scores(is_correct, confidence, predicted_sign)")
    .order("submitted_at", { ascending: false });
}

export async function upsertScore(
  submissionId: string,
  predictedSign: string,
  isCorrect: boolean,
  confidence: number
) {
  return supabase
    .from("scores")
    .upsert(
      { submission_id: submissionId, predicted_sign: predictedSign, is_correct: isCorrect, confidence },
      { onConflict: "submission_id" }
    )
    .select()
    .single();
}

// ---- admin ----

// profiles <-> classes has two FKs (profiles.class_id -> classes.id, and
// classes.teacher_id -> profiles.id), so PostgREST can't infer which one to
// embed here without a hint. `!profiles_class_id_fkey` picks the "class this
// profile belongs to" direction (see supabase/migrations/0001_schema.sql).
export async function listAllProfiles() {
  return supabase
    .from("profiles")
    .select("*, classes!profiles_class_id_fkey(name)")
    .order("created_at", { ascending: false });
}

export async function updateProfileRoleAndClass(
  profileId: string,
  role: ProfileRole,
  classId: string | null
) {
  return supabase
    .from("profiles")
    .update({ role, class_id: classId })
    .eq("id", profileId)
    .select()
    .single();
}

// Same ambiguity as listAllProfiles() above, other direction:
// `!classes_teacher_id_fkey` picks "the teacher of this class", not the
// reverse (students whose class_id points at this class).
export async function listAllClasses() {
  return supabase
    .from("classes")
    .select("*, profiles!classes_teacher_id_fkey(full_name)")
    .order("created_at", { ascending: false });
}

export async function listTeacherProfiles() {
  return supabase.from("profiles").select("id, full_name").eq("role", "teacher");
}

export async function adminCreateClass(name: string, teacherId: string | null) {
  return supabase.from("classes").insert({ name, teacher_id: teacherId }).select().single();
}

export async function adminDeleteClass(classId: string) {
  return supabase.from("classes").delete().eq("id", classId);
}
