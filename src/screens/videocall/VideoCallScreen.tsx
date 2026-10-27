// In-call UI (Graphite Aurora, "call mode": design_handoff_teacher_admin_videocall
// C1-C9). Both video feeds can be read by the on-device sign pipeline
// (useCallSignReader) with a model the teacher chooses - ASL letters, ASL
// words or FSL words - and each side's signs build up as text that can be
// spoken aloud (useTranslateAndSpeak, in the standing speech language) or
// shown full-screen. Recognition runs on this device only and nothing is
// sent over the network. Deaf-first: every state is shown in words, nothing
// depends on sound.
//
// Rendered by the Student/Teacher dashboards in place of their normal
// content whenever a call is anything other than idle (useVideoCall).
//
// Calls are always teacher <-> student, and the teacher runs the call: the
// model, whose signs are read, and "Show big" (which opens on both screens)
// are set in the teacher's Tools and sent to the student (CallSettings in
// ../../lib/callSignaling.ts). The student's screen doesn't show those
// controls at all; mic, camera, captions and speech language stay each
// person's own.
//
// Layout: a focus layout - the other person big, one caption strip below the
// video, tools in a drawer (desktop) or sheet (phone), and a control bar that
// never scrolls away. The two <video> elements are created once, at the top
// of the in-call tree, and only moved and resized (callGeometry.ts); a
// different element tree per layout is what used to leave them black.
//
// Practice in the call: the teacher picks a sign (letters, or the class
// plan's words) and asks the student for it. The student's own device
// checks it with the classroom's pass rule (callPractice.ts), records the
// attempt in lesson_progress like the practice screen does, and sends the
// result back so the teacher sees it at once. While asked, the student's own
// video becomes the big one: the check reads it.
//
// After a call that connected, the teacher gets a summary to save to the
// class's call notes (0013) or download; the student a short summary.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LanguagePicker, { useSelectedLanguage } from "../../components/LanguagePicker";
import { useHandedness } from "../../components/HandednessPicker";
import {
  BackspaceIcon,
  CaptionsIcon,
  ChevronDownIcon,
  CloseIcon,
  EyeIcon,
  ExpandIcon,
  HandIcon,
  MicIcon,
  PhoneOffIcon,
  SlidersIcon,
  SpeakerIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import { isVideoCallSupported, type VideoCall } from "../../hooks/useVideoCall";
import { useCallSignReader, type SignReading } from "../../hooks/useCallSignReader";
import { useTranslateAndSpeak } from "../../hooks/useTranslateAndSpeak";
import { findLanguage } from "../../lib/languages";
import { CallPracticeGrader, callModelScope, practiceSignsFor, summarizePractice } from "../../lib/callPractice";
import { recordAttempt, saveCallNotes } from "../../lib/queries";
import type { ClassPlan } from "../../lib/curriculum";
import type { CallModelKey, CallPeer, CallSettings, PracticeResult } from "../../lib/callSignaling";
import { callLayout, type Rect } from "./callGeometry";
import { MODELS, MODEL_NAMES, firstName, fromRead, clock, toRead, type ReadFrom } from "./callUi";
import { CallAvatar, CallPill, ControlToggle, PhaseChip, QualityBadge, QualityBars, SpinnerArc } from "./CallParts";
import CaptionStrip from "./CaptionStrip";
import CallToolsPanel, { type ToolsTab } from "./CallToolsPanel";
import StudentAskPanel from "./StudentAskPanel";
import { CallErrorScreen, CallingScreen, IncomingScreen, StudentEnded, TeacherSummary, WebOnlyScreen, type NotesData } from "./CallScreens";

type Props = {
  role: "teacher" | "student";
  /** Everything useVideoCall returns. */
  call: VideoCall;
  /** This side of the call, and the class it's in (for attempts and notes). */
  self: CallPeer;
  classId: string;
  /** Shown on the teacher's summary ("Back to Grade 5 - Mabini") and incoming calls. */
  className?: string | null;
  /** Teacher side: the class learning plan, which words can be practised. */
  plan?: ClassPlan | null;
  accentColor: string;
};

type Big = { text: string; by: "teacher" | "student" };

// Plain CSS: these go on the <video> elements themselves, not on RN views.
const VIDEO_CSS: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };
const MIRRORED_CSS: React.CSSProperties = { ...VIDEO_CSS, transform: "scaleX(-1)" };

