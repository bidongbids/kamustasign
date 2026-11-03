// Word Translator ("Words" mode): sign a word (hands-free, or Record/Stop) ->
// classify -> ranked top-5 word predictions -> auto-translate and speak in
// the standing target language.
//
// Layout: the Letters / Numbers design (docs/design/
// design_handoff_translator_fingerspelling) applied to Words. Desktop: the
// camera is the hero in the slim housing, its status on the video; the right
// column holds "Now signing" (the Record button, or the hands-free light,
// with one sentence of what to do) and the top match (big, with confidence,
// translation, the other matches and Speak / Show to someone / Clear).
// Below 1100 wide: the phone stack with a bottom bar. The camera sits at the
// same place in the tree in both layouts, so the <video> never remounts.
// TranslatorHubScreen owns the header, the tabs and Auto / Manual.
// variant="practice" is the classroom's and keeps its own layout.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as tf from "@tensorflow/tfjs";
import { loadWordModels, type SignLanguage } from "../ml/modelLoader";
import {
  landmarksToVector,
  trimToHandSpan,
  TRIM_MARGIN,
  ASL_TRIM_MARGIN,
  matchTrainingAspect,
  resampleSequence,
  normalizeSequence,
  SEQUENCE_LENGTH,
  MODEL_FEATURES_PER_FRAME,
} from "../ml/wordLandmarks";
import { frameAspect } from "../ml/handshapeInput";
import { SignSegmenter } from "../ml/signSegmenter";
import { typography, type ThemeColors } from "../theme/theme";
import { useTheme, useThemedStyles, type Theme } from "../theme/ThemeProvider";
import { useResponsive } from "../theme/responsive";
import GlassCard from "../components/GlassCard";
import CameraDevice, { type CameraState } from "../components/CameraDevice";
import { NowSigningCard } from "../components/FingerspellCards";
import { MatchesCard, PhoneMatchCard, RecordDisc, type WordMatch } from "../components/WordCards";
import TranslatorButton from "../components/TranslatorButton";
import ShowToSomeone from "../components/ShowToSomeone";
import { useTranslatorDisplay } from "../components/TranslatorSettings";
import { CloseIcon, ExpandIcon, SpeakerIcon } from "../components/icons/UiIcons";
import { useReduceMotion } from "../hooks/useReduceMotion";
import { findLanguage } from "../lib/languages";
import { signName } from "../lib/signNames";
import { PASS_CONFIDENCE, UNKNOWN_SIGN_LABEL } from "../lib/curriculum";
import { drawHandSkeleton } from "../lib/handSkeleton";
import PracticeCameraOverlay from "../components/learn/PracticeCameraOverlay";
import { useTranslateAndSpeak } from "../hooks/useTranslateAndSpeak";
import { useFpsMeter } from "../hooks/useFpsMeter";

const TOP_K = 5;

// Pose keypoints sit behind the hands, so they are deliberately dimmer and
// cooler than the mint hand skeleton rather than competing with it.
const POSE_DOT = "rgba(154,163,178,0.8)"; // neutral, matches the hand overlay (handSkeleton HAND_NEUTRAL)

// Camera startup tracing. The camera panel has gone black after switching
// between the Letters and Words tabs, with no error surfaced - which means
// setup() is stalling or silently skipping a step rather than throwing. These
// traces mark every await boundary so the console shows exactly how far it
// got. Set to false once the cause is fixed.
const TRACE_CAMERA = false;
const trace = (...args: any[]) => {
  if (TRACE_CAMERA) console.log("[words-cam]", ...args);
};

type Prediction = { word: string; confidence: number };

type Props = {
  targetLanguage: string;
  getCameraStream: () => Promise<MediaStream>;
  createHolisticLandmarker: () => Promise<any>;
  releaseLandmarker: (instance: any) => void;
  /** Which sign language's word model classifies the recording. */
  language?: SignLanguage;
  /**
   * "auto": hands-free - SignSegmenter detects each sign from hand movement
   * and classifies it when the hands settle. "manual": Record/Stop.
   */
  mode?: CaptureMode;
  /** Classroom practice mode: the word the student is trying to sign. */
  targetSign?: string;
  /**
   * Practice mode only: called once per classified clip. `confidence` is the
   * model's probability (0-1) for the TARGET word, whatever it ranked;
   * `passed` means the target was the top match at PASS_CONFIDENCE or more.
   * `predicted` is the top match, or null when nothing cleared MIN_CONFIDENCE.
   */
  onPracticeResult?: (result: { passed: boolean; confidence: number; predicted: string | null }) => void;
  /**
   * "practice": the classroom layout - the camera device plus the record
   * button only (the record button IS the action). The ranked top-5 list,
   * the on-video translation bar and auto-speak are not rendered; the
   * predicted word reaches PracticeScreen through onPracticeResult. Same
   * component and camera lifecycle - not a fork. Default "full".
   */
  variant?: "full" | "practice";
  /** Practice mode: drives the "1 · Press Record → 2 · Sign it → 3 · Press Stop" chips. */
  onRecordingStateChange?: (state: "idle" | "recording" | "classifying") => void;
  /** Practice mode: "Try again" on the camera-error overlay. */
  onRetry?: () => void;
  /** Practice mode: shown to the right of the record button (PracticeScreen's feedback). */
  practiceAside?: React.ReactNode;
  /** Full: the signed-in person's name, for "{name} signed" on the big view. */
  signerName?: string;
};

