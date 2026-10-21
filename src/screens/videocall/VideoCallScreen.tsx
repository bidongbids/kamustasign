// In-call UI (Graphite Aurora). Both video feeds can be read by the on-device
// sign pipeline (useCallSignReader) with a model the caller chooses - ASL
// letters, ASL words or FSL words - and each side's signs build up as text
// that can be spoken aloud (useTranslateAndSpeak, in the standing speech
// language) or shown full-screen. Recognition runs on this device only and
// nothing is sent over the network. Deaf-first: every state is shown in
// words, nothing depends on sound.
//
// Rendered by the Student/Teacher dashboards in place of their normal
// content whenever a call is anything other than idle (useVideoCall).
//
// Calls are always teacher <-> student, and the teacher runs the call: the
// sign language/model, whose signs are read, and "Show big" (which opens on
// both screens) are set on the teacher's side and sent to the student
// (CallSettings in ../../lib/callSignaling.ts). The student sees those
// settings but can't change them; mic, camera, captions and speech language
// stay each person's own.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import SegmentedToggle from "../../components/SegmentedToggle";
import LanguagePicker, { useSelectedLanguage } from "../../components/LanguagePicker";
import { useHandedness } from "../../components/HandednessPicker";
import KidButton from "../../components/learn/KidButton";
import {
  BackspaceIcon,
  CaptionsIcon,
  ChevronDownIcon,
  EyeIcon,
  MicIcon,
  PhoneIcon,
  PhoneOffIcon,
  SpeakerIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import { colors, fonts, radii, spacing, typography } from "../../theme/theme";
import { neuInset, neuRaised } from "../../theme/shadows";
import { useResponsive } from "../../theme/responsive";
import { isVideoCallSupported, type CallState } from "../../hooks/useVideoCall";
import { useCallSignReader, type CallModel, type ReaderPhase } from "../../hooks/useCallSignReader";
import { useTranslateAndSpeak } from "../../hooks/useTranslateAndSpeak";
import { findLanguage } from "../../lib/languages";
import type { CallModelKey, CallPeer, CallSettings } from "../../lib/callSignaling";

type Props = {
  role: "teacher" | "student";
  /** Student side: the teacher's settings as last received. */
  remoteSettings: CallSettings | null;
  sendSettings: (settings: CallSettings) => void;
  requestSettings: () => void;
  callState: CallState;
  incomingCallFrom: CallPeer | null;
  peer: CallPeer | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  acceptCall: () => void;
  declineCall: () => void;
  hangUp: () => void;
  accentColor: string;
};

const MODELS: Record<CallModelKey, CallModel> = {
  "asl-letters": { kind: "letters" },
  "asl-words": { kind: "words", language: "asl" },
  "fsl-words": { kind: "words", language: "fsl" },
};
const MODEL_NAMES: Record<CallModelKey, string> = {
  "asl-letters": "ASL Letters",
  "asl-words": "ASL Words",
  "fsl-words": "FSL Words",
};
type ReadFrom = "them" | "me" | "both";

// "them"/"me" on this screen <-> the role-based `read` the settings carry.
const toRead = (readFrom: ReadFrom, role: Props["role"]): CallSettings["read"] =>
  readFrom === "both" ? "both" : (readFrom === "me") === (role === "teacher") ? "teacher" : "student";
const fromRead = (read: CallSettings["read"], role: Props["role"]): ReadFrom =>
  read === "both" ? "both" : read === role ? "me" : "them";

const PHASE: Record<ReaderPhase, { chip: string; tone: "neutral" | "gold" | "success" | "error" }> = {
  off: { chip: "Paused", tone: "neutral" },
  loading: { chip: "Starting…", tone: "neutral" },
  error: { chip: "Can't read signs", tone: "error" },
  "no-hand": { chip: "No hand", tone: "neutral" },
  unsure: { chip: "Not sure", tone: "neutral" },
  holding: { chip: "Hold still", tone: "gold" },
  added: { chip: "Added", tone: "success" },
  reading: { chip: "Reading sign…", tone: "gold" },
  checking: { chip: "Checking…", tone: "gold" },
};
const toneColor = (t: string) =>
  t === "success" ? colors.success : t === "gold" ? colors.accentCoral : t === "error" ? colors.needsPractice : colors.textSecondary;

const initials = (name?: string | null) =>
  (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export default function VideoCallScreen({
  role,
  remoteSettings,
  sendSettings,
  requestSettings,
  callState,
  incomingCallFrom,
  peer,
  localStream,
  remoteStream,
  error,
  acceptCall,
  declineCall,
  hangUp,
}: Props) {
  const { isDesktop } = useResponsive();
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const isTeacher = role === "teacher";
  // The teacher's own choices. On the student's screen the same three come
  // from remoteSettings instead (defaults until the first one arrives).
  const [teacherModel, setTeacherModel] = useState<CallModelKey>("asl-letters");
  const [teacherReadFrom, setTeacherReadFrom] = useState<ReadFrom>("both");
  const [teacherBig, setTeacherBig] = useState<CallSettings["big"]>(null);
  const modelKey = isTeacher ? teacherModel : remoteSettings?.model ?? "asl-letters";
  const readFrom = isTeacher ? teacherReadFrom : fromRead(remoteSettings?.read ?? "both", role);
  const sharedBig = isTeacher ? teacherBig : remoteSettings?.big ?? null;
  // Student side: the id of a teacher "Show big" this student closed, and a
  // "Show big" of their own (which only opens on their own screen).
  const [dismissedBigId, setDismissedBigId] = useState<number | null>(null);
  const [ownBig, setOwnBig] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [speechLang, setSpeechLang] = useSelectedLanguage();
  const [handedness] = useHandedness();

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream, callState]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream, callState]);

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
    sendSettings({ model: teacherModel, read: toRead(teacherReadFrom, role), big: teacherBig });
  }, [isTeacher, inCall, teacherModel, teacherReadFrom, teacherBig, role, sendSettings]);
  useEffect(() => {
    if (!isTeacher && inCall) requestSettings();
  }, [isTeacher, inCall, requestSettings]);
  // A new "Show big" from the teacher replaces whatever the student had open.
  const sharedBigId = isTeacher ? null : remoteSettings?.big?.id ?? null;
  useEffect(() => {
    if (sharedBigId !== null) setOwnBig(null);
  }, [sharedBigId]);

  useEffect(() => {
    if (connected && connectedAt === null) setConnectedAt(Date.now());
    if (!connected) setConnectedAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [connected]);

  const model = MODELS[modelKey];
  const remote = useCallSignReader(remoteVideoRef, connected && captionsOn && readFrom !== "me", model);
  const local = useCallSignReader(localVideoRef, connected && captionsOn && readFrom !== "them" && camOn, model, {
    mirrorLandmarks: handedness === "left",
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

  const peerName = peer?.name ?? incomingCallFrom?.name ?? "Your call";
  const elapsed = connectedAt ? Math.max(0, Math.floor((now - connectedAt) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const languageName = findLanguage(speechLang)?.name ?? "English";

  // What the big view shows: the student's own "Show big" first, else the
  // teacher's unless this student closed that one.
  const bigText = ownBig ?? (sharedBig && sharedBig.id !== dismissedBigId ? sharedBig.text : null);
  const bigFromTeacher = ownBig === null && bigText !== null;
  const showBig = (text: string) => (isTeacher ? setTeacherBig({ text, id: Date.now() }) : setOwnBig(text));
  const closeBig = () => {
    if (isTeacher) setTeacherBig(null);
    else if (ownBig !== null) setOwnBig(null);
    else if (sharedBig) setDismissedBigId(sharedBig.id);
  };
  const readLabel = readFrom === "both" ? "Both of you" : readFrom === "me" ? "Your signs" : `${peerName}'s signs`;

  if (!isVideoCallSupported) {
    return (
      <GradientBackground variant="subtle" style={styles.center}>
        <StateCard title="Video calls work on the web app" subtitle="Open LCSign in a browser to make calls.">
          <KidButton label="Back" onPress={hangUp} />
        </StateCard>
      </GradientBackground>
    );
  }

  // ---------- ringing / ended ----------
  if (callState === "ringing-incoming" && incomingCallFrom) {
    return (
      <GradientBackground variant="subtle" style={styles.center}>
        <StateCard avatar={initials(incomingCallFrom.name)} title={incomingCallFrom.name} subtitle="is calling you" ringing>
          <View style={styles.stateActions}>
            <KidButton
              variant="ghost"
              label="Decline"
              onPress={declineCall}
              iconLeft={<PhoneOffIcon size={20} color={colors.needsPractice} />}
              style={styles.flex}
            />
            <Pressable onPress={acceptCall} style={[styles.acceptButton, styles.flex]} accessibilityRole="button" accessibilityLabel="Accept call">
              <PhoneIcon size={20} color={colors.textOnFrosted} />
              <Text style={styles.acceptLabel}>Accept</Text>
            </Pressable>
          </View>
        </StateCard>
      </GradientBackground>
    );
  }
  if (callState === "ringing-outgoing") {
    return (
      <GradientBackground variant="subtle" style={styles.center}>
        <StateCard avatar={initials(peer?.name)} title={peer?.name ?? "…"} subtitle="Calling… waiting for them to answer" ringing>
          <ActivityIndicator color={colors.accentCoral} style={{ marginBottom: 16 }} />
          <KidButton variant="ghost" label="Cancel" onPress={hangUp} iconLeft={<PhoneOffIcon size={20} color={colors.needsPractice} />} />
        </StateCard>
      </GradientBackground>
    );
  }
  if (callState === "ended") {
    return (
      <GradientBackground variant="subtle" style={styles.center}>
        <StateCard avatar={initials(peerName)} title="Call ended" subtitle={error ?? `Your call with ${peerName} has ended.`}>
          <KidButton variant="primary" label="Back" onPress={hangUp} />
        </StateCard>
      </GradientBackground>
    );
  }
  if (callState !== "connecting" && callState !== "connected") {
    return <GradientBackground variant="subtle" style={styles.center}>{null}</GradientBackground>;
  }

  // ---------- in call ----------
  const remoteTail = remote.text.slice(-60);
  const readingRemote = connected && captionsOn && readFrom !== "me";

  const modelPicker = isTeacher ? (
    <SegmentedToggle
      size="kid"
      options={[
        { key: "asl-letters", label: "ASL Letters" },
        { key: "asl-numbers", label: "ASL Numbers", disabled: true, badge: "soon" },
        { key: "asl-words", label: "ASL Words" },
        { key: "fsl-words", label: "FSL Words" },
      ]}
      value={modelKey}
      onChange={(k) => k !== "asl-numbers" && setTeacherModel(k)}
    />
  ) : (
    <View style={[styles.setPill, neuInset("sm")]} accessibilityLabel={`Reading ${MODEL_NAMES[modelKey]}, set by your teacher`}>
      <Text style={styles.setPillValue}>{MODEL_NAMES[modelKey]}</Text>
      <Text style={styles.setPillNote}>Set by your teacher</Text>
    </View>
  );

  const speechPicker = (
    <LanguagePicker
      value={speechLang}
      onChange={setSpeechLang}
      accentColor={colors.accentCoral}
      renderTrigger={({ open, current }) => (
        <Pressable onPress={open} style={[styles.langPill, neuRaised("sm")]} accessibilityRole="button" accessibilityLabel="Choose speech language">
          <SpeakerIcon size={15} color={colors.textSecondary} />
          <Text style={styles.langText}>{current.name}</Text>
          <ChevronDownIcon size={13} color={colors.textSecondary} />
        </Pressable>
      )}
    />
  );

  const stage = (
    <View style={[styles.stage, !isDesktop && styles.stageMobile]}>
      <video ref={remoteVideoRef} autoPlay playsInline style={styles.remoteVideo as any} />
      {callState === "connecting" && (
        <View style={styles.connectingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.connectingText}>Connecting to {peerName}…</Text>
        </View>
      )}
      {readingRemote && (
        <View style={[styles.captionBar, styles.captionContent]}>
          <PhaseChip phase={remote.phase} />
          <Text style={[styles.captionText, !remoteTail && styles.captionPlaceholder]} numberOfLines={1}>
            {remoteTail || `${peerName}'s signs appear here as text`}
          </Text>
        </View>
      )}
      <View style={[styles.pip, !isDesktop && styles.pipMobile]}>
        <video ref={localVideoRef} autoPlay muted playsInline style={styles.localVideo as any} />
        {!camOn && (
          <View style={styles.pipOff}>
            <VideoIcon size={22} color={colors.textSecondary} off />
            <Text style={styles.pipOffText}>Camera off</Text>
          </View>
        )}
        <View style={styles.pipLabel}>
          <Text style={styles.pipLabelText}>You{!micOn ? " · muted" : ""}</Text>
        </View>
      </View>
    </View>
  );

  const remoteCard = (
    <CaptionCard
      title={`${peerName} is signing`}
      active={readingRemote}
      pausedText={
        readFrom !== "me"
          ? "Captions are off."
          : isTeacher
            ? "Not reading their signs. Choose “Them” or “Both” below."
            : "Your teacher isn't reading their own signs right now."
      }
      reader={remote}
      speech={remoteSpeech}
      words={model.kind === "words"}
      onShowBig={() => showBig(remote.text)}
      showBigLabel={isTeacher ? "Show big to both" : "Show big"}
      placeholder="Their signs appear here as text."
      autoSpeak={model.kind === "words" ? { on: autoSpeak, toggle: () => setAutoSpeak((v) => !v) } : undefined}
      compact={!isDesktop}
    />
  );
  const localCard = (
    <CaptionCard
      title="You"
      active={connected && captionsOn && readFrom !== "them" && camOn}
      pausedText={
        !camOn
          ? "Your camera is off."
          : readFrom !== "them"
            ? "Captions are off."
            : isTeacher
              ? "Not reading your signs. Choose “Me” or “Both” below."
              : "Your teacher isn't reading your signs right now."
      }
      reader={local}
      speech={localSpeech}
      words={model.kind === "words"}
      onShowBig={() => showBig(local.text)}
      showBigLabel={isTeacher ? "Show big to both" : "Show big"}
      placeholder="Your signs appear here. Speak them aloud for people near you."
      compact={!isDesktop}
    />
  );

  const controls = (
    <View style={[styles.controls, !isDesktop && styles.controlsMobile]}>
      <ControlButton label={micOn ? "Mute" : "Unmute"} on={micOn} onPress={() => setMicOn((v) => !v)} icon={<MicIcon size={22} color={micOn ? colors.textPrimary : colors.needsPractice} off={!micOn} />} />
      <ControlButton label={camOn ? "Camera off" : "Camera on"} on={camOn} onPress={() => setCamOn((v) => !v)} icon={<VideoIcon size={22} color={camOn ? colors.textPrimary : colors.needsPractice} off={!camOn} />} />
      <ControlButton
        label={captionsOn ? "Captions on" : "Captions off"}
        on={captionsOn}
        onPress={() => setCaptionsOn((v) => !v)}
        icon={<CaptionsIcon size={22} color={captionsOn ? colors.accentCoral : colors.textSecondary} />}
      />
      <View style={styles.readFrom}>
        <Text style={styles.readFromLabel}>Read signs from</Text>
        {isTeacher ? (
          <SegmentedToggle
            size="kid"
            options={[
              { key: "them", label: "Them" },
              { key: "me", label: "Me" },
              { key: "both", label: "Both" },
            ]}
            value={readFrom}
            onChange={setTeacherReadFrom}
          />
        ) : (
          <View style={[styles.setPill, styles.setPillControls, neuInset("sm")]} accessibilityLabel={`Reading ${readLabel}, set by your teacher`}>
            <Text style={styles.setPillValue}>{readLabel}</Text>
            <Text style={styles.setPillNote}>Set by your teacher</Text>
          </View>
        )}
      </View>
      <Pressable onPress={hangUp} style={styles.hangup} accessibilityRole="button" accessibilityLabel="Leave call">
        <PhoneOffIcon size={22} color="#FFFFFF" />
        <Text style={styles.hangupText}>Leave</Text>
      </Pressable>
    </View>
  );

  const bigModal = (
    <Modal visible={bigText !== null} transparent animationType="fade" onRequestClose={closeBig}>
      <Pressable style={styles.bigScrim} onPress={closeBig} accessibilityLabel={isTeacher ? "Close big view for both of you" : "Close big view"}>
        {isTeacher ? (
          <Text style={styles.bigFrom}>Showing on {peerName}'s screen too</Text>
        ) : bigFromTeacher ? (
          <Text style={styles.bigFrom}>From {peerName}</Text>
        ) : null}
        <Text style={[styles.bigText, { fontSize: Math.max(44, Math.min(200, 1500 / Math.max(bigText?.length ?? 1, 1))) }]}>
          {bigText}
        </Text>
        <Text style={styles.bigHint}>{isTeacher ? "Tap anywhere to close it for both of you" : "Tap anywhere to close"}</Text>
      </Pressable>
    </Modal>
  );

  const topBar = (
    <View style={[styles.topBar, !isDesktop && styles.topBarMobile]}>
      <View style={styles.who}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(peerName)}</Text>
        </View>
        <View>
          <Text style={styles.peerName}>{peerName}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.accentCoral }]} />
            <Text style={styles.statusText}>{connected ? `Connected · ${clock}` : "Connecting…"}</Text>
          </View>
        </View>
      </View>
      {isDesktop && <View style={styles.topCenter}>{modelPicker}</View>}
      <View style={styles.topRight}>
        {isDesktop && <Text style={styles.speakLabelSmall}>Speak in</Text>}
        {speechPicker}
      </View>
    </View>
  );

  return (
    <GradientBackground variant="subtle" style={styles.root}>
      {error ? (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {topBar}
      {isDesktop ? (
        <>
          <View style={styles.main}>
            <View style={styles.stageWrap}>{stage}</View>
            <View style={styles.side}>
              {remoteCard}
              {localCard}
            </View>
          </View>
          {controls}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.mobileBody}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 4 }}>
            {modelPicker}
          </ScrollView>
          {stage}
          {remoteCard}
          {localCard}
          {controls}
        </ScrollView>
      )}
      {bigModal}
      <Text style={styles.srOnly} accessibilityLiveRegion="polite">
        {`Speech: ${languageName}`}
      </Text>
    </GradientBackground>
  );
}

