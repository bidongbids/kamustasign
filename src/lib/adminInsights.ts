// The admin dashboard's words and filters (design A1-A5): what changes when
// an account's role changes, said in sentences with the person's first name
// (never a guessed pronoun); the "Class" cell for each account; and the
// role / class filters. Pure, so the rules can be tested.
//
// The database rules these describe: only students are in classes (a role
// change away from student clears class_id, 0009 / updateProfileRole); a
// teacher's classes keep their teacher_id when that person stops being a
// teacher, but every class action needs is_teacher() (0011), so nobody can
// manage those classes until they're a teacher again; an admin-made teacher
// is approved.
import type { AccountRow, ClassRow, ProfileRole } from "./queries";

export const firstOf = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "This person";

const article = (role: ProfileRole) => (role === "admin" ? "an admin" : role === "teacher" ? "a teacher" : "a student");
export const roleWithArticle = article;

export function classesTaughtBy(id: string, classes: ClassRow[]): ClassRow[] {
  return classes.filter((c) => c.teacher_id === id);
}

/** "What changes if Ana becomes a teacher": one sentence per change. */
export function roleChangeConsequences(
  a: AccountRow,
  next: ProfileRole,
  ctx: { classes: ClassRow[]; nameOf: (id: string) => string | null }
): string[] {
  if (next === a.role) return [];
  const first = firstOf(a.full_name || a.email);
  const out: string[] = [];
  if (a.role === "student" && a.class_id) {
    const klass = ctx.classes.find((c) => c.id === a.class_id);
    out.push(`${first} leaves ${klass?.name ?? "their class"}. Only students are in classes.`);
    const teacher = klass?.teacher_id ? ctx.nameOf(klass.teacher_id) : null;
    if (teacher) out.push(`${teacher}, ${first}'s teacher, stops seeing ${first} in the class.`);
  }
  if (a.role === "teacher") {
    const taught = classesTaughtBy(a.id, ctx.classes);
    if (taught.length) {
      const names = taught.map((c) => c.name).join(", ");
      out.push(
        `${first}'s class${taught.length === 1 ? "" : "es"} (${names}) stay${taught.length === 1 ? "s" : ""}, with ${
          taught.length === 1 ? "its" : "their"
        } students, but nobody can manage ${taught.length === 1 ? "it" : "them"} until ${first} is a teacher again.`
      );
    }
    if (a.approved === false && next === "student") out.push(`${first} can still sign in, and you can make ${first} a teacher later.`);
  }
  if (a.role === "admin") out.push(`${first} can no longer manage accounts.`);
  if (next === "teacher") {
    out.push(`${first} can make classes, see their students' progress and call them.`);
    out.push(`${first} can see the names and emails of students who aren't in a class yet.`);
  }
  if (next === "admin") out.push(`${first} can manage every account, like you do.`);
  if (next === "student" && a.role !== "student") out.push(`${first} starts as a student with no class.`);
  return out;
}

export type ClassCell = { text: string; tone: "normal" | "pending" | "muted" };

/** The "Class" column: a student's class, what a teacher teaches, or that they await approval. */
export function classCell(a: AccountRow, classes: ClassRow[]): ClassCell {
  if (a.role === "student") {
    const klass = a.class_id ? classes.find((c) => c.id === a.class_id) : null;
    return klass ? { text: klass.name, tone: "normal" } : a.class_id ? { text: "Unknown class", tone: "muted" } : { text: "No class", tone: "muted" };
  }
  if (a.role === "teacher") {
    if (a.approved === false) return { text: "Awaiting approval", tone: "pending" };
    const taught = classesTaughtBy(a.id, classes);
    return taught.length ? { text: `Teaches ${taught.map((c) => c.name).join(", ")}`, tone: "normal" } : { text: "No classes yet", tone: "muted" };
  }
  return { text: "—", tone: "muted" };
}

export type RoleFilter = "all" | ProfileRole;
/** "all", a class id, or "none" (students with no class). */
export type ClassFilter = string;

export function filterAccounts(
  accounts: AccountRow[],
  f: { role: RoleFilter; klass: ClassFilter; query: string; classes: ClassRow[] }
): AccountRow[] {
  const q = f.query.trim().toLowerCase();
  return accounts.filter((a) => {
    if (f.role !== "all" && a.role !== f.role) return false;
    if (f.klass === "none" && !(a.role === "student" && !a.class_id)) return false;
    if (f.klass !== "all" && f.klass !== "none") {
      const inIt = a.role === "student" ? a.class_id === f.klass : a.role === "teacher" ? f.classes.some((c) => c.id === f.klass && c.teacher_id === a.id) : false;
      if (!inIt) return false;
    }
    return !q || (a.full_name ?? "").toLowerCase().includes(q) || (a.email ?? "").toLowerCase().includes(q);
  });
}

/** "Sep 2", or "Sep 2, 2025" when it isn't this year. */
export function joinedText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
