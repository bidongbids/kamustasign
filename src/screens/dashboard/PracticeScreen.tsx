// Classroom practice: the translator with a target sign, in the Graphite
// Aurora student layout (design system: PracticeLettersScreen /
// PracticeWordsScreen). Not a fork of either translator screen - it renders
// the real LiveTranslatorScreen (letters / numbers) or WordTranslatorScreen
// (words) with variant="practice" + targetSign + onPracticeResult, and owns
// the camera stream and landmarker queue the same way TranslatorHubScreen
// does (useSharedCameraStream / useSharedLandmarkers). Unmounting releases
// both; switching to the next sign does NOT (same screen, new `sign`).
//
// What gets written (one lesson_progress upsert per attempt, via
// recordAttempt()):
//  - Letters/Numbers predict continuously. Each time the target holds at the
//    pass threshold is a passed attempt (the student must let go of the sign
//    before the next one - see LiveTranslatorScreen). A session with no pass
//    is recorded as one plain attempt when the student leaves or moves to
//    another sign (only if a hand was ever seen).
//  - Words: every classified clip is an attempt.
// Every pass is sent as a pass and counts (0012 dropped the pass cooldown);
// the row that comes back tells this screen whether it just learned the sign.
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SegmentedToggle from "../../components/SegmentedToggle";
import type { CaptureMode } from "../WordTranslatorScreen";
import GradientBackground from "../../components/GradientBackground";
import GlassCard from "../../components/GlassCard";
import LiveTranslatorScreen from "../LiveTranslatorScreen";
import WordTranslatorScreen from "../WordTranslatorScreen";
import { useSelectedLanguage } from "../../components/LanguagePicker";
import { ArrowRightIcon, ChevronLeftIcon, EyeIcon } from "../../components/icons/UiIcons";
import KidButton from "../../components/learn/KidButton";
import TargetCard from "../../components/learn/TargetCard";
import SignReference from "../../components/learn/SignReference";
import PracticeFeedback from "../../components/learn/PracticeFeedback";
import MasteryCelebration from "../../components/learn/MasteryCelebration";
import NextSignActions from "../../components/learn/NextSignActions";
import GrownUpSettings from "../../components/learn/GrownUpSettings";
import { StarMeter } from "../../components/learn/Stars";
import { useSharedCameraStream } from "../../hooks/useSharedCameraStream";
import { useSharedLandmarkers } from "../../hooks/useSharedLandmarkers";
import { useReduceMotion } from "../../hooks/useReduceMotion";
import { recordAttempt, type LessonProgressRow } from "../../lib/queries";
import { MASTERY_PASSES, getGroup, getLanguage, type SignGroup, type SignLanguage } from "../../lib/curriculum";
import { nextPracticeSign } from "../../lib/practiceFlow";
import { accuracyStars, starReference } from "../../lib/starReference";
import { getMotionHint, getSignMedia } from "../../lib/referenceMedia";
import { signName } from "../../lib/signNames";
import { buildFeedback, type PracticeFeedbackState } from "../../lib/learnCopy";
import { fonts, kidTypography, radii, spacing, type ThemeColors } from "../../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../../theme/ThemeProvider";
import { useResponsive } from "../../theme/responsive";

type Props = {
  studentId: string;
  language: SignLanguage;
  group: SignGroup;
  sign: string;
  /** The group's signs in curriculum order, and the student's rows for them - for "Next sign". */
  signs: string[];
  rows: Map<string, LessonProgressRow>;
  accentColor: string;
  /** Every saved attempt's returned row, so the dashboard (and "Next sign") stay current. */
  onRowUpdate: (row: LessonProgressRow) => void;
  /** Move to another sign without leaving practice (camera stays on). */
  onChangeSign: (sign: string) => void;
  /** Called after any pending progress write has finished. */
  onDone: () => void;
};

type WriteResult = { counted: boolean; crossed: boolean; alreadyLearned: boolean };
const GROUP_WORD: Record<SignGroup, string> = { letters: "letter", numbers: "number", words: "word" };