// ---------------------------------------------------------------------------

function PhaseChip({ phase }: { phase: ReaderPhase }) {
  const p = PHASE[phase];
  const c = toneColor(p.tone);
  return (
    <View style={[styles.chip, { backgroundColor: p.tone === "neutral" ? "rgba(255,255,255,0.08)" : `${c}29` }]}>
      <View style={[styles.chipDot, { backgroundColor: c }]} />
      <Text style={[styles.chipText, { color: p.tone === "neutral" ? colors.textSecondary : c }]}>{p.chip}</Text>
    </View>
  );
}

function CaptionCard({
  title,
  active,
  pausedText,
  reader,
  speech,
  words,
  onShowBig,
  showBigLabel,
  placeholder,
  autoSpeak,
  compact,
}: {
  title: string;
  active: boolean;
  pausedText: string;
  reader: ReturnType<typeof useCallSignReader>;
  speech: ReturnType<typeof useTranslateAndSpeak>;
  words: boolean;
  onShowBig: () => void;
  showBigLabel: string;
  placeholder: string;
  autoSpeak?: { on: boolean; toggle: () => void };
  compact?: boolean;
}) {
  const hasText = reader.text.trim().length > 0;
  const speakLabel =
    speech.status === "speaking" ? "Speaking…" : speech.status === "translating" ? "Translating…" : "Speak aloud";
  const showGuess = active && !words && reader.guess.label && reader.phase !== "no-hand";
  const R = 26;
  const C = 2 * Math.PI * R;
  return (
    <GlassCard radius={radii.lg} padding={compact ? 14 : 18} style={compact ? undefined : styles.flex} contentStyle={styles.cardContent}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        {active ? <PhaseChip phase={reader.phase} /> : <PhaseChip phase="off" />}
      </View>

      {!active ? (
        <Text style={styles.pausedText}>{pausedText}</Text>
      ) : (
        <View style={styles.liveRow}>
          {!words && (
            <View style={styles.guessWrap} accessibilityLabel={showGuess ? `Seeing ${reader.guess.label}` : "No letter yet"}>
              <View style={[styles.guessTile, neuRaised("sm")]}>
                <Text style={[styles.guessText, !showGuess && { color: colors.textTertiary }]}>
                  {showGuess ? (reader.guess.label.length > 2 ? reader.guess.label.slice(0, 3) : reader.guess.label) : "?"}
                </Text>
              </View>
              <Svg width={64} height={64} style={StyleSheet.absoluteFill} pointerEvents="none">
                <Circle cx={32} cy={32} r={R} fill="none" stroke={colors.holdTrack} strokeWidth={4} />
                {reader.hold > 0 && (
                  <Circle
                    cx={32}
                    cy={32}
                    r={R}
                    fill="none"
                    stroke={reader.phase === "added" ? colors.success : colors.accentCoral}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={`${C} ${C}`}
                    strokeDashoffset={C * (1 - reader.hold)}
                    transform="rotate(-90 32 32)"
                  />
                )}
              </Svg>
            </View>
          )}
          <Text style={styles.liveHint}>
            {words
              ? reader.phase === "reading"
                ? "Reading a sign…"
                : reader.phase === "checking"
                  ? "Checking the sign…"
                  : reader.phase === "unsure"
                    ? "Not sure what that was. Sign it again."
                    : "Signs are read hands-free. Pause briefly between signs."
              : reader.phase === "holding"
                ? "Hold still… adding the letter."
                : reader.phase === "added"
                  ? "Added. To repeat a letter, lower your hand first."
                  : reader.phase === "no-hand"
                    ? "Show a hand to the camera."
                    : "Spell one letter at a time and hold still."}
          </Text>
        </View>
      )}

      <View style={[styles.transcript, neuInset("sm"), compact && { minHeight: 64 }]}>
        <Text style={[styles.transcriptText, !hasText && styles.transcriptPlaceholder]} numberOfLines={compact ? 2 : 4}>
          {hasText ? reader.text : placeholder}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <KidButton
          small
          variant="primary"
          label={speakLabel}
          onPress={() => speech.speak(reader.text.trim())}
          disabled={!hasText}
          iconLeft={<SpeakerIcon size={16} color={colors.textOnAccent} />}
          style={styles.flex}
        />
        <KidButton small label={showBigLabel} onPress={onShowBig} disabled={!hasText} iconLeft={<EyeIcon size={18} color={colors.textPrimary} />} />
      </View>
      <View style={styles.cardActions}>
        {!words && <KidButton small label="Space" onPress={reader.addSpace} style={styles.flex} />}
        <KidButton
          small
          iconOnly
          label={words ? "Delete last word" : "Delete last letter"}
          onPress={reader.backspace}
          disabled={!hasText}
          iconLeft={<BackspaceIcon size={18} color={colors.textSecondary} />}
        />
        <KidButton small variant="ghost" label="Clear" onPress={reader.clear} disabled={!hasText} style={styles.flex} />
      </View>
      {autoSpeak && (
        <Pressable
          onPress={autoSpeak.toggle}
          style={styles.autoRow}
          accessibilityRole="switch"
          accessibilityState={{ checked: autoSpeak.on }}
        >
          <View style={[styles.switchTrack, autoSpeak.on && styles.switchOn]}>
            <View style={[styles.switchKnob, autoSpeak.on && styles.switchKnobOn]} />
          </View>
          <Text style={styles.autoText}>Speak each new word aloud</Text>
        </Pressable>
      )}
      {speech.error ? <Text style={styles.speechError}>{speech.error}</Text> : null}
    </GlassCard>
  );
}

