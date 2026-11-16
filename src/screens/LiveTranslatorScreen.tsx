// Letters / Numbers translator: the camera, the hand landmarker and the
// fingerspelling classifier, plus the word being spelled.
//
// Layout per docs/design/design_handoff_translator_fingerspelling (F1-F7):
//   desktop (>= 1100 wide) - the camera is the hero (flex, full height) in a
//     slim housing; the right column holds "Now signing" (the hold ring with
//     the letter inside, one sentence, confidence) and "Your word" (the word,
//     big, with Speak / Show to someone / Space / Delete letter / Clear word).
//   below 1100 - the phone stack: camera, a compact Now signing row, the word,
//     and a fixed bottom bar (Speak, Show, Space, Delete).
// The header, the ASL/FSL and Letters/Numbers/Words tabs, Signing hand and
// Settings belong to TranslatorHubScreen. The camera sits at the same place
// in the tree in both layouts, so crossing the breakpoint never remounts the
// <video>.
//
// variant="practice" is the classroom's: only the camera device with the
// child-facing overlays; PracticeScreen draws the target, stars and feedback.
import React, { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadAlphabet, type Alphabet, type SignLanguage } from "../ml/modelLoader";
import { frameAspect, handshapeInput, type HandshapeInputFormat } from "../ml/handshapeInput";
import * as tf from "@tensorflow/tfjs";
import { breakpoints, spacing, typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import CameraDevice, { type CameraState } from "../components/CameraDevice";
import { useHandedness } from "../components/HandednessPicker";
import { useHoldDuration } from "../components/HoldDurationControl";
import HoldRing, { type HoldTone } from "../components/HoldRing";
import { NowSigningCard, PhoneWordCard, WordCard, type SureWord } from "../components/FingerspellCards";
import TranslatorButton from "../components/TranslatorButton";
import ShowToSomeone from "../components/ShowToSomeone";
import { useTranslatorDisplay } from "../components/TranslatorSettings";
import { BackspaceIcon, ExpandIcon, SpaceBarIcon, SpeakerIcon } from "../components/icons/UiIcons";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { fpsLabel, useFpsMeter } from "../hooks/useFpsMeter";
import { createLiveValue, useLiveValue, type LiveValue } from "../hooks/useLiveValue";
import { useTranslateAndSpeak } from "../hooks/useTranslateAndSpeak";
import { findLanguage } from "../lib/languages";
import { drawHandSkeleton } from "../lib/handSkeleton";
import { LivePassTracker } from "../lib/livePassTracker";
import PracticeCameraOverlay from "../components/learn/PracticeCameraOverlay";

// Confidence (0-100) a live prediction needs before it's "stable" enough to
// commit to the accumulated word. Keeps a hand pausing mid-transition (low
// confidence) from spamming the strip with noise, while still committing the
// moment a clean letter holds.
const COMMIT_THRESHOLD = 60;

// The reader runs at ~30 fps; the status sentence and the confidence bar
// update at most this often (handoff §4). The hold ring follows every frame.
const PUBLISH_MS = 100;

// Camera startup tracing, mirroring WordTranslatorScreen's [words-cam] trace
// (see docs/CAMERA_BUG_HANDOFF.md section 4) - lets you confirm from the console
// that Letters gets a live stream back on the second/third mount instead of
// stalling or getting an already-`ended` track. Set to false once confirmed.
const TRACE_CAMERA = false;
const trace = (...args: any[]) => {
  if (TRACE_CAMERA) console.log("[letters-cam]", ...args);
};

type Props = {
  targetLanguage: string;
  getCameraStream: () => Promise<MediaStream>;
  createHandLandmarker: () => Promise<any>;
  releaseLandmarker: (instance: any) => void;
  /** Which fingerspelling model to classify against. Letters and numbers are
   *  separate models because several ASL digits share a handshape with a
   *  letter (O/0, F/9, V/2, W/6) - see modelLoader.ts. */
  alphabet?: Alphabet;
  /** ASL or FSL fingerspelling. Each language has its own letters and numbers models. */
  language?: SignLanguage;
  /** Classroom practice mode: the sign the student is trying to make. */
  targetSign?: string;
  /**
   * Practice mode only. Reports the session's state whenever it changes:
   * once when a hand first appears ({ passed: false, confidence: 0 }), each
   * time the target's best confidence rises, and on each pass - the target
   * held at PASS_CONFIDENCE for LIVE_PASS_HOLD_MS. After a pass the student
   * has to let go of the sign (or lower the hand) before the next one can be
   * reported, so holding one sign reports a single pass, not one per 500 ms.
   * Whether a pass COUNTS toward mastery is decided by the database.
   */
  onPracticeResult?: (result: { passed: boolean; confidence: number }) => void;
  /**
   * "practice": the classroom layout (Graphite Aurora student layer) - only
   * the camera device, with child-facing overlays (hand box, camera loading
   * / error). PracticeScreen draws the target, stars and feedback itself.
   * Same component, same camera + MediaPipe lifecycle - not a fork. Default
   * "full" is the translator.
   */
  variant?: "full" | "practice";
  /**
   * Practice mode only: how far the current hold of the target is towards a
   * pass, 0-1 (LIVE_PASS_HOLD_MS). 0 when the target drops below
   * PASS_CONFIDENCE, 1 on a pass (until the student lets go). Throttled.
   */
  onHoldProgress?: (progress: number) => void;
  /** Practice mode: "Try again" on the camera-error overlay. */
  onRetry?: () => void;
  /** Full: the signed-in person's name, for "{name} signed" on the big view. */
  signerName?: string;
  /** Full: filled with this screen's Clear word, for the hub's phone Settings. */
  clearWordRef?: React.MutableRefObject<(() => void) | null>;
};

/** What the reader sees right now. Published to React at most every PUBLISH_MS. */
type Live = {
  label: string;
  confidence: number;
  hand: boolean;
  /** At or above COMMIT_THRESHOLD: the hold timer is running. */
  holding: boolean;
  /** The held letter has been added (until the hand lowers or changes). */
  committed: boolean;
};

const NO_HAND: Live = { label: "-", confidence: 0, hand: false, holding: false, committed: false };
const sameLive = (a: Live, b: Live) =>
  a.label === b.label && a.confidence === b.confidence && a.hand === b.hand && a.holding === b.holding && a.committed === b.committed;

type Problem = "blocked" | "camera" | "reader" | null;

const nameOf = (l: string) => (l === "space" ? "space" : l === "del" ? "delete" : l);

export default function LiveTranslatorScreen({
  targetLanguage,
  getCameraStream,
  createHandLandmarker,
  releaseLandmarker,
  alphabet = "letters",
  language = "asl",
  targetSign,
  onPracticeResult,
  variant = "full",
  onHoldProgress,
  onRetry,
  signerName,
  clearWordRef,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Kept so the effect below can re-attach the stream if the <video> is
  // ever replaced (Practice's grown-up view switches variant).
  const streamRef = useRef<MediaStream | null>(null);
  // Held in refs, not state, so the frame loop reads the current classifier
  // without the camera effect needing to re-run when the alphabet changes.
  const modelRef = useRef<any>(null);
  const classesRef = useRef<string[]>([]);
  const inputFormatRef = useRef<HandshapeInputFormat>("raw");
  const [status, setStatus] = useState("Starting...");
  const [problem, setProblem] = useState<Problem>(null);
  // Bumped by "Try again": re-runs the camera + model setup.
  const [attempt, setAttempt] = useState(0);
  const { fps, tick: fpsTick } = useFpsMeter();

  // Live reading: the loop writes liveRef every frame; React gets it at most
  // every PUBLISH_MS (and at once when a hand appears / leaves or a letter is
  // added). The hold ring reads holdStore, which follows every frame.
  const liveRef = useRef<Live>(NO_HAND);
  const publishedRef = useRef<Live>(NO_HAND);
  const lastPublishRef = useRef(0);
  const [live, setLive] = useState<Live>(NO_HAND);
  const holdStore = useRef<LiveValue<number>>(createLiveValue(0)).current;

  const { width: winW, height: winH } = useWindowDimensions();
  const wide = winW >= breakpoints.desktop;
  const phone = winW < breakpoints.tablet;
  const languageName = findLanguage(targetLanguage)?.name ?? "English";

  const [accumulatedWord, setAccumulatedWord] = useState<string[]>([]);
  // "Show to someone": the word full-screen, big enough to read across a desk.
  const [showBig, setShowBig] = useState(false);
  const reduceMotion = useReduceMotion();
  const lastCommittedRef = useRef<string>("");
  const holdLabelRef = useRef<string | null>(null);
  const holdStartRef = useRef<number>(0);

  const { speak, status: speechStatus, translatedText } = useTranslateAndSpeak(targetLanguage);
  const spokenWordRef = useRef("");

  // The detection loop below is set up once per camera attempt and runs as a
  // long-lived requestAnimationFrame recursion, so it reads settings through
  // refs kept in sync with state instead of closing over them.
  const [handedness] = useHandedness();
  const handednessRef = useRef(handedness);
  handednessRef.current = handedness;
  const [holdDuration] = useHoldDuration();
  const holdDurationRef = useRef(holdDuration);
  holdDurationRef.current = holdDuration;
  const [display] = useTranslatorDisplay();
  const displayRef = useRef(display);
  displayRef.current = display;
  const variantRef = useRef(variant);
  variantRef.current = variant;

  // Practice mode state, read by the frame loop (same ref pattern). `best`
  // is the target's best confidence (0-1).
  const targetSignRef = useRef(targetSign);
  targetSignRef.current = targetSign;
  const onPracticeResultRef = useRef(onPracticeResult);
  onPracticeResultRef.current = onPracticeResult;
  const practiceRef = useRef(new LivePassTracker());
  const onHoldProgressRef = useRef(onHoldProgress);
  onHoldProgressRef.current = onHoldProgress;
  const lastHoldRef = useRef(0);
  // Practice-variant overlay only (hand box colour/label).
  const [practiceHold, setPracticeHold] = useState(0);
  useEffect(() => {
    practiceRef.current.reset();
    lastHoldRef.current = 0;
    setPracticeHold(0);
  }, [targetSign]);

  function publish(next: Live, force: boolean) {
    const pub = publishedRef.current;
    if (sameLive(pub, next)) return;
    const now = performance.now();
    if (force || pub.hand !== next.hand || pub.committed !== next.committed || now - lastPublishRef.current >= PUBLISH_MS) {
      lastPublishRef.current = now;
      publishedRef.current = next;
      setLive(next);
    }
  }
  const publishRef = useRef(publish);
  publishRef.current = publish;

  // Swap the classifier when the Letters/Numbers toggle changes. Deliberately
  // separate from the camera effect below: the camera, the MediaPipe graph and
  // the stream all stay exactly as they are, and only the model behind the
  // predictions changes. Clears the current reading so a stale letter doesn't
  // sit on screen while the new model loads.
  useEffect(() => {
    let cancelled = false;
    modelRef.current = null;
    liveRef.current = NO_HAND;
    holdStore.set(0);
    publishRef.current(NO_HAND, true);

    loadAlphabet(alphabet, language)
      .then(({ model, classes, input }) => {
        if (cancelled) return;
        modelRef.current = model;
        classesRef.current = classes;
        inputFormatRef.current = input;
        trace(`${language} ${alphabet} model ready (${classes.length} classes)`);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setProblem("reader");
        setStatus(`ERROR loading ${language} ${alphabet} model: ${err?.message ?? err}`);
      });

    return () => {
      cancelled = true;
    };
  }, [alphabet, language, attempt, holdStore]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setStatus("Live translator currently supports web only.");
      return;
    }

    let handLandmarker: any = null;
    let animationId: number | null = null;
    let stream: MediaStream | null = null;
    let stopped = false;
    // Which step failed, for the camera's error screen.
    let stage: "reader" | "camera" = "reader";

    async function setup() {
      trace("setup() start; videoRef present?", !!videoRef.current);
      // The model is NOT loaded here. It lives in modelRef, loaded by the
      // alphabet effect above, so switching Letters <-> Numbers swaps the
      // classifier without tearing down the camera or the landmarker. The
      // frame loop simply skips until modelRef is populated.
      setStatus("Loading hand detector...");
      trace("building hand landmarker...");
      handLandmarker = await createHandLandmarker();
      trace("hand landmarker ready");
      // Same orphaned-resource guard as the camera stream below: if we
      // unmounted while this was being created, the cleanup already ran with
      // handLandmarker still null, so release it here instead of leaking it.
      if (stopped) {
        releaseLandmarker(handLandmarker);
        handLandmarker = null;
        return;
      }

      setStatus("Requesting camera access...");
      stage = "camera";
      // The stream is owned by TranslatorHubScreen (see useSharedCameraStream)
      // and shared across tab switches - it is NOT acquired or released here,
      // which is what used to cause the black-panel bug (see
      // docs/CAMERA_BUG_HANDOFF.md H1: releasing and re-requesting the camera in
      // the same tick raced with the OS/driver actually freeing the device).
      trace("awaiting shared camera stream...");
      stream = await getCameraStream();
      trace(
        "camera stream resolved; tracks:",
        stream.getTracks().map((t) => `${t.kind}/${t.readyState}/${t.label}`)
      );
      // If the component unmounted while we were waiting on the camera
      // (e.g. the user switched tabs during a slow CDN/model load), just
      // bail - the stream is shared, so it is not ours to stop.
      if (stopped) {
        return;
      }
      if (videoRef.current) {
        trace("attaching stream to <video>");
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch((err) => {
          // A <video> replaced mid-play() aborts its play(); the re-attach
          // effect plays the new one, and loop() reads videoRef.current, so
          // that's not a setup failure.
          if (err?.name !== "AbortError") throw err;
        });
        trace(
          "play() resolved;",
          `size=${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`,
          `readyState=${videoRef.current.readyState}`,
          `paused=${videoRef.current.paused}`
        );
      }

      setStatus("Running.");
      loop();
    }

    // Practice mode: hold-ring progress, throttled to ~25 steps per hold so
    // it doesn't re-render every frame.
    function reportHold(progress: number) {
      const p = Math.max(0, Math.min(1, progress));
      const last = lastHoldRef.current;
      if (p === last) return;
      if (p !== 0 && p !== 1 && Math.abs(p - last) < 0.04) return;
      lastHoldRef.current = p;
      onHoldProgressRef.current?.(p);
      setPracticeHold(p);
    }

    // Practice mode: compare one classified frame against the target.
    function trackPractice(label: string, confidence: number, nowMs: number) {
      const target = targetSignRef.current;
      const report = onPracticeResultRef.current;
      if (!target || !report) return;
      const { hold, reports } = practiceRef.current.frame(target, label, confidence, nowMs);
      // Same order as before the tracker was extracted: progress reports,
      // then the ring, then the pass itself.
      reports.filter((r) => !r.passed).forEach(report);
      reportHold(hold);
      reports.filter((r) => r.passed).forEach(report);
    }

    function commit(label: string) {
      if (label === "del") {
        setAccumulatedWord((prev) => prev.slice(0, -1));
      } else if (label === "space") {
        // As the Space button: never a leading or a double space.
        setAccumulatedWord((prev) => (prev.length && prev[prev.length - 1] !== " " ? [...prev, " "] : prev));
      } else {
        setAccumulatedWord((prev) => [...prev, label]);
      }
    }

    function loop() {
      if (stopped || !handLandmarker || !videoRef.current) return;
      // A throttled change that no newer frame has carried out yet.
      publishRef.current(liveRef.current, false);
      // The classifier is swapped out (null) while the Letters/Numbers toggle
      // loads the other alphabet. Keep the loop alive through that instead of
      // returning, or it never restarts once the model arrives.
      if (!modelRef.current) {
        animationId = requestAnimationFrame(loop);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const nowMs = performance.now();

      // fpsTick is false while the camera is still on the frame we last
      // processed (see useFpsMeter) - nothing new to detect.
      if (video.readyState >= 2 && fpsTick(video)) {
        const result = handLandmarker.detectForVideo(video, nowMs);

        let ctx: CanvasRenderingContext2D | null = null;
        if (canvas) {
          ctx = canvas.getContext("2d");
          // Assigning width/height reallocates the canvas even when the
          // value is unchanged, so only do it when the video size changes.
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (result.landmarks && result.landmarks.length > 0) {
          const landmarks = result.landmarks[0];

          // "Hand points" (Settings) only hides the drawing; detection is the same.
          if (ctx && (variantRef.current === "practice" || displayRef.current.points)) {
            drawHandSkeleton(ctx, canvas!, landmarks);
          }

          // Model was trained on right-handed signing - a left hand signing
          // the same letter produces mirrored landmarks (see
          // HandednessPicker.tsx), so undo that mirror before classifying.
          const flat = handshapeInput(landmarks, {
            format: inputFormatRef.current,
            aspect: frameAspect(video),
            mirror: handednessRef.current === "left",
          });

          const inputTensor = tf.tensor2d([flat], [1, 63]);
          const outputTensor = modelRef.current.predict(inputTensor);
          outputTensor.data().then((data: any) => {
            if (stopped) return;
            const arr = Array.from(data) as number[];
            const maxIndex = arr.indexOf(Math.max(...arr));
            const label = classesRef.current[maxIndex] ?? "?";
            const pct = arr[maxIndex] * 100;
            trackPractice(label, arr[maxIndex], nowMs);

            const above = pct >= COMMIT_THRESHOLD && label !== "-";
            let holdFrac = 0;
            let addedNow = false;
            if (above) {
              if (label !== holdLabelRef.current) {
                // New candidate label - start timing its hold instead of
                // committing immediately.
                holdLabelRef.current = label;
                holdStartRef.current = nowMs;
              }
              const held = nowMs - holdStartRef.current;
              if (held >= holdDurationRef.current && label !== lastCommittedRef.current) {
                lastCommittedRef.current = label;
                commit(label);
                addedNow = true;
              }
              holdFrac = holdDurationRef.current > 0 ? Math.min(1, held / holdDurationRef.current) : 1;
            } else {
              holdLabelRef.current = null;
            }
            holdStore.set(holdFrac);
            const next: Live = {
              label,
              // Whole percent: an unchanged value lets React skip the render.
              confidence: Math.round(pct),
              hand: true,
              holding: above,
              committed: above && holdFrac >= 1 && label === lastCommittedRef.current,
            };
            liveRef.current = next;
            publishRef.current(next, addedNow);
          });
          inputTensor.dispose();
          outputTensor.dispose();
        } else {
          lastCommittedRef.current = "";
          holdLabelRef.current = null;
          holdStore.set(0);
          liveRef.current = NO_HAND;
          publishRef.current(NO_HAND, false);
          const hold = practiceRef.current.handLost();
          if (targetSignRef.current) reportHold(hold);
        }
      }

      animationId = requestAnimationFrame(loop);
    }

    trace("MOUNT");
    setup().catch((err) => {
      trace("setup() THREW:", err);
      if (stopped) return;
      const name = err?.name;
      setProblem(
        stage === "reader"
          ? "reader"
          : name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError"
            ? "blocked"
            : "camera"
      );
      // The screen says what failed in plain words; the detail goes to the error report.
      console.error(`[hand reader] ${stage} failed`, err);
      setStatus("ERROR: " + (err && err.message ? err.message : String(err)));
    });

    return () => {
      trace("UNMOUNT - closing landmarker (stream is shared, not stopped here)");
      stopped = true;
      if (animationId) cancelAnimationFrame(animationId);
      // Do NOT stop the stream's tracks here - it's shared across tab
      // switches (see useSharedCameraStream) and only the hub that acquired
      // it releases it, when the Translator itself is left.
      // The landmarker, unlike the stream, IS created fresh per mount and
      // must be closed here - see useSharedLandmarkers. Each holds its own
      // WebGL context and GPU inference graph; Chrome only allows a limited
      // number of live contexts before it starts evicting the oldest ones.
      if (handLandmarker) {
        // Released through the shared queue, NOT closed directly: the next
        // screen's landmarker build must not start until this teardown has
        // actually finished in the WASM runtime, or it hangs and the camera
        // is never requested. See useSharedLandmarkers.
        releaseLandmarker(handLandmarker);
        handLandmarker = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // setup() attaches the stream once; if a new <video> replaced the old one
  // (Practice's grown-up view switches variant), attach it again or the
  // panel stays black.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [wide, variant]);

  function retry() {
    setProblem(null);
    setStatus("Starting...");
    setAttempt((a) => a + 1);
  }

  function handleBackspace() {
    setAccumulatedWord((prev) => prev.slice(0, -1));
    lastCommittedRef.current = "";
  }

  // Delete letter removes the last letter; Clear word empties it and starts
  // a new word.
  function handleClear() {
    setAccumulatedWord([]);
    lastCommittedRef.current = "";
    holdLabelRef.current = null;
    holdStore.set(0);
  }

  function handleSpeak() {
    const word = accumulatedWord.join("").trim();
    if (!word) return;
    spokenWordRef.current = word;
    speak(word);
  }

  // Space between words without a sign; also re-arms the last letter so a
  // word can start with the letter that ended the previous one.
  function handleSpace() {
    setAccumulatedWord((prev) => (prev.length && prev[prev.length - 1] !== " " ? [...prev, " "] : prev));
    lastCommittedRef.current = "";
  }

  // The hub's phone Settings sheet has Clear word.
  useEffect(() => {
    if (!clearWordRef) return;
    clearWordRef.current = handleClear;
    return () => {
      clearWordRef.current = null;
    };
  });

  // Keyboard shortcuts (web, full translator only): Backspace deletes the last
  // letter, Escape clears (or closes the big view), Enter speaks. While any
  // other dialog is open (Settings, Help, Appearance, the language list)
  // the keys are its own.
  useEffect(() => {
    if (Platform.OS !== "web" || variant !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (showBig) {
        if (e.key === "Escape") setShowBig(false);
        else if (e.key === "Enter") handleSpeak();
        return;
      }
      if (typeof document !== "undefined" && document.querySelector('[aria-modal="true"]')) return;
      if (e.key === "Escape") {
        handleClear();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Enter") {
        handleSpeak();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (Platform.OS !== "web") {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedTitle}>Live Translator</Text>
        <Text style={styles.unsupportedText}>This feature currently supports web only.</Text>
      </View>
    );
  }

  const ready = status === "Running." && !problem;

  if (variant === "practice") {
    const cameraError = status.startsWith("ERROR");
    return (
      <View style={styles.practiceRoot}>
        <CameraDevice
          isDesktop
          videoRef={videoRef}
          canvasRef={canvasRef}
          ledColor={cameraError ? colors.needsPractice : ready ? colors.success : colors.accentCoral}
          statusText={cameraError ? "CAMERA OFF" : ready ? `${fpsLabel(fps)} · READY` : "STARTING"}
          overlays={
            <PracticeCameraOverlay
              phase={cameraError ? "error" : ready ? "live" : "loading"}
              handSeen={live.hand}
              hold={practiceHold}
              onRetry={onRetry}
            />
          }
          style={styles.practiceCamera}
        />
      </View>
    );
  }

  // --- What's happening right now, in words (nothing here relies on sound) ---
  const cameraState: CameraState = problem === "blocked" ? "blocked" : problem ? "error" : ready ? "live" : "loading";
  const tone: HoldTone = !ready || !live.hand || !live.holding ? "idle" : live.committed ? "added" : "holding";
  const name = nameOf(live.label);
  const glyph = tone === "idle" ? "?" : name;
  const now: { title: string; hint: string } = problem
    ? { title: "The camera is off.", hint: "See the message on the camera." }
    : !ready
      ? { title: "Getting ready…", hint: "The camera turns on in a moment." }
      : !live.hand
        ? { title: "Show your hand to the camera.", hint: "Keep it inside the box." }
        : !live.holding
          ? { title: "Not sure yet.", hint: "Make the handshape clearer and hold it still." }
          : live.committed
            ? { title: `Added “${name}”.`, hint: "Lower your hand, then sign the next letter." }
            : { title: `Hold still… adding “${name}”`, hint: "To repeat it, lower your hand first." };
  const sure: SureWord = !ready || !live.hand ? "No hand" : live.confidence >= 80 ? "Sure" : live.confidence >= COMMIT_THRESHOLD ? "Almost sure" : "Not sure";

  const wordText = accumulatedWord.join("");
  const wordEmpty = wordText.trim().length === 0;
  const speakText =
    speechStatus === "speaking" ? "Speaking…" : speechStatus === "translating" ? "Translating…" : "Speak it aloud";
  const speakShort = speechStatus === "speaking" ? "Speaking…" : speechStatus === "translating" ? "Translating…" : "Speak";

  // 1366x768 (F6): ring 118, word 44, tighter gaps; very short windows also
  // drop the two hint lines so nothing scrolls.
  const dense = wide && (winH < 860 || winW < 1400);
  const tight = wide && winH < 700;
  const gutter = wide ? (dense ? 20 : 24) : phone ? 14 : 24;
  const cameraHeight = phone ? 300 : Math.round(Math.min(520, (winW - gutter * 2) * 0.6));
  const fpsText = display.fps ? `${fps > 0 ? fps : "--"} fps · ready` : null;

  const ring = (size: number) => <LiveRing store={holdStore} glyph={glyph} size={size} tone={tone} reduceMotion={reduceMotion} />;

  const camera = (
    <CameraDevice
      variant="slim"
      videoRef={videoRef}
      canvasRef={canvasRef}
      cameraState={cameraState}
      chip={live.hand ? "hand" : "none"}
      fpsText={fpsText}
      guideState={live.hand ? "hand" : "idle"}
      guideSide={handedness === "left" ? "left" : "right"}
      errorTitle={problem === "reader" ? "The hand reader didn't load" : undefined}
      errorBody={problem === "reader" ? "Try again. If it keeps happening, restart LCSign." : undefined}
      onRetry={retry}
    />
  );

  // Translation line on the big view: only when the speech language turned
  // the word into something else (it's known once the word has been spoken).
  const translation =
    spokenWordRef.current === wordText.trim() && translatedText && translatedText.trim().toLowerCase() !== wordText.trim().toLowerCase()
      ? translatedText.trim()
      : "";
  const showBigModal = (
    <ShowToSomeone
      visible={showBig}
      onClose={() => setShowBig(false)}
      text={wordText}
      signerName={signerName}
      translation={translation}
      languageName={languageName}
      speakLabel={speakText}
      onSpeak={handleSpeak}
      reduceMotion={reduceMotion}
    />
  );

  const openBig = () => wordText.trim() && setShowBig(true);

  return (
    <View style={[styles.root, wide ? [styles.rootWide, { paddingHorizontal: gutter, paddingBottom: gutter, gap: dense ? 16 : 20 }] : null]}>
      {/* Always the first child, in both layouts: the <video> never remounts. */}
      <View style={wide ? styles.cameraWide : [styles.cameraStack, { height: cameraHeight, marginHorizontal: gutter }]}>{camera}</View>

      {wide ? (
        <ScrollView
          style={[styles.side, { width: dense ? 520 : 548 }]}
          contentContainerStyle={[styles.sideContent, { gap: dense ? 12 : 16 }]}
          showsVerticalScrollIndicator={false}
        >
          <NowSigningCard ring={ring(dense ? 118 : 150)} title={now.title} hint={now.hint} confidence={live.confidence} sure={sure} dense={dense} />
          <WordCard
            letters={accumulatedWord}
            languageName={languageName}
            dense={dense}
            tight={tight}
            speakLabel={speakText}
            onSpeak={handleSpeak}
            onShow={openBig}
            onSpace={handleSpace}
            onDelete={handleBackspace}
            onClear={handleClear}
          />
        </ScrollView>
      ) : (
        <ScrollView style={styles.stackScroll} contentContainerStyle={[styles.stackContent, { paddingHorizontal: gutter }]}>
          <NowSigningCard phone ring={ring(92)} title={now.title} confidence={live.confidence} sure={sure} />
          <PhoneWordCard letters={accumulatedWord} />
        </ScrollView>
      )}

      {!wide ? (
        <View style={[styles.bottomBar, { paddingHorizontal: gutter, paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
          <TranslatorButton
            tone="accent"
            size="lg"
            grow
            label={speakShort}
            icon={(c) => <SpeakerIcon size={18} color={c} />}
            onPress={handleSpeak}
            disabled={wordEmpty}
            accessibilityLabel="Speak it aloud"
            accessibilityHint={wordEmpty ? "Spell a word first" : undefined}
          />
          <TranslatorButton
            tone="neu"
            size="lg"
            square
            icon={(c) => <ExpandIcon size={18} color={c} />}
            onPress={openBig}
            disabled={wordEmpty}
            accessibilityLabel="Show to someone"
          />
          <TranslatorButton tone="neu" size="lg" square icon={(c) => <SpaceBarIcon size={20} color={c} />} onPress={handleSpace} accessibilityLabel="Add a space" />
          <TranslatorButton tone="neu" size="lg" square icon={(c) => <BackspaceIcon size={19} color={c} />} onPress={handleBackspace} accessibilityLabel="Delete letter" />
        </View>
      ) : null}

      {showBigModal}
    </View>
  );
}

/** The hold ring, re-rendered on its own for every frame of the hold. */
function LiveRing({ store, ...rest }: { store: LiveValue<number>; glyph: string; size: number; tone: HoldTone; reduceMotion: boolean }) {
  const progress = useLiveValue(store);
  return <HoldRing progress={progress} {...rest} />;
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  unsupported: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  unsupportedTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  unsupportedText: {
    ...typography.body,
    color: colors.textSecondary,
  },

  // Practice variant: the camera device fills whatever box PracticeScreen gives it.
  practiceRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  practiceCamera: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },

  root: { flex: 1, minHeight: 0, minWidth: 0 },
  rootWide: { flexDirection: "row", alignItems: "stretch" },
  cameraWide: { flex: 1, minWidth: 0, minHeight: 0 },
  cameraStack: { flexShrink: 0 },
  side: { flexGrow: 0, flexShrink: 0 },
  sideContent: { flexGrow: 1 },
  stackScroll: { flex: 1, minHeight: 0 },
  stackContent: { gap: 10, paddingTop: 10, paddingBottom: 12 },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: theme.name === "dark" ? "rgba(255,255,255,0.08)" : colors.border,
  },
});
