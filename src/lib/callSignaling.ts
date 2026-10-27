// WebRTC signaling only - exchanges the SDP offer/answer and ICE candidates
// needed to set up a direct peer-to-peer call, over a Supabase Realtime
// private broadcast channel per student (see callChannelName). No persistent DB table: the channel
// is ephemeral and only matters while both sides are subscribed (see
// docs/SESSION_SUMMARY_for_UI_and_VideoChat.md's Section 6.0 "Establish Call").
// Actual call video/audio never touches this channel or Supabase at all -
// once the peer connection is up, media flows directly between the two
// devices (Section 7.0 "Stream Video & Translate Overlay (P2P)").
//
// The same topics carry Realtime presence (0013): each side "tracks" itself
// on them, so the teacher sees which students are online or already on a
// call, and a student sees whether their teacher is.
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPeer = { id: string; name: string };

export type CallModelKey = "asl-letters" | "asl-words" | "fsl-words";

// What the teacher has chosen for the call. The teacher is the only side
// that can change it; the student's screen follows. `read` names whose
// signs are read by role, not "them"/"me", so it means the same thing on
// both screens. `big` is the text the teacher put up full-screen (null when
// closed); `id` changes on every press, so showing the same text again
// re-opens it on a student screen where it was dismissed. `practice` is a
// sign the teacher asked the student to make (one of the current model's
// signs); a new `id` is a new request, even for the same sign.
export type CallSettings = {
  model: CallModelKey;
  read: "teacher" | "student" | "both";
  big: { text: string; id: number } | null;
  practice: { sign: string; id: number } | null;
};

/** The student's answer to a practice request: one per attempt. */
export type PracticeResult = {
  practiceId: number;
  sign: string;
  passed: boolean;
  /** What the computer saw, and how sure it was (0-1). */
  seen: string | null;
  confidence: number;
};

/** What each person shows on the topics they're on. */
export type PresenceStatus = "available" | "busy";

// Every signal carries the id of the call it belongs to (minted by the
// caller's "ring"), so a late ICE candidate or hangup from an earlier call -
// or a message from someone we're not talking to - can't touch this one.
type Base = { from: CallPeer; to: string; callId: string };
export type CallSignal =
  | (Base & { kind: "ring" })
  | (Base & { kind: "accept" })
  | (Base & { kind: "decline"; reason?: "busy" })
  | (Base & { kind: "hangup"; reason?: "failed" })
  | (Base & { kind: "offer"; sdp: RTCSessionDescriptionInit })
  | (Base & { kind: "answer"; sdp: RTCSessionDescriptionInit })
  | (Base & { kind: "ice-candidate"; candidate: RTCIceCandidateInit })
  | (Base & { kind: "settings"; settings: CallSettings })
  | (Base & { kind: "settings-request" })
  | (Base & { kind: "practice-result"; result: PracticeResult });

// A signal minus the envelope fields the sender fills in for every message.
export type CallSignalBody = CallSignal extends infer S
  ? S extends CallSignal
    ? Omit<S, "from" | "to" | "callId">
    : never
  : never;

/** Everyone else currently present on this side's topics: user id -> status. */
export type PresenceMap = Record<string, PresenceStatus>;

export type CallChannel = {
  send: (signal: CallSignal) => void;
  /** Teacher side: the students whose call topics to listen on. */
  setStudents: (studentIds: string[]) => void;
  /** What this side shows as its presence on every topic it's on. */
  setStatus: (status: PresenceStatus) => void;
  close: () => void;
};

const BROADCAST_EVENT = "call-signal";

// One private topic per student: only that student and their class's
// (approved) teacher may join it - enforced by realtime.messages RLS
// (supabase/migrations/0011_auth_hardening.sql). With a topic holding just
// those two people, nobody else can listen in on a call being set up or ring
// a student pretending to be their teacher.
export function callChannelName(classId: string, studentId: string) {
  return `call:${classId}:${studentId}`;
}

export function newCallId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The other members of one topic, from a Realtime presenceState(). */
export function presenceMembers(
  state: Record<string, { status?: PresenceStatus }[]>,
  selfId: string,
  peerId: string | null
): PresenceMap {
  const members: PresenceMap = {};
  for (const [key, metas] of Object.entries(state)) {
    if (key === selfId || (peerId && key !== peerId) || metas.length === 0) continue;
    // Several tabs on one account: "busy" in any of them wins.
    members[key] = metas.some((m) => m.status === "busy") ? "busy" : "available";
  }
  return members;
}

/** Merges each topic's members into one map ("busy" wins). */
export function mergePresence(maps: Iterable<PresenceMap>): PresenceMap {
  const merged: PresenceMap = {};
  for (const members of maps) {
    for (const [id, status] of Object.entries(members)) merged[id] = merged[id] === "busy" ? "busy" : status;
  }
  return merged;
}

