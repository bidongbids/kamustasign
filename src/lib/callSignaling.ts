// WebRTC signaling only - exchanges the SDP offer/answer and ICE candidates
// needed to set up a direct peer-to-peer call, over a Supabase Realtime
// broadcast channel keyed by class id. No persistent DB table: the channel
// is ephemeral and only matters while both sides are subscribed (see
// SESSION_SUMMARY_for_UI_and_VideoChat.md's Section 6.0 "Establish Call").
// Actual call video/audio never touches this channel or Supabase at all -
// once the peer connection is up, media flows directly between the two
// devices (Section 7.0 "Stream Video & Translate Overlay (P2P)").
import { supabase } from "./supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallPeer = { id: string; name: string };

export type CallSignal =
  | { kind: "ring"; from: CallPeer; to: string }
  | { kind: "accept"; from: CallPeer; to: string }
  | { kind: "decline"; from: CallPeer; to: string }
  | { kind: "hangup"; from: CallPeer; to: string }
  | { kind: "offer"; from: CallPeer; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: CallPeer; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice-candidate"; from: CallPeer; to: string; candidate: RTCIceCandidateInit };

const BROADCAST_EVENT = "call-signal";

export function callChannelName(classId: string) {
  return `call-${classId}`;
}

// Opens (or reuses) the class's signaling channel and routes incoming
// messages addressed to `selfId` to the callback. Every client subscribed to
// the class channel receives every broadcast (Realtime broadcast has no
// server-side per-recipient filtering), so `to` is checked client-side -
// fine here since signaling metadata (who's calling whom) isn't sensitive;
// the call media itself never passes through this channel.
export function openCallChannel(
  classId: string,
  selfId: string,
  onSignal: (signal: CallSignal) => void
): RealtimeChannel {
  const channel = supabase.channel(callChannelName(classId), {
    config: { broadcast: { self: false } },
  });

  channel.on("broadcast", { event: BROADCAST_EVENT }, ({ payload }) => {
    const signal = payload as CallSignal;
    if (signal.to !== selfId) return;
    onSignal(signal);
  });

  channel.subscribe();
  return channel;
}

export function sendCallSignal(channel: RealtimeChannel, signal: CallSignal) {
  return channel.send({ type: "broadcast", event: BROADCAST_EVENT, payload: signal });
}

export function closeCallChannel(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}