export default function PracticeScreen({
  studentId,
  language,
  group,
  sign,
  signs,
  rows,
  onRowUpdate,
  onChangeSign,
  onDone,
}: Props) {
  const { colors, shadows } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { isDesktop, height: windowHeight, width: windowWidth } = useResponsive();
  const reduceMotion = useReduceMotion();
  const [targetLanguage] = useSelectedLanguage();
  const { getCameraStream } = useSharedCameraStream();
  const { createHandLandmarker, createHolisticLandmarker, releaseLandmarker } = useSharedLandmarkers();

  const initialRow = rows.get(sign);
  const [feedback, setFeedback] = useState<PracticeFeedbackState>({ kind: "waiting" });
  const [passes, setPasses] = useState(initialRow?.passes ?? 0);
  // Stored best (all sessions) - with this session's `best`, drives the stars.
  const [storedBest, setStoredBest] = useState(Number(initialRow?.best_confidence ?? 0));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hold, setHold] = useState(0);
  const [recState, setRecState] = useState<"idle" | "recording" | "classifying">("idle");
  const [tipIndex, setTipIndex] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [instrumentView, setInstrumentView] = useState(false);
  // Words: hands-free (auto) or Record button (manual) - the same choice, and
  // the same saved setting, as the Words translator's Auto/Manual switch.
  const [captureMode, setCaptureMode] = useState<CaptureMode>("auto");
  useEffect(() => {
    AsyncStorage.getItem("kamustasign:wordCaptureMode")
      .then((saved) => {
        if (saved === "auto" || saved === "manual") setCaptureMode(saved);
      })
      .catch(() => {});
  }, []);
  function changeCaptureMode(next: CaptureMode) {
    setCaptureMode(next);
    AsyncStorage.setItem("kamustasign:wordCaptureMode", next).catch(() => {});
  }
  const [showReference, setShowReference] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [best, setBest] = useState(0);

  // Session bookkeeping lives in refs: the translator callbacks fire from
  // async frame/classification code, and the unmount cleanup needs the
  // latest values without re-running.
  const signRef = useRef(sign);
  const sessionRef = useRef({ started: false, best: 0, recorded: false });
  // Words: the last clip's score for this sign, for "Up from 62%".
  const lastScoreRef = useRef<number | null>(null);
  const passesRef = useRef(initialRow?.passes ?? 0);
  const writesRef = useRef<Promise<unknown>>(Promise.resolve());
  const lastFailedRef = useRef<{ sign: string; passed: boolean; confidence: number } | null>(null);
  const lastKindRef = useRef<PracticeFeedbackState["kind"]>("waiting");

  // A new target (Next sign): reset everything that belongs to one sign.
  useEffect(() => {
    if (signRef.current === sign) return;
    signRef.current = sign;
    const row = rows.get(sign);
    sessionRef.current = { started: false, best: 0, recorded: false };
    lastScoreRef.current = null;
    passesRef.current = row?.passes ?? 0;
    lastKindRef.current = "waiting";
    setPasses(row?.passes ?? 0);
    setStoredBest(Number(row?.best_confidence ?? 0));
    setFeedback({ kind: "waiting" });
    setSaveError(null);
    setHold(0);
    setBest(0);
    setCelebrate(false);
    setShowReference(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sign]);

  const isLive = group !== "words";
  const languageLabel = getLanguage(language).label;
  const groupLabel = getGroup(language, group).label;
  // Rises live as soon as this session beats the stored best.
  const stars = accuracyStars(Math.max(storedBest, best), starReference(language, group, sign));
  const nextSign = nextPracticeSign(signs, rows, sign);
  const shownSign = signName(language, sign);
  const shownNext = nextSign ? signName(language, nextSign) : null;

  /** Feedback setter that also rotates the tip on each new "not yet" moment. */
  function setFeedbackState(next: PracticeFeedbackState) {
    const prev = lastKindRef.current;
    if ((next.kind === "trying" && prev !== "trying") || next.kind === "retry") setTipIndex((i) => i + 1);
    lastKindRef.current = next.kind;
    setFeedback(next);
  }

  function write(passed: boolean, confidence: number): Promise<WriteResult> {
    const target = signRef.current;
    const job = writesRef.current.then(async (): Promise<WriteResult> => {
      const none = { counted: false, crossed: false, alreadyLearned: false };
      const { data, error } = await recordAttempt(studentId, language, group, target, passed, confidence);
      if (error) {
        lastFailedRef.current = { sign: target, passed, confidence };
        if (target === signRef.current) setSaveError(error.message);
        return none;
      }
      const row = (Array.isArray(data) ? data[0] : data) as LessonProgressRow | null;
      if (!row) return none;
      onRowUpdate(row);
      if (target !== signRef.current) return none; // moved on meanwhile
      setSaveError(null);
      const prev = passesRef.current;
      passesRef.current = row.passes;
      setPasses(row.passes);
      setStoredBest(Number(row.best_confidence ?? 0));
      return {
        counted: row.passes > prev,
        crossed: prev < MASTERY_PASSES && row.passes >= MASTERY_PASSES,
        alreadyLearned: prev >= MASTERY_PASSES,
      };
    });
    writesRef.current = job.catch(() => {});
    return job;
  }

  function showPass(confidence: number) {
    const alreadyLearned = passesRef.current >= MASTERY_PASSES;
    const target = signRef.current;
    setFeedbackState({ kind: "passed", counted: null, alreadyLearned, confidence });
    void write(true, confidence).then((r) => {
      if (target !== signRef.current) return;
      if (r.crossed) setCelebrate(true);
      // Only resolve the message if nothing newer (a retry) replaced it.
      setFeedback((f) =>
        f.kind === "passed" && f.counted === null ? { ...f, counted: r.counted, alreadyLearned: r.alreadyLearned } : f
      );
    });
  }

  // Live (letters/numbers).
  function handleLiveResult({ passed, confidence }: { passed: boolean; confidence: number }) {
    const s = sessionRef.current;
    s.started = true;
    s.best = Math.max(s.best, confidence);
    setBest(s.best);
    if (passed) {
      s.recorded = true;
      showPass(confidence);
    } else if (lastKindRef.current !== "passed") {
      // Keep a pass message up while the student lowers their hand.
      setFeedbackState({ kind: "trying", best: s.best });
    }
  }

  // Words: one attempt per classified clip.
  function handleWordResult({ passed, confidence, predicted }: { passed: boolean; confidence: number; predicted: string | null }) {
    const s = sessionRef.current;
    s.started = true;
    s.recorded = true;
    s.best = Math.max(s.best, confidence);
    setBest(s.best);
    const previous = lastScoreRef.current;
    lastScoreRef.current = confidence;
    if (passed) {
      showPass(confidence);
    } else {
      setFeedbackState({ kind: "retry", predicted, confidence, previous });
      void write(false, confidence);
    }
  }

  function retrySave() {
    const f = lastFailedRef.current;
    lastFailedRef.current = null;
    setSaveError(null);
    if (!f || f.sign !== signRef.current) return;
    if (f.passed) showPass(f.confidence);
    else void write(false, f.confidence);
  }

  // Leaving (or moving to another sign) without any recorded attempt still
  // counts as one (letters/numbers only; words recorded each clip as it
  // went). The unmount path covers leaving some other way than the back
  // button, e.g. signing out mid-practice.
  function recordUnfinishedSession() {
    const s = sessionRef.current;
    if (s.started && !s.recorded) {
      s.recorded = true;
      return write(false, s.best);
    }
    return writesRef.current;
  }

  useEffect(() => {
    return () => {
      void recordUnfinishedSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBack() {
    if (leaving) return;
    setLeaving(true);
    await recordUnfinishedSession();
    onDone();
  }

  async function goToSign(next: string) {
    await recordUnfinishedSession();
    await writesRef.current;
    onChangeSign(next);
  }

  function practiseAgain() {
    lastKindRef.current = "waiting";
    setFeedback({ kind: "waiting" });
    setHold(0);
  }

  const feedbackModel = buildFeedback({
    state: feedback.kind === "retry" && feedback.predicted ? { ...feedback, predicted: signName(language, feedback.predicted) } : feedback,
    isLive,
    sign: shownSign,
    passes,
    holding: isLive && hold > 0 && hold < 1,
    saveError,
    tipIndex,
    onRetrySave: retrySave,
    handsFree: !isLive && captureMode === "auto",
  });

  const showNextActions = feedback.kind === "passed" && feedback.counted !== null && !celebrate;

  // Desktop fills the window. Left: target + reference. Right: the camera
  // as wide and tall as the space allows, with one bottom row under it -
  // the record button + feedback side by side (words) or the feedback
  // (letters). The camera box is capped at 16:9 so the cover-cropped feed
  // never loses more than a normal widescreen crop of the signing space.
  const LEFT_W = 400;
  const GAP = 26;
  const BOTTOM_H = 120; // bottom row (record / feedback) - matches the translator's practice strip
  const rightH = Math.max(420, windowHeight - 80 /* top bar */ - 24 /* bottom pad */);
  const screenH = rightH - BOTTOM_H - 16 /* gap */ - 72; /* device shelves + padding */
  const areaW = windowWidth - 56 - LEFT_W - GAP;
  const camW = Math.round(Math.min(areaW, screenH * (16 / 9) + 24));
  // Width the camera can't use goes to the left column (bigger target + reference).
  const leftW = Math.round(Math.min(560, Math.max(LEFT_W, windowWidth - 56 - GAP - camW)));
  const desktopBodyWidth = leftW + GAP + camW + 56;
  const step = recState === "recording" ? 2 : recState === "classifying" ? 3 : 1;

  const feedbackCard = <PracticeFeedback model={feedbackModel} compact fill={isDesktop} dense={isDesktop} />;
  // Short windows: a smaller target slab so the left column fits too.
  const compactTarget = !isDesktop || windowHeight < 900;
  const nextActions = showNextActions ? (
    <NextSignActions
      sign={shownSign}
      nextSign={shownNext}
      groupWord={GROUP_WORD[group]}
      onNext={() => nextSign && goToSign(nextSign)}
      onRepeat={practiseAgain}
      onBack={handleBack}
      compact={!isDesktop}
    />
  ) : null;
  // Desktop words: feedback sits beside the record button, inside the
  // translator's bottom row (practiceAside).
  const feedbackInTranslator = isDesktop && !isLive && !instrumentView;

  const translator = isLive ? (
    <LiveTranslatorScreen
      key={cameraKey}
      variant={instrumentView ? "full" : "practice"}
      targetLanguage={targetLanguage}
      getCameraStream={getCameraStream}
      createHandLandmarker={createHandLandmarker}
      releaseLandmarker={releaseLandmarker}
      alphabet={group === "numbers" ? "numbers" : "letters"}
      language={language}
      targetSign={sign}
      onPracticeResult={handleLiveResult}
      onHoldProgress={setHold}
      onRetry={() => setCameraKey((k) => k + 1)}
    />
  ) : (
    <WordTranslatorScreen
      key={cameraKey}
      variant={instrumentView ? "full" : "practice"}
      targetLanguage={targetLanguage}
      getCameraStream={getCameraStream}
      createHolisticLandmarker={createHolisticLandmarker}
      releaseLandmarker={releaseLandmarker}
      language={language}
      mode={captureMode}
      targetSign={sign}
      onPracticeResult={handleWordResult}
      onRecordingStateChange={setRecState}
      practiceAside={feedbackInTranslator ? feedbackCard : undefined}
      onRetry={() => setCameraKey((k) => k + 1)}
    />
  );

  return (
    <GradientBackground variant="subtle" style={styles.root}>
      <View style={[styles.topBar, !isDesktop && styles.topBarMobile, isDesktop && !instrumentView ? { maxWidth: desktopBodyWidth } : null]}>
        <KidButton
          small
          label={leaving ? "Saving…" : isDesktop ? "My signs" : "Back"}
          accessibilityLabel="Back to my learning plan"
          onPress={handleBack}
          disabled={leaving}
          iconLeft={<ChevronLeftIcon size={18} color={colors.textPrimary} />}
        />
        <View style={[styles.groupPill, shadows.neuInset("sm")]}>
          <Text style={styles.groupPillText}>
            {languageLabel} · {groupLabel}
          </Text>
        </View>
        <View style={styles.topRight}>
          {isDesktop && nextSign ? (
            <KidButton
              small
              label="Next sign"
              onPress={() => goToSign(nextSign)}
              iconRight={<ArrowRightIcon size={18} color={colors.textPrimary} />}
            />
          ) : null}
          <GrownUpSettings
            compact={!isDesktop}
            best={best}
            passes={passes}
            saveErrorDetail={saveError}
            instrumentView={instrumentView}
            onToggleInstrumentView={() => setInstrumentView((v) => !v)}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.body,
          isDesktop ? styles.bodyDesktop : styles.bodyMobile,
          isDesktop && !instrumentView ? { maxWidth: desktopBodyWidth } : null,
        ]}
      >
        {!instrumentView && (
          <View style={isDesktop ? [styles.leftDesktop, { width: leftW, height: rightH }] : styles.leftMobile}>
            <GlassCard radius={radii.lg} padding={isDesktop ? 22 : 14}>
              <View style={styles.targetRow}>
                <TargetCard sign={shownSign} showRing={isLive} holdProgress={hold} compact={compactTarget} reduceMotion={reduceMotion} />
                <View style={styles.targetInfo}>
                  <Text style={styles.instruction}>
                    {isLive ? (isDesktop ? "Make the sign for " : "Sign ") : "Sign "}
                    <Text style={{ color: colors.accentCoralText }}>{isLive ? shownSign : `“${shownSign}”`}</Text>
                  </Text>
                  <StarMeter stars={stars} passes={passes} size={isDesktop ? 30 : 26} reduceMotion={reduceMotion} />
                </View>
              </View>
              {!isLive && (
                <View style={styles.modeRow}>
                  <Text style={styles.modeLabel}>Recording</Text>
                  <SegmentedToggle
                    size="kid"
                    options={[
                      { key: "auto", label: "Hands-free" },
                      { key: "manual", label: "Record button" },
                    ]}
                    value={captureMode}
                    onChange={changeCaptureMode}
                  />
                </View>
              )}
              {!isLive && (
                <View style={styles.steps} accessibilityLabel={`Step ${step} of 3`}>
                  {(captureMode === "auto" ? ["Sign it", "Keep going", "Checking"] : ["Press Record", "Sign it", "Press Stop"]).map((label, i) => (
                    <View key={label} style={[styles.stepChip, i + 1 === step ? styles.stepOn : shadows.neuInset("sm")]}>
                      <Text style={[styles.stepText, i + 1 === step && { color: colors.textOnAccent }]}>
                        {i + 1} · {label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>
            {(isDesktop || showReference) && (
              <SignReference
                sign={shownSign}
                media={getSignMedia(language, group, sign)}
                motionHint={getMotionHint(language, group, sign)}
                reduceMotion={reduceMotion}
                style={isDesktop ? styles.referenceDesktop : undefined}
                fill={isDesktop}
              />
            )}
          </View>
        )}

        <View
          style={
            isDesktop
              ? instrumentView
                ? styles.rightDesktopFull
                : [styles.rightDesktop, { width: camW, height: rightH }]
              : styles.rightMobile
          }
        >
          <View
            style={
              isDesktop
                ? instrumentView
                  ? styles.cameraDesktop
                  : { flex: 1, minHeight: 0, width: "100%" }
                : { height: instrumentView ? 760 : isLive ? 320 : 400 }
            }
          >
            {translator}
            {/* Desktop: "what next" floats over the camera instead of joining
                the left column, so "How to make it" keeps its size. */}
            {isDesktop && nextActions ? (
              <View style={[styles.nextFloat, { bottom: isLive ? 24 : BOTTOM_H + 40 }]} pointerEvents="box-none">
                <GlassCard overVideo radius={radii.lg} padding={14} dropShadow>
                  {nextActions}
                </GlassCard>
              </View>
            ) : null}
          </View>
          {!instrumentView && isDesktop && isLive && <View style={{ minHeight: BOTTOM_H }}>{feedbackCard}</View>}
          {!instrumentView && !isDesktop && (
            <>
              {feedbackCard}
              {nextActions}
            </>
          )}
          {!isDesktop && !instrumentView && (
            <KidButton
              label={showReference ? "Hide how to make it" : "Show me how"}
              onPress={() => setShowReference((v) => !v)}
              iconLeft={<EyeIcon size={20} color={colors.textPrimary} />}
            />
          )}
        </View>
      </ScrollView>

      {celebrate && (
        <MasteryCelebration
          sign={shownSign}
          stars={stars}
          nextSign={shownNext}
          groupLabel={groupLabel}
          reduceMotion={reduceMotion}
          onNext={() => {
            setCelebrate(false);
            if (nextSign) void goToSign(nextSign);
          }}
          onBack={() => {
            setCelebrate(false);
            void handleBack();
          }}
          onDismiss={() => setCelebrate(false)}
        />
      )}
    </GradientBackground>
  );
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: 28,
    paddingVertical: spacing.md,
    width: "100%",
    maxWidth: 1600,
    alignSelf: "center",
    zIndex: 30,
  },
  topBarMobile: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  groupPill: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.neuWell,
    flexShrink: 1,
  },
  groupPillText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textSecondary },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  scroll: { flex: 1 },
  body: { flexGrow: 1, width: "100%", maxWidth: 1600, alignSelf: "center" },
  bodyDesktop: { flexDirection: "row", gap: 26, paddingHorizontal: 28, paddingBottom: 24 },
  bodyMobile: { flexDirection: "column", gap: 12, paddingHorizontal: 16, paddingBottom: 24 },
  leftDesktop: { width: 400, flexShrink: 0, gap: 16 },
  leftMobile: { gap: 12 },
  rightDesktop: { flexShrink: 1, minWidth: 0, gap: 16 },
  rightDesktopFull: { flex: 1, minWidth: 0, gap: 16 },
  rightMobile: { gap: 12 },
  cameraDesktop: { flex: 1, minHeight: 360, minWidth: 0 },
  nextFloat: { position: "absolute", left: 24, right: 24, alignItems: "center", zIndex: 20 },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  targetInfo: { flex: 1, minWidth: 0, gap: 12 },
  instruction: { ...kidTypography.kidBody, color: colors.textPrimary },
  referenceDesktop: { flex: 1, minHeight: 0 },
  sideDesktop: { width: 380, flexShrink: 0, gap: 16 },
  steps: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" },
  modeLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textSecondary },
  stepChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.neuWell },
  stepOn: { backgroundColor: colors.accentCoral },
  stepText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.textSecondary },
});
