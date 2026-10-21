// Peer-to-peer WebRTC video call, signaled over Supabase Realtime (see
// ../lib/callSignaling.ts). Web-only for now: uses the browser's native
// RTCPeerConnection/getUserMedia rather than react-native-webrtc, matching
// the existing translator screens' web-only precedent (native support is a
// separate, larger lift - see KamustaSign_UI_CRUD_Handoff.md Section 5.3).
//
// STUN-only (Google's public stun.l.google.com:19302), no TURN server - fine
// for most same-network/open-NAT demo conditions, but calls between peers
// behind restrictive/symmetric NATs may fail to connect without a TURN relay.
//
// Flow: the caller opens its camera, then rings. The callee opens its camera
// when it accepts, then sends "accept". The caller answers that with the SDP
// offer, the callee replies with the answer, and ICE candidates trickle both
// ways. Each side opens its camera BEFORE telling the other to move on, so a
// camera that is blocked or busy fails on the side that owns it, with a
// message there, instead of after the other side is already waiting.
//
// Any failure, a hangup, a decline or a timeout ends in "ended" (never
// straight to "idle"), so the dashboard keeps showing the call screen with
// the reason until the user taps Back. Whenever this side gives up, it also
// tells the other side, so nobody is left on "Connecting…".
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  newCallId,
  openCallChannel,
  type CallChannel,
  type CallPeer,
  type CallSettings,
  type CallSignal,
  type CallSignalBody,
} from "../lib/callSignaling";

export type CallState =
  | "idle"
  | "ringing-outgoing"
  | "ringing-incoming"
  | "connecting"
  | "connected"
  | "ended";

// STUN alone only works when both peers can reach each other directly; on
// school Wi-Fi / mobile data (symmetric NAT, blocked UDP) calls need a TURN
// relay. Set EXPO_PUBLIC_TURN_URLS (comma-separated, e.g.
// "turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp")
// plus EXPO_PUBLIC_TURN_USERNAME / EXPO_PUBLIC_TURN_CREDENTIAL in .env.
// Expo only inlines EXPO_PUBLIC_* when read as a literal property access.
const TURN_URLS = (process.env.EXPO_PUBLIC_TURN_URLS ?? "")
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export const hasTurnRelay = TURN_URLS.length > 0;

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ...(hasTurnRelay
      ? [
          {
            urls: TURN_URLS,
            username: process.env.EXPO_PUBLIC_TURN_USERNAME ?? "",
            credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "",
          },
        ]
      : []),
  ],
};

if (!hasTurnRelay) {
  console.info(
    "[videocall] No TURN relay configured (EXPO_PUBLIC_TURN_URLS) - calls across " +
      "different networks may fail to connect."
  );
}

const RING_TIMEOUT_MS = 45_000;
const CONNECT_TIMEOUT_MS = 30_000;
// "disconnected" is often a blip (Wi-Fi hiccup) that recovers on its own;
// only give up if it lasts this long. "failed" ends the call immediately.
const DISCONNECT_GRACE_MS = 10_000;

export const isVideoCallSupported =
  Platform.OS === "web" && typeof window !== "undefined" && typeof window.RTCPeerConnection !== "undefined";

function mediaErrorMessage(err: any): string {
  switch (err?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera or microphone permission was blocked. Allow it in the browser's address bar, then call again.";
    case "NotReadableError":
    case "AbortError":
      return "Your camera is being used by another app or tab. Close it there, then call again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera or microphone was found.";
    default:
      return err?.message ?? "Could not open your camera.";
  }
}

