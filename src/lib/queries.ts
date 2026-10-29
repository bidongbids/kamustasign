// src/lib/queries.ts
// Centralized CRUD calls against the classroom schema
// (supabase/migrations/0001_schema.sql). Kept out of the screens so each
// dashboard focuses on rendering, not query shape. Every function mirrors
// supabase-js's own { data, error } return shape, so screens can destructure
// the same way LoginScreen.tsx already does.
//
// Row Level Security (0002_rls.sql onward) is the real access-control
// boundary, not these functions - e.g. getClassProgressSummary() has no
// "where teacher_id = me" filter because the database already refuses to
// return anyone else's students to a teacher, regardless of what a client
// asks for. (The legacy assignments / submissions / scores tables are
// closed since 0011 and have no functions here.)
import { supabase } from "./supabase";
import {
  countMastered,
  getGroup,
  MASTERY_PASSES,
  type ClassPlan,
  type MasteredCounts,
  type SignGroup,
  type SignLanguage,
} from "./curriculum";

export type ProfileRole = "student" | "teacher" | "admin";

export type Profile = {
  id: string;
  full_name: string;
  role: ProfileRole;
  class_id: string | null;
  /** False for a sign-up nobody has approved yet: no role's powers (0014). */
  approved?: boolean;
  /** The LCSign owner: the only one who approves and changes admins (0014). */
  superadmin?: boolean;
  created_at: string;
};

/** A sign-up waiting for approval - by an admin, or for an admin sign-up, the super admin (0014). */
export function isPendingApproval(p: Pick<Profile, "approved">) {
  return p.approved === false;
}

export type ClassRow = {
  id: string;
  name: string;
  teacher_id: string | null;
  /** What students type to join (0009_teacher_classroom.sql). */
  join_code: string;
  created_at: string;
};

// PostgREST embeds a to-one relationship (like a student's class) as either
// a single object or a one-element array depending on how the schema cache
// resolved the join direction - this normalizes either shape so screens
// don't have to guess or crash on the wrong one.
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

// ---- teacher ----

// A teacher can own several classes, so this returns a list - oldest first,
// so the default selection is stable.
export async function getMyClassesAsTeacher(teacherId: string) {
  return supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true });
}

export async function createClass(name: string, teacherId: string) {
  return supabase.from("classes").insert({ name, teacher_id: teacherId }).select().single();
}

// Teacher, own class only ("classes: teacher manages own classes").
export async function renameClass(classId: string, name: string) {
  return supabase.from("classes").update({ name }).eq("id", classId).select().single();
}

// Students in the class drop to "no class" (profiles_class_id_fkey is
// on delete set null); its old assignments go with it (on delete cascade).
export async function deleteClass(classId: string) {
  return supabase.from("classes").delete().eq("id", classId);
}

// ---- class roster (0009_teacher_classroom.sql) ----
// Neither teachers nor students may write profiles.class_id directly, so
// membership changes go through definer functions that check the caller:
// a teacher ticks students who have no class yet, or a student types the
// class's join code.

export type UnassignedStudent = { id: string; full_name: string; email: string | null; created_at: string };

export async function listUnassignedStudents() {
  const { data, error } = await supabase.rpc("list_unassigned_students");
  return { data: (data as UnassignedStudent[] | null) ?? [], error: error ? friendlyRpcError(error) : null };
}

/** Returns who was actually added - anyone who joined another class meanwhile is skipped. */
export async function addStudentsToClass(classId: string, studentIds: string[]) {
  const { data, error } = await supabase.rpc("add_students_to_class", {
    p_class_id: classId,
    p_student_ids: studentIds,
  });
  return {
    data: (data as { student_id: string; student_name: string }[] | null) ?? [],
    error: error ? friendlyRpcError(error) : null,
  };
}

export async function removeStudentFromClass(studentId: string) {
  const { error } = await supabase.rpc("remove_student_from_class", { p_student_id: studentId });
  return { error: error ? friendlyRpcError(error) : null };
}

export async function joinClassWithCode(code: string) {
  const { data, error } = await supabase.rpc("join_class_with_code", { p_code: code.trim() });
  const row = toOne(data as { class_id: string; class_name: string }[] | null);
  return { data: row, error: error ? friendlyRpcError(error) : null };
}

export async function regenerateClassCode(classId: string) {
  const { data, error } = await supabase.rpc("regenerate_class_code", { p_class_id: classId });
  return { data: (data as string | null) ?? null, error: error ? friendlyRpcError(error) : null };
}

