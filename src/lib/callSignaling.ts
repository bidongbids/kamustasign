// WebRTC signaling only - exchanges the SDP offer/answer and ICE candidates
// needed to set up a direct peer-to-peer call, over a Supabase Realtime
// broadcast channel keyed by class id. No persistent DB table: the channel
// is ephemeral and only matters while both sides are subscribed (see
// docs/SESSION_SUMMARY_for_UI_and_VideoChat.md's Section 6.0 "Establish Call").
// Actual call video/audio never touches this channel or Supabase at all -
// once the peer connection is up, media flows directly between the two
// devices (Section 7.0 "Stream Video & Translate Overlay (P2P)").
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPeer = { id: string; name: string };

export type CallModelKey = "asl-letters" | "asl-words" | "fsl-words";

// What the teacher has chosen for the call. The teacher is the only side
// that can change it; the student's screen follows. `read` names whose
// signs are read by role, not "them"/"me", so it means the same thing on
// both screens. `big` is the text the teacher put up full-screen (null when
// closed); `id` changes on every press, so showing the same text again
// re-opens it on a student screen where it was dismissed.
export type CallSettings = {
  model: CallModelKey;
  read: "teacher" | "student" | "both";
  big: { text: string; id: number } | null;
};

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
  | (Base & { kind: "settings-request" });

// A signal minus the envelope fields the sender fills in for every message.
export type CallSignalBody = CallSignal extends infer S
  ? S extends CallSignal
    ? Omit<S, "from" | "to" | "callId">
    : never
  : never;

export type CallChannel = {
  send: (signal: CallSignal) => void;
  close: () => void;
};

const BROADCAST_EVENT = "call-signal";

export function callChannelName(classId: string) {
  return `call-${classId}`;
}

export function newCallId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// supabase.channel(topic) hands back the EXISTING channel for a topic while
// that channel is still being removed (removeChannel is async). Re-opening
// right after closing - an effect re-run - would then bind to a channel that
// is about to be torn down, and the new subscription would silently hear
// nothing. So a re-open waits for the previous removal of the same topic.
const pendingRemovals = new Map<string, Promise<unknown>>();

// Opens the class's signaling channel and routes incoming messages addressed
// to `selfId` to the callback. Every client subscribed to the class channel
// receives every broadcast (Realtime broadcast has no server-side
// per-recipient filtering), so `to` is checked client-side - fine here since
// signaling metadata (who's calling whom) isn't sensitive; the call media
// itself never passes through this channel.
export function openCallChannel(
  classId: string,
  selfId: string,
  onSignal: (signal: CallSignal) => void
): CallChannel {
  const topic = callChannelName(classId);
  let channel: RealtimeChannel | null = null;
  let closed = false;

  const ready = (pendingRemovals.get(topic) ?? Promise.resolve()).then(() => {
    if (closed) return;
    channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
      const signal = payload as CallSignal;
      if (signal?.to !== selfId) return;
      onSignal(signal);
    });
    channel.subscribe();
  });

  return {
    send(signal) {
      // Before the join completes realtime-js falls back to its REST
      // broadcast endpoint, so an early send still gets delivered.
      void ready.then(() => channel?.send({ type: "broadcast", event: BROADCAST_EVENT, payload: signal }));
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
