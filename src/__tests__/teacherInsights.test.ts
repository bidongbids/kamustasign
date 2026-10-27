import {
  classGroupAverages,
  daysUntil,
  dueInfo,
  monthGrid,
  moduleCompletion,
  nameList,
  needsYou,
  parseDay,
  rosterCounts,
  shareLearned,
  signGrid,
  sortRoster,
  soonGroupsText,
  stuckSigns,
  toDay,
} from "../lib/teacherInsights";
import type { SignInsight } from "../lib/classInsights";

const NOW = new Date(2026, 9, 27, 15, 0); // Tue, Oct 27 2026, 3 PM

describe("dates", () => {
  it("parses real days only", () => {
    expect(toDay(parseDay("2026-11-01")!)).toBe("2026-11-01");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("11/01/2026")).toBeNull();
  });

  it("counts calendar days, not 24-hour blocks", () => {
    expect(daysUntil("2026-10-27", NOW)).toBe(0);
    expect(daysUntil("2026-11-01", NOW)).toBe(5);
    expect(daysUntil("2026-10-20", NOW)).toBe(-7);
  });

  it("words the due chip by how soon it is", () => {
    expect(dueInfo(null, NOW)).toMatchObject({ tone: "none", text: "No due date" });
    expect(dueInfo("2026-11-01", NOW)).toMatchObject({ tone: "soon", days: 5 });
    expect(dueInfo("2026-11-01", NOW).text).toMatch(/in 5 days$/);
    expect(dueInfo("2026-12-01", NOW).tone).toBe("later");
    expect(dueInfo("2026-10-20", NOW)).toMatchObject({ tone: "overdue" });
    expect(dueInfo("2026-10-20", NOW).text).toMatch(/^Overdue · was due /);
    expect(dueInfo("2026-10-28", NOW).text).toMatch(/tomorrow$/);
  });

  it("lays a month out Sunday first", () => {
    const nov = monthGrid(2026, 10); // November 2026 starts on a Sunday
    expect(nov[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(nov[nov.length - 1]).toEqual([29, 30, null, null, null, null, null]);
    const oct = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(oct[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
  });
});

const student = (id: string, name: string, letters: number) => ({ id, full_name: name, mastered: { "asl:letters": letters } });

describe("roster", () => {
  const students = [student("a", "Ana", 26), student("b", "Ben", 0), student("c", "Cy", 3)];
  const presence = { a: "available" as const, c: "busy" as const };

  it("counts each filter with the same overall figure", () => {
    expect(rosterCounts(students, {}, presence)).toEqual({ all: 3, online: 2, under25: 2, notStarted: 1 });
  });

  it("sorts by overall, status or name, ties by name", () => {
    expect(sortRoster(students, "overall", true, {}, presence).map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(sortRoster(students, "overall", false, {}, presence).map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(sortRoster(students, "status", true, {}, presence).map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(sortRoster(students, "name", false, {}, presence).map((s) => s.id)).toEqual(["c", "b", "a"]);
    expect(sortRoster(students, "asl:letters", true, {}, presence).map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("progress grid", () => {
  const rows = new Map([
    ["a", [{ sign: "A", passes: 1, attempts: 2 }, { sign: "B", passes: 0, attempts: 3 }]],
    ["b", [{ sign: "A", passes: 0, attempts: 0 }]],
  ]);
  const grid = signGrid([{ id: "a", name: "Ana" }, { id: "b", name: "Ben" }], rows, ["A", "B", "C"]);

  it("marks learned, tried and not tried", () => {
    expect(grid[0]).toMatchObject({ cells: ["learned", "tried", "none"], learned: 1, tried: ["B"] });
    expect(grid[1].cells).toEqual(["none", "none", "none"]);
  });

  it("gives the share of the class that learned each sign", () => {
    expect(shareLearned(grid, ["A", "B", "C"])).toEqual([0.5, 0, 0]);
  });

  it("works out module completion per student", () => {
    const done = moduleCompletion(["A"], ["a", "b"], rows);
    expect(done.finished).toBe(1);
    expect(done.average).toBe(0.5);
    expect(done.perStudent.get("a")).toBe(1);
    expect(moduleCompletion(["A"], ["a"], null).average).toBe(0);
  });
});

describe("Today", () => {
  const insight = (sign: string, stuck: number): SignInsight => ({ sign, tried: stuck, learned: 0, stuck, attempts: stuck * 3, stuckBest: 0.5 });

  it("keeps only signs a fifth of the class is stuck on", () => {
    expect(stuckSigns([insight("Z", 9), insight("R", 4), insight("M", 1)], 20).map((s) => s.sign)).toEqual(["Z", "R"]);
    expect(stuckSigns([insight("Z", 1)], 3)).toEqual([]);
  });

  it("orders Needs you by urgency", () => {
    const items = needsYou({
      missed: [
        { id: "m1", caller_id: "b", created_at: "2026-10-27T01:00:00Z" },
        { id: "m2", caller_id: "b", created_at: "2026-10-27T05:00:00Z" },
        { id: "m3", caller_id: "x", created_at: "2026-10-26T05:00:00Z" },
      ],
      nameOf: (id) => (id === "b" ? "Ben Reyes" : null),
      students: [
        { id: "a", name: "Ana", overall: 0.5 },
        { id: "b", name: "Ben", overall: 0.1 },
        { id: "c", name: "Cy", overall: 0 },
      ],
      stuck: { language: "asl", group: "letters", signs: [insight("Z", 5)] },
      modules: [
        { id: "late", title: "Greetings", due_date: "2026-10-20", signs: 5, finished: 0 },
        { id: "soon", title: "Family", due_date: "2026-11-01", signs: 7, finished: 3 },
        { id: "far", title: "Later", due_date: "2026-12-20", signs: 7, finished: 0 },
        { id: "none", title: "Letters", due_date: null, signs: 10, finished: 4 },
      ],
      waiting: [{ id: "k", name: "Kyla" }],
      now: NOW,
    });
    expect(items.map((i) => i.key)).toEqual(["missed:b", "missed:x", "under25", "stuck", "due:late", "due:soon", "waiting"]);
    const missed = items[0] as Extract<(typeof items)[number], { kind: "missed" }>;
    expect(missed).toMatchObject({ name: "Ben Reyes", ids: ["m2", "m1"], at: "2026-10-27T05:00:00Z" });
    const under = items[2] as Extract<(typeof items)[number], { kind: "under25" }>;
    expect(under.students.map((s) => s.id)).toEqual(["c", "b"]);
  });

  it("is empty when nothing needs the teacher", () => {
    expect(needsYou({ missed: [], nameOf: () => null, students: [{ id: "a", name: "Ana", overall: 0.9 }], stuck: null, modules: [], waiting: [], now: NOW })).toEqual([]);
  });
});

describe("words", () => {
  it("lists names", () => {
    expect(nameList(["Kyla Bautista", "Leo Navarro"])).toBe("Kyla Bautista and Leo Navarro");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });

  it("names the groups with no model", () => {
    expect(soonGroupsText()).toBe("ASL Numbers, FSL Letters and FSL Numbers");
  });

  it("averages each available group over the plan", () => {
    const avg = classGroupAverages([{ mastered: { "asl:letters": 13 } }, { mastered: {} }], {});
    expect(avg.find((g) => g.key === "asl:letters")?.value).toBeCloseTo(0.25);
    expect(avg.map((g) => g.key)).not.toContain("asl:numbers");
  });
});