export function useVideoCall(classId: string | null, self: CallPeer | null) {
  const [callState, setCallStateRaw] = useState<CallState>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The teacher's call settings as last received (student side only).
  const [remoteSettings, setRemoteSettings] = useState<CallSettings | null>(null);
  // The settings this side last sent (teacher side only), re-sent when the
  // student asks - e.g. it joined after the first send went out.
  const sentSettingsRef = useRef<CallSettings | null>(null);

  // Signal handlers and async continuations read these refs rather than
  // render-time state, so two signals arriving in the same tick (or an await
  // that resumes after a state change) always see the latest values.
  const callStateRef = useRef<CallState>("idle");
  const selfRef = useRef(self);
  selfRef.current = self;
  const channelRef = useRef<CallChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCallState = useCallback((next: CallState) => {
    callStateRef.current = next;
    setCallStateRaw(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (graceRef.current) clearTimeout(graceRef.current);
    timerRef.current = null;
    graceRef.current = null;
  }, []);

  // Releases the camera and the peer connection. Bumping callIdRef to null
  // also makes any still-running async step (a getUserMedia that hasn't
  // resolved yet, say) notice it's stale and drop what it got.
  const teardownCall = useCallback(() => {
    clearTimers();
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
    }
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pendingIceRef.current = [];
    peerRef.current = null;
    callIdRef.current = null;
    sentSettingsRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteSettings(null);
  }, [clearTimers]);

  const send = useCallback((signal: CallSignalBody) => {
    const me = selfRef.current;
    const to = peerRef.current;
    const callId = callIdRef.current;
    if (!me || !to || !callId || !channelRef.current) return;
    channelRef.current.send({ ...signal, from: me, to: to.id, callId } as CallSignal);
  }, []);

  // End the call from this side with a reason shown on the "Call ended"
  // screen, telling the other side so it doesn't wait forever.
  const fail = useCallback(
    (message: string, notifyPeer = true) => {
      if (notifyPeer) send({ kind: "hangup", reason: "failed" });
      teardownCall();
      setError(message);
      setCallState("ended");
    },
    [send, teardownCall, setCallState]
  );

  const startTimer = useCallback(
    (ms: number, message: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fail(message), ms);
    },
    [fail]
  );

  // Opens camera + mic for the call identified by callId. Returns null if the
  // call was abandoned while the browser was still opening the camera.
  const acquireLocalMedia = useCallback(async (callId: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (callIdRef.current !== callId) {
      stream.getTracks().forEach((t) => t.stop());
      return null;
    }
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // A function, not an inline comparison, so TypeScript doesn't carry an
  // earlier narrowing of pcRef.current across the awaits in handleSignal.
  const isCurrentPc = (pc: RTCPeerConnection) => pcRef.current === pc;

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) send({ kind: "ice-candidate", candidate: event.candidate.toJSON() });
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? new MediaStream([event.track]));
    };
    pc.onconnectionstatechange = () => {
      if (!isCurrentPc(pc)) return;
      switch (pc.connectionState) {
        case "connected":
          clearTimers();
          setCallState("connected");
          break;
        case "disconnected":
          if (!graceRef.current) {
            graceRef.current = setTimeout(() => fail("The connection was lost."), DISCONNECT_GRACE_MS);
          }
          break;
        case "failed":
          fail(
            callStateRef.current === "connected"
              ? "The connection was lost."
              : "Couldn't connect the call. Your networks may be blocking it - try again, or from the same Wi-Fi."
          );
          break;
      }
      if (pc.connectionState !== "disconnected" && graceRef.current) {
        clearTimeout(graceRef.current);
        graceRef.current = null;
      }
    };

    pcRef.current = pc;
    return pc;
  }, [send, clearTimers, setCallState, fail]);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    const pending = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of pending) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }, []);

  const handleSignal = useCallback(
    async (signal: CallSignal) => {
      const me = selfRef.current;
      if (!me) return;
      const state = callStateRef.current;

      if (signal.kind === "ring") {
        if (state !== "idle" && state !== "ended") {
          // Busy - auto-decline rather than silently dropping the request.
          channelRef.current?.send({ kind: "decline", reason: "busy", from: me, to: signal.from.id, callId: signal.callId });
          return;
        }
        teardownCall();
        peerRef.current = signal.from;
        callIdRef.current = signal.callId;
        setPeer(signal.from);
        setError(null);
        setCallState("ringing-incoming");
        // The caller gives up at RING_TIMEOUT_MS and says so; this is only a
        // backstop in case that hangup never arrives.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          teardownCall();
          setCallState("idle");
        }, RING_TIMEOUT_MS + 5_000);
        return;
      }

      // Everything else must belong to the call we're in, with that peer.
      if (signal.callId !== callIdRef.current || signal.from.id !== peerRef.current?.id) return;

      if (signal.kind === "decline") {
        if (state !== "ringing-outgoing") return;
        fail(
          signal.reason === "busy" ? `${signal.from.name} is on another call.` : `${signal.from.name} declined the call.`,
          false
        );
        return;
      }

      if (signal.kind === "hangup") {
        teardownCall();
        if (state === "ringing-incoming") {
          // The caller cancelled before we picked up - nothing to report.
          setCallState("idle");
          return;
        }
        setError(signal.reason === "failed" ? `The call couldn't continue on ${signal.from.name}'s side.` : null);
        setCallState("ended");
        return;
      }

      if (signal.kind === "accept") {
        // We're the caller (camera already open): we make the offer.
        if (state !== "ringing-outgoing") return;
        try {
          setCallState("connecting");
          startTimer(CONNECT_TIMEOUT_MS, "Couldn't connect the call. Try again.");
          const pc = createPeerConnection();
          const offer = await pc.createOffer();
          if (!isCurrentPc(pc)) return;
          await pc.setLocalDescription(offer);
          send({ kind: "offer", sdp: offer });
        } catch (err: any) {
          fail(err?.message ?? "Could not start the call.");
        }
        return;
      }

      if (signal.kind === "offer") {
        // We're the callee (camera opened in acceptCall): we answer.
        if (state !== "connecting" || pcRef.current) return;
        try {
          const pc = createPeerConnection();
          await pc.setRemoteDescription(signal.sdp);
          await flushPendingIce(pc);
          const answer = await pc.createAnswer();
          if (!isCurrentPc(pc)) return;
          await pc.setLocalDescription(answer);
          send({ kind: "answer", sdp: answer });
        } catch (err: any) {
          fail(err?.message ?? "Could not answer the call.");
        }
        return;
      }

      if (signal.kind === "answer") {
        const pc = pcRef.current;
        if (!pc || pc.signalingState !== "have-local-offer") return;
        try {
          await pc.setRemoteDescription(signal.sdp);
          await flushPendingIce(pc);
        } catch (err: any) {
          fail(err?.message ?? "Could not connect the call.");
        }
        return;
      }

      if (signal.kind === "settings") {
        setRemoteSettings(signal.settings);
        return;
      }

      if (signal.kind === "settings-request") {
        if (sentSettingsRef.current) send({ kind: "settings", settings: sentSettingsRef.current });
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
    [teardownCall, setCallState, fail, startTimer, createPeerConnection, send, flushPendingIce]
  );

  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  useEffect(() => {
    if (!classId || !self?.id || !isVideoCallSupported) return;
    const channel = openCallChannel(classId, self.id, (signal) => {
      void handleSignalRef.current(signal);
    });
    channelRef.current = channel;
    return () => {
      // Leaving the class channel (sign-out, class switch, unmount) ends any
      // call in progress - say so first, so the other side isn't left waiting.
      const state = callStateRef.current;
      if (state !== "idle" && state !== "ended") send({ kind: "hangup" });
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
      teardownCall();
      setPeer(null);
      setCallState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, self?.id]);

  const startCall = useCallback(
    async (to: CallPeer) => {
      const state = callStateRef.current;
      if (!selfRef.current || (state !== "idle" && state !== "ended")) return;
      teardownCall();
      const callId = newCallId();
      peerRef.current = to;
      callIdRef.current = callId;
      setPeer(to);
      setError(null);
      setCallState("ringing-outgoing");
      try {
        if (!(await acquireLocalMedia(callId))) return;
      } catch (err) {
        fail(mediaErrorMessage(err), false);
        return;
      }
      send({ kind: "ring" });
      startTimer(RING_TIMEOUT_MS, `${to.name} didn't answer.`);
    },
    [teardownCall, setCallState, acquireLocalMedia, fail, send, startTimer]
  );

  const acceptCall = useCallback(async () => {
    const callId = callIdRef.current;
    if (callStateRef.current !== "ringing-incoming" || !callId) return;
    clearTimers();
    setError(null);
    setCallState("connecting");
    try {
      if (!(await acquireLocalMedia(callId))) return;
    } catch (err) {
      fail(mediaErrorMessage(err));
      return;
    }
    send({ kind: "accept" });
    startTimer(CONNECT_TIMEOUT_MS, "Couldn't connect the call. Try again.");
  }, [clearTimers, setCallState, acquireLocalMedia, fail, send, startTimer]);

  const declineCall = useCallback(() => {
    if (callStateRef.current !== "ringing-incoming") return;
    send({ kind: "decline" });
    teardownCall();
    setPeer(null);
    setCallState("idle");
  }, [send, teardownCall, setCallState]);

  // Leave / Cancel / Back. From "ended" this just returns to the dashboard.
  const hangUp = useCallback(() => {
    const state = callStateRef.current;
    if (state !== "idle" && state !== "ended") send({ kind: "hangup" });
    teardownCall();
    setPeer(null);
    setError(null);
    setCallState("idle");
  }, [send, teardownCall, setCallState]);

  // Teacher side: push the call settings to the student.
  const sendSettings = useCallback(
    (settings: CallSettings) => {
      sentSettingsRef.current = settings;
      send({ kind: "settings", settings });
    },
    [send]
  );

  // Student side: ask for the teacher's current settings.
  const requestSettings = useCallback(() => send({ kind: "settings-request" }), [send]);

  return {
    callState,
    incomingCallFrom: callState === "ringing-incoming" ? peer : null,
    peer,
    localStream,
    remoteStream,
    error,
    remoteSettings,
    sendSettings,
    requestSettings,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
  };
}
