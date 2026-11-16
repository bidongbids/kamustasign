import {
  CLOCK_SLACK_MS,
  EARLY_MS,
  byDay,
  dayWords,
  nextBooking,
  openBooking,
  overlaps,
  startTimes,
  startsInWords,
  studentCallGate,
  type CallBooking,
} from "../lib/callSchedule";

// Local times, so the tests read the same in any time zone.
const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const booking = (id: string, student: string, day: number, h: number, m: number, minutes: number): CallBooking => ({
  id,
  class_id: "c1",
  teacher_id: "t1",
  student_id: student,
  starts_at: iso(at(day, h, m)),
  ends_at: iso(at(day, h, m) + minutes * 60_000),
});

const ana = booking("b1", "ana", 6, 14, 0, 15); // Fri Nov 6, 2:00-2:15 PM
const ben = booking("b2", "ben", 6, 14, 30, 30); // 2:30-3:00 PM
const anaLater = booking("b3", "ana", 9, 9, 0, 10); // Mon Nov 9, 9:00 AM
const all = [ben, anaLater, ana];

describe("overlaps", () => {
  it("lets back-to-back calls touch", () => {
    expect(overlaps(0, 10, 10, 20)).toBe(false);
    expect(overlaps(0, 11, 10, 20)).toBe(true);
    expect(overlaps(12, 14, 10, 20)).toBe(true);
  });
});

describe("when a student can call", () => {
  it("opens 5 minutes before the start and closes at the end", () => {
    expect(openBooking(all, "ana", at(6, 13, 50))).toBeNull();
    expect(openBooking(all, "ana", at(6, 14, 0) - EARLY_MS)?.id).toBe("b1");
    expect(openBooking(all, "ana", at(6, 14, 14))?.id).toBe("b1");
    expect(openBooking(all, "ana", at(6, 14, 15))).toBeNull();
  });

  it("never opens another student's booking", () => {
    expect(openBooking(all, "ana", at(6, 14, 40))).toBeNull();
    expect(openBooking(all, "ben", at(6, 14, 40))?.id).toBe("b2");
  });

  it("gives the teacher's app some slack for device clocks", () => {
    expect(openBooking(all, "ana", at(6, 14, 16))).toBeNull();
    expect(openBooking(all, "ana", at(6, 14, 16), CLOCK_SLACK_MS)?.id).toBe("b1");
  });

  it("says open, later or none", () => {
    expect(studentCallGate(all, "ana", at(6, 14, 5)).kind).toBe("open");
    const later = studentCallGate(all, "ana", at(6, 15, 0));
    expect(later.kind).toBe("later");
    expect(later.kind === "later" && later.booking.id).toBe("b3");
    expect(studentCallGate(all, "cy", at(6, 15, 0)).kind).toBe("none");
    expect(studentCallGate(all, "ben", at(6, 15, 0)).kind).toBe("none"); // his call ended
    expect(nextBooking(all, "ana", at(6, 12, 0))?.id).toBe("b1");
  });
});

describe("start times for a booking", () => {
  const day = new Date(2026, 10, 6);
  const now = at(6, 13, 0);

  it("runs every 15 minutes, 7:00 AM to 8:45 PM", () => {
    const times = startTimes(day, 15, [], 0);
    expect(times).toHaveLength(14 * 4);
    expect(new Date(times[0].at).getHours()).toBe(7);
    expect(new Date(times[times.length - 1].at).getMinutes()).toBe(45);
  });

  it("crosses out times that would overlap a call, not the ones next to it", () => {
    const times = startTimes(day, 15, all, now);
    const get = (h: number, m: number) => times.find((x) => x.at === at(6, h, m))!;
    expect(get(13, 45).clash).toBeNull(); // ends 2:00, as Ana starts
    expect(get(14, 0).clash?.id).toBe("b1");
    expect(get(14, 15).clash).toBeNull(); // between Ana and Ben
    expect(get(14, 30).clash?.id).toBe("b2");
    expect(get(14, 45).clash?.id).toBe("b2");
    expect(get(15, 0).clash).toBeNull();
  });

  it("a longer call clashes sooner", () => {
    const times = startTimes(day, 30, all, now);
    expect(times.find((x) => x.at === at(6, 13, 45))!.clash?.id).toBe("b1");
    expect(times.find((x) => x.at === at(6, 14, 15))!.clash?.id).toBe("b2");
  });

  it("ignores the booking being moved, and marks past times", () => {
    const times = startTimes(day, 15, all, now, "b1");
    expect(times.find((x) => x.at === at(6, 14, 0))!.clash).toBeNull();
    expect(times.find((x) => x.at === at(6, 12, 0))!.past).toBe(true);
    expect(times.find((x) => x.at === at(6, 13, 15))!.past).toBe(false);
  });
});

describe("words", () => {
  const now = at(6, 13, 30);
  it("names the day", () => {
    expect(dayWords(at(6, 20), now)).toBe("Today");
    expect(dayWords(at(7, 8), now)).toBe("Tomorrow");
    expect(dayWords(at(9, 9), now)).not.toMatch(/Today|Tomorrow/);
  });

  it("says how soon", () => {
    expect(startsInWords(ana, now)).toBe("in 30 min");
    expect(startsInWords(ana, at(6, 14, 5))).toBe("Now");
    expect(startsInWords(anaLater, now)).toBeNull();
  });

  it("groups by day in order", () => {
    const days = byDay(all, now);
    expect(days.map((d) => d.label)[0]).toBe("Today");
    expect(days[0].items.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(days[1].items.map((b) => b.id)).toEqual(["b3"]);
  });
});