function ControlButton({ label, on, onPress, icon }: { label: string; on: boolean; onPress: () => void; icon: React.ReactNode }) {
  return (
    <View style={styles.ctrlWrap}>
      <Pressable
        onPress={onPress}
        style={[styles.ctrl, on ? [styles.ctrlOn, neuRaised("md")] : [styles.ctrlOff, neuInset("sm")]]}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: on }}
      >
        {icon}
      </Pressable>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </View>
  );
}

function StateCard({
  avatar,
  title,
  subtitle,
  ringing,
  children,
}: {
  avatar?: string;
  title: string;
  subtitle: string;
  ringing?: boolean;
  children: React.ReactNode;
}) {
  return (
    <GlassCard radius={radii.lg} padding={32} dropShadow style={styles.stateCard} contentStyle={styles.stateContent}>
      {avatar ? (
        <View style={[styles.bigAvatar, ringing && styles.bigAvatarRinging]}>
          <Text style={styles.bigAvatarText}>{avatar}</Text>
        </View>
      ) : null}
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateSubtitle}>{subtitle}</Text>
      {children}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg },
  srOnly: { position: "absolute", width: 1, height: 1, opacity: 0 },

  // state cards
  stateCard: { width: 420, maxWidth: "100%" },
  stateContent: { alignItems: "center" },
  bigAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryTeal,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  bigAvatarRinging: {
    boxShadow: [
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 8, color: "rgba(124,108,245,0.25)" },
      { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 18, color: "rgba(124,108,245,0.12)" },
    ],
  } as any,
  bigAvatarText: { fontFamily: fonts.heading, fontSize: 36, color: "#FFFFFF" },
  stateTitle: { ...typography.h2, fontSize: 26, lineHeight: 30, color: colors.textPrimary, textAlign: "center" },
  stateSubtitle: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 24, color: colors.textSecondary, textAlign: "center", marginTop: 6, marginBottom: 24 },
  stateActions: { flexDirection: "row", gap: 12, alignSelf: "stretch" },
  acceptButton: {
    minHeight: 56,
    borderRadius: 28,
    backgroundColor: colors.success,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  acceptLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.textOnFrosted },

  // top bar
  errorBanner: { backgroundColor: "rgba(224,82,95,0.9)", paddingVertical: 8, paddingHorizontal: 16 },
  errorText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: "#FFFFFF", textAlign: "center" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, gap: 16 },
  topBarMobile: { paddingHorizontal: 16 },
  who: { flexDirection: "row", alignItems: "center", gap: 12, flexShrink: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryTeal, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.heading, fontSize: 18, color: "#FFFFFF" },
  peerName: { ...typography.h3, fontSize: 18, color: colors.textPrimary },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  topCenter: { flex: 1, alignItems: "center" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  speakLabelSmall: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textSecondary },
  langPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.neuBase,
  },
  langText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textPrimary },

  // main
  main: { flex: 1, minHeight: 0, flexDirection: "row", gap: 20, paddingHorizontal: 24, paddingTop: 8 },
  stageWrap: { flex: 1, minWidth: 0 },
  stage: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  stageMobile: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", height: 300 },
  remoteVideo: { width: "100%", height: "100%", objectFit: "cover" },
  connectingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: colors.overlay,
  },
  connectingText: { fontFamily: fonts.bodyMedium, fontSize: 17, color: "#FFFFFF" },
  captionBar: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 20,
    borderRadius: 18,
    backgroundColor: "rgba(10,12,16,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  captionContent: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 18 },
  captionText: { flex: 1, fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: "#FFFFFF" },
  captionPlaceholder: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 24, color: "rgba(255,255,255,0.72)" },
  pip: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 240,
    height: 135,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: colors.neuWell,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.22)",
  },
  pipMobile: { width: 120, height: 90, top: 10, right: 10, borderRadius: 12 },
  localVideo: { width: "100%", height: "100%", objectFit: "cover", transform: [{ scaleX: -1 }] },
  pipOff: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.neuWell },
  pipOffText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  pipLabel: { position: "absolute", left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(10,12,16,0.7)" },
  pipLabelText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: "#FFFFFF" },

  // side cards
  side: { width: 400, gap: 16 },
  cardContent: { flex: 1, gap: 12 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { ...typography.h3, fontSize: 18, color: colors.textPrimary, flexShrink: 1 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  pausedText: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  guessWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  guessTile: { width: 50, height: 50, borderRadius: 14, backgroundColor: colors.neuBase, alignItems: "center", justifyContent: "center" },
  guessText: { fontFamily: fonts.heading, fontSize: 26, color: colors.accentCoral },
  liveHint: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textPrimary },
  transcript: { flex: 1, minHeight: 80, borderRadius: radii.md, backgroundColor: colors.neuWell, padding: 14 },
  transcriptText: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 30, color: colors.textPrimary },
  transcriptPlaceholder: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 36 },
  switchTrack: { width: 40, height: 24, borderRadius: 12, backgroundColor: colors.neuWell, padding: 3, borderWidth: 1, borderColor: colors.border },
  switchOn: { backgroundColor: colors.accentCoral, borderColor: colors.accentCoral },
  switchKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.textSecondary },
  switchKnobOn: { backgroundColor: colors.textOnAccent, transform: [{ translateX: 16 }] },
  autoText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary },
  speechError: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },

  // controls
  controls: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 22, paddingVertical: 16, paddingHorizontal: 24 },
  controlsMobile: { flexWrap: "wrap", gap: 14 },
  ctrlWrap: { alignItems: "center", gap: 6 },
  ctrl: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  ctrlOn: { backgroundColor: colors.neuBase },
  ctrlOff: { backgroundColor: colors.neuWell },
  ctrlLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  readFrom: { alignItems: "center", gap: 0 },
  readFromLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textSecondary },
  // student side: a setting the teacher controls, shown but not changeable
  setPill: {
    alignSelf: "center",
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: radii.md,
    backgroundColor: colors.neuWell,
  },
  setPillControls: { marginTop: 6, marginBottom: 18 },
  setPillValue: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.textPrimary },
  setPillNote: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  hangup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 56,
    paddingHorizontal: 28,
    borderRadius: 28,
    backgroundColor: colors.needsPractice,
    marginBottom: 18,
  },
  hangupText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: "#FFFFFF" },

  mobileBody: { padding: 16, gap: 14 },

  // big view
  bigScrim: { flex: 1, backgroundColor: "rgba(10,12,16,0.96)", alignItems: "center", justifyContent: "center", padding: 32, gap: 24 },
  bigText: { fontFamily: fonts.heading, color: colors.textPrimary, textAlign: "center" },
  bigHint: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary },
  bigFrom: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.accentCoral },
});