// PostgREST answers "function not found" (PGRST202) when the migration that
// defines it hasn't been run yet - say that plainly instead of a schema-cache
// message.
export function friendlyRpcError(error: { message: string; code?: string }) {
  if (error.code === "PGRST202" || /could not find the function/i.test(error.message)) {
    return {
      ...error,
      message: "This needs the 0009_teacher_classroom.sql migration - run it in the Supabase SQL Editor.",
    };
  }
  return error;
}

// ---- modules (0009_teacher_classroom.sql) ----
// A module is a teacher's named set of signs from one language + group of
// the curriculum. module_signs holds the order; moduleSigns() drops signs a
// model no longer has, so a stale module can't promise an ungradable lesson.

export type ModuleRow = {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  language: SignLanguage;
  sign_group: SignGroup;
  due_date: string | null;
  position: number;
  created_at: string;
  module_signs: { sign: string; position: number }[];
};

export type ModuleDraft = {
  title: string;
  description: string | null;
  language: SignLanguage;
  sign_group: SignGroup;
  due_date: string | null;
};

export function moduleSigns(m: Pick<ModuleRow, "language" | "sign_group" | "module_signs">): string[] {
  const valid = new Set(getGroup(m.language, m.sign_group).signs);
  return [...(m.module_signs ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.sign)
    .filter((s) => valid.has(s));
}

export async function getModulesForClass(classId: string) {
  const { data, error } = await supabase
    .from("modules")
    .select("*, module_signs(sign, position)")
    .eq("class_id", classId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return { data: (data as ModuleRow[] | null) ?? [], error };
}

export async function saveModule(classId: string, draft: ModuleDraft, signs: string[], moduleId?: string) {
  const res = moduleId
    ? await supabase.from("modules").update(draft).eq("id", moduleId).select().single()
    : await supabase.from("modules").insert({ ...draft, class_id: classId }).select().single();
  if (res.error) return { data: null, error: res.error };
  const id = (res.data as { id: string }).id;
  const { error } = await supabase.rpc("set_module_signs", { p_module_id: id, p_signs: signs });
  return { data: id, error: error ? friendlyRpcError(error) : null };
}

export async function deleteModule(moduleId: string) {
  return supabase.from("modules").delete().eq("id", moduleId);
}

// ---- class learning plans (0012_class_plan_no_cooldown.sql) ----
// One row per class + language. No row = every word (curriculum planSigns).

/** The class's plan. A missing table (0012 not applied yet) reads as "no plan". */
export async function getClassPlan(classId: string): Promise<{ data: ClassPlan; error: { message: string } | null }> {
  const { data, error } = await supabase.from("class_word_plans").select("language, signs").eq("class_id", classId);
  if (error) return { data: {}, error: error.code === "42P01" || error.code === "PGRST205" ? null : error };
  const plan: ClassPlan = {};
  for (const r of (data as { language: SignLanguage; signs: string[] }[] | null) ?? []) plan[r.language] = r.signs;
  return { data: plan, error: null };
}

/** Sets one language's planned words; null removes the plan (every word again). */
export async function saveClassPlan(classId: string, language: SignLanguage, signs: string[] | null) {
  if (signs === null) {
    return supabase.from("class_word_plans").delete().eq("class_id", classId).eq("language", language);
  }
  return supabase
    .from("class_word_plans")
    .upsert({ class_id: classId, language, signs, updated_at: new Date().toISOString() }, { onConflict: "class_id,language" });
}

/** Saves a new module order: each id's position becomes its index. */
export async function setModuleOrder(moduleIds: string[]) {
  for (let i = 0; i < moduleIds.length; i++) {
    const { error } = await supabase.from("modules").update({ position: i }).eq("id", moduleIds[i]);
    if (error) return { error };
  }
  return { error: null };
}

// ---- admin (account management only) ----

// Only students belong to a class through profiles.class_id, so changing an
// account away from student also takes it out of its class (the database
// enforces this too, 0011). An admin choosing someone's role also approves
// them as that role. Only the super admin can make or unmake admins (0014).
export async function updateProfileRole(profileId: string, role: ProfileRole) {
  const patch: { role: ProfileRole; approved: true; class_id?: null } =
    role === "student" ? { role, approved: true } : { role, approved: true, class_id: null };
  return supabase.from("profiles").update(patch).eq("id", profileId).select().single();
}

export async function approveAccount(profileId: string) {
  return supabase.from("profiles").update({ approved: true }).eq("id", profileId).select().single();
}

/** Deletes a sign-up that is still waiting (decline_signup, 0014). */
export async function declineSignup(profileId: string) {
  return supabase.rpc("decline_signup", { p_profile_id: profileId });
}

export async function updateProfileName(profileId: string, fullName: string) {
  return supabase.from("profiles").update({ full_name: fullName }).eq("id", profileId).select().single();
}

// profiles <-> classes has two FKs (profiles.class_id -> classes.id, and
// classes.teacher_id -> profiles.id), so PostgREST can't infer which one to
// embed here without a hint.
// `!classes_teacher_id_fkey` picks "the teacher of this class", not the
// reverse (students whose class_id points at this class).
export async function listAllClasses() {
  return supabase
    .from("classes")
    .select("*, profiles!classes_teacher_id_fkey(full_name)")
    .order("created_at", { ascending: false });
}

export type AccountRow = Profile & { email: string | null };

// Profiles plus their sign-in email (admin_list_accounts in 0008). Falls
// back to the plain profiles list - names only - when 0008 isn't applied,
// so the dashboard still works and can say why emails are missing.
export async function adminListAccounts(): Promise<{
  data: AccountRow[] | null;
  error: { message: string } | null;
  emailsAvailable: boolean;
}> {
  const rpc = await supabase.rpc("admin_list_accounts");
  if (!rpc.error) return { data: (rpc.data as AccountRow[]) ?? [], error: null, emailsAvailable: true };

  const fallback = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (fallback.error) return { data: null, error: fallback.error, emailsAvailable: false };
  return {
    data: ((fallback.data as Profile[]) ?? []).map((p) => ({ ...p, email: null })),
    error: null,
    emailsAvailable: false,
  };
}


// ---- classroom learning plan (lesson_progress, 0005/0006 migrations) ----
// The curriculum and every total/percentage come from src/lib/curriculum.ts;
// these only read and write what a student has done. Teacher and admin
// reads need no "where" scoping beyond the class - lesson_progress's RLS
// already limits a teacher to their own class's students.

export type LessonProgressRow = {
  id: string;
  student_id: string;
  language: SignLanguage;
  sign_group: SignGroup;
  sign: string;
  attempts: number;
  passes: number;
  best_confidence: number;
  first_passed_at: string | null;
  /** Last pass that counted (0007 migration) - drives the pass cooldown. */
  last_passed_at: string | null;
  updated_at: string;
};

/** One student's row set reduced to what the progress bars need. */
export type StudentProgressSummary = {
  id: string;
  full_name: string;
  class_id: string | null;
  className: string | null;
  mastered: MasteredCounts;
  /** The mastered rows behind `mastered`, to recount under a class plan (countMastered). */
  masteredRows: ProgressEmbed[];
};

export type ProgressEmbed = Pick<LessonProgressRow, "language" | "sign_group" | "sign" | "passes"> &
  Partial<Pick<LessonProgressRow, "best_confidence" | "attempts">>;

function summarizeStudent(row: any): StudentProgressSummary {
  const klass = toOne(row.classes) as { name: string } | null;
  const masteredRows = (row.lesson_progress as ProgressEmbed[] | null) ?? [];
  return {
    id: row.id,
    full_name: row.full_name,
    class_id: row.class_id ?? null,
    className: klass?.name ?? null,
    mastered: countMastered(masteredRows),
    masteredRows,
  };
}

export async function getLessonProgress(studentId: string, language: SignLanguage, group: SignGroup) {
  return supabase
    .from("lesson_progress")
    .select("*")
    .eq("student_id", studentId)
    .eq("language", language)
    .eq("sign_group", group);
}

// Every row the student has, across languages and groups - for the module
// cards, whose signs can come from any group.
export async function getAllLessonProgress(studentId: string) {
  return supabase
    .from("lesson_progress")
    .select("language, sign_group, sign, passes, best_confidence")
    .eq("student_id", studentId);
}

// Upsert-and-increment happens inside the record_lesson_attempt() Postgres
// function (0005_lesson_progress.sql), not as a read-modify-write here - two
// quick attempts would otherwise race and one would be lost.
export async function recordAttempt(
  studentId: string,
  language: SignLanguage,
  group: SignGroup,
  sign: string,
  passed: boolean,
  confidence: number
) {
  return supabase.rpc("record_lesson_attempt", {
    p_student_id: studentId,
    p_language: language,
    p_sign_group: group,
    p_sign: sign,
    p_passed: passed,
    p_confidence: Math.max(0, Math.min(1, confidence)),
  });
}

// Every language+group in ONE round trip: only mastered rows come back, and
// countMastered() buckets them. Feed the result to computeOverall().
export async function getMasteredCounts(studentId: string) {
  const { data, error } = await supabase
    .from("lesson_progress")
    .select("language, sign_group, sign, passes")
    .eq("student_id", studentId)
    .gte("passes", MASTERY_PASSES);
  if (error) return { data: null, error };
  return { data: countMastered((data as ProgressEmbed[]) ?? []), error: null };
}

// Teacher view: one row per student in the class, with mastered counts.
// lesson_progress embeds through its single FK to profiles; the embedded
// filter keeps the payload to mastered rows only.
export async function getClassProgressSummary(classId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, class_id, lesson_progress(language, sign_group, sign, passes)")
    .eq("class_id", classId)
    .eq("role", "student")
    .gte("lesson_progress.passes", MASTERY_PASSES)
    .order("full_name", { ascending: true });
  if (error) return { data: null, error };
  return { data: ((data as any[]) ?? []).map(summarizeStudent), error: null };
}

// Teacher's module view and "Signs to review": every student's rows for one
// language+group (not just mastered ones), so a module can show per-student
// progress over its own signs.
export async function getClassGroupProgress(classId: string, language: SignLanguage, group: SignGroup) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, lesson_progress(language, sign_group, sign, attempts, passes, best_confidence)")
    .eq("class_id", classId)
    .eq("role", "student")
    .eq("lesson_progress.language", language)
    .eq("lesson_progress.sign_group", group);
  if (error) return { data: null, error };
  const byStudent = new Map<string, ProgressEmbed[]>();
  for (const row of (data as any[]) ?? []) byStudent.set(row.id, row.lesson_progress ?? []);
  return { data: byStudent, error: null };
}

// ---- missed calls and call notes (0013_video_call_extras.sql) ----
// Both tables may not exist yet (0013 not applied): reads then come back
// empty, and writes fail quietly where the caller treats them as best-effort.

const missingTable = (error: { code?: string } | null) => !!error && (error.code === "42P01" || error.code === "PGRST205");

export type MissedCallRow = { id: string; class_id: string; caller_id: string; created_at: string };

/** The caller records a ring nobody answered (useVideoCall). */
export async function recordMissedCall(classId: string, callerId: string, calleeId: string) {
  return supabase.from("missed_calls").insert({ class_id: classId, caller_id: callerId, callee_id: calleeId });
}

/** Unseen missed calls for this user, newest first. */
export async function getMissedCalls(calleeId: string): Promise<{ data: MissedCallRow[]; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("missed_calls")
    .select("id, class_id, caller_id, created_at")
    .eq("callee_id", calleeId)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { data: [], error: missingTable(error) ? null : error };
  return { data: (data as MissedCallRow[]) ?? [], error: null };
}

export async function markMissedCallsSeen(ids: string[]) {
  if (ids.length === 0) return { error: null };
  return supabase.from("missed_calls").update({ seen_at: new Date().toISOString() }).in("id", ids);
}

export type CallPracticeEntry = {
  sign: string;
  language: SignLanguage;
  group: SignGroup;
  passed: boolean;
  /** Best confidence over the tries (0-1). */
  confidence: number;
  tries: number;
};

export type CallNoteRow = {
  id: string;
  class_id: string;
  teacher_id: string;
  student_id: string;
  started_at: string;
  duration_seconds: number;
  teacher_text: string;
  student_text: string;
  practice: CallPracticeEntry[];
  created_at: string;
};

export type CallNoteDraft = Omit<CallNoteRow, "id" | "created_at">;

export async function saveCallNotes(draft: CallNoteDraft) {
  const { error } = await supabase.from("call_notes").insert({
    ...draft,
    teacher_text: draft.teacher_text.slice(0, 5000),
    student_text: draft.student_text.slice(0, 5000),
    practice: draft.practice.slice(0, 200),
  });
  if (missingTable(error)) return { error: { message: "Saving call notes needs the 0013 database update. Ask your admin to apply it." } };
  return { error };
}

/** A class's saved call notes, newest first. */
export async function getCallNotes(classId: string): Promise<{ data: CallNoteRow[]; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("call_notes")
    .select("*")
    .eq("class_id", classId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return { data: [], error: missingTable(error) ? null : error };
  return { data: (data as CallNoteRow[]) ?? [], error: null };
}

export async function deleteCallNote(id: string) {
  return supabase.from("call_notes").delete().eq("id", id);
}