// supabase.channel(topic) hands back the EXISTING channel for a topic while
// that channel is still being removed (removeChannel is async). Re-opening
// right after closing - an effect re-run - would then bind to a channel that
// is about to be torn down, and the new subscription would silently hear
// nothing. So a re-open waits for the previous removal of the same topic.
const pendingRemovals = new Map<string, Promise<unknown>>();

type TopicChannel = {
  send: (signal: CallSignal) => void;
  track: (status: PresenceStatus) => void;
  close: () => void;
};

// Joins one student's topic. `peerId` is who may legitimately be on the
// other end: the teacher listening on a student's topic only accepts that
// student; a student (peerId null) accepts whoever else could join, which
// the RLS policy limits to their teacher. `onPresence` gets the topic's
// other members whenever presence changes.
function openTopic(
  topic: string,
  selfId: string,
  peerId: string | null,
  status: PresenceStatus,
  onSignal: (signal: CallSignal) => void,
  onPresence: (members: PresenceMap) => void
): TopicChannel {
  let channel: RealtimeChannel | null = null;
  let closed = false;
  let subscribed = false;
  let current = status;

  const ready = (pendingRemovals.get(topic) ?? Promise.resolve()).then(() => {
    if (closed) return;
    const ch = supabase.channel(topic, {
      config: { private: true, broadcast: { self: false }, presence: { key: selfId } },
    });
    channel = ch;
    ch.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
      const signal = payload as CallSignal;
      if (signal?.to !== selfId) return;
      if (peerId && signal.from?.id !== peerId) return;
      onSignal(signal);
    });
    ch.on("presence", { event: "sync" }, () => {
      onPresence(presenceMembers(ch.presenceState<{ status?: PresenceStatus }>(), selfId, peerId));
    });
    ch.subscribe((state) => {
      if (state !== "SUBSCRIBED" || closed) return;
      subscribed = true;
      // Best-effort: without 0013's presence policies the track is refused
      // and calls still work - nobody just shows as online.
      void ch.track({ status: current }).catch(() => {});
    });
  });

  return {
    send(signal) {
      // Before the join completes realtime-js falls back to its REST
      // broadcast endpoint, so an early send still gets delivered.
      void ready.then(() => channel?.send({ type: "broadcast", event: BROADCAST_EVENT, payload: signal }));
    },
    track(next) {
      current = next;
      if (subscribed && channel) void channel.track({ status: next }).catch(() => {});
    },
    close() {
      if (closed) return;
      closed = true;
      // Let any signal already queued (e.g. a final hangup) go out first.
      const removal = ready
        .then(() => (channel ? supabase.removeChannel(channel) : undefined))
        .catch(() => {})
        .finally(() => {
          if (pendingRemovals.get(topic) === removal) pendingRemovals.delete(topic);
        });
      pendingRemovals.set(topic, removal);
    },
  };
}

// A student listens on their own topic. A teacher listens on one topic per
// student in the class (setStudents), and each message goes out on the topic
// of the student it's to.
export function openCallChannel(
  classId: string,
  selfId: string,
  role: "student" | "teacher",
  onSignal: (signal: CallSignal) => void,
  onPresence: (present: PresenceMap) => void = () => {}
): CallChannel {
  const topics = new Map<string, TopicChannel>();
  // Each topic's other members, merged for the caller.
  const byTopic = new Map<string, PresenceMap>();
  let closed = false;
  let status: PresenceStatus = "available";

  const report = () => onPresence(mergePresence(byTopic.values()));
  const open = (studentId: string, peerId: string | null) =>
    openTopic(callChannelName(classId, studentId), selfId, peerId, status, onSignal, (members) => {
      if (closed) return;
      byTopic.set(studentId, members);
      report();
    });

  if (role === "student") topics.set(selfId, open(selfId, null));

  return {
    send(signal) {
      const studentId = role === "student" ? selfId : signal.to;
      topics.get(studentId)?.send(signal);
    },
    setStudents(studentIds) {
      if (closed || role !== "teacher") return;
      const next = new Set(studentIds);
      for (const [id, topic] of topics) {
        if (!next.has(id)) {
          topic.close();
          topics.delete(id);
          byTopic.delete(id);
        }
      }
      for (const id of next) {
        if (!topics.has(id)) topics.set(id, open(id, id));
      }
      report();
    },
    setStatus(next) {
      status = next;
      for (const topic of topics.values()) topic.track(next);
    },
    close() {
      if (closed) return;
      closed = true;
      for (const topic of topics.values()) topic.close();
      topics.clear();
      byTopic.clear();
    },
  };
}
