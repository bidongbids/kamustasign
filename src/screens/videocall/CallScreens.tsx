// The call's full-screen states around the call itself (design C1, C7):
// calling, incoming (visual ringing - nothing depends on sound), the
// teacher's end-of-call summary, the student's short summary, and one card
// for each way a call can fail to happen or end early.
import React, { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import GradientBackground from "../../components/GradientBackground";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  DownloadIcon,
  PhoneIcon,
  PhoneOffIcon,
  RetryIcon,
  VideoIcon,
} from "../../components/icons/UiIcons";
import { fonts, radii, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import type { EndReason } from "../../hooks/useVideoCall";
import type { CallPracticeEntry } from "../../lib/queries";
import type { PresenceStatus } from "../../lib/callSignaling";
import { CallAvatar, CallPill, QualityBars, RingingAvatar } from "./CallParts";
import { clock, firstName, pct, tries } from "./callUi";
import { signName } from "../../lib/signNames";

export type NotesData = {
  startedAt: number;
  seconds: number;
  mine: string;
  theirs: string;
  practice: CallPracticeEntry[];
};

/** The downloadable .txt version of a call's notes. */
export function notesText(n: NotesData, selfName: string, peerName: string, isTeacher: boolean): string {
  const lines = ["LCSign call notes", `With: ${peerName}`, `Started: ${new Date(n.startedAt).toLocaleString()}`, `Length: ${clock(n.seconds)}`, ""];
  if (n.practice.length) {
    lines.push("Practised:");
    for (const p of n.practice) {
      lines.push(
        `  - ${signName(p.language, p.sign)} (${p.language.toUpperCase()} ${p.group === "words" ? "word" : p.group === "numbers" ? "number" : "letter"}): ${p.passed ? "passed" : "not yet"}${
          p.confidence > 0 ? `, best ${pct(p.confidence)}` : ""
        }, ${tries(p.tries)}`
      );
    }
    lines.push("");
  }
  const teacherText = isTeacher ? n.mine : n.theirs;
  const studentText = isTeacher ? n.theirs : n.mine;
  lines.push(`${isTeacher ? selfName : peerName} (teacher) signed: ${teacherText || "-"}`);
  lines.push(`${isTeacher ? peerName : selfName} (student) signed: ${studentText || "-"}`);
  return lines.join("\n");
}

function downloadNotes(n: NotesData, selfName: string, peerName: string, isTeacher: boolean) {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const blob = new Blob([notesText(n, selfName, peerName, isTeacher)], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `call-notes-${peerName.replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date(n.startedAt).toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A <video> for a stream, attached whenever the element or the stream changes. */
function StreamVideo({ stream, mirrored, style }: { stream: MediaStream | null; mirrored?: boolean; style: object }) {
  return (
    <video
      ref={(el) => {
        if (el && el.srcObject !== stream) el.srcObject = stream;
      }}
      autoPlay
      muted
      playsInline
      style={{ ...style, objectFit: "cover", transform: mirrored ? "scaleX(-1)" : undefined } as any}
    />
  );
}


export function CallingScreen({
  peerName,
  presence,
  accent,
  localStream,
  onCancel,
}: {
  peerName: string;
  presence: PresenceStatus | undefined;
  accent: string;
  localStream: MediaStream | null;
  onCancel: () => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const first = firstName(peerName);
  // Present at all = online. Their status is "busy" while this very call
  // rings on their screen; a real other call would have declined it at once.
  const online = presence !== undefined;
  return (
    <GradientBackground variant="subtle" style={styles.center}>
      <ScrollView contentContainerStyle={styles.centerScroll}>
        <RingingAvatar name={peerName} size={92} color={accent} />
        <Text style={styles.callingTitle} accessibilityRole="header">
          Calling {peerName}…
        </Text>
        <View style={styles.presenceRow}>
          <View style={[styles.presenceDot, online ? { backgroundColor: colors.presenceOnline } : styles.presenceRing]} />
          <Text style={[styles.presenceText, { color: online ? colors.successText : colors.textOnGlass }]}>{online ? "Online" : "Offline"}</Text>
          <Text style={styles.sub}>{online ? `Waiting for ${first} to answer.` : `${first} will see that you called when they open LCSign.`}</Text>
        </View>
        <CallPill
          label="Cancel call"
          variant="dangerOutline"
          onPress={onCancel}
          icon={(c) => <PhoneOffIcon size={18} color={c} />}
          style={styles.mt8}
        />
        <View style={[styles.selfCard, shadows.neuInset("sm")]}>
          <View style={styles.selfThumb}>
            <StreamVideo stream={localStream} mirrored style={{ width: "100%", height: "100%" }} />
          </View>
          <Text style={styles.selfCardText}>Your camera is on. Check you're in the frame while you wait.</Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

export function IncomingScreen({
  callerName,
  selfRole,
  className,
  phone,
  onAccept,
  onDecline,
}: {
  callerName: string;
  /** Who is being called: a student hears from their teacher, a teacher from a student. */
  selfRole: "teacher" | "student";
  className?: string | null;
  phone: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [since] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // A background tab still says who's calling.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const before = document.title;
    document.title = `Call from ${callerName}`;
    return () => {
      document.title = before;
    };
  }, [callerName]);
  const ringing = Math.max(0, Math.floor((now - since) / 1000));
  const accept = (
    <CallPill size="xl" variant="accept" label="Accept" accessibilityLabel="Accept call" onPress={onAccept} icon={(c) => <VideoIcon size={22} color={c} />} style={phone ? styles.fullWidth : styles.flexBtn} />
  );
  const decline = (
    <CallPill size="xl" variant="dangerOutline" label="Decline" accessibilityLabel="Decline call" onPress={onDecline} icon={(c) => <PhoneOffIcon size={22} color={c} />} style={phone ? styles.fullWidth : styles.flexBtn} />
  );
  return (
    <View style={styles.incomingRoot} accessibilityLiveRegion="assertive">
      <View style={styles.band}>
        <PhoneIcon size={18} color="#FFFFFF" />
        <Text style={styles.bandText}>Incoming video call</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.centerScroll, styles.incomingBody]}>
        <RingingAvatar name={callerName} size={phone ? 120 : 150} color={colors.primaryTealLight} />
        <Text style={[styles.incomingTitle, phone && styles.incomingTitlePhone]} accessibilityRole="header">
          {callerName} is calling you
        </Text>
        <Text style={styles.incomingSub}>
          {selfRole === "student"
            ? "Your teacher wants to practise signs with you."
            : `${callerName}${className ? ` from ${className}` : ""} is calling.`}
        </Text>
        <View style={[styles.incomingActions, phone && styles.incomingActionsPhone]}>
          {phone ? (
            <>
              {accept}
              {decline}
            </>
          ) : (
            <>
              {decline}
              {accept}
            </>
          )}
        </View>
        <Text style={styles.ringingText}>Ringing · {clock(ringing)}</Text>
      </ScrollView>
    </View>
  );
}

// ---- ended ----

const REASON_WORDS: Partial<Record<EndReason, (first: string) => string>> = {
  left: () => "you left the call",
  theyLeft: (first) => `${first} left the call`,
  dropped: () => "the call dropped",
  failed: () => "the call couldn't continue",
};

/** The teacher's summary page (C7). */
export function TeacherSummary({
  peerName,
  selfName,
  className,
  notes,
  reason,
  onBack,
  onSave,
}: {
  peerName: string;
  selfName: string;
  className?: string | null;
  notes: NotesData;
  reason: EndReason | null;
  onBack: () => void;
  onSave: () => Promise<{ error: { message: string } | null }>;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const first = firstName(peerName);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const got = notes.practice.filter((p) => p.passed).length;
  const hasContent = !!(notes.mine || notes.theirs || notes.practice.length);
  const started = new Date(notes.startedAt);
  const sameDay = started.toDateString() === new Date().toDateString();
  const when = `${sameDay ? "Today" : started.toLocaleDateString()} at ${started.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const reasonText = reason ? REASON_WORDS[reason]?.(first) : null;

  const save = async () => {
    if (saveState !== "idle") return;
    setSaveState("saving");
    setSaveError(null);
    const { error } = await onSave();
    if (error) {
      setSaveError(error.message);
      setSaveState("idle");
    } else setSaveState("saved");
  };

  return (
    <GradientBackground variant="subtle" style={styles.flex}>
      <ScrollView contentContainerStyle={styles.summary}>
        <View style={styles.summaryHead}>
          <CallAvatar name={peerName} size={64} color={colors.accentCoral} />
          <View style={styles.flex}>
            <Text style={styles.summaryTitle} accessibilityRole="header">
              Call with {peerName} ended
            </Text>
            <Text style={styles.sub}>
              {[when, `${clock(notes.seconds)} long`, reasonText].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <CallPill
            size="lg"
            label={className ? `Back to ${className}` : "Back"}
            onPress={onBack}
            icon={(c) => <ChevronLeftIcon size={16} color={c} />}
          />
        </View>
        <View style={styles.tiles}>
          <Tile value={clock(notes.seconds)} label="Call length" />
          <Tile value={String(notes.practice.length)} label="Signs practised" />
          <Tile value={String(got)} label="Got it" color={colors.successText} />
          <Tile value={String(notes.practice.length - got)} label="Not yet" color={colors.accentCoral} />
        </View>
        {hasContent ? (
          <View style={styles.summaryCols}>
            {notes.practice.length > 0 ? (
              <View style={[styles.card, styles.col]}>
                <Text style={styles.cardTitle}>Practised</Text>
                {notes.practice.map((p, i) => (
                  <View key={`${p.sign}-${i}`} style={[styles.practRow, i > 0 && styles.rowRule]}>
                    <View style={[styles.signChip, shadows.neuRaised("sm")]}>
                      <Text style={styles.signChipText} numberOfLines={1}>
                        {signName(p.language, p.sign)}
                      </Text>
                    </View>
                    {p.passed ? <CheckIcon size={15} color={colors.successText} /> : <RetryIcon size={15} color={colors.accentCoral} />}
                    <Text style={[styles.practWord, { color: p.passed ? colors.successText : colors.accentCoral }]}>{p.passed ? "Got it" : "Not yet"}</Text>
                    <Text style={styles.practDetail} numberOfLines={1}>
                      {p.confidence > 0 ? `${p.passed ? "" : "best "}${pct(p.confidence)} · ` : ""}
                      {tries(p.tries)}
                    </Text>
                    <Text style={styles.practModel}>
                      {p.language.toUpperCase()} {p.group === "words" ? "Words" : p.group === "numbers" ? "Numbers" : "Letters"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={[styles.card, styles.col]}>
              <Text style={styles.cardTitle}>What was signed</Text>
              <View style={[styles.signedBox, shadows.neuInset("sm")]}>
                <Text style={styles.eyebrow}>{first.toUpperCase()} SIGNED</Text>
                <Text style={styles.signedText}>{notes.theirs || "-"}</Text>
              </View>
              <View style={[styles.signedBox, shadows.neuInset("sm")]}>
                <Text style={styles.eyebrow}>YOU SIGNED</Text>
                <Text style={styles.signedText}>{notes.mine || "-"}</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={[styles.sub, styles.mt8]}>Nothing was signed or practised in this call.</Text>
        )}
        {hasContent ? (
          <View style={styles.saveRow}>
            <CallPill
              size="lg"
              variant={saveState === "saved" ? "raised" : "primary"}
              label={saveState === "saved" ? "Saved to class notes" : saveState === "saving" ? "Saving…" : "Save to class notes"}
              onPress={save}
              disabled={saveState === "saving"}
              icon={saveState === "saved" ? () => <CheckIcon size={16} color={colors.successText} /> : undefined}
            />
            {Platform.OS === "web" ? (
              <CallPill size="lg" label="Download notes" onPress={() => downloadNotes(notes, selfName, peerName, true)} icon={(c) => <DownloadIcon size={17} color={c} />} />
            ) : null}
            <Text style={styles.sub}>Saved notes appear on {first}'s page and on Today.</Text>
          </View>
        ) : null}
        {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
      </ScrollView>
    </GradientBackground>
  );
}

function Tile({ value, label, color }: { value: string; label: string; color?: string }) {
  const { shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.tile, shadows.neuRaised("sm")]}>
      <Text style={[styles.tileValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

/** The student's short, warm summary (C7). Only this call's results. */
export function StudentEnded({
  teacherName,
  selfName,
  notes,
  reason,
  onBack,
}: {
  teacherName: string;
  selfName: string;
  notes: NotesData | null;
  reason: EndReason | null;
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const practised = notes?.practice ?? [];
  const got = practised.filter((p) => p.passed);
  return (
    <GradientBackground variant="subtle" style={styles.center}>
      <ScrollView contentContainerStyle={styles.centerScroll}>
        <CallAvatar name={teacherName} size={96} color={colors.primaryTealLight} />
        <Text style={styles.endedTitle} accessibilityRole="header">
          The call has ended
        </Text>
        <Text style={styles.endedBody}>
          {practised.length > 0
            ? `You practised ${practised.length} sign${practised.length === 1 ? "" : "s"} and got ${got.length} of them!`
            : "Thanks for the call!"}
        </Text>
        {reason === "dropped" ? <Text style={styles.sub}>The connection was lost.</Text> : null}
        {practised.length > 0 ? (
          <View style={styles.learnedRow}>
            {practised.map((p, i) => (
              <View key={`${p.sign}-${i}`} style={[styles.learnedTile, p.passed ? styles.learnedTileOn : styles.learnedTileOff]}>
                <Text style={[styles.learnedText, !p.passed && { color: colors.textTertiary }]} numberOfLines={1}>
                  {signName(p.language, p.sign)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.endedActions}>
          {notes && Platform.OS === "web" && (notes.mine || notes.theirs || practised.length) ? (
            <CallPill size="lg" label="Download notes" onPress={() => downloadNotes(notes, selfName, teacherName, false)} icon={(c) => <DownloadIcon size={17} color={c} />} />
          ) : null}
          <CallPill size="xl" variant="gold" label="Back" onPress={onBack} style={styles.backWide} />
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

/** One card for each way a call can fail to happen (C7 errors). */
export function CallErrorScreen({
  reason,
  peerName,
  error,
  onBack,
  onCallAgain,
}: {
  reason: EndReason | null;
  peerName: string;
  /** The hook's own message, for reasons without fixed copy. */
  error: string | null;
  onBack: () => void;
  onCallAgain: () => void;
}) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const first = firstName(peerName);
  const card = errorCard(reason, first, error, colors);
  return (
    <GradientBackground variant="subtle" style={styles.center}>
      <View style={[styles.errorCard, shadows.neuRaised("md")]} accessibilityLiveRegion="polite">
        <View style={[styles.errorIcon, shadows.neuInset("sm")]}>{card.icon}</View>
        <View style={styles.flex}>
          <Text style={styles.errorTitle} accessibilityRole="header">
            {card.title}
          </Text>
          <Text style={styles.errorBody}>{card.body}</Text>
          <View style={styles.errorActions}>
            {card.action === "again" ? (
              <CallPill label={card.actionLabel} variant="primary" onPress={onCallAgain} />
            ) : null}
            <CallPill label="Back" variant={card.action === "again" ? "ghost" : "raised"} onPress={onBack} />
          </View>
        </View>
      </View>
    </GradientBackground>
  );
}

function errorCard(reason: EndReason | null, first: string, error: string | null, colors: ThemeColors) {
  const red = colors.needsPracticeText;
  switch (reason) {
    case "declined":
      return { icon: <PhoneOffIcon size={22} color={red} />, title: `${first} declined the call`, body: "Try again later, or send a reminder in class.", action: "back" as const, actionLabel: "" };
    case "busy":
      return { icon: <PhoneIcon size={22} color={colors.accentCoral} />, title: `${first} is on another call`, body: "Call them again in a few minutes.", action: "back" as const, actionLabel: "" };
    case "noAnswer":
      return { icon: <ClockIcon size={22} color={colors.textOnGlass} />, title: `${first} didn't answer`, body: "They'll see that you called when they next open LCSign.", action: "back" as const, actionLabel: "" };
    case "cameraBlocked":
      return { icon: <VideoIcon size={22} color={red} off />, title: "Your camera is blocked", body: "Allow the camera in the browser's address bar, then try again.", action: "again" as const, actionLabel: "Try again" };
    case "cameraBusy":
      return { icon: <VideoIcon size={22} color={colors.accentCoral} />, title: "Your camera is busy", body: "Close other apps that use the camera, like Zoom or Meet, then try again.", action: "again" as const, actionLabel: "Try again" };
    case "noCamera":
      return { icon: <VideoIcon size={22} color={red} off />, title: "No camera found", body: "Plug in a camera or check it's switched on, then try again.", action: "again" as const, actionLabel: "Try again" };
    case "dropped":
      return { icon: <QualityBars bars={1} color={red} />, title: "The call dropped", body: "The connection was lost. You can call again.", action: "again" as const, actionLabel: "Call again" };
    case "connectFailed":
      return { icon: <QualityBars bars={1} color={red} />, title: "The call couldn't connect", body: error ?? "Try again in a moment.", action: "again" as const, actionLabel: "Call again" };
    default:
      return { icon: <AlertCircleIcon size={22} color={red} />, title: "The call ended", body: error ?? "Something went wrong. You can call again.", action: "again" as const, actionLabel: "Call again" };
  }
}

export function WebOnlyScreen({ onBack }: { onBack: () => void }) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <GradientBackground variant="subtle" style={styles.center}>
      <View style={[styles.errorCard, shadows.neuRaised("md")]}>
        <View style={[styles.errorIcon, shadows.neuInset("sm")]}>
          <AlertCircleIcon size={22} color={colors.textOnGlass} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.errorTitle}>Calls work in the web app</Text>
          <Text style={styles.errorBody}>Open LCSign in Chrome or Edge to make video calls.</Text>
          <View style={styles.errorActions}>
            <CallPill label="Back" onPress={onBack} />
          </View>
        </View>
      </View>
    </GradientBackground>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  centerScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 },
  mt8: { marginTop: 8 },
  fullWidth: { alignSelf: "stretch" },
  flexBtn: { minWidth: 180 },
  callingTitle: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.textPrimary, textAlign: "center", marginTop: 8 },
  presenceRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceRing: { borderWidth: 1.5, borderColor: colors.presenceOffline },
  presenceText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textOnGlass },
  selfCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 16, backgroundColor: colors.neuWell, maxWidth: 420, marginTop: 18 },
  selfThumb: { width: 96, height: 60, borderRadius: 10, overflow: "hidden", backgroundColor: colors.cameraBezel },
  selfCardText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.textOnGlass },
  incomingRoot: { flex: 1, backgroundColor: colors.background },
  band: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: 48,
    backgroundColor: colors.actionPrimaryFill,
  },
  bandText: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: "#FFFFFF" },
  incomingBody: { backgroundColor: "rgba(90,80,168,0.16)" },
  incomingTitle: { fontFamily: fonts.heading, fontSize: 40, lineHeight: 46, color: colors.textPrimary, textAlign: "center", marginTop: 6 },
  incomingTitlePhone: { fontSize: 30, lineHeight: 36 },
  incomingSub: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 24, color: colors.textOnGlass, textAlign: "center" },
  incomingActions: { flexDirection: "row", gap: 16, marginTop: 12 },
  incomingActionsPhone: { flexDirection: "column", alignSelf: "stretch", marginTop: "auto" },
  ringingText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass },
  summary: { padding: 32, gap: 18, maxWidth: 1040, width: "100%", alignSelf: "center" },
  summaryHead: { flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" },
  summaryTitle: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 36, color: colors.textPrimary },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tile: { flexGrow: 1, flexBasis: 180, padding: 16, borderRadius: 18, backgroundColor: colors.neuBase, gap: 2 },
  tileValue: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 34, color: colors.textPrimary },
  tileLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textOnGlass },
  summaryCols: { flexDirection: "row", flexWrap: "wrap", gap: 18, alignItems: "flex-start" },
  col: { flexGrow: 1, flexBasis: 380 },
  card: { padding: 18, borderRadius: 22, backgroundColor: "rgba(48,54,68,0.92)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", gap: 10 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary },
  practRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52 },
  rowRule: { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  signChip: { minWidth: 38, height: 38, borderRadius: 10, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuBase },
  signChipText: { fontFamily: fonts.heading, fontSize: 16, color: colors.textPrimary },
  practWord: { fontFamily: fonts.bodySemiBold, fontSize: 14, width: 64 },
  practDetail: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textOnGlass },
  practModel: { fontFamily: fonts.body, fontSize: 13, color: colors.textOnGlass },
  signedBox: { padding: 14, borderRadius: 14, backgroundColor: colors.neuWell, gap: 4 },
  eyebrow: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 1.1, color: colors.textOnGlass },
  signedText: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.needsPracticeText },
  endedTitle: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 40, color: colors.textPrimary, textAlign: "center", marginTop: 6 },
  endedBody: { fontFamily: fonts.bodyMedium, fontSize: 19, lineHeight: 27, color: colors.textPrimary, textAlign: "center" },
  learnedRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  learnedTile: { minWidth: 52, height: 52, borderRadius: 12, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  learnedTileOn: { borderColor: colors.success, backgroundColor: colors.neuBase },
  learnedTileOff: { borderColor: "transparent", backgroundColor: colors.neuWell },
  learnedText: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary },
  endedActions: { alignItems: "center", gap: 12, marginTop: 6 },
  backWide: { minWidth: 220 },
  errorCard: {
    flexDirection: "row",
    gap: 16,
    padding: 22,
    borderRadius: radii.lg,
    backgroundColor: colors.neuBase,
    maxWidth: 480,
    width: "92%",
  },
  errorIcon: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.neuWell },
  errorTitle: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 26, color: colors.textPrimary },
  errorBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textOnGlass, marginTop: 4 },
  errorActions: { flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" },
});