export default function VideoCallScreen({ role, call, self, classId, className, plan, accentColor }: Props) {
  const {
    remoteSettings,
    sendSettings,
    requestSettings,
    callState,
    incomingCallFrom,
    peer,
    localStream,
    remoteStream,
    error,
    endReason,
    acceptCall,
    declineCall,
    hangUp,
    quality,
    connectedAt,
    endedAt,
  } = call;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const isTeacher = role === "teacher";
  // The teacher's own choices. On the student's screen the same come from
  // remoteSettings instead (defaults until the first one arrives).
  const [teacherModel, setTeacherModel] = useState<CallModelKey>("asl-letters");
  const [teacherReadFrom, setTeacherReadFrom] = useState<ReadFrom>("both");
  const [teacherBig, setTeacherBig] = useState<CallSettings["big"]>(null);
  const [teacherPractice, setTeacherPractice] = useState<CallSettings["practice"]>(null);
  const modelKey = isTeacher ? teacherModel : remoteSettings?.model ?? "asl-letters";
  const readFrom = isTeacher ? teacherReadFrom : fromRead(remoteSettings?.read ?? "both", role);
  const sharedBig = isTeacher ? teacherBig : remoteSettings?.big ?? null;
  const practice = isTeacher ? teacherPractice : remoteSettings?.practice ?? null;
  // Which model each practice request was made with, for the notes.
  const practiceModelsRef = useRef(new Map<number, CallModelKey>());
  if (practice && !practiceModelsRef.current.has(practice.id)) practiceModelsRef.current.set(practice.id, modelKey);
  const modelOf = useCallback((r: PracticeResult) => practiceModelsRef.current.get(r.practiceId) ?? modelKey, [modelKey]);
  // Student side: this call's practice attempts (the teacher gets them as call.practiceResults).
  const [ownResults, setOwnResults] = useState<PracticeResult[]>([]);
  const practiceResults = isTeacher ? call.practiceResults : ownResults;
  // Student side: the id of a teacher "Show big" this student closed, and a
  // "Show big" of their own (which only opens on their own screen).
  const [dismissedBigId, setDismissedBigId] = useState<number | null>(null);
  const [ownBig, setOwnBig] = useState<Big | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<ToolsTab>("practice");
  const [yourSignsOpen, setYourSignsOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [speechLang, setSpeechLang] = useSelectedLanguage();
  const [handedness] = useHandedness();

  // Attach each stream to its element whenever either changes. The elements
  // are created once per call, so this only runs when a stream arrives.
  const attachLocal = useCallback(
    (el: HTMLVideoElement | null) => {
      localVideoRef.current = el;
      if (el && el.srcObject !== localStream) el.srcObject = localStream;
    },
    [localStream]
  );
  const attachRemote = useCallback(
    (el: HTMLVideoElement | null) => {
      remoteVideoRef.current = el;
      if (el && el.srcObject !== remoteStream) el.srcObject = remoteStream;
    },
    [remoteStream]
  );

  // Mic / camera switches act on the local tracks (the peer sees a frozen
  // or black frame, and hears nothing, exactly as in any call app).
  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [localStream, micOn]);
  useEffect(() => {
    localStream?.getVideoTracks().forEach((t) => (t.enabled = camOn));
  }, [localStream, camOn]);

  const connected = callState === "connected";
  const inCall = callState === "connecting" || connected;

  // Teacher: send the settings whenever they change, and once the call
  // starts. Student: ask for them once the call starts, in case the
  // teacher's first send went out before this side was listening.
  useEffect(() => {
    if (!isTeacher || !inCall) return;
    sendSettings({ model: teacherModel, read: toRead(teacherReadFrom, role), big: teacherBig, practice: teacherPractice });
  }, [isTeacher, inCall, teacherModel, teacherReadFrom, teacherBig, teacherPractice, role, sendSettings]);
  useEffect(() => {
    if (!isTeacher && inCall) requestSettings();
  }, [isTeacher, inCall, requestSettings]);
  // A new "Show big" from the teacher replaces whatever the student had open.
  const sharedBigId = isTeacher ? null : remoteSettings?.big?.id ?? null;
  useEffect(() => {
    if (sharedBigId !== null) setOwnBig(null);
  }, [sharedBigId]);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connected]);

  // The weak-connection banner shows once per drop: dismissing it lasts
  // until the link recovers.
  const poor = quality?.level === "poor";
  useEffect(() => {
    if (!poor) setBannerDismissed(false);
  }, [poor]);

  // ---- practice ----
  const practiceScope = callModelScope(modelKey);
  // Student side: grade the local feed against the requested sign. A new
  // request (new id) starts a fresh grader.
  const graderRef = useRef<{ id: number; grader: CallPracticeGrader } | null>(null);
  useEffect(() => {
    graderRef.current = !isTeacher && practice ? { id: practice.id, grader: new CallPracticeGrader(practice.sign, practiceScope.group) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, practice?.id, practice?.sign, practiceScope.group]);

  const onLocalReading = (r: SignReading) => {
    const current = graderRef.current;
    if (isTeacher || !current || !practice) return;
    const attempt = current.grader.push(r);
    if (!attempt) return;
    const result: PracticeResult = { practiceId: current.id, sign: current.grader.sign, ...attempt };
    setOwnResults((prev) => [...prev, result].slice(-200));
    call.sendPracticeResult(result);
    // Counts like the practice screen: every word clip, and a letter's
    // pass or finished try. Best-effort - the call never waits on it.
    void recordAttempt(self.id, practiceScope.language, practiceScope.group, current.grader.sign, attempt.passed, attempt.confidence);
  };

  // Teacher: asking for a sign also makes sure the student's signs are read.
  const askFor = (sign: string | null) => {
    setTeacherPractice(sign ? { sign, id: Date.now() } : null);
    if (sign && teacherReadFrom === "me") setTeacherReadFrom("both");
  };
  // A different model means a different set of signs: drop the request.
  useEffect(() => {
    if (isTeacher) setTeacherPractice(null);
  }, [isTeacher, teacherModel]);

  const model = MODELS[modelKey];
  const remote = useCallSignReader(remoteVideoRef, connected && captionsOn && readFrom !== "me", model);
  const local = useCallSignReader(localVideoRef, connected && captionsOn && readFrom !== "them" && camOn, model, {
    mirrorLandmarks: handedness === "left",
    onReading: onLocalReading,
  });
  const remoteSpeech = useTranslateAndSpeak(speechLang);
  const localSpeech = useTranslateAndSpeak(speechLang);

  // Words model: optionally speak each new word the other person signs.
  useEffect(() => {
    if (!autoSpeak || model.kind !== "words" || !remote.lastAdded) return;
    const t = remote.lastAdded.token;
    if (t !== "del" && t !== "space") void remoteSpeech.speak(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.lastAdded]);

  // A remote video whose frames stop for 3 s says so, instead of freezing.
  const [noVideo, setNoVideo] = useState(false);
  useEffect(() => {
    if (!connected) {
      setNoVideo(false);
      return;
    }
    let last = -1;
    let stalledFor = 0;
    const id = setInterval(() => {
      const v = remoteVideoRef.current;
      const frames = v?.getVideoPlaybackQuality?.().totalVideoFrames ?? -1;
      stalledFor = frames === last ? stalledFor + 1 : 0;
      last = frames;
      setNoVideo(stalledFor >= 3);
    }, 1000);
    return () => clearInterval(id);
  }, [connected]);

  // Esc closes Show big, the sheet and the drawer, in that order (web).
  const peerName = peer?.name ?? incomingCallFrom?.name ?? "Your call";
  const first = firstName(peerName);
  const elapsed = connectedAt ? Math.max(0, Math.floor((now - connectedAt) / 1000)) : 0;
  const languageName = findLanguage(speechLang)?.name ?? "English";

  // What the big view shows: the student's own "Show big" first, else the
  // teacher's unless this student closed that one.
  const big: Big | null =
    ownBig ?? (sharedBig && sharedBig.id !== dismissedBigId ? { text: sharedBig.text, by: sharedBig.by ?? (isTeacher ? "student" : "teacher") } : null);
  const bigFromTeacher = !isTeacher && ownBig === null && big !== null;
  const showBig = (text: string, by: Big["by"]) =>
    isTeacher ? setTeacherBig({ text, id: Date.now(), by }) : setOwnBig({ text, by });
  const closeBig = () => {
    if (isTeacher) setTeacherBig(null);
    else if (ownBig !== null) setOwnBig(null);
    else if (sharedBig) setDismissedBigId(sharedBig.id);
  };
  const escapeRef = useRef<() => void>(() => {});
  escapeRef.current = () => {
    if (big) closeBig();
    else if (yourSignsOpen) setYourSignsOpen(false);
    else if (toolsOpen) setToolsOpen(false);
  };
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined" || !inCall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") escapeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inCall]);

  if (!isVideoCallSupported) return <WebOnlyScreen onBack={hangUp} />;

  // ---------- ringing / ended ----------
  if (callState === "ringing-incoming" && incomingCallFrom) {
    return (
      <IncomingScreen
        callerName={incomingCallFrom.name}
        selfRole={role}
        className={className}
        phone={width < 768}
        onAccept={acceptCall}
        onDecline={declineCall}
      />
    );
  }
  if (callState === "ringing-outgoing") {
    return (
      <CallingScreen
        peerName={peer?.name ?? "…"}
        presence={peer ? call.presence[peer.id] : undefined}
        accent={isTeacher ? colors.accentCoral : colors.primaryTealLight}
        localStream={localStream}
        onCancel={hangUp}
      />
    );
  }
  if (callState === "ended") {
    // Notes only for a call that actually connected.
    const notes: NotesData | null =
      connectedAt !== null
        ? {
            startedAt: connectedAt,
            seconds: Math.max(0, Math.round(((endedAt ?? Date.now()) - connectedAt) / 1000)),
            mine: local.text.trim(),
            theirs: remote.text.trim(),
            practice: summarizePractice(practiceResults, modelOf),
          }
        : null;
    if (!notes) {
      return <CallErrorScreen reason={endReason} peerName={peerName} error={error} onBack={hangUp} onCallAgain={() => peer && call.startCall(peer)} />;
    }
    if (isTeacher && peer) {
      return (
        <TeacherSummary
          peerName={peerName}
          selfName={self.name}
          className={className}
          notes={notes}
          reason={endReason}
          onBack={hangUp}
          onSave={() =>
            saveCallNotes({
              class_id: classId,
              teacher_id: self.id,
              student_id: peer.id,
              started_at: new Date(notes.startedAt).toISOString(),
              duration_seconds: notes.seconds,
              teacher_text: notes.mine,
              student_text: notes.theirs,
              practice: notes.practice,
            })
          }
        />
      );
    }
    return <StudentEnded teacherName={peerName} selfName={self.name} notes={notes} reason={endReason} onBack={hangUp} />;
  }
  if (!inCall) return <View style={styles.root} />;

  // ---------- in call ----------
  const asked = !isTeacher && !!practice;
  const readingRemote = connected && captionsOn && readFrom !== "me";
  const readingLocal = connected && captionsOn && readFrom !== "them" && camOn;
  const layout = callLayout({
    width,
    height,
    role,
    toolsOpen: isTeacher && toolsOpen,
    asked,
    showBig: big !== null,
    twoRows: readFrom === "both" && isTeacher,
    insetTop: insets.top,
    insetBottom: insets.bottom,
  });
  const { phone, compact } = layout;
  const words = model.kind === "words";

  const remoteSource = {
    label: `${first} is signing`,
    reader: remote,
    active: readingRemote,
    pausedText: !captionsOn
      ? "Captions are off."
      : isTeacher
        ? `Not reading ${first}'s signs. In Tools → Reading, choose ${first} or Both of us.`
        : "Your teacher isn't reading their own signs right now.",
    placeholder: `${first}'s signs appear here as text.`,
  };
  const localSource = {
    label: isTeacher ? "You" : "Your signs",
    reader: local,
    active: readingLocal,
    pausedText: !camOn
      ? "Your camera is off."
      : !captionsOn
        ? "Captions are off."
        : isTeacher
          ? "Not reading your signs. In Tools → Reading, choose Me or Both of us."
          : "Your teacher isn't reading your signs right now.",
    placeholder: isTeacher ? "Your signs appear here as text." : "Your signs appear here. Speak them aloud for people near you.",
  };
  // The strip shows the other person's signs, or your own when only yours are read.
  const primary = readFrom === "me" ? localSource : remoteSource;
  const secondary = isTeacher && readFrom === "both" ? localSource : null;
  const primarySpeech = readFrom === "me" ? localSpeech : remoteSpeech;
  const readingNote = isTeacher
    ? `Reading ${readFrom === "both" ? "both of you" : readFrom === "me" ? "your signs" : `${first}'s signs`} with ${MODEL_NAMES[modelKey]}`
    : `Reading ${MODEL_NAMES[modelKey]}, chosen by your teacher`;

  const transcriptTools = (reader: typeof remote, speech: typeof remoteSpeech, by: Big["by"], showBigLabel: string) => {
    const has = reader.text.trim().length > 0;
    return (
      <>
        <CallPill
          size="sm"
          label={speech.status === "speaking" ? "Speaking…" : speech.status === "translating" ? "Translating…" : "Speak aloud"}
          onPress={() => speech.speak(reader.text.trim())}
          disabled={!has}
          icon={(c) => <SpeakerIcon size={15} color={c} />}
        />
        <CallPill size="sm" label={showBigLabel} onPress={() => showBig(reader.text, by)} disabled={!has} icon={(c) => <ExpandIcon size={14} color={c} />} />
        {!words ? <CallPill size="sm" label="␣" accessibilityLabel="Add a space" onPress={reader.addSpace} /> : null}
        <CallPill
          size="sm"
          label=""
          accessibilityLabel={words ? "Delete last word" : "Delete last letter"}
          onPress={reader.backspace}
          disabled={!has}
          icon={(c) => <BackspaceIcon size={16} color={c} />}
        />
        <CallPill size="sm" variant="ghost" label="Clear" onPress={reader.clear} disabled={!has} />
      </>
    );
  };

  const speechPicker = (inline: boolean) => (
    <LanguagePicker
      value={speechLang}
      onChange={setSpeechLang}
      accentColor={colors.accentCoral}
      renderTrigger={({ open, current }) => (
        <View style={styles.speakWrap}>
          <Pressable onPress={open} style={[styles.langPill, neuRaised("sm")]} accessibilityRole="button" accessibilityLabel={`Speak in ${current.name}. Change the speech language`}>
            <SpeakerIcon size={15} color={colors.textOnGlass} />
            <Text style={styles.langText}>{inline ? `Speak in ${current.name}` : current.name}</Text>
            <ChevronDownIcon size={13} color={colors.textOnGlass} />
          </Pressable>
          {!inline ? <Text style={styles.ctrlCaption}>Speak in</Text> : null}
        </View>
      )}
    />
  );

  const peerAccent = isTeacher ? colors.accentCoral : colors.primaryTealLight;
  const statusLine = (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.accentCoral }]} />
      <Text style={[styles.statusText, { color: connected ? colors.successText : colors.textOnGlass }]}>
        {connected ? (phone ? clock(elapsed) : `Connected · ${clock(elapsed)}`) : "Connecting…"}
      </Text>
      {connected && quality ? <QualityBadge quality={quality} /> : null}
    </View>
  );
  const readingChip = isTeacher && connected ? (
    <Pressable
      onPress={() => {
        setToolsTab("reading");
        setToolsOpen(true);
      }}
      style={[styles.readingChip, neuRaised("sm")]}
      accessibilityRole="button"
      accessibilityLabel={`${readingNote}. Change in Tools`}
    >
      <EyeIcon size={16} color={colors.textOnGlass} />
      <Text style={styles.readingChipText} numberOfLines={1}>
        Reading <Text style={styles.readingChipStrong}>{readFrom === "both" ? "both" : readFrom === "me" ? "you" : first}</Text> · {MODEL_NAMES[modelKey]}
      </Text>
    </Pressable>
  ) : null;
  const toolsButton = (size: "md" | "phone") => (
    <Pressable
      onPress={() => {
        if (!toolsOpen) setToolsTab(practice ? "practice" : toolsTab);
        setToolsOpen((v) => !v);
      }}
      style={size === "phone" ? styles.phoneCtrl : [styles.toolsBtn, toolsOpen ? [styles.toolsBtnOn, neuInset("sm")] : neuRaised("sm")]}
      accessibilityRole="button"
      accessibilityLabel={toolsOpen ? "Close Tools" : "Open Tools"}
      accessibilityState={{ expanded: toolsOpen }}
    >
      {size === "phone" ? (
        <>
          <View style={[styles.phoneCtrlBtn, toolsOpen ? [styles.toolsBtnOn, neuInset("sm")] : neuRaised("sm")]}>
            <SlidersIcon size={20} color={toolsOpen ? colors.accentCoral : colors.textPrimary} />
          </View>
          <Text style={[styles.ctrlCaption, toolsOpen && { color: colors.accentCoral }]}>Tools</Text>
        </>
      ) : (
        <>
          <SlidersIcon size={17} color={toolsOpen ? colors.accentCoral : colors.textPrimary} />
          <Text style={[styles.toolsText, toolsOpen && { color: colors.accentCoral }]}>Tools</Text>
        </>
      )}
    </Pressable>
  );

  const ctrlSize = phone ? 52 : isTeacher ? (compact ? 48 : 56) : compact ? 56 : 64;
  const toggles = (
    <>
      <ControlToggle label="Mute" offLabel="Muted" on={micOn} onPress={() => setMicOn((v) => !v)} size={ctrlSize} inlineLabel={compact && !phone} icon={(c) => <MicIcon size={22} color={c} off={!micOn} />} />
      <ControlToggle label="Camera" offLabel="Camera off" on={camOn} onPress={() => setCamOn((v) => !v)} size={ctrlSize} inlineLabel={compact && !phone} icon={(c) => <VideoIcon size={22} color={c} off={!camOn} />} />
      <ControlToggle label="Captions" offLabel="Captions off" on={captionsOn} onPress={() => setCaptionsOn((v) => !v)} size={ctrlSize} inlineLabel={compact && !phone} icon={(c) => <CaptionsIcon size={22} color={captionsOn ? colors.accentCoral : c} />} />
    </>
  );
  const leave = phone ? (
    <Pressable onPress={hangUp} style={styles.phoneCtrl} accessibilityRole="button" accessibilityLabel="Leave call">
      <View style={[styles.phoneCtrlBtn, styles.leavePhone]}>
        <PhoneOffIcon size={22} color="#FFFFFF" />
      </View>
      <Text style={[styles.ctrlCaption, { color: colors.needsPracticeText }]}>Leave</Text>
    </Pressable>
  ) : (
    <CallPill size="lg" variant="danger" label="Leave" accessibilityLabel="Leave call" onPress={hangUp} icon={(c) => <PhoneOffIcon size={20} color={c} />} style={styles.leaveDesk} />
  );

  const rect = (r: Rect) => ({ position: "absolute" as const, left: r.left, top: r.top, width: r.width, height: r.height });
  // The small video sits above the big one; in "Show big" both are tiles above the text.
  const remoteZ = big ? 31 : layout.selfBig ? 2 : 1;
  const selfZ = big ? 31 : layout.selfBig ? 1 : 2;

  return (
    <View style={styles.root}>
      {/* The two videos: created once, only their wrappers' styles change. */}
      <View style={[rect(layout.remote), styles.videoBox, phone && !big && !asked && styles.videoBoxFull, { zIndex: remoteZ }]}>
        <video ref={attachRemote} autoPlay playsInline style={VIDEO_CSS} />
        {callState === "connecting" ? (
          <View style={styles.overlay}>
            <SpinnerArc size={44} />
            <Text style={styles.overlayTitle}>Connecting to {peerName}…</Text>
            <Text style={styles.overlaySub}>This usually takes a few seconds.</Text>
          </View>
        ) : noVideo && !big ? (
          <View style={styles.overlay}>
            <CallAvatar name={peerName} size={phone ? 72 : 96} color={peerAccent} />
            <Text style={styles.overlayTitle}>{first}'s video isn't coming through</Text>
          </View>
        ) : null}
        {big || (phone && asked) ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{first}</Text>
          </View>
        ) : null}
      </View>
      <View
        style={[
          rect(layout.self),
          styles.videoBox,
          styles.selfBox,
          layout.selfBig && styles.selfBoxBig,
          { zIndex: selfZ },
        ]}
      >
        <video ref={attachLocal} autoPlay muted playsInline style={MIRRORED_CSS} />
        {!camOn ? (
          <View style={styles.overlay}>
            <VideoIcon size={22} color={colors.needsPracticeText} off />
            <Text style={[styles.overlaySub, { color: colors.needsPracticeText }]}>Your camera is off</Text>
          </View>
        ) : null}
        {layout.selfBig ? (
          camOn ? (
            <View style={phone ? styles.tagBottom : styles.tagTop}>
              <EyeIcon size={14} color="#FFFFFF" />
              <Text style={styles.tagText}>{phone ? "The computer is watching your hand" : "You · the computer is watching your hand"}</Text>
            </View>
          ) : null
        ) : (
          <View style={styles.tag}>
            <Text style={styles.tagText}>You</Text>
            {!micOn ? (
              <>
                <MicIcon size={12} color={colors.needsPracticeText} off />
                <Text style={[styles.tagText, { color: colors.needsPracticeText }]}>muted</Text>
              </>
            ) : null}
          </View>
        )}
      </View>

      {/* Top bar: who, status, quality; the teacher's reading chip and Tools. */}
      <View style={[rect(layout.topBar), phone ? styles.topBarPhone : styles.topBar]} pointerEvents="box-none">
        <View style={styles.who}>
          <CallAvatar name={peerName} size={phone ? 36 : 44} color={peerAccent} />
          <View style={styles.flexShrink}>
            <Text style={styles.peerName} numberOfLines={1}>
              {peerName}
              {!isTeacher && !phone ? <Text style={styles.peerRole}> · your teacher</Text> : null}
            </Text>
            {statusLine}
          </View>
        </View>
        {!phone ? (
          <View style={styles.topRight}>
            {readingChip}
            {isTeacher && connected ? toolsButton("md") : null}
          </View>
        ) : null}
      </View>

      {poor && !bannerDismissed && !big ? (
        <View
          style={[
            styles.banner,
            { left: layout.remote.left + 16, top: (phone ? layout.topBar.top + layout.topBar.height : layout.remote.top) + 12, width: Math.max(200, layout.remote.width - 32) },
          ]}
          accessibilityLiveRegion="polite"
        >
          <QualityBars bars={1} color={colors.qualityPoor} />
          {!phone ? <Text style={[styles.bannerStrong, { color: colors.qualityPoor }]}>Weak connection</Text> : null}
          <Text style={styles.bannerText}>The connection is weak. Your video is lowered to keep the call going. Captions still work.</Text>
          <Pressable onPress={() => setBannerDismissed(true)} accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} style={[styles.bannerClose, neuRaised("sm")]}>
            <CloseIcon size={13} color={colors.textPrimary} />
          </Pressable>
        </View>
      ) : null}

      {layout.caption ? (
        <View style={[rect(layout.caption), styles.layer]}>
          <CaptionStrip
            role={role}
            phone={phone}
            compact={compact}
            letters={!words}
            primary={primary}
            secondary={secondary}
            speech={primarySpeech}
            onShowBig={() => showBig(primary.reader.text, readFrom === "me" ? (isTeacher ? "teacher" : "student") : isTeacher ? "student" : "teacher")}
            showBigLabel={isTeacher ? "Show big to both" : "Show big"}
            onYourSigns={!isTeacher ? () => setYourSignsOpen(true) : undefined}
            readingNote={readingNote}
            width={layout.caption.width}
          />
          {phone && !isTeacher ? (
            <Pressable onPress={() => setYourSignsOpen(true)} style={[styles.yourSignsPhone, neuRaised("sm")]} accessibilityRole="button" accessibilityLabel="Your signs">
              <HandIcon size={15} color={colors.textPrimary} />
              <Text style={styles.yourSignsText}>Your signs</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {layout.panel && isTeacher && toolsOpen && peer ? (
        <View style={[rect(layout.panel), styles.layer]}>
          <CallToolsPanel
            phone={phone}
            tab={toolsTab}
            onTab={setToolsTab}
            onClose={() => setToolsOpen(false)}
            peer={peer}
            modelKey={modelKey}
            onModel={setTeacherModel}
            readFrom={teacherReadFrom}
            onReadFrom={setTeacherReadFrom}
            autoSpeak={words ? { on: autoSpeak, toggle: () => setAutoSpeak((v) => !v) } : null}
            signs={practiceSignsFor(modelKey, plan)}
            practice={practice}
            results={practiceResults}
            modelOf={modelOf}
            onAsk={askFor}
            reading={readFrom !== "me" && captionsOn}
            transcriptTools={
              phone ? (
                <>
                  {transcriptTools(primary.reader, primarySpeech, readFrom === "me" ? "teacher" : "student", "Show big")}
                  {speechPicker(true)}
                </>
              ) : undefined
            }
          />
        </View>
      ) : null}
      {layout.panel && asked && practice ? (
        <View style={[rect(layout.panel), styles.layer]}>
          <StudentAskPanel
            phone={phone}
            sign={practice.sign}
            language={practiceScope.language}
            group={practiceScope.group}
            results={practiceResults.filter((r) => r.practiceId === practice.id)}
            checking={readingLocal}
            cameraOff={!camOn}
            captionsOff={!captionsOn}
            hold={local.hold}
            guess={local.guess.label}
            phase={local.phase}
            reduceMotion={reduceMotion}
          />
        </View>
      ) : null}

      {/* Control bar: never scrolls away. Leave is set apart. */}
      <View style={[rect(layout.controls), phone ? styles.controlsPhone : styles.controls, phone && { paddingBottom: insets.bottom }]}>
        {phone ? (
          <>
            {toggles}
            {isTeacher && connected ? toolsButton("phone") : null}
            {leave}
          </>
        ) : (
          <>
            <View style={styles.controlsCenter}>
              {toggles}
              {speechPicker(compact)}
            </View>
            {leave}
          </>
        )}
      </View>

      {big ? (
        <Pressable
          style={styles.bigScrim}
          onPress={closeBig}
          accessibilityRole="button"
          accessibilityLabel={isTeacher ? "Close the big view for both of you" : "Close the big view"}
        >
          <View style={styles.bigTop} pointerEvents="box-none">
            {isTeacher || bigFromTeacher ? (
              <View style={styles.bigChip}>
                <ExpandIcon size={14} color={colors.primaryTealText} />
                <Text style={styles.bigChipText}>{isTeacher ? `Showing big to ${first} too` : "Shown big by your teacher"}</Text>
              </View>
            ) : (
              <View />
            )}
            <CallPill size="lg" label={isTeacher ? "Close for both" : "Close"} onPress={closeBig} icon={(c) => <CloseIcon size={15} color={c} />} />
          </View>
          <View style={styles.bigBody} pointerEvents="none">
            <Text style={styles.bigLabel}>
              {(big.by === "teacher") === isTeacher ? "You signed" : `${first} signed`}
            </Text>
            <Text
              style={[
                styles.bigText,
                (() => {
                  const fs = Math.max(36, Math.min(132, Math.floor((4.6 * (width - 64)) / Math.max(big.text.length, 1))));
                  return { fontSize: fs, lineHeight: Math.round(fs * 1.08) };
                })(),
              ]}
              numberOfLines={3}
            >
              {big.text}
            </Text>
          </View>
        </Pressable>
      ) : null}

      {!isTeacher ? (
        <Modal visible={yourSignsOpen} transparent animationType={reduceMotion ? "none" : "slide"} onRequestClose={() => setYourSignsOpen(false)}>
          <View style={styles.sheetScrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setYourSignsOpen(false)} accessibilityRole="button" accessibilityLabel="Close your signs" />
            <View style={[styles.sheet, { paddingBottom: 20 + insets.bottom }]}>
              <View style={styles.sheetHead}>
                <Text style={styles.sheetTitle}>Your signs</Text>
                <PhaseChip phase={readingLocal ? local.phase : "off"} />
                <View style={styles.flex} />
                <Pressable onPress={() => setYourSignsOpen(false)} style={[styles.sheetClose, neuRaised("sm")]} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6}>
                  <CloseIcon size={15} color={colors.textPrimary} />
                </Pressable>
              </View>
              <View style={[styles.sheetText, neuInset("sm")]}>
                <Text style={[styles.sheetTranscript, !local.text.trim() && styles.sheetPlaceholder]}>
                  {readingLocal || local.text.trim() ? local.text.trim() || localSource.placeholder : localSource.pausedText}
                </Text>
              </View>
              <View style={styles.sheetTools}>
                {transcriptTools(local, localSpeech, "student", "Show big")}
                {phone ? speechPicker(true) : null}
              </View>
            </View>
          </View>
        </Modal>
      ) : null}

      <Text style={styles.srOnly} accessibilityLiveRegion="polite">
        {`Speech: ${languageName}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: "hidden" },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1, minWidth: 0 },
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0 },

  videoBox: { backgroundColor: colors.cameraBezel, borderRadius: 20, overflow: "hidden" },
  videoBoxFull: { borderRadius: 0 },
  selfBox: { borderRadius: 14, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.18)" },
  selfBoxBig: { borderRadius: 20, borderWidth: 2.5, borderColor: colors.attention },
  overlay: {
    position: "absolute", left: 0, top: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 16,
    backgroundColor: colors.cameraBezel,
  },
  overlayTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary, textAlign: "center" },
  overlaySub: { fontFamily: fonts.body, fontSize: 14, color: colors.textOnGlass, textAlign: "center" },
  tag: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: "rgba(10,12,16,0.82)",
  },
  tagTop: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(10,12,16,0.82)",
  },
  // Phone: the top bar lies over the top of this video, so the tag goes low.
  tagBottom: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(10,12,16,0.82)",
  },
  // Caption, drawer and sheets: above both videos (on a phone they overlap them).
  layer: { zIndex: 3 },
  tagText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: "#FFFFFF" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: colors.background,
  },
  topBarPhone: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, backgroundColor: "rgba(10,12,16,0.45)", zIndex: 3 },
  who: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1, minWidth: 0 },
  peerName: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.textPrimary },
  peerRole: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  topRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  readingChip: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.neuBase, maxWidth: 360 },
  readingChipText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, color: colors.textOnGlass },
  readingChipStrong: { fontFamily: fonts.bodySemiBold, color: colors.textPrimary },
  toolsBtn: { flexDirection: "row", alignItems: "center", gap: 8, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.neuBase },
  toolsBtnOn: { backgroundColor: colors.neuWell },
  toolsText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },

  banner: {
    position: "absolute",
    zIndex: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,122,133,0.5)",
    backgroundColor: "rgba(12,14,19,0.9)",
  },
  bannerStrong: { fontFamily: fonts.bodySemiBold, fontSize: 13 },
  bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19, color: colors.textPrimary },
  bannerClose: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    backgroundColor: colors.background,
  },
  controlsCenter: { flexDirection: "row", alignItems: "center", gap: 28 },
  controlsPhone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    backgroundColor: "rgba(16,18,24,0.96)",
    borderTopLeftRadius: 0,
    zIndex: 5,
  },
  phoneCtrl: { alignItems: "center", gap: 6 },
  phoneCtrlBtn: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  leavePhone: { backgroundColor: colors.callDanger, width: 64 },
  leaveDesk: { position: "absolute", right: 24, minWidth: 140 },
  ctrlCaption: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.textOnGlass },
  speakWrap: { alignItems: "center", gap: 6 },
  langPill: { flexDirection: "row", alignItems: "center", gap: 7, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.neuBase },
  langText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },

  yourSignsPhone: {
    position: "absolute",
    right: 10,
    top: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.neuBase,
  },
  yourSignsText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textPrimary },

  bigScrim: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 30, backgroundColor: "#0E1015", padding: 32 },
  bigTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", zIndex: 32 },
  bigChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(179,168,255,0.5)",
    backgroundColor: "rgba(90,80,168,0.25)",
  },
  bigChipText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },
  bigBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingBottom: 140 },
  bigLabel: { fontFamily: fonts.bodySemiBold, fontSize: 20, color: colors.textOnGlass },
  bigText: { fontFamily: fonts.heading, color: colors.textPrimary, textAlign: "center" },

  sheetScrim: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 640,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "rgba(48,54,68,0.98)",
    padding: 20,
    gap: 14,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.textPrimary },
  sheetClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  sheetText: { minHeight: 72, padding: 14, borderRadius: 14, backgroundColor: colors.neuWell, justifyContent: "center" },
  sheetTranscript: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  sheetPlaceholder: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.textOnGlass },
  sheetTools: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
});