/** What the last attempt left to say, shown in "Now signing" until the next sign. */
type Notice = "unsure" | "brief" | "short" | "failed" | null;
type Problem = "blocked" | "camera" | "reader" | null;

export type CaptureMode = "auto" | "manual";

// A classification is only shown (and spoken) at or above this ensemble
// confidence, in both modes. Below it the screen shows nothing - no word, no
// runner-up list - just a "not sure" status, and any previous result is
// cleared so it can't be mistaken for the answer to the new sign. On the FSL
// held-out signer, >= 40% answers 86% of signs at 82% accuracy, versus 76%
// when answering everything: a wrong word displayed or spoken costs more
// than a "try again". It's also the guard against movement that isn't a
// sign at all - those rarely produce a confident match.
const MIN_CONFIDENCE = 40;
const AUTO_REPEAT_MS = 2500;

export default function WordTranslatorScreen({
  targetLanguage,
  getCameraStream,
  createHolisticLandmarker,
  releaseLandmarker,
  language = "asl",
  mode = "manual",
  targetSign,
  onPracticeResult,
  variant = "full",
  onRecordingStateChange,
  onRetry,
  practiceAside,
  signerName,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRef = useRef(false);
  const framesRef = useRef<Float32Array[]>([]);

  const { isDesktop, isMobile, width: winW, height: winH } = useResponsive();

  const [status, setStatus] = useState("Starting...");
  // Full layout state: what failed (camera / reader), the retry counter,
  // whether hands are in view, and what the last attempt left to say.
  const [problem, setProblem] = useState<Problem>(null);
  const [attempt, setAttempt] = useState(0);
  const [handsSeen, setHandsSeen] = useState(false);
  const handsSeenRef = useRef(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [showBig, setShowBig] = useState(false);
  const reduceMotion = useReduceMotion();
  const [display] = useTranslatorDisplay();
  const displayRef = useRef(display);
  displayRef.current = display;
  const variantRef = useRef(variant);
  variantRef.current = variant;
  const { fps, tick: fpsTick } = useFpsMeter();
  // The word models load in the background, separately from the camera. The
  // ref mirrors the state so setup()'s async flow can read it without
  // capturing a stale closure value.
  const [modelsReady, setModelsReady] = useState(false);
  const modelsReadyRef = useRef(false);
  useEffect(() => {
    modelsReadyRef.current = modelsReady;
  }, [modelsReady]);

  // Which ensemble classifyBuffer() runs. A ref, not just the prop, because
  // a classification already awaiting must score against the language it
  // was recorded in, and setup()'s loop must never be rebuilt to see it.
  const languageRef = useRef(language);
  languageRef.current = language;

  // Read by loop(), which lives in the mount-once camera effect - so mode
  // changes reach it without rebuilding the camera/landmarker.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const segmenterRef = useRef(new SignSegmenter());
  // Auto mode: a sign is in progress (drives the REC pill / "Reading sign").
  const [segmentActive, setSegmentActive] = useState(false);
  // A segment that finished while the previous one was still classifying.
  // Only the latest is kept: a backlog of stale words is worse than a skip.
  const pendingSegmentRef = useRef<Float32Array[] | null>(null);
  const classifyingRef = useRef(false);
  // Last word auto mode spoke, and when. Lowering the arm after a held sign
  // occasionally reads as a second segment of the SAME word (see rearmMs in
  // signSegmenter.ts); re-speaking it within AUTO_REPEAT_MS would sound like
  // a stutter. Auto-only and time-limited: the Speak button always speaks,
  // and deliberately signing a word twice with a pause still speaks twice.
  const lastAutoSpokenRef = useRef<{ word: string; at: number } | null>(null);

  const readyText = () =>
    modeRef.current === "auto"
      ? "Watching for signs - sign a word, then lower or still your hands."
      : "Ready. Press Record, sign a word, press Stop.";

  useEffect(() => {
    segmenterRef.current.reset();
    pendingSegmentRef.current = null;
    setSegmentActive(false);
    setNotice(null);
    if (mode === "auto" && recordingRef.current) {
      // Switched to Auto mid-recording: drop the manual clip.
      recordingRef.current = false;
      setRecording(false);
      framesRef.current = [];
      setFrameCount(0);
    }
    // Any idle/auto status ("Watching", "Reading sign", "Not sure", "Too
    // brief") belongs to the old mode; only a classification in flight or a
    // load/camera status should survive the switch.
    setStatus((s) =>
      classifyingRef.current || /^(Loading|Camera ready|ERROR|Word model load failed)/.test(s) ? s : readyText()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Start the selected language's ensemble downloading, but do NOT await it
  // in setup(): the models are tens of MB and the camera has no dependency on
  // them, so awaiting meant a black camera panel for the entire download.
  // Keyed on `language` and deliberately separate from the camera effect
  // below, so an ASL<->FSL switch swaps classifiers without remounting the
  // camera or rebuilding the Holistic graph (rebuilding while the old one is
  // tearing down deadlocks MediaPipe's WASM runtime - see
  // useSharedLandmarkers). loadWordModels() caches per language, so switching
  // back is instant and pressing Record early joins the in-flight download.
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    setModelsReady(false);
    setPredictions([]);
    loadWordModels(language)
      .then(() => {
        if (cancelled) return;
        setModelsReady(true);
        // Don't clobber a status the user is actively looking at (mid
        // record/classify); only upgrade the "still downloading" notice.
        setStatus((s) =>
          s.startsWith("Camera ready") ? readyText() : s
        );
      })
      .catch((e: any) => {
        if (cancelled) return;
        setProblem("reader");
        setStatus(`Word model load failed: ${e?.message ?? e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [language, attempt]);
  // The camera preview comes up before the landmarker is built (see setup()),
  // but frames are only captured once loop() is running - so Record stays
  // off until then instead of silently recording an empty or truncated clip.
  const [detectorReady, setDetectorReady] = useState(false);
  // Kept so the effect below can re-attach the shared stream if the <video>
  // is replaced (Practice's grown-up view switches variant).
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [predictions, setPredictions] = useState<Prediction[]>([]);

  const { speak, reset: resetSpeech, status: speechStatus, translatedText, error: speechError } =
    useTranslateAndSpeak(targetLanguage);

  const languageName = findLanguage(targetLanguage)?.name ?? "English";

  useEffect(() => {
    if (Platform.OS !== "web") {
      setStatus("Word translator currently supports web only.");
      return;
    }

    let holisticLandmarker: any = null;
    let animationId: any = null;
    let stream: MediaStream | null = null;
    let stopped = false;
    // Set when getting the camera itself failed (vs. building the reader).
    let cameraFailed = false;

    async function setup() {
      // The word models are NOT loaded here - see the effect keyed on
      // `language` above. setup() owns only the camera and the landmarker.
      trace("setup() start; videoRef present?", !!videoRef.current);

      setStatus("Loading pose/hand detector...");
      // The camera preview has no dependency on the landmarker, so build it
      // and start the camera side by side rather than one after the other.
      // Awaiting the landmarker first meant any stall in its build - like
      // its .task download queueing behind the word-model shards (see
      // drainingFetch in modelLoader.ts) - left a black panel and no error.
      // Promise.all attaches handlers to both up front, so a failure in one
      // can't surface as an unhandled rejection while the other is pending.
      const [landmarker] = await Promise.all([buildLandmarker(), startCamera()]);
      if (stopped || !landmarker) return;

      setDetectorReady(true);
      setStatus(
        modelsReadyRef.current
          ? readyText()
          : "Camera ready - word models still downloading..."
      );
      loop();
    }

    async function buildLandmarker() {
      trace("building holistic landmarker...");
      const landmarker = await createHolisticLandmarker();
      trace("holistic landmarker ready");
      // If we unmounted while this was being created, cleanup already ran
      // with holisticLandmarker still null, so release it here rather than
      // leak it.
      if (stopped) {
        releaseLandmarker(landmarker);
        return null;
      }
      holisticLandmarker = landmarker;
      return landmarker;
    }

    async function startCamera() {
      // The stream is owned by TranslatorHubScreen (see useSharedCameraStream)
      // and shared across tab switches - it is NOT acquired or released here.
      // Releasing and re-requesting the camera in the same tick used to race
      // with the OS/driver actually freeing the device (docs/CAMERA_BUG_HANDOFF.md
      // H1), which is what caused the black panel on the first tab switch.
      trace("awaiting shared camera stream...");
      stream = await getCameraStream().catch((err) => {
        cameraFailed = true;
        throw err;
      });
      trace(
        "camera stream resolved; tracks:",
        stream.getTracks().map((t) => `${t.kind}/${t.readyState}/${t.label}`)
      );
      // If we unmounted while waiting on the camera, just bail - the stream
      // is shared, so it is not ours to stop.
      if (stopped) {
        return;
      }
      // The <video> lives inside CameraDevice. If this ref is somehow null we
      // used to silently skip the attach and carry on to "Ready", leaving a
      // black panel and no error - so wait briefly for it and complain loudly
      // rather than failing quietly.
      let videoEl = videoRef.current;
      for (let i = 0; i < 40 && !videoEl && !stopped; i++) {
        await new Promise((r) => setTimeout(r, 50));
        videoEl = videoRef.current;
      }
      if (stopped) {
        return;
      }
      if (!videoEl) {
        throw new Error("camera element never mounted (videoRef stayed null)");
      }

      trace("attaching stream to <video>");
      streamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play().catch((err) => {
        // Crossing the breakpoint mid-play() removes this <video> and
        // aborts its play(); the re-attach effect plays the new one, and
        // loop() reads videoRef.current, so that's not a setup failure.
        if (err?.name !== "AbortError") throw err;
      });
      trace(
        "play() resolved;",
        `size=${videoEl.videoWidth}x${videoEl.videoHeight}`,
        `readyState=${videoEl.readyState}`,
        `paused=${videoEl.paused}`
      );
      // A stream can attach and play yet still deliver no pixels (0x0, or a
      // track that ends immediately). Re-check shortly after so the console
      // distinguishes "never attached" from "attached but dead".
      setTimeout(() => {
        if (stopped || !videoEl) return;
        trace(
          "1s later:",
          `size=${videoEl.videoWidth}x${videoEl.videoHeight}`,
          `readyState=${videoEl.readyState}`,
          `paused=${videoEl.paused}`,
          `track=${stream?.getVideoTracks()[0]?.readyState}`
        );
      }, 1000);
    }

    function loop() {
      if (stopped || !holisticLandmarker || !videoRef.current) return;

      const video = videoRef.current;

      // Tracking runs in a worker (see lib/holisticTracker) and takes longer
      // than one camera frame, so frames that arrive while one is being
      // tracked are skipped. fpsTick is false while the camera is still on
      // the frame we last took (see useFpsMeter) - nothing new to detect.
      if (!holisticLandmarker.busy && video.readyState >= 2 && fpsTick(video)) {
        // Detection runs on the RAW (unmirrored) video frame - the preview
        // is mirrored purely via CSS (see CameraDevice's videoStyle), same
        // as the alphabet screen. Feeding a visually-flipped frame into the
        // detector would be a real train/inference mismatch, not just a
        // cosmetic choice, since the training videos were not mirrored.
        // Timestamps use performance.now() (matching LiveTranslatorScreen)
        // rather than a locally incremented counter: MediaPipe requires
        // them to strictly increase across a landmarker's whole lifetime.
        // The frame's capture time is also what the segmenter is given.
        const capturedAt = performance.now();
        holisticLandmarker
          .detect(video, capturedAt)
          ?.then((result: any) => {
            if (!stopped && result) onTracked(video, result, capturedAt);
          })
          .catch((err: any) => trace("tracking failed:", err));
      }

      animationId = requestAnimationFrame(loop);
    }

    function onTracked(video: HTMLVideoElement, result: any, capturedAt: number) {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        // Assigning width/height reallocates the canvas even when the
        // value is unchanged, so only do it when the video size changes.
        if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
        if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // "Hand points" (Settings) only hides the drawing.
          if (variantRef.current === "practice" || displayRef.current.points) drawLandmarks(ctx, canvas, result);
        }
      }

      const handsNow = handsIn(result);
      if (handsNow !== handsSeenRef.current) {
        handsSeenRef.current = handsNow;
        setHandsSeen(handsNow);
      }

      if (modeRef.current === "auto") {
        const seg = segmenterRef.current;
        const event = seg.push(landmarksToVector(result), capturedAt);
        if (event?.type === "start") {
          setSegmentActive(true);
          setNotice(null);
          setStatus("Reading sign...");
        } else if (event?.type === "end") {
          setSegmentActive(false);
          setFrameCount(event.frames.length);
          autoClassifyRef.current(event.frames);
        } else if (event?.type === "discard") {
          setSegmentActive(false);
          setFrameCount(0);
          setNotice("brief");
          setStatus("Too brief to read as a sign - " + readyText().charAt(0).toLowerCase() + readyText().slice(1));
        }
        if (seg.isActive) setFrameCount(seg.length);
      } else if (recordingRef.current) {
        framesRef.current.push(landmarksToVector(result));
        setFrameCount(framesRef.current.length);
      }
    }

    trace("MOUNT");
    setup().catch((err) => {
      trace("setup() THREW:", err);
      if (stopped) return;
      const name = err?.name;
      setProblem(
        !cameraFailed
          ? "reader"
          : name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError"
            ? "blocked"
            : "camera"
      );
      setStatus("ERROR: " + (err && err.message ? err.message : String(err)));
    });

    return () => {
      trace("UNMOUNT - stopping stream, closing landmarker");
      stopped = true;
      if (animationId) cancelAnimationFrame(animationId);
      // Do NOT stop the stream's tracks here - it's shared across tab
      // switches (see useSharedCameraStream) and only the hub that acquired
      // it releases it, when the Translator itself is left.
      // The landmarker, unlike the stream, IS created fresh per mount and
      // must be closed here - see useSharedLandmarkers. Each holds its own
      // WebGL context and GPU inference graph; Chrome only allows a limited
      // number of live contexts before it starts evicting the oldest ones.
      if (holisticLandmarker) {
        // Released through the shared queue, NOT closed directly: the next
        // screen's landmarker build must not start until this teardown has
        // actually finished in the WASM runtime, or it hangs and the camera
        // is never requested. See useSharedLandmarkers.
        releaseLandmarker(holisticLandmarker);
        holisticLandmarker = null;
      }
      // Do NOT dispose the cached word models here - they're shared at
      // module level by loadWordModels() (modelLoader.ts) so they can be
      // reused across mounts without re-downloading. Disposing them on
      // every unmount (e.g. switching to Letters and back) poisoned the
      // shared cache: the next mount would get back these same, now-
      // disposed model objects and crash deep in the WebGL backend on the
      // very next inference ("Cannot read properties of undefined
      // (reading 'backend')"). The models are an app-lifetime resource,
      // not something scoped to a single component mount.
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
  }, [variant]);

  function retry() {
    setProblem(null);
    setDetectorReady(false);
    setStatus("Starting...");
    setAttempt((a) => a + 1);
  }

  // Hands-free ("auto") counts a sign the segmenter is reading as recording.
  const recordingState: "idle" | "recording" | "classifying" =
    (mode === "auto" ? segmentActive : recording) ? "recording" : classifying ? "classifying" : "idle";
  const onRecordingStateChangeRef = useRef(onRecordingStateChange);
  onRecordingStateChangeRef.current = onRecordingStateChange;
  useEffect(() => {
    onRecordingStateChangeRef.current?.(recordingState);
  }, [recordingState]);

  function drawLandmarks(ctx: any, canvas: any, result: any) {
    const unwrap = (points: any) =>
      !points ? null : Array.isArray(points[0]) ? points[0] : points;

    // Pose stays as discrete points - there is no single "pose skeleton" worth
    // drawing here, and the arms are already implied by where the hands are.
    const pose = unwrap(result.poseLandmarks);
    if (pose) {
      ctx.fillStyle = POSE_DOT;
      for (const lm of pose) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    }

    // Hands get the full bone skeleton, same renderer as the Fingerspelling
    // overlay, so the two modes look like one product.
    for (const hand of [unwrap(result.leftHandLandmarks), unwrap(result.rightHandLandmarks)]) {
      if (hand) drawHandSkeleton(ctx, canvas, hand);
    }
  }

  // Auto mode: classify one finished segment, or park it if a classification
  // is still running (only the newest parked segment survives - see
  // pendingSegmentRef). Called from loop() through autoClassifyRef so it
  // always sees the current render's speak()/language, not the first one's.
  async function autoClassify(frames: Float32Array[]) {
    if (classifyingRef.current) {
      pendingSegmentRef.current = frames;
      return;
    }
    let next: Float32Array[] | null = frames;
    while (next) {
      pendingSegmentRef.current = null;
      await classifyBuffer(next, true);
      next = modeRef.current === "auto" ? pendingSegmentRef.current : null;
    }
  }
  const autoClassifyRef = useRef(autoClassify);
  autoClassifyRef.current = autoClassify;

  async function classifyBuffer(raw: Float32Array[] = framesRef.current, auto = false) {
    if (raw.length < 3) {
      setStatus("Too few frames captured - try signing a bit longer.");
      setNotice("short");
      setPredictions([]);
      setClassifying(false);
      return;
    }

    classifyingRef.current = true;
    setClassifying(true);
    setStatus("Classifying...");
    const lang = languageRef.current;
    // In auto mode the next sign may already be under way by the time this
    // one finishes scoring; don't stomp its "Reading sign..." status.
    const settle = (text: string) => {
      if (!(auto && segmenterRef.current.isActive)) setStatus(text);
    };
    // Both word models score clips trimmed to the hand-active span (see
    // trimToHandSpan), so the sign fills the same 40 frames as in training.
    // A phone held upright gives a tall frame; matchTrainingAspect evens it out.
    const clip = matchTrainingAspect(trimToHandSpan(raw, lang === "fsl" ? TRIM_MARGIN : ASL_TRIM_MARGIN), frameAspect(videoRef.current));
    const resampled = resampleSequence(clip, SEQUENCE_LENGTH);
    const normalized = normalizeSequence(resampled);

    // normalizeSequence widens each frame from the 258 captured values to the
    // 384 the model expects (it appends the wrist-relative hand blocks), so
    // the tensor is built on MODEL_FEATURES_PER_FRAME, not FEATURES_PER_FRAME.
    const flat = new Float32Array(SEQUENCE_LENGTH * MODEL_FEATURES_PER_FRAME);
    normalized.forEach((frame: Float32Array, i: number) =>
      flat.set(frame, i * MODEL_FEATURES_PER_FRAME)
    );

    let inputTensor: tf.Tensor3D | null = null;
    try {
      const { model, classes } = await loadWordModels(lang);
      inputTensor = tf.tensor3d(flat, [1, SEQUENCE_LENGTH, MODEL_FEATURES_PER_FRAME]);

      // One fused graph returns the seed ensemble's averaged probabilities
      // (see modelLoader.ts). It has no control flow, so the synchronous
      // execute() is safe; data() still awaits the GPU without blocking.
      const outTensor = model.execute(inputTensor) as tf.Tensor;
      const avgProbs = Array.from(await outTensor.data());
      outTensor.dispose();

      const sorted = avgProbs
        .map((p, i) => ({ word: classes[i] ?? "?", confidence: p * 100 }))
        .sort((a, b) => b.confidence - a.confidence);
      // A model with the "unknown sign" class: when that wins, it's no sign.
      const unknownTop = sorted[0]?.word === UNKNOWN_SIGN_LABEL;
      const ranked = sorted.filter((r) => r.word !== UNKNOWN_SIGN_LABEL).slice(0, TOP_K);

      // Language switched while this was scoring: the old vocabulary's
      // matches would show (and be spoken) under the new language's toggle.
      if (languageRef.current !== lang) {
        settle(readyText());
        return;
      }

      if (targetSign && onPracticeResult) {
        const targetIndex = classes.indexOf(targetSign);
        const targetConfidence = targetIndex >= 0 ? avgProbs[targetIndex] : 0;
        const top = unknownTop ? undefined : ranked[0];
        onPracticeResult({
          passed: !!top && top.word === targetSign && targetConfidence >= PASS_CONFIDENCE,
          confidence: targetConfidence,
          predicted: top && top.confidence >= MIN_CONFIDENCE ? top.word : null,
        });
      }

      if (unknownTop || ranked.length === 0 || ranked[0].confidence < MIN_CONFIDENCE) {
        // Unsure: display nothing and say nothing (see MIN_CONFIDENCE). The
        // previous word and its translation are cleared too, so they can't
        // read as the answer to this sign.
        setPredictions([]);
        resetSpeech();
        setNotice("unsure");
        settle(
          auto
            ? "Not sure what that was - try the sign again."
            : "Not sure what that was - press Record and try again."
        );
        return;
      }
      setPredictions(ranked);
      setNotice(null);
      settle(readyText());
      if (auto) {
        const now = performance.now();
        const last = lastAutoSpokenRef.current;
        if (last && last.word === ranked[0].word && now - last.at < AUTO_REPEAT_MS) return;
        lastAutoSpokenRef.current = { word: ranked[0].word, at: now };
      }
      // Automatic, immediate: the moment a sign is recognized it gets
      // translated (and spoken) in the standing target language, right where
      // the top prediction is computed - no separate "Translate" trigger.
      // Not in practice: there the result is feedback, not a translation, and
      // saying a misrecognised word aloud would read as a verdict.
      if (variant !== "practice") speak(ranked[0].word);
    } catch (e: any) {
      setNotice("failed");
      settle(`Classification failed: ${e?.message ?? e}`);
    } finally {
      inputTensor?.dispose();
      classifyingRef.current = false;
      setClassifying(false);
    }
  }

  function toggleRecording() {
    if (!recording && !detectorReady) return;
    if (!recording) {
      framesRef.current = [];
      setFrameCount(0);
      setPredictions([]);
      setNotice(null);
      resetSpeech();
      recordingRef.current = true;
      setRecording(true);
      setStatus("Recording - sign the word now...");
    } else {
      recordingRef.current = false;
      setRecording(false);
      classifyBuffer();
    }
  }

  // Clear: discards the buffered clip and the ranked matches. No backspace
  // equivalent on Words - nothing accumulates.
  function handleClear() {
    segmenterRef.current.reset();
    pendingSegmentRef.current = null;
    setSegmentActive(false);
    framesRef.current = [];
    setFrameCount(0);
    setPredictions([]);
    setNotice(null);
    resetSpeech();
    setStatus(readyText());
  }

  function speakTop() {
    const first = predictions[0];
    if (first) speak(first.word);
  }

  // Keyboard (web, full translator): Space records / stops (Manual), Enter
  // speaks, Escape clears (or closes the big view). A focused button keeps
  // Space and Enter for itself, and another open dialog keeps every key.
  useEffect(() => {
    if (Platform.OS !== "web" || variant !== "full") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (showBig) {
        if (e.key === "Escape") setShowBig(false);
        else if (e.key === "Enter") speakTop();
        return;
      }
      if (typeof document !== "undefined" && document.querySelector('[aria-modal="true"]')) return;
      const onButton = !!t?.closest?.('button,[role="button"],[role="tab"],[role="radio"],[role="switch"]');
      if (e.key === "Escape") handleClear();
      else if (e.key === "Enter" && !onButton) speakTop();
      else if (e.key === " " && !onButton && modeRef.current === "manual") {
        e.preventDefault();
        toggleRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (Platform.OS !== "web") {
    return (
      <View style={styles.nativeFallback}>
        <Text style={[typography.h2, { color: colors.textPrimary }]}>Word Translator</Text>
        <Text style={[typography.body, { color: colors.textSecondary }]}>
          This feature currently supports web only.
        </Text>
      </View>
    );
  }

  const isAuto = mode === "auto";
  // "Capturing" = frames are being gathered for a classification: a manual
  // recording, or in auto mode a sign the segmenter is currently reading.
  const capturing = isAuto ? segmentActive : recording;
  const top = predictions[0];

  // Practice keeps its material record button (PracticeScreen's layout).
  const recordButtonSize = isDesktop ? 74 : 88;
  const recordCapSize = isDesktop ? 56 : 66;
  const glyphSize = isDesktop ? 18 : 20;

  const recordButton = (
    <Pressable
      onPress={toggleRecording}
      disabled={isAuto || (!recording && !detectorReady)}
      accessibilityRole="button"
      accessibilityLabel={isAuto ? "Hands-free: signs are detected automatically" : recording ? "Stop recording" : "Start recording"}
      style={[styles.recordBezel, { width: recordButtonSize, height: recordButtonSize, borderRadius: recordButtonSize }, ((isAuto && !capturing) || (!recording && !detectorReady)) && styles.recordDisabled]}
    >
      <LinearGradient
        colors={["#3A414F", "#1A1E26"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={[styles.recordBezelFill, { width: recordButtonSize, height: recordButtonSize, borderRadius: recordButtonSize }]}
      >
        <LinearGradient
          colors={["#E0525F", "#A8303C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.recordCap, { width: recordCapSize, height: recordCapSize, borderRadius: recordCapSize }]}
        >
          <View style={{ width: glyphSize, height: glyphSize, borderRadius: capturing ? 5 : glyphSize, backgroundColor: "#FFFFFF" }} />
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );

  if (variant === "practice") {
    const cameraError = status.startsWith("ERROR") || /failed/i.test(status);
    const cameraReady = detectorReady;
    return (
      <View style={styles.practiceRoot}>
        <CameraDevice
          isDesktop
          videoRef={videoRef}
          canvasRef={canvasRef}
          ledColor={cameraError || capturing ? colors.needsPractice : cameraReady ? colors.success : colors.accentCoral}
          statusText={cameraError ? "CAMERA OFF" : !cameraReady ? "STARTING" : capturing ? `REC · ${frameCount} FRAMES` : classifying ? "CHECKING" : "READY"}
          overlays={
            <>
              <PracticeCameraOverlay phase={cameraError ? "error" : cameraReady ? "live" : "loading"} recording={capturing} onRetry={onRetry} />
              {capturing && (
                <GlassCard overVideo radius={999} padding={0} style={[styles.recPill, styles.recPillDesktop]} contentStyle={styles.recPillContent}>
                  <View style={styles.recDot} />
                  <Text style={[typography.labelSm, { color: "#FFFFFF" }]}>REC</Text>
                </GlassCard>
              )}
            </>
          }
          style={styles.practiceCamera}
        />
        <View style={[styles.practiceBottom, practiceAside ? { height: 120 } : null]}>
        <GlassCard radius={22} padding={12} style={practiceAside ? styles.practiceRecordCard : undefined} contentStyle={styles.practiceRecordRow}>
          {isAuto ? (
            // Hands-free: no button - the segmenter starts and stops on its own.
            <View
              style={[
                styles.handsFreeDot,
                { backgroundColor: capturing ? "rgba(242,178,62,0.18)" : classifying ? "rgba(124,108,245,0.18)" : colors.neuWell },
              ]}
              accessibilityLabel={capturing ? "Reading your sign" : "Hands-free, watching"}
            >
              <View style={[styles.handsFreeCore, { backgroundColor: capturing ? colors.accentCoral : classifying ? colors.primaryTealLight : colors.success }]} />
            </View>
          ) : (
            recordButton
          )}
          <View style={styles.recordTextBlock}>
            <Text style={[typography.h3, { color: colors.textPrimary }]}>
              {isAuto
                ? capturing ? "Reading your sign…" : classifying ? "Checking…" : "Hands-free"
                : recording ? "Recording…" : classifying ? "Checking…" : "Record"}
            </Text>
            <Text style={[typography.bodySm, { fontSize: 14, lineHeight: 19, color: colors.textSecondary }]}>
              {isAuto
                ? "Just sign. Pause when you finish."
                : recording ? "Sign it, then press Stop." : "Press, sign, press again."}
            </Text>
          </View>
        </GlassCard>
        {practiceAside ? <View style={styles.practiceAside}>{practiceAside}</View> : null}
        </View>
      </View>
    );
  }

  // ---- Full translator ----
  const wide = isDesktop;
  const dense = wide && (winH < 860 || winW < 1400);
  const tight = wide && winH < 700;
  const gutter = wide ? (dense ? 20 : 24) : isMobile ? 14 : 24;
  const cameraHeight = isMobile ? 300 : Math.round(Math.min(520, (winW - gutter * 2) * 0.6));

  const cameraState: CameraState = problem === "blocked" ? "blocked" : problem ? "error" : detectorReady ? "live" : "loading";
  const discState = capturing ? "capturing" : classifying ? "checking" : "idle";
  const frames = `${frameCount} frame${frameCount === 1 ? "" : "s"}`;
  const chip: { text: string; dot: "on" | "off" | "rec" | "wait" | "busy" } = capturing
    ? isAuto
      ? { text: `Reading sign · ${frames}`, dot: "wait" }
      : { text: `Recording · ${frames}`, dot: "rec" }
    : classifying
      ? { text: "Checking…", dot: "busy" }
      : handsSeen
        ? { text: "Hands found", dot: "on" }
        : { text: "No hands in view", dot: "off" };

  // What to do now, in words (nothing here relies on sound).
  const now: { title: string; hint: string } = problem
    ? { title: "The camera is off.", hint: "See the message on the camera." }
    : !detectorReady
      ? { title: "Getting ready…", hint: "The camera turns on in a moment." }
      : capturing
        ? isAuto
          ? { title: "Reading your sign…", hint: "Lower or still your hands when you finish." }
          : { title: "Recording… sign the word now.", hint: "Press Stop when you finish." }
        : classifying
          ? { title: "Checking…", hint: "Finding the closest words." }
          : !modelsReady
            ? { title: "Getting the word reader ready…", hint: "The first time takes a little while." }
            : notice === "unsure"
              ? { title: "Not sure what that was.", hint: isAuto ? "Try the sign again." : "Press Record and try again." }
              : notice === "brief"
                ? { title: "That was too short to read.", hint: "Sign the whole word, then lower your hands." }
                : notice === "short"
                  ? { title: "That was too short to read.", hint: "Sign a bit longer before you press Stop." }
                  : notice === "failed"
                    ? { title: "Something went wrong reading that.", hint: "Please sign it again." }
                    : isAuto
                      ? { title: top ? "Sign the next word." : "Sign a word.", hint: "Then lower your hands. It's read when they settle." }
                      : { title: "Press Record, then sign.", hint: "Press Stop when you finish the word." };

  const topMatch: WordMatch | null = top ? { name: signName(language, top.word), confidence: top.confidence } : null;
  const others: WordMatch[] = predictions.slice(1).map((p) => ({ name: signName(language, p.word), confidence: p.confidence }));
  const translation =
    topMatch && translatedText && translatedText.trim().toLowerCase() !== topMatch.name.trim().toLowerCase() ? translatedText.trim() : "";
  const speechLine =
    speechStatus === "translating" ? "Translating…" : translation ? `“${translation}” in ${languageName}` : `Spoken in ${languageName}`;
  const speakText = speechStatus === "speaking" ? "Speaking…" : speechStatus === "translating" ? "Translating…" : "Speak it aloud";
  const speakShort = speechStatus === "speaking" ? "Speaking…" : speechStatus === "translating" ? "Translating…" : "Speak";
  const keysHint = isAuto ? "Keys: Enter speaks · Esc clears" : "Keys: Space records / stops · Enter speaks · Esc clears";

  const disc = (size: number) => (
    <RecordDisc mode={mode} state={discState} size={size} disabled={!isAuto && !recording && !detectorReady} onPress={toggleRecording} />
  );

  const camera = (
    <CameraDevice
      variant="slim"
      videoRef={videoRef}
      canvasRef={canvasRef}
      cameraState={cameraState}
      chip="hand"
      chipText={chip.text}
      chipDot={chip.dot}
      fpsText={display.fps ? `${fps > 0 ? fps : "--"} fps · ready` : null}
      guideState={null}
      errorTitle={problem === "reader" ? "The word reader didn't load" : undefined}
      errorBody={problem === "reader" ? "Try again. If it keeps happening, restart LCSign." : undefined}
      onRetry={retry}
    />
  );

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
          <NowSigningCard
            ring={disc(dense ? 96 : 118)}
            title={now.title}
            hint={now.hint}
            footer={capturing ? frames : undefined}
            dense={dense}
          />
          <MatchesCard
            mode={mode}
            top={topMatch}
            others={others}
            speechLine={speechLine}
            speechError={speechError}
            dense={dense}
            tight={tight}
            speakLabel={speakText}
            onSpeak={speakTop}
            onShow={() => top && setShowBig(true)}
            onClear={handleClear}
            keysHint={keysHint}
          />
        </ScrollView>
      ) : (
        <ScrollView style={styles.stackScroll} contentContainerStyle={[styles.stackContent, { paddingHorizontal: gutter }]}>
          <NowSigningCard phone ring={disc(76)} title={now.title} footer={capturing ? frames : now.hint} />
          <PhoneMatchCard top={topMatch} others={others} speechLine={speechLine} />
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
            onPress={speakTop}
            disabled={!top}
            accessibilityLabel="Speak it aloud"
            accessibilityHint={top ? undefined : "Sign a word first"}
          />
          <TranslatorButton
            tone="neu"
            size="lg"
            square
            icon={(c) => <ExpandIcon size={18} color={c} />}
            onPress={() => top && setShowBig(true)}
            disabled={!top}
            accessibilityLabel="Show to someone"
          />
          <TranslatorButton tone="neu" size="lg" square icon={(c) => <CloseIcon size={18} color={c} />} onPress={handleClear} accessibilityLabel="Clear the matches" />
        </View>
      ) : null}

      <ShowToSomeone
        visible={showBig}
        onClose={() => setShowBig(false)}
        text={topMatch?.name ?? ""}
        signerName={signerName}
        translation={translation}
        languageName={languageName}
        speakLabel={speakText}
        onSpeak={speakTop}
        reduceMotion={reduceMotion}
      />
    </View>
  );
}

/** Any hand in a Holistic result. */
function handsIn(result: any): boolean {
  const count = (points: any) => (!points ? 0 : Array.isArray(points[0]) ? points[0].length : points.length);
  return count(result?.leftHandLandmarks) > 0 || count(result?.rightHandLandmarks) > 0;
}

const makeStyles = (colors: ThemeColors, theme: Theme) =>
  StyleSheet.create({
  nativeFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },

  // ---- Full translator ----
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

  // ---- Practice variant: camera fills the box PracticeScreen gives it, record row below ----
  practiceRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    gap: 14,
  },
  practiceCamera: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  practiceBottom: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 14,
  },
  practiceRecordCard: { width: 280, flexShrink: 0 },
  handsFreeDot: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  handsFreeCore: { width: 22, height: 22, borderRadius: 11 },
  practiceAside: { flex: 1, minWidth: 0 },
  practiceRecordRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  recordBezel: {
    flexShrink: 0,
    boxShadow: [
      { offsetX: 0, offsetY: 6, blurRadius: 14, color: "rgba(0,0,0,0.5)" },
    ],
  } as any,
  recordDisabled: {
    opacity: 0.45,
  },
  recordBezelFill: {
    alignItems: "center",
    justifyContent: "center",
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.2)", inset: true }],
  } as any,
  recordCap: {
    alignItems: "center",
    justifyContent: "center",
    boxShadow: [
      { offsetX: 0, offsetY: 4, blurRadius: 0, color: "#7A1F29" },
      { offsetX: 0, offsetY: 8, blurRadius: 14, color: "rgba(224,82,95,0.35)" },
      { offsetX: 0, offsetY: 1, blurRadius: 0, color: "rgba(255,255,255,0.35)", inset: true },
    ],
  } as any,
  recordTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  recPill: {
    position: "absolute",
  },
  recPillDesktop: {
    top: 14,
    left: 16,
  },
  recPillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.needsPractice,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 8, color: colors.needsPractice }],
  } as any,
});
