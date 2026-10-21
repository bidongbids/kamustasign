import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { loadAlphabet, type Alphabet } from "../ml/modelLoader";
import * as tf from "@tensorflow/tfjs";
import { colors, fonts, spacing, typography } from "../theme/theme";
import { neuInset, neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";
import GlassCard from "../components/GlassCard";
import CameraDevice from "../components/CameraDevice";
import ConfidenceDial from "../components/ConfidenceDial";
import HandednessPicker, { useHandedness, mirrorFlatLandmarks } from "../components/HandednessPicker";
import HoldDurationControl, { useHoldDuration } from "../components/HoldDurationControl";
import TranslatorPanel from "../components/TranslatorPanel";
import { BackspaceIcon, CheckIcon, ClockIcon, EyeIcon, HandIcon, SpeakerIcon } from "../components/icons/UiIcons";
import { useReduceMotion } from "../hooks/useReduceMotion";
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
   * / error). The confidence dial, commit speed, holding meter and reading
   * strip are not rendered; PracticeScreen draws the target, stars and
   * feedback itself. Same component, same camera + MediaPipe lifecycle - not
   * a fork. Default "full" is the translator as before.
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
};

export default function LiveTranslatorScreen({
  targetLanguage,
  getCameraStream,
  createHandLandmarker,
  releaseLandmarker,
  alphabet = "letters",
  targetSign,
  onPracticeResult,
  variant = "full",
  onHoldProgress,
  onRetry,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // The desktop and mobile layouts render CameraDevice in different tree
  // positions, so crossing the breakpoint mounts a fresh, empty <video>.
  // Kept here so the effect below the camera setup can re-attach to it.
  const streamRef = useRef<MediaStream | null>(null);
  // Held in refs, not state, so the frame loop reads the current classifier
  // without the camera effect needing to re-run when the alphabet changes.
  const modelRef = useRef<any>(null);
  const classesRef = useRef<string[]>([]);
  const [prediction, setPrediction] = useState("-");
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState("Starting...");
  const [handDetected, setHandDetected] = useState(false);
  const [landmarkCount, setLandmarkCount] = useState(0);

  const { isDesktop } = useResponsive();
  const languageName = findLanguage(targetLanguage)?.name ?? "English";

  const [accumulatedWord, setAccumulatedWord] = useState<string[]>([]);
  // "Show to someone": the word full-screen, big enough to read across a desk.
  const [showBig, setShowBig] = useState(false);
  const reduceMotion = useReduceMotion();
  // Visual confirmation for every added letter (there is no sound cue): the
  // newest tile pops in.
  const letterPop = useRef(new Animated.Value(1)).current;
  const prevWordLength = useRef(0);
  useEffect(() => {
    if (accumulatedWord.length > prevWordLength.current && !reduceMotion) {
      letterPop.setValue(0.55);
      Animated.spring(letterPop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
    }
    prevWordLength.current = accumulatedWord.length;
  }, [accumulatedWord.length, reduceMotion, letterPop]);
  const lastCommittedRef = useRef<string>("");
  const holdLabelRef = useRef<string | null>(null);
  const holdStartRef = useRef<number>(0);
  // Drives the desktop instrument panel's "Holding" meter (control strip
  // cell 3) - a live readout of how long the current candidate letter has
  // held above COMMIT_THRESHOLD, not a transition, so it's a plain state
  // value updated every frame rather than an Animated value.
  const [heldMs, setHeldMs] = useState(0);
  // Desktop only: how many committed-letter tiles fit in the reading strip
  // at its current bay width, measured via onLayout (see JSX below) instead
  // of hardcoded, per the handoff ("compute N from the bay width - do not
  // wrap and do not shrink the tiles").
  const [stripWidth, setStripWidth] = useState(0);

  const { speak, status: speechStatus } = useTranslateAndSpeak(targetLanguage);

  // The detection loop below is set up once (empty-deps mount effect) and
  // runs as a long-lived requestAnimationFrame recursion, so it can't just
  // close over `handedness` - that would freeze it at whatever the value
  // was on mount. Mirroring the recordingRef pattern already used here:
  // keep a ref in sync with the state so the loop always reads the current
  // value without needing to tear down and restart the camera/model setup
  // every time the user flips the toggle.
  const [handedness, setHandedness] = useHandedness();
  const handednessRef = useRef(handedness);
  useEffect(() => {
    handednessRef.current = handedness;
  }, [handedness]);

  // Practice mode state, read by the mount-once frame loop (same ref pattern
  // as handedness above). `best` is the target's best confidence (0-1).
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

  const [holdDuration, setHoldDuration] = useHoldDuration();
  const holdDurationRef = useRef(holdDuration);
  useEffect(() => {
    holdDurationRef.current = holdDuration;
  }, [holdDuration]);

  // Swap the classifier when the Letters/Numbers toggle changes. Deliberately
  // separate from the camera effect below: the camera, the MediaPipe graph and
  // the stream all stay exactly as they are, and only the model behind the
  // predictions changes. Clears the current reading so a stale letter doesn't
  // sit on screen while the new model loads.
  useEffect(() => {
    let cancelled = false;
    modelRef.current = null;
    setPrediction("-");
    setConfidence(0);

    loadAlphabet(alphabet)
      .then(({ model, classes }) => {
        if (cancelled) return;
        modelRef.current = model;
        classesRef.current = classes;
        trace(`${alphabet} model ready (${classes.length} classes)`);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setStatus(`ERROR loading ${alphabet} model: ${err?.message ?? err}`);
      });

    return () => {
      cancelled = true;
    };
  }, [alphabet]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setStatus("Live translator currently supports web only.");
      return;
    }

    let handLandmarker: any = null;
    let animationId: number | null = null;
    let stream: MediaStream | null = null;
    let stopped = false;

    async function setup() {
      trace("setup() start; videoRef present?", !!videoRef.current);
      // The model is NOT loaded here. It lives in modelRef, loaded by the
      // alphabet effect below, so switching Letters <-> Numbers swaps the
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
          // Crossing the breakpoint mid-play() removes this <video> and
          // aborts its play(); the re-attach effect plays the new one, and
          // loop() reads videoRef.current, so that's not a setup failure.
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

    function loop() {
      if (stopped || !handLandmarker || !videoRef.current) return;
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

      if (video.readyState >= 2) {
        const result = handLandmarker.detectForVideo(video, nowMs);

        let ctx: CanvasRenderingContext2D | null = null;
        if (canvas) {
          ctx = canvas.getContext("2d");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (result.landmarks && result.landmarks.length > 0) {
          const landmarks = result.landmarks[0];
          setHandDetected(true);
          setLandmarkCount(landmarks.length);

          if (ctx) {
            drawHandSkeleton(ctx, canvas!, landmarks);
          }

          let flat: number[] = [];
          for (const lm of landmarks) {
            flat.push(lm.x, lm.y, lm.z);
          }
          // Model was trained on right-handed signing - a left hand signing
          // the same letter produces mirrored landmarks (see
          // HandednessPicker.tsx), so undo that mirror before classifying.
          if (handednessRef.current === "left") {
            flat = mirrorFlatLandmarks(flat);
          }

          const inputTensor = tf.tensor2d([flat], [1, 63]);
          const outputTensor = modelRef.current.predict(inputTensor);
          outputTensor.data().then((data: any) => {
            const arr = Array.from(data) as number[];
            const maxIndex = arr.indexOf(Math.max(...arr));
            const label = classesRef.current[maxIndex] ?? "?";
            const pct = arr[maxIndex] * 100;
            setPrediction(label);
            setConfidence(pct);
            trackPractice(label, arr[maxIndex], nowMs);

            if (pct >= COMMIT_THRESHOLD && label !== "-") {
              if (label !== holdLabelRef.current) {
                // New candidate label - start timing its hold instead of
                // committing immediately.
                holdLabelRef.current = label;
                holdStartRef.current = nowMs;
                setHeldMs(0);
              } else if (
                nowMs - holdStartRef.current >= holdDurationRef.current &&
                label !== lastCommittedRef.current
              ) {
                lastCommittedRef.current = label;
                setHeldMs(nowMs - holdStartRef.current);
                if (label === "del") {
                  setAccumulatedWord((prev) => prev.slice(0, -1));
                } else if (label === "space") {
                  setAccumulatedWord((prev) => [...prev, " "]);
                } else {
                  setAccumulatedWord((prev) => [...prev, label]);
                }
              } else {
                setHeldMs(nowMs - holdStartRef.current);
              }
            } else {
              holdLabelRef.current = null;
              setHeldMs(0);
            }
          });
          inputTensor.dispose();
          outputTensor.dispose();
        } else {
          setPrediction("-");
          setConfidence(0);
          setHandDetected(false);
          lastCommittedRef.current = "";
          holdLabelRef.current = null;
          setHeldMs(0);
          const hold = practiceRef.current.handLost();
          if (targetSignRef.current) reportHold(hold);
        }
      }

      animationId = requestAnimationFrame(loop);
    }

    trace("MOUNT");
    setup().catch((err) => {
      trace("setup() THREW:", err);
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
  }, []);

  // setup() attaches the stream once; after a breakpoint crossing swaps in a
  // new <video> (see streamRef), attach it again or the panel stays black.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
  }, [isDesktop, variant]);

  function handleBackspace() {
    setAccumulatedWord((prev) => prev.slice(0, -1));
    lastCommittedRef.current = "";
  }

  // Clear vs. backspace - the distinction matters (design handoff): backspace
  // removes the last committed letter, Clear empties the whole strip and
  // starts a new word. Desktop-only control (control-strip / bay-3 action).
  function handleClear() {
    setAccumulatedWord([]);
    lastCommittedRef.current = "";
    holdLabelRef.current = null;
    setHeldMs(0);
  }

  function handleSpeak() {
    const word = accumulatedWord.join("");
    if (word) speak(word);
  }

  // Space between words without a sign; also re-arms the last letter so a
  // word can start with the letter that ended the previous one.
  function handleSpace() {
    setAccumulatedWord((prev) => (prev.length && prev[prev.length - 1] !== " " ? [...prev, " "] : prev));
    lastCommittedRef.current = "";
  }

  // Keyboard shortcuts (web, full translator only): Backspace deletes the last
  // letter, Escape clears (or closes the big view), Enter speaks.
  useEffect(() => {
    if (Platform.OS !== "web" || variant !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Escape") {
        if (showBig) setShowBig(false);
        else handleClear();
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

  const ready = status === "Running.";
  const bottomShelfText = isDesktop ? `30 FPS · ${ready ? "MODEL READY" : "LOADING"}` : `30 FPS · ${ready ? "READY" : "LOADING"}`;
  const translationTag =
    speechStatus === "translating" ? "translating…" : speechStatus === "speaking" ? "speaking…" : "ready";

  const displayedLetters = isDesktop ? accumulatedWord : accumulatedWord.slice(-3);
  const wordText = accumulatedWord.join("");

  // --- What's happening right now, in words (nothing here relies on sound) ---
  const camError = status.startsWith("ERROR");
  const aboveThreshold = handDetected && confidence >= COMMIT_THRESHOLD;
  const heldFrac = aboveThreshold && holdDuration > 0 ? Math.min(1, heldMs / holdDuration) : 0;
  const nameOf = (l: string) => (l === "space" ? "space" : l === "del" ? "delete" : l);
  const committedNow = aboveThreshold && heldFrac >= 1 && prediction === lastCommittedRef.current;
  const liveState: { text: string; sub?: string; chip: string; tone: "neutral" | "gold" | "success" } = !ready
    ? { text: camError ? "The camera isn't working." : "Getting the camera ready…", chip: "Starting", tone: "neutral" }
    : !handDetected
      ? { text: "Show your hand to the camera.", sub: "Keep it inside the box.", chip: "No hand", tone: "neutral" }
      : !aboveThreshold
        ? { text: "Not sure yet.", sub: "Make the handshape clearer and hold it still.", chip: "Not sure", tone: "neutral" }
        : committedNow
          ? {
              text: `Added “${nameOf(prediction)}”. Sign the next letter.`,
              sub: "To repeat it (like LL), lower your hand, then sign it again.",
              chip: "Added",
              tone: "success",
            }
          : { text: `Hold still… adding “${nameOf(prediction)}”.`, chip: "Hold still", tone: "gold" };
  const sureWord =
    !handDetected ? "No hand" : confidence >= 80 ? "Sure" : confidence >= COMMIT_THRESHOLD ? "Almost sure" : "Not sure";
  const toneColor = liveState.tone === "success" ? colors.success : liveState.tone === "gold" ? colors.accentCoral : colors.textSecondary;
  const speakText =
    speechStatus === "speaking" ? "Speaking…" : speechStatus === "translating" ? "Translating…" : "Speak it aloud";
  const glyph = !handDetected || prediction === "-" ? "?" : nameOf(prediction);

  const showBigModal = (
    <Modal visible={showBig} transparent animationType={reduceMotion ? "none" : "fade"} onRequestClose={() => setShowBig(false)}>
      <Pressable style={styles.bigScrim} onPress={() => setShowBig(false)} accessibilityLabel="Close big view">
        <Text
          style={[styles.bigText, { fontSize: Math.max(48, Math.min(220, 1500 / Math.max(wordText.length, 1))) }]}
          accessibilityRole="header"
        >
          {wordText}
        </Text>
        <Text style={styles.bigHint}>Tap anywhere to close</Text>
      </Pressable>
    </Modal>
  );

  // Camera overlay: the hand box tells you where to sign, turns gold while a
  // letter is holding and green the moment it's added; camera loading /
  // error states are shown on the feed itself.
  const overlays = (
    <PracticeCameraOverlay
      audience="general"
      phase={camError ? "error" : ready ? "live" : "loading"}
      handSeen={handDetected}
      hold={heldFrac}
      holdLabel="Hold still…"
      doneLabel="Added!"
    />
  );

  const cameraDevice = (
    <CameraDevice
      isDesktop={isDesktop}
      videoRef={videoRef}
      canvasRef={canvasRef}
      ledColor={colors.success}
      statusText={bottomShelfText}
      mobileScreenHeight={340}
      overlays={overlays}
      style={isDesktop ? styles.cameraDesktopSize : styles.cameraMobile}
    />
  );

  const translationPanel = (
    <GlassCard
      radius={isDesktop ? 22 : 20}
      padding={isDesktop ? 20 : 16}
      style={isDesktop ? styles.translationPanel : styles.mobilePanel}
    >
      <Text style={[typography.meta, styles.eyebrow]}>TRANSLATION</Text>
      <Text
        style={[typography.h2, styles.translationText, { fontSize: isDesktop ? 24 : 20 }]}
        numberOfLines={1}
      >
        {wordText ? `“${wordText}”` : "Spell a word with your hand"}
      </Text>
      <Text style={styles.translationMeta}>
        {languageName} · {translationTag}
      </Text>
    </GlassCard>
  );

  const recognizedPanel = (
    <GlassCard radius={isDesktop ? 22 : 20} padding={isDesktop ? 16 : 18} style={isDesktop ? undefined : styles.mobilePanel}>
      {isDesktop && <Text style={[typography.meta, styles.eyebrow]}>RECOGNIZED</Text>}
      <View style={[styles.recognizedRow, { gap: isDesktop ? 16 : 18, marginTop: isDesktop ? 8 : 0 }]}>
        <View
          style={[
            isDesktop ? styles.letterTileDesktop : styles.letterTileMobile,
            { backgroundColor: colors.neuBase },
            neuRaised("lg"),
          ]}
        >
          <Text style={[typography.hero, { fontSize: isDesktop ? 50 : 44, lineHeight: isDesktop ? 50 : 44, color: colors.textPrimary }]}>
            {prediction}
          </Text>
        </View>
        <ConfidenceDial
          size={isDesktop ? 92 : 80}
          percent={confidence}
          pctSize={isDesktop ? 22 : 20}
          metaSize={isDesktop ? 8.5 : 7}
        />
      </View>

      {!isDesktop && (
        <Text style={[styles.liveStateMobile, { color: liveState.tone === "neutral" ? colors.textPrimary : toneColor }]}>
          {liveState.text}
        </Text>
      )}
      {isDesktop && <View style={styles.divider} />}

      <View style={isDesktop ? undefined : styles.readingRowMobile}>
        <Text style={[typography.bodySm, styles.readingLabel, !isDesktop && { marginBottom: 0, marginRight: 8 }]}>
          {isDesktop ? "Reading:" : "Reading"}
        </Text>
        <View style={styles.tileStrip}>
          {displayedLetters.length === 0 ? (
            <Text style={styles.tileStripEmpty}>—</Text>
          ) : (
            displayedLetters.map((letter, i) => {
              const isNewest = i === displayedLetters.length - 1;
              const w = isDesktop ? 26 : 20;
              const h = isDesktop ? 26 : 26;
              return (
                <View
                  key={`${letter}-${i}`}
                  style={[
                    styles.letterChip,
                    { width: w, height: h, borderRadius: isDesktop ? 8 : 6, backgroundColor: isNewest ? colors.surfaceElevated : colors.neuWell },
                    isNewest ? neuRaised("sm") : neuInset("sm"),
                  ]}
                >
                  <Text style={[typography.label, { fontSize: isDesktop ? 14 : 12, color: isNewest ? colors.accentCoral : colors.adminGray }]}>
                    {letter}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </View>
    </GlassCard>
  );

  const signingHandPanel = (
    <GlassCard radius={isDesktop ? 22 : 20} padding={isDesktop ? 14 : 14} style={isDesktop ? undefined : styles.mobilePanel} contentStyle={!isDesktop && styles.signingHandContentMobile}>
      {isDesktop ? (
        <>
          <View style={styles.signingHandHeader}>
            <Text style={[typography.meta, styles.eyebrow]}>SIGNING HAND</Text>
            <Text style={styles.affectsAccuracy}>affects accuracy</Text>
          </View>
          <HandednessPicker value={handedness} onChange={setHandedness} />
          <Text style={[typography.caption, styles.reasonLine]} numberOfLines={1}>
            The model was trained right-hand dominant. Flip this and we mirror the landmarks for you.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.signingHandTextMobile}>
            <Text style={styles.signingHandLabelMobile}>Signing hand</Text>
            <Text style={styles.signingHandHintMobile}>Left-handed? Flip it.</Text>
          </View>
          <HandednessPicker value={handedness} onChange={setHandedness} compact />
        </>
      )}
    </GlassCard>
  );

  const holdDurationPanel = (
    <GlassCard radius={isDesktop ? 22 : 20} padding={isDesktop ? 14 : 14} style={isDesktop ? undefined : styles.mobilePanel} contentStyle={!isDesktop && styles.signingHandContentMobile}>
      {isDesktop ? (
        <>
          <View style={styles.signingHandHeader}>
            <Text style={[typography.meta, styles.eyebrow]}>COMMIT SPEED</Text>
            <Text style={styles.affectsAccuracy}>{holdDuration}ms hold</Text>
          </View>
          <HoldDurationControl value={holdDuration} onChange={setHoldDuration} />
          <Text style={[typography.caption, styles.reasonLine]} numberOfLines={1}>
            How long a sign must hold steady before it's logged. Higher = fewer accidental letters.
          </Text>
        </>
      ) : (
        <>
          <View style={styles.signingHandTextMobile}>
            <Text style={styles.signingHandLabelMobile}>Commit speed</Text>
            <Text style={styles.signingHandHintMobile}>Unsure signs? Slow it down.</Text>
          </View>
          <HoldDurationControl value={holdDuration} onChange={setHoldDuration} compact />
        </>
      )}
    </GlassCard>
  );

  const actionRow = (
    <View style={[styles.actionRow, isDesktop ? { marginTop: "auto" as any } : styles.actionRowMobile]}>
      <Pressable
        onPress={handleSpeak}
        style={[styles.speakButton, { height: isDesktop ? 46 : 56, backgroundColor: colors.neuBase }, neuRaised("md")]}
        accessibilityRole="button"
        accessibilityLabel="Speak the accumulated word"
      >
        <Text style={[typography.label, styles.speakLabel]}>{speakText}</Text>
      </Pressable>
      <Pressable
        onPress={() => setShowBig(true)}
        disabled={!wordText}
        style={[
          styles.backspaceButton,
          { width: isDesktop ? 46 : 56, height: isDesktop ? 46 : 56, backgroundColor: colors.neuBase, opacity: wordText ? 1 : 0.45 },
          neuRaised("md"),
        ]}
        accessibilityRole="button"
        accessibilityLabel="Show the word big"
      >
        <EyeIcon size={20} color={colors.textSecondary} />
      </Pressable>
      <Pressable
        onPress={handleBackspace}
        style={[
          styles.backspaceButton,
          { width: isDesktop ? 46 : 56, height: isDesktop ? 46 : 56, backgroundColor: colors.neuBase },
          neuRaised("md"),
        ]}
        accessibilityRole="button"
        accessibilityLabel="Delete last letter"
      >
        <BackspaceIcon size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  if (variant === "practice") {
    const cameraError = status.startsWith("ERROR");
    return (
      <View style={styles.practiceRoot}>
        <CameraDevice
          isDesktop
          videoRef={videoRef}
          canvasRef={canvasRef}
          ledColor={cameraError ? colors.needsPractice : ready ? colors.success : colors.accentCoral}
          statusText={cameraError ? "CAMERA OFF" : ready ? "30 FPS · READY" : "STARTING"}
          overlays={
            <PracticeCameraOverlay
              phase={cameraError ? "error" : ready ? "live" : "loading"}
              handSeen={handDetected}
              hold={practiceHold}
              onRetry={onRetry}
            />
          }
          style={styles.practiceCamera}
        />
      </View>
    );
  }

  if (isDesktop) {
    // Reading strip: fit as many committed-letter tiles as the measured bay
    // width allows (tile 36 + gap 7), newest last - never wrap, never shrink
    // the tiles (handoff: "compute N from the bay width").
    const fitCount = stripWidth > 0 ? Math.max(1, Math.floor((stripWidth + 8) / 52)) : accumulatedWord.length;
    const stripLetters = accumulatedWord.slice(-fitCount);
    const heldMsClamped = Math.min(heldMs, holdDuration);
    const heldFraction = holdDuration > 0 ? Math.min(1, heldMsClamped / holdDuration) : 0;
    const RING = 188;
    const ringR = 90;
    const ringC = 2 * Math.PI * ringR;

    const bay2 = (
      <View style={styles.bay2Column}>
        <View style={styles.bay2Header}>
          <Text style={[typography.meta, styles.eyebrowBright]}>RECOGNIZED</Text>
          <View
            style={[
              styles.stateChip,
              {
                backgroundColor:
                  liveState.tone === "success" ? "rgba(63,181,106,0.16)" : liveState.tone === "gold" ? "rgba(242,178,62,0.16)" : colors.neuWell,
              },
            ]}
          >
            <View style={[styles.stateDot, { backgroundColor: toneColor }]} />
            <Text style={[styles.stateChipText, { color: liveState.tone === "neutral" ? colors.textSecondary : toneColor }]}>
              {liveState.chip}
            </Text>
          </View>
        </View>
        <View style={[styles.recognizedRow, { gap: 22, marginTop: 14 }]}>
          <View style={{ width: RING, height: RING, alignItems: "center", justifyContent: "center" }}>
            <View style={[styles.letterTileBig, { backgroundColor: colors.neuBase }, neuRaised("lg")]}>
              <Text
                style={[
                  styles.letterGlyphBig,
                  glyph.length > 1 && { fontSize: 34, lineHeight: 40 },
                  glyph === "?" && { color: colors.textTertiary },
                  committedNow && { color: colors.success },
                ]}
                accessibilityLabel={glyph === "?" ? "No letter yet" : `Recognized ${glyph}`}
              >
                {glyph}
              </Text>
            </View>
            {/* Hold ring: fills while the letter holds steady; full = added. */}
            <Svg width={RING} height={RING} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Circle cx={RING / 2} cy={RING / 2} r={ringR} fill="none" stroke={colors.holdTrack} strokeWidth={6} />
              {heldFrac > 0 && (
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={ringR}
                  fill="none"
                  stroke={committedNow ? colors.success : colors.accentCoral}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeDasharray={`${ringC} ${ringC}`}
                  strokeDashoffset={ringC * (1 - heldFrac)}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              )}
            </Svg>
          </View>
          <View style={{ alignItems: "center", gap: 6 }}>
            <ConfidenceDial size={160} percent={confidence} pctSize={36} metaSize={9} />
            <Text style={styles.sureWord}>{sureWord}</Text>
          </View>
        </View>
        <Text style={[styles.liveStateText, liveState.tone !== "neutral" && { color: toneColor }]}>{liveState.text}</Text>
        {liveState.sub ? <Text style={styles.liveStateSub}>{liveState.sub}</Text> : null}
        <View style={styles.bay2Rule} />
        <View style={styles.readingRow}>
          <Text style={[typography.meta, styles.eyebrowBright]}>YOUR WORD</Text>
          <Text style={styles.readingCountText}>
            {accumulatedWord.filter((l) => l !== " ").length} letter{accumulatedWord.filter((l) => l !== " ").length === 1 ? "" : "s"}
          </Text>
        </View>
        <View style={styles.tileStripDesktop} onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}>
          {stripLetters.length === 0 ? (
            <View style={styles.wordEmpty}>
              <Text style={styles.wordEmptyText}>Your word builds here, one letter at a time.</Text>
            </View>
          ) : (
            stripLetters.map((letter, i) => {
              const isNewest = i === stripLetters.length - 1;
              const chip = (
                <View
                  style={[
                    styles.letterChipBig,
                    { backgroundColor: isNewest ? colors.surfaceElevated : colors.neuWell },
                    isNewest ? neuRaised("sm") : neuInset("sm"),
                    letter === " " && styles.spaceChip,
                  ]}
                >
                  <Text style={[styles.letterChipLabel, { color: isNewest ? colors.accentCoral : colors.textPrimary }]}>
                    {letter === " " ? "" : letter}
                  </Text>
                </View>
              );
              return isNewest ? (
                <Animated.View key={`${letter}-${i}`} style={{ transform: [{ scale: letterPop }] }}>
                  {chip}
                </Animated.View>
              ) : (
                <View key={`${letter}-${i}`}>{chip}</View>
              );
            })
          )}
        </View>
      </View>
    );

    const signingHandCell = (
      <View style={styles.stripCellFlex}>
        <View style={styles.stripCellHeader}>
          <Text style={[typography.meta, styles.eyebrow]}>SIGNING HAND</Text>
          <Text style={styles.stripCellAccent}>affects accuracy</Text>
        </View>
        <HandednessPicker value={handedness} onChange={setHandedness} />
      </View>
    );

    const commitSpeedCell = (
      <View style={styles.stripCellFlex}>
        <View style={styles.stripCellHeader}>
          <Text style={[typography.meta, styles.eyebrow]}>COMMIT SPEED</Text>
          <Text style={styles.stripCellAccent}>{holdDuration}ms hold</Text>
        </View>
        <HoldDurationControl value={holdDuration} onChange={setHoldDuration} />
      </View>
    );

    const holdingMeterCell = (
      <View style={styles.holdingCell}>
        <Text style={[typography.meta, styles.eyebrow, { marginBottom: 8 }]}>
          HOLD PROGRESS · {Math.round(heldMsClamped)} / {holdDuration} ms
        </Text>
        <View style={styles.holdingWell}>
          <View style={styles.holdingTrough}>
            <LinearGradient
              colors={["#5A50A8", "#7C6CF5"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.holdingFill, { width: `${Math.round(heldFraction * 100)}%` }]}
            />
          </View>
          <Text style={styles.holdingPct}>{Math.round(heldFraction * 100)}%</Text>
        </View>
      </View>
    );

    const actionsRow = (
      <View style={{ gap: 12 }}>
        <Pressable
          onPress={() => setShowBig(true)}
          disabled={!wordText}
          style={[styles.showButton, !wordText && { opacity: 0.45 }]}
          accessibilityRole="button"
          accessibilityLabel="Show the word big, to show someone"
        >
          <EyeIcon size={18} color={colors.textPrimary} />
          <Text style={styles.clearLabel}>Show to someone</Text>
        </Pressable>
        <View style={styles.actionsRowDesktop}>
          <Pressable onPress={handleSpace} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Add a space">
            <Text style={styles.clearLabel}>Space</Text>
          </Pressable>
          <Pressable
            onPress={handleClear}
            style={styles.clearButton}
            accessibilityRole="button"
            accessibilityLabel="Clear all letters"
          >
            <Text style={styles.clearLabel}>Clear</Text>
          </Pressable>
          <Pressable
            onPress={handleBackspace}
            style={[styles.backspaceButtonDesktop, { backgroundColor: colors.neuBase }, neuRaised("md")]}
            accessibilityRole="button"
            accessibilityLabel="Delete last letter"
          >
            <BackspaceIcon size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    );

    const guide = (
      <View style={styles.guide}>
        {[
          { icon: <HandIcon size={16} color={colors.tipAccent} />, text: "Sign one letter at a time." },
          { icon: <ClockIcon size={16} color={colors.accentCoral} />, text: "Hold still until the ring fills. Then the letter is added." },
          { icon: <CheckIcon size={16} color={colors.success} strokeWidth={2.6} />, text: "To repeat a letter, lower your hand first." },
        ].map((step, i) => (
          <View key={i} style={styles.guideRow}>
            <View style={[styles.guideIcon, neuInset("sm")]}>{step.icon}</View>
            <Text style={styles.guideText}>{step.text}</Text>
          </View>
        ))}
        <Text style={styles.keysHint}>Keys: Backspace deletes · Esc clears · Enter speaks</Text>
      </View>
    );

    return (
      <View style={styles.instrumentBody}>
        <TranslatorPanel
          cameraDevice={
            <CameraDevice
              isDesktop
              videoRef={videoRef}
              canvasRef={canvasRef}
              ledColor={colors.success}
              statusText={bottomShelfText}
              overlays={overlays}
              style={styles.cameraDesktopSize}
            />
          }
          bay2={bay2}
          translationText={wordText}
          placeholder="Spell a word with your hand. It shows up here."
          helperContent={guide}
          speakLabel={speakText}
          speakIcon={<SpeakerIcon size={16} color={colors.textOnAccent} />}
          statusLabel={`${languageName} · ${translationTag}`}
          helperText="Letters commit to the strip once they hold steady, then translate as a word. Clear empties the strip and starts a new word."
          onSpeak={handleSpeak}
          speakDisabled={!wordText}
          actionsRow={actionsRow}
          stripCells={[signingHandCell, commitSpeedCell, holdingMeterCell]}
        />
        {showBigModal}
      </View>
    );
  }

  return (
    <ScrollView style={styles.bodyMobile} contentContainerStyle={styles.mobileScrollContent}>
      {cameraDevice}
      <View style={styles.mobileStack}>
        {translationPanel}
        {recognizedPanel}
        {signingHandPanel}
        {holdDurationPanel}
        {actionRow}
      </View>
      {showBigModal}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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

  // Desktop root: fills the hub's body. TranslatorPanel measures this
  // exact space itself (onLayout) and scales its fixed 1600x706 layout down
  // to fit + centers it - so this must STRETCH to fill available space
  // (default alignItems), not shrink-center around undersized content,
  // or the measurement TranslatorPanel reads back would be wrong. Kept
  // local to this screen rather than on the hub's shared body style, since
  // the mobile ScrollView below must keep its own full-width stretch too.
  instrumentBody: {
    flex: 1,
    minHeight: 0,
    padding: spacing.md,
  },
  cameraDesktopSize: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    // Bay-1 device size (instrument panel handoff): 540x398 total housing
    // so a 12px padding on all sides yields exactly the spec's 516x326
    // usable feed area.
    width: 540,
    height: 398,
  },
  translationPanel: {
    width: 480,
  },
  translationText: {
    color: colors.textPrimary,
    marginTop: 6,
    marginBottom: 4,
  },
  translationMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  bodyMobile: {
    flex: 1,
  },
  mobileScrollContent: {
    flexGrow: 1,
  },
  cameraMobile: {
    marginHorizontal: 16,
  },
  mobileStack: {
    padding: 16,
    gap: 14,
  },
  mobilePanel: {
    width: "100%",
  },

  eyebrow: {
    color: colors.textTertiary,
  },
  recognizedRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  letterTileDesktop: {
    width: 92,
    height: 92,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  letterTileMobile: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginVertical: 10,
  },
  readingLabel: {
    color: colors.textSecondary,
    marginBottom: 8,
  },
  readingRowMobile: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  tileStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    flexShrink: 1,
  },
  tileStripEmpty: {
    ...typography.bodySm,
    color: colors.textTertiary,
  },
  letterChip: {
    alignItems: "center",
    justifyContent: "center",
  },

  signingHandHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  affectsAccuracy: {
    ...typography.caption,
    fontSize: 10,
    color: colors.accentCoral,
  },
  reasonLine: {
    color: colors.textSecondary,
    marginTop: 8,
  },
  signingHandContentMobile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  signingHandTextMobile: {
    flex: 1,
    minWidth: 0,
  },
  signingHandLabelMobile: {
    ...typography.labelSm,
    color: colors.textPrimary,
  },
  signingHandHintMobile: {
    fontFamily: typography.body.fontFamily,
    fontSize: 10.5,
    color: colors.textSecondary,
    marginTop: 2,
  },

  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionRowMobile: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  speakButton: {
    flex: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  speakLabel: {
    color: colors.textPrimary,
  },
  backspaceButton: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  badge: {
    position: "absolute",
    backgroundColor: "rgba(124,108,245,0.9)",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeText: {
    fontFamily: typography.labelSm.fontFamily,
    fontSize: 10,
    color: "#FFFFFF",
  },

  // --- Desktop instrument-panel bay 2 (Recognized) ---
  bay2Header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  eyebrowBright: { color: colors.textSecondary },
  stateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  stateChipText: { fontFamily: typography.label.fontFamily, fontSize: 13 },
  sureWord: { fontFamily: typography.label.fontFamily, fontSize: 14, color: colors.textSecondary },
  liveStateText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 26,
    color: colors.textPrimary,
    marginTop: 16,
  },
  liveStateSub: { fontFamily: typography.body.fontFamily, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 2 },
  liveStateMobile: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, marginTop: 10 },
  wordEmpty: {
    flex: 1,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  wordEmptyText: { fontFamily: typography.body.fontFamily, fontSize: 14, color: colors.textSecondary },
  spaceChip: { width: 22, opacity: 0.6 },
  showButton: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  guide: { gap: 10 },
  guideRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  guideIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.neuWell,
    alignItems: "center",
    justifyContent: "center",
  },
  guideText: { flex: 1, fontFamily: typography.body.fontFamily, fontSize: 13, lineHeight: 19, color: colors.textPrimary },
  keysHint: { fontFamily: typography.body.fontFamily, fontSize: 11, lineHeight: 16, color: colors.textSecondary, marginTop: 2 },
  bigScrim: {
    flex: 1,
    backgroundColor: "rgba(10,12,16,0.96)",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 24,
  },
  bigText: { fontFamily: typography.hero.fontFamily, color: colors.textPrimary, textAlign: "center" },
  bigHint: { fontFamily: typography.body.fontFamily, fontSize: 16, color: colors.textSecondary },
  bay2Column: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  letterTileBig: {
    width: 168,
    height: 168,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  letterGlyphBig: {
    fontFamily: typography.hero.fontFamily,
    fontSize: 92,
    lineHeight: 92,
    color: colors.textPrimary,
  },
  bay2Rule: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
    marginTop: 18,
    marginBottom: 14,
  },
  readingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  readingRowLabelText: {
    fontFamily: typography.body.fontFamily,
    fontSize: 13,
    color: colors.textSecondary,
  },
  readingCountText: {
    fontFamily: typography.body.fontFamily,
    fontSize: 10,
    color: colors.textTertiary,
  },
  tileStripDesktop: {
    flexDirection: "row",
    gap: 7,
    flexWrap: "nowrap",
    overflow: "hidden",
  },
  letterChipBig: {
    width: 44,
    height: 54,
    borderRadius: 10,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  letterChipLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 24,
  },

  // --- Desktop control-strip cells ---
  stripCellFlex: {
    flex: 1,
    minWidth: 0,
  },
  stripCellHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  stripCellAccent: {
    fontFamily: typography.body.fontFamily,
    fontSize: 10,
    color: colors.accentCoral,
  },
  holdingCell: {
    width: 394,
    flexGrow: 0,
    flexShrink: 0,
  },
  holdingWell: {
    height: 50,
    borderRadius: 15,
    backgroundColor: colors.neuWell,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  holdingTrough: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#171B22",
    overflow: "hidden",
  },
  holdingFill: {
    height: "100%",
    borderRadius: 5,
  },
  holdingPct: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },

  // --- Desktop bay-3 actions (Clear / Backspace) ---
  actionsRowDesktop: {
    flexDirection: "row",
    gap: 12,
  },
  clearButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  clearLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 14,
    color: colors.textPrimary,
  },
  backspaceButtonDesktop: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
