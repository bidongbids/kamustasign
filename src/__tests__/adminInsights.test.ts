import { classCell, filterAccounts, roleChangeConsequences } from "../lib/adminInsights";
import type { AccountRow, ClassRow } from "../lib/queries";

const account = (id: string, full_name: string, role: AccountRow["role"], extra: Partial<AccountRow> = {}): AccountRow => ({
  id,
  full_name,
  role,
  class_id: null,
  approved: true,
  created_at: "2026-09-01T00:00:00Z",
  email: `${full_name.split(" ")[0].toLowerCase()}@school.ph`,
  ...extra,
});
const klass = (id: string, name: string, teacher_id: string | null): ClassRow => ({ id, name, teacher_id, join_code: "ABCDEF", created_at: "2026-09-01T00:00:00Z" });

const classes = [klass("c1", "Grade 5 - Mabini", "t1"), klass("c2", "Grade 6 - Rizal", "t1")];
const liza = account("t1", "Liza Mendoza", "teacher");
const ana = account("s1", "Ana Santos", "student", { class_id: "c1" });
const nameOf = (id: string) => (id === "t1" ? "Liza Mendoza" : null);

describe("role change consequences", () => {
  it("a student who becomes a teacher leaves the class, by name", () => {
    expect(roleChangeConsequences(ana, "teacher", { classes, nameOf })).toEqual([
      "Ana leaves Grade 5 - Mabini. Only students are in classes.",
      "Liza Mendoza, Ana's teacher, stops seeing Ana in the class.",
      "Ana can make classes, see their students' progress and call them.",
      "Ana can see the names and emails of students who aren't in a class yet.",
    ]);
  });

  it("a teacher who stops teaching leaves classes nobody can manage", () => {
    const out = roleChangeConsequences(liza, "student", { classes, nameOf });
    expect(out[0]).toBe("Liza's classes (Grade 5 - Mabini, Grade 6 - Rizal) stay, with their students, but nobody can manage them until Liza is a teacher again.");
    expect(out).toContain("Liza starts as a student with no class.");
  });

  it("says nothing when the role doesn't change", () => {
    expect(roleChangeConsequences(ana, "student", { classes, nameOf })).toEqual([]);
  });

  it("choosing a role for a waiting sign-up approves it", () => {
    const pia = account("s3", "Pia Reyes", "student", { approved: false });
    expect(roleChangeConsequences(pia, "teacher", { classes, nameOf })[0]).toBe("This also approves Pia's sign-up.");
  });

  it("an admin who stops being one loses account management", () => {
    expect(roleChangeConsequences(account("a1", "Teresa Gomez", "admin"), "teacher", { classes, nameOf })[0]).toBe("Teresa can no longer manage accounts.");
  });
});

describe("class cell and filters", () => {
  const jose = account("t2", "Jose Ramirez", "teacher", { approved: false });
  const paolo = account("t3", "Paolo Garcia", "teacher");
  const kyla = account("s2", "Kyla Bautista", "student");
  const all = [liza, jose, paolo, ana, kyla, account("a1", "Teresa Gomez", "admin")];

  it("describes each kind of account", () => {
    expect(classCell(liza, classes)).toEqual({ text: "Teaches Grade 5 - Mabini, Grade 6 - Rizal", tone: "normal" });
    expect(classCell(jose, classes)).toEqual({ text: "Awaiting approval", tone: "pending" });
    expect(classCell(paolo, classes).text).toBe("No classes yet");
    expect(classCell(ana, classes).text).toBe("Grade 5 - Mabini");
    expect(classCell(kyla, classes).text).toBe("No class");
    expect(classCell(account("s4", "Pia Reyes", "student", { approved: false }), classes)).toEqual({ text: "Awaiting approval", tone: "pending" });
    expect(classCell(account("a2", "Pat Cruz", "admin", { approved: false }), classes).text).toBe("Awaiting super admin approval");
    expect(classCell(account("a3", "Owner", "admin", { superadmin: true }), classes).text).toBe("Super admin");
  });

  it("filters by role, class and search", () => {
    const f = (role: "all" | "student" | "teacher" | "admin", k: string, query = "") => filterAccounts(all, { role, klass: k, query, classes }).map((a) => a.id);
    expect(f("student", "all")).toEqual(["s1", "s2"]);
    expect(f("all", "c1")).toEqual(["t1", "s1"]);
    expect(f("all", "none")).toEqual(["s2"]);
    expect(f("all", "all", "school.ph").length).toBe(6);
    expect(f("all", "all", "ramirez")).toEqual(["t2"]);
  });
});
