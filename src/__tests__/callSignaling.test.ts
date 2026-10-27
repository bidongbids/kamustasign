import { mergePresence, openCallChannel, presenceMembers, type CallSignal, type PresenceMap } from "../lib/callSignaling";

// A fake Realtime client: records each channel's topic and config, what it
// sent and tracked, and lets a test deliver a broadcast or a presence sync.
type FakeChannel = {
  topic: string;
  config: any;
  sent: any[];
  tracked: any[];
  deliver: (payload: unknown) => void;
  sync: (state: Record<string, { status?: string }[]>) => void;
};
const channels: FakeChannel[] = [];
const removed: string[] = [];

jest.mock("../lib/supabase", () => ({
  supabase: {
    channel: (topic: string, opts: any) => {
      const handlers: Record<string, (msg?: any) => void> = {};
      let presence: Record<string, { status?: string }[]> = {};
      const ch: any = {
        topic,
        config: opts.config,
        sent: [] as any[],
        tracked: [] as any[],
        deliver: (payload: unknown) => handlers.broadcast?.({ payload }),
        sync: (state: Record<string, { status?: string }[]>) => {
          presence = state;
          handlers.presence?.();
        },
        on: (type: string, _filter: unknown, cb: (msg?: any) => void) => {
          handlers[type] = cb;
          return ch;
        },
        subscribe: (cb?: (state: string) => void) => {
          cb?.("SUBSCRIBED");
          return ch;
        },
        presenceState: () => presence,
        track: async (meta: any) => {
          ch.tracked.push(meta);
          return "ok";
        },
        send: (msg: any) => ch.sent.push(msg.payload),
      };
      channels.push(ch);
      return ch;
    },
    removeChannel: async (ch: FakeChannel) => {
      removed.push(ch.topic);
    },
  },
}));

const flush = () => new Promise((r) => setTimeout(r, 0));
const CLASS = "c1";
const signal = (from: string, to: string, kind: CallSignal["kind"] = "ring") =>
  ({ kind, from: { id: from, name: from }, to, callId: "x" }) as CallSignal;

beforeEach(() => {
  channels.length = 0;
  removed.length = 0;
});

describe("openCallChannel", () => {
  it("a student joins only their own private topic", async () => {
    openCallChannel(CLASS, "s1", "student", () => {});
    await flush();
    expect(channels.map((c) => c.topic)).toEqual(["call:c1:s1"]);
    expect(channels[0].config.private).toBe(true);
    expect(channels[0].config.presence.key).toBe("s1");
  });

  it("a teacher joins one private topic per student and sends on the addressee's", async () => {
    const ch = openCallChannel(CLASS, "t1", "teacher", () => {});
    ch.setStudents(["s1", "s2"]);
    await flush();
    expect(channels.map((c) => c.topic).sort()).toEqual(["call:c1:s1", "call:c1:s2"]);
    expect(channels.every((c) => c.config.private)).toBe(true);

    ch.send(signal("t1", "s2"));
    await flush();
    expect(channels.find((c) => c.topic === "call:c1:s2")!.sent).toHaveLength(1);
    expect(channels.find((c) => c.topic === "call:c1:s1")!.sent).toHaveLength(0);
  });

  it("on a student's topic the teacher only accepts that student", async () => {
    const got: CallSignal[] = [];
    const ch = openCallChannel(CLASS, "t1", "teacher", (s) => got.push(s));
    ch.setStudents(["s1"]);
    await flush();
    channels[0].deliver(signal("s2", "t1")); // someone claiming another id
    channels[0].deliver(signal("s1", "t1"));
    expect(got.map((s) => s.from.id)).toEqual(["s1"]);
  });

  it("ignores signals addressed to someone else", async () => {
    const got: CallSignal[] = [];
    openCallChannel(CLASS, "s1", "student", (s) => got.push(s));
    await flush();
    channels[0].deliver(signal("t1", "s9"));
    expect(got).toHaveLength(0);
  });

  it("a roster change only joins/leaves the students that changed", async () => {
    const ch = openCallChannel(CLASS, "t1", "teacher", () => {});
    ch.setStudents(["s1", "s2"]);
    await flush();
    ch.setStudents(["s2", "s3"]);
    await flush();
    expect(removed).toEqual(["call:c1:s1"]);
    expect(channels.map((c) => c.topic).sort()).toEqual(["call:c1:s1", "call:c1:s2", "call:c1:s3"]);
  });
});

describe("presence", () => {
  it("tracks this side as available on join, and re-tracks on a status change", async () => {
    const ch = openCallChannel(CLASS, "t1", "teacher", () => {});
    ch.setStudents(["s1", "s2"]);
    await flush();
    expect(channels.map((c) => c.tracked)).toEqual([[{ status: "available" }], [{ status: "available" }]]);
    ch.setStatus("busy");
    expect(channels.every((c) => c.tracked[c.tracked.length - 1].status === "busy")).toBe(true);
  });

  it("reports each student on their own topic, never the teacher themselves", async () => {
    const seen: PresenceMap[] = [];
    const ch = openCallChannel(CLASS, "t1", "teacher", () => {}, (p) => seen.push(p));
    ch.setStudents(["s1", "s2"]);
    await flush();
    const s1 = channels.find((c) => c.topic === "call:c1:s1")!;
    // Someone else's key on s1's topic is not s1 - ignored.
    s1.sync({ t1: [{ status: "available" }], s1: [{ status: "busy" }], s9: [{ status: "available" }] });
    expect(seen[seen.length - 1]).toEqual({ s1: "busy" });
    // s1 leaves.
    s1.sync({ t1: [{ status: "available" }] });
    expect(seen[seen.length - 1]).toEqual({});
  });

  it("a student sees their teacher", async () => {
    const seen: PresenceMap[] = [];
    openCallChannel(CLASS, "s1", "student", () => {}, (p) => seen.push(p));
    await flush();
    channels[0].sync({ s1: [{ status: "available" }], t1: [{ status: "available" }] });
    expect(seen[seen.length - 1]).toEqual({ t1: "available" });
  });

  it("busy wins across tabs and topics", () => {
    expect(presenceMembers({ s1: [{ status: "available" }, { status: "busy" }] }, "t1", "s1")).toEqual({ s1: "busy" });
    expect(presenceMembers({ s1: [] }, "t1", "s1")).toEqual({});
    expect(mergePresence([{ t1: "busy" }, { t1: "available" }])).toEqual({ t1: "busy" });
  });
});
