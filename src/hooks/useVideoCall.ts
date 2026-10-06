// Peer-to-peer WebRTC video call, signaled over Supabase Realtime (see
// ../lib/callSignaling.ts). Web-only for now: uses the browser's native
// RTCPeerConnection/getUserMedia rather than react-native-webrtc, matching
// the existing translator screens' web-only precedent (native support is a
// separate, larger lift - see KamustaSign_UI_CRUD_Handoff.md Section 5.3).
//
// STUN-only (Google's public stun.l.google.com:19302), no TURN server - fine
// for most same-network/open-NAT demo conditions, but calls between peers
// behind restrictive/symmetric NATs may fail to connect without a TURN relay.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  callChannelName,
  closeCallChannel,
  openCallChannel,
  sendCallSignal,
  type CallPeer,
  type CallSignal,
} from "../lib/callSignaling";
import type { RealtimeChannel } from "@supabase/supabase-js";

export type CallState =
  | "idle"
  | "ringing-outgoing"
  | "ringing-incoming"
  | "connecting"
  | "connected"
  | "ended";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const isVideoCallSupported =
  Platform.OS === "web" && typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";

export function useVideoCall(classId: string | null, self: CallPeer | null) {
  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCallFrom, setIncomingCallFrom] = useState<CallPeer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);

  const teardownCall = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCallFrom(null);
  }, []);

  const send = useCallback((signal: CallSignal) => {
    if (channelRef.current) sendCallSignal(channelRef.current, signal);
  }, []);

  const createPeerConnection = useCallback(
    (peer: CallPeer) => {
      const pc = new RTCPeerConnection(ICE_SERVERS);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          send({ kind: "ice-candidate", from: self!, to: peer.id, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0] ?? null);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setCallState("connected");
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setError((prev) => prev ?? "Call connection lost.");
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [self, send]
  );

  const acquireLocalMedia = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of pendingIceRef.current) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
    pendingIceRef.current = [];
  }, []);

  const handleSignal = useCallback(
    async (signal: CallSignal) => {
      if (!self) return;

      if (signal.kind === "ring") {
        if (callState !== "idle") {
          // Busy - auto-decline rather than silently dropping the request.
          send({ kind: "decline", from: self, to: signal.from.id });
          return;
        }
        peerRef.current = signal.from;
        setIncomingCallFrom(signal.from);
        setCallState("ringing-incoming");
        return;
      }

      if (signal.kind === "decline") {
        setError(`${signal.from.name} declined the call.`);
        teardownCall();
        setCallState("idle");
        return;
      }

      if (signal.kind === "hangup") {
        teardownCall();
        setCallState("ended");
        return;
      }

      if (signal.kind === "accept") {
        // We're the caller: the callee is ready, so we're the offerer.
        try {
          setCallState("connecting");
          const peer = peerRef.current;
          if (!peer) return;
          const stream = await acquireLocalMedia();
          const pc = createPeerConnection(peer);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ kind: "offer", from: self, to: peer.id, sdp: offer });
        } catch (err: any) {
          setError(err?.message ?? "Could not start the call.");
          teardownCall();
          setCallState("idle");
        }
        return;
      }

      if (signal.kind === "offer") {
        // We're the callee, already past ringing-incoming -> connecting once
        // acceptCall() ran. Build our side of the connection now.
        try {
          const peer = signal.from;
          peerRef.current = peer;
          const stream = await acquireLocalMedia();
          const pc = createPeerConnection(peer);
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          await pc.setRemoteDescription(signal.sdp);
          await flushPendingIce(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ kind: "answer", from: self, to: peer.id, sdp: answer });
        } catch (err: any) {
          setError(err?.message ?? "Could not answer the call.");
          teardownCall();
          setCallState("idle");
        }
        return;
      }

      if (signal.kind === "answer") {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(signal.sdp);
        await flushPendingIce(pc);
        return;
      }

      if (signal.kind === "ice-candidate") {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingIceRef.current.push(signal.candidate);
          return;
        }
        await pc.addIceCandidate(signal.candidate).catch(() => {});
      }
    },
    [self, callState, send, acquireLocalMedia, createPeerConnection, flushPendingIce, teardownCall]
  );

  // The channel subscription effect below only (re)subscribes when
  // classId/self.id change, but handleSignal is recreated on every render
  // (it closes over callState). Routing the subscription callback through a
  // ref that's updated every render keeps it seeing current state instead of
  // being permanently stuck with the closure from the first subscribe.
  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  useEffect(() => {
    if (!classId || !self || !isVideoCallSupported) return;
    channelRef.current = openCallChannel(classId, self.id, (signal) => {
      handleSignalRef.current(signal);
    });
    return () => {
      if (channelRef.current) closeCallChannel(channelRef.current);
      channelRef.current = null;
      teardownCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, self?.id]);

  const startCall = useCallback(
    (peer: CallPeer) => {
      if (!self || callState !== "idle") return;
      setError(null);
      peerRef.current = peer;
      setCallState("ringing-outgoing");
      send({ kind: "ring", from: self, to: peer.id });
    },
    [self, callState, send]
  );

  const acceptCall = useCallback(() => {
    if (!self || !incomingCallFrom) return;
    setError(null);
    send({ kind: "accept", from: self, to: incomingCallFrom.id });
    setCallState("connecting");
  }, [self, incomingCallFrom, send]);

  const declineCall = useCallback(() => {
    if (!self || !incomingCallFrom) return;
    send({ kind: "decline", from: self, to: incomingCallFrom.id });
    teardownCall();
    setCallState("idle");
  }, [self, incomingCallFrom, send, teardownCall]);

  const hangUp = useCallback(() => {
    if (self && peerRef.current) {
      send({ kind: "hangup", from: self, to: peerRef.current.id });
    }
    teardownCall();
    setCallState("idle");
  }, [self, send, teardownCall]);

  return {
    callState,
    incomingCallFrom,
    peer: peerRef.current,
    localStream,
    remoteStream,
    error,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
  };
}

export { callChannelName };
