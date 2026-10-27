// Peer-to-peer WebRTC video call, signaled over Supabase Realtime (see
// ../lib/callSignaling.ts). Web-only for now: uses the browser's native
// RTCPeerConnection/getUserMedia rather than react-native-webrtc, matching
// the existing translator screens' web-only precedent (native support is a
// separate, larger lift - see docs/KamustaSign_UI_CRUD_Handoff.md Section 5.3).
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
// the reason - and, after a real call, its notes - until the user taps
// Back. Whenever this side gives up, it also tells the other side, so nobody
// is left on "Connecting…".
//
// Around the call itself:
//  - presence: this side shows "available" or "busy" (in a call) on its call
//    topics, and `presence` says who else is online;
//  - missed calls: a ring nobody answered is written to missed_calls (0013)
//    for the person who was called;
//  - connection quality: getStats() every few seconds; on a weak link the
//    video we send is lowered (bitrate + resolution) until it recovers;
//  - practice: the student's results for a sign the teacher asked for come
//    back as "practice-result" signals (`practiceResults`, teacher side).
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
  type PracticeResult,
  type PresenceMap,
} from "../lib/callSignaling";
import { recordMissedCall } from "../lib/queries";
import { CAMERA_VIDEO } from "./useSharedCameraStream";

export type CallState =
  | "idle"
  | "ringing-outgoing"
  | "ringing-incoming"
  | "connecting"
  | "connected"
  | "ended";

// ---- ICE servers ----
// STUN alone only works when both peers can reach each other directly; on
// school Wi-Fi / mobile data (symmetric NAT, blocked UDP) calls need a TURN
// relay. Two ways to configure one in .env:
//  - EXPO_PUBLIC_TURN_CREDENTIALS_URL: an endpoint that returns short-lived
//    credentials as RTCIceServer JSON - an array, or { iceServers: [...] }
//    (e.g. Metered's https://<app>.metered.live/api/v1/turn/credentials?apiKey=...).
//    Fetched when a call starts, cached for a while.
//  - EXPO_PUBLIC_TURN_URLS (comma-separated, e.g.
//    "turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp")
//    plus EXPO_PUBLIC_TURN_USERNAME / EXPO_PUBLIC_TURN_CREDENTIAL: fixed
//    credentials.
// Expo only inlines EXPO_PUBLIC_* when read as a literal property access.
const TURN_URLS = (process.env.EXPO_PUBLIC_TURN_URLS ?? "")
  .split(",")
  .map((u: string) => u.trim())
  .filter(Boolean);
const TURN_CREDENTIALS_URL = (process.env.EXPO_PUBLIC_TURN_CREDENTIALS_URL ?? "").trim();

export const hasTurnRelay = TURN_URLS.length > 0 || TURN_CREDENTIALS_URL.length > 0;

const STUN: RTCIceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] };
const STATIC_TURN: RTCIceServer[] = TURN_URLS.length
  ? [
      {
        urls: TURN_URLS,
        username: process.env.EXPO_PUBLIC_TURN_USERNAME ?? "",
        credential: process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "",
      },
    ]
  : [];
const TURN_CACHE_MS = 30 * 60_000;
let turnCache: { at: number; servers: RTCIceServer[] } | null = null;

/** Fetched TURN credentials (cached); [] when none are configured or the fetch fails. */
async function fetchedTurn(): Promise<RTCIceServer[]> {
  if (!TURN_CREDENTIALS_URL) return [];
  if (turnCache && Date.now() - turnCache.at < TURN_CACHE_MS) return turnCache.servers;
  try {
    const res = await fetch(TURN_CREDENTIALS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const servers = (Array.isArray(body) ? body : body?.iceServers ?? []) as RTCIceServer[];
    turnCache = { at: Date.now(), servers };
    return servers;
  } catch (err) {
    // A failed fetch still leaves STUN (and any fixed TURN): same-network calls work.
    console.warn("[videocall] Couldn't fetch TURN credentials:", err);
    return [];
  }
}

async function iceConfig(): Promise<RTCConfiguration> {
  return { iceServers: [STUN, ...STATIC_TURN, ...(await fetchedTurn())] };
}

if (!hasTurnRelay) {
  console.info(
    "[videocall] No TURN relay configured (EXPO_PUBLIC_TURN_CREDENTIALS_URL or EXPO_PUBLIC_TURN_URLS) - " +
      "calls across different networks may fail to connect."
  );
}

const RING_TIMEOUT_MS = 45_000;
const CONNECT_TIMEOUT_MS = 30_000;
// "disconnected" is often a blip (Wi-Fi hiccup) that recovers on its own;
// only give up if it lasts this long. "failed" ends the call immediately.
const DISCONNECT_GRACE_MS = 10_000;
// A ring the caller cancels after this long still counts as a missed call.
const MISSED_AFTER_MS = 15_000;

// ---- connection quality ----
const STATS_EVERY_MS = 2_000;
// Lowered video: what we send while the link is weak.
const LOW_BITRATE = 300_000;
const LOW_SCALE = 2;

export type QualityLevel = "good" | "fair" | "poor";
export type CallQuality = {
  level: QualityLevel;
  /** Round trip in ms, when known. */
  rttMs: number | null;
  /** Packet loss in the last interval, either direction, worst of the two (%). */
  lossPct: number;
  /** Frames per second of the video we receive, when known. */
  fps: number | null;
  /** Media goes through a TURN relay. */
  relayed: boolean;
  /** Our outgoing video is lowered because of a weak link. */
  reduced: boolean;
};

/** Grades one stats sample. Pure, for tests. */
export function gradeQuality(rttMs: number | null, lossPct: number): QualityLevel {
  if (lossPct >= 8 || (rttMs !== null && rttMs >= 600)) return "poor";
  if (lossPct >= 3 || (rttMs !== null && rttMs >= 300)) return "fair";
  return "good";
}

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

// `studentIds` is null on the student side; on the teacher side it is the
// class roster - the students this teacher can ring or be rung by.
export function useVideoCall(classId: string | null, self: CallPeer | null, studentIds: string[] | null = null) {
  const [callState, setCallStateRaw] = useState<CallState>("idle");
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The teacher's call settings as last received (student side only).
  const [remoteSettings, setRemoteSettings] = useState<CallSettings | null>(null);
  const [presence, setPresence] = useState<PresenceMap>({});
  const [quality, setQuality] = useState<CallQuality | null>(null);
  // When the current (or just-ended) call connected and ended - for the
  // call timer and the notes. Reset when the next call starts.
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [endedAt, setEndedAt] = useState<number | null>(null);
  // Teacher side: every practice result the student sent during this call.
  const [practiceResults, setPracticeResults] = useState<PracticeResult[]>([]);
  // Bumped whenever this side writes a missed call, so a dashboard can refresh.
  const [missedCallWrites, setMissedCallWrites] = useState(0);
  // The settings this side last sent (teacher side only), re-sent when the
  // student asks - e.g. it joined after the first send went out.
  const sentSettingsRef = useRef<CallSettings | null>(null);

  // Signal handlers and async continuations read these refs rather than
  // render-time state, so two signals arriving in the same tick (or an await
  // that resumes after a state change) always see the latest values.
  const callStateRef = useRef<CallState>("idle");
  const selfRef = useRef(self);
  selfRef.current = self;
  const classIdRef = useRef(classId);
  classIdRef.current = classId;
  const channelRef = useRef<CallChannel | null>(null);
  const isTeacher = studentIds !== null;
  const studentIdsRef = useRef(studentIds);
  studentIdsRef.current = studentIds;
  const studentKey = studentIds ? [...studentIds].sort().join(",") : "";
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Outgoing ring: when it started (missed-call rule).
  const ringStartedRef = useRef<number | null>(null);
  // ICE config fetched for this call (TURN credentials can take a moment).
  const iceRef = useRef<Promise<RTCConfiguration> | null>(null);

  const setCallState = useCallback((next: CallState) => {
    callStateRef.current = next;
    setCallStateRaw(next);
    if (next === "connected") setConnectedAt((at) => at ?? Date.now());
    if (next === "ended") setEndedAt(Date.now());
    // Presence: "busy" from the first ring to the end of the call.
    channelRef.current?.setStatus(next === "idle" || next === "ended" ? "available" : "busy");
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (graceRef.current) clearTimeout(graceRef.current);
    timerRef.current = null;
    graceRef.current = null;
  }, []);

  // A fresh call: forget the last one's timings and results.
  const resetCallRecord = useCallback(() => {
    setConnectedAt(null);
    setEndedAt(null);
    setPracticeResults([]);
    setQuality(null);
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
    ringStartedRef.current = null;
    iceRef.current = null;
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

  // An outgoing ring nobody answered: tell the person called, via their
  // dashboard. Best-effort - a missing table (0013 not applied) is ignored.
  const noteMissedCall = useCallback(() => {
    const to = peerRef.current;
    const klass = classIdRef.current;
    const me = selfRef.current;
    if (!to || !klass || !me) return;
    void recordMissedCall(klass, me.id, to.id).then(({ error: err }) => {
      if (!err) setMissedCallWrites((n) => n + 1);
    });
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
    (ms: number, message: string, onExpire?: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onExpire?.();
        fail(message);
      }, ms);
    },
    [fail]
  );

  // Opens camera + mic for the call identified by callId. Returns null if the
  // call was abandoned while the browser was still opening the camera.
  const acquireLocalMedia = useCallback(async (callId: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA_VIDEO, audio: true });
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

  const createPeerConnection = useCallback(
    (config: RTCConfiguration) => {
      const pc = new RTCPeerConnection(config);
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
                : hasTurnRelay
                  ? "Couldn't connect the call. Try again."
                  : "Couldn't connect the call. Your networks may be blocking it - try again from the same Wi-Fi, or ask your admin to set up a TURN relay."
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
    },
    [send, clearTimers, setCallState, fail]
  );

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
        resetCallRecord();
        peerRef.current = signal.from;
        callIdRef.current = signal.callId;
        iceRef.current = iceConfig();
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
          // The caller cancelled before we picked up - their side records a
          // missed call if it rang long enough; nothing to show here now.
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
        ringStartedRef.current = null;
        try {
          setCallState("connecting");
          startTimer(CONNECT_TIMEOUT_MS, "Couldn't connect the call. Try again.");
          const callId = callIdRef.current;
          const config = await (iceRef.current ?? iceConfig());
          if (callIdRef.current !== callId) return;
          const pc = createPeerConnection(config);
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
          const callId = callIdRef.current;
          const config = await (iceRef.current ?? iceConfig());
          if (callIdRef.current !== callId || pcRef.current) return;
          const pc = createPeerConnection(config);
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

      if (signal.kind === "practice-result") {
        if (!isTeacher) return;
        setPracticeResults((prev) => [...prev, signal.result].slice(-200));
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
    [teardownCall, resetCallRecord, setCallState, fail, startTimer, createPeerConnection, send, flushPendingIce, isTeacher]
  );

  const handleSignalRef = useRef(handleSignal);
  handleSignalRef.current = handleSignal;

  useEffect(() => {
    if (!classId || !self?.id || !isVideoCallSupported) return;
    const channel = openCallChannel(
      classId,
      self.id,
      isTeacher ? "teacher" : "student",
      (signal) => {
        void handleSignalRef.current(signal);
      },
      setPresence
    );
    channelRef.current = channel;
    channel.setStudents(studentIdsRef.current ?? []);
    return () => {
      // Leaving the class channel (sign-out, class switch, unmount) ends any
      // call in progress - say so first, so the other side isn't left waiting.
      const state = callStateRef.current;
      if (state !== "idle" && state !== "ended") send({ kind: "hangup" });
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
      teardownCall();
      setPeer(null);
      setPresence({});
      setCallState("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, self?.id, isTeacher]);

  // Roster changes join/leave just the affected students' topics, without
  // dropping a call in progress with someone else.
  useEffect(() => {
    channelRef.current?.setStudents(studentIdsRef.current ?? []);
  }, [studentKey]);

  // ---- connection quality, while connected ----
  useEffect(() => {
    if (callState !== "connected") return;
    let prevIn = { lost: 0, recv: 0 };
    let poorStreak = 0;
    let goodStreak = 0;
    let reduced = false;
    let cancelled = false;

    const setSenderLowered = async (pc: RTCPeerConnection, low: boolean) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (!sender) return;
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      for (const enc of params.encodings) {
        if (low) {
          enc.maxBitrate = LOW_BITRATE;
          enc.scaleResolutionDownBy = LOW_SCALE;
        } else {
          delete enc.maxBitrate;
          enc.scaleResolutionDownBy = 1;
        }
      }
      await sender.setParameters(params).catch(() => {});
    };

    const sample = async () => {
      const pc = pcRef.current;
      if (!pc || cancelled) return;
      const stats = await pc.getStats().catch(() => null);
      if (!stats || cancelled) return;
      let rttMs: number | null = null;
      let localCandidateId: string | null = null;
      let inLost = 0;
      let inRecv = 0;
      let fps: number | null = null;
      // Loss the other side reports on the video WE send (RTCP), 0-1.
      let outLossFraction = 0;
      stats.forEach((r: any) => {
        if (r.type === "candidate-pair" && r.state === "succeeded" && (r.nominated || r.selected)) {
          if (typeof r.currentRoundTripTime === "number") rttMs = Math.round(r.currentRoundTripTime * 1000);
          localCandidateId = r.localCandidateId ?? null;
        } else if (r.type === "inbound-rtp" && r.kind === "video") {
          inLost = r.packetsLost ?? 0;
          inRecv = r.packetsReceived ?? 0;
          if (typeof r.framesPerSecond === "number") fps = Math.round(r.framesPerSecond);
        } else if (r.type === "remote-inbound-rtp" && r.kind === "video") {
          if (typeof r.fractionLost === "number") outLossFraction = r.fractionLost;
          if (rttMs === null && typeof r.roundTripTime === "number") rttMs = Math.round(r.roundTripTime * 1000);
        }
      });
      const relayed = localCandidateId ? (stats.get(localCandidateId) as any)?.candidateType === "relay" : false;
      const dLost = Math.max(0, inLost - prevIn.lost);
      const dRecv = Math.max(0, inRecv - prevIn.recv);
      prevIn = { lost: inLost, recv: inRecv };
      const inLossPct = dLost + dRecv > 0 ? (dLost / (dLost + dRecv)) * 100 : 0;
      const outLossPct = outLossFraction * 100;
      const lossPct = Math.round(Math.max(inLossPct, outLossPct) * 10) / 10;

      // Lower what WE send when the other side reports loss on it, or the
      // round trip is long; restore after a run of good samples.
      const sendLevel = gradeQuality(rttMs, outLossPct);
      if (sendLevel === "poor") {
        poorStreak += 1;
        goodStreak = 0;
      } else if (sendLevel === "good") {
        goodStreak += 1;
        poorStreak = 0;
      } else {
        poorStreak = 0;
        goodStreak = 0;
      }
      if (!reduced && poorStreak >= 2) {
        reduced = true;
        await setSenderLowered(pc, true);
      } else if (reduced && goodStreak >= 4) {
        reduced = false;
        await setSenderLowered(pc, false);
      }
      if (cancelled) return;
      setQuality({ level: gradeQuality(rttMs, lossPct), rttMs, lossPct, fps, relayed, reduced });
    };

    const id = setInterval(() => void sample(), STATS_EVERY_MS);
    void sample();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [callState]);

  const startCall = useCallback(
    async (to: CallPeer) => {
      const state = callStateRef.current;
      if (!selfRef.current || (state !== "idle" && state !== "ended")) return;
      teardownCall();
      resetCallRecord();
      const callId = newCallId();
      peerRef.current = to;
      callIdRef.current = callId;
      iceRef.current = iceConfig();
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
      ringStartedRef.current = Date.now();
      startTimer(RING_TIMEOUT_MS, `${to.name} didn't answer. They'll see that you called.`, noteMissedCall);
    },
    [teardownCall, resetCallRecord, setCallState, acquireLocalMedia, fail, send, startTimer, noteMissedCall]
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

  // Leave / Cancel / Back. Leaving a call that connected shows the "Call
  // ended" screen (with its notes); from "ended" this returns to the dashboard.
  const hangUp = useCallback(() => {
    const state = callStateRef.current;
    if (state === "ringing-outgoing" && ringStartedRef.current && Date.now() - ringStartedRef.current >= MISSED_AFTER_MS) {
      noteMissedCall();
    }
    if (state !== "idle" && state !== "ended") send({ kind: "hangup" });
    teardownCall();
    setError(null);
    if (state === "connected") {
      setCallState("ended");
      return;
    }
    setPeer(null);
    setCallState("idle");
  }, [send, teardownCall, setCallState, noteMissedCall]);

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

  // Student side: report one attempt at the sign the teacher asked for.
  const sendPracticeResult = useCallback((result: PracticeResult) => send({ kind: "practice-result", result }), [send]);

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
    sendPracticeResult,
    practiceResults,
    presence,
    quality,
    connectedAt,
    endedAt,
    missedCallWrites,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
  };
}

export type VideoCall = ReturnType<typeof useVideoCall>;
