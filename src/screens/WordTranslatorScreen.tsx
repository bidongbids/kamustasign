// Word Translator ("Words" mode): record a clip -> classify -> ranked top-5
// word predictions -> auto-translate and speak in the standing target
// language. Visual pass per design_handoff_kamustasign_material_pass/
// README.md section 3 ("Word Translator") — the MediaPipe Holistic capture/
// classification pipeline below is unchanged from the working version, only
// the chrome around it moved to the material system (glass panels, a
// neumorphic top-matches list + record button, the shared skeuomorphic
// CameraDevice). TranslatorHubScreen now owns the GradientBackground and the
// language picker; this screen only renders its two-column body.
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as tf from "@tensorflow/tfjs";
import { loadWordModels, type SignLanguage } from "../ml/modelLoader";
import {
  landmarksToVector,
  trimToHandSpan,
  TRIM_MARGIN,
  ASL_TRIM_MARGIN,
  resampleSequence,
  normalizeSequence,
  SEQUENCE_LENGTH,
  MODEL_FEATURES_PER_FRAME,
} from "../ml/wordLandmarks";
import { SignSegmenter } from "../ml/signSegmenter";
import { colors, typography } from "../theme/theme";
import { neuInset, neuRaised } from "../theme/shadows";
import { useResponsive } from "../theme/responsive";
import GlassCard from "../components/GlassCard";
import CameraDevice from "../components/CameraDevice";
import HandednessPicker, { useHandedness } from "../components/HandednessPicker";
import ClipLengthControl, { useClipLength } from "../components/ClipLengthControl";
import TranslatorPanel from "../components/TranslatorPanel";
import { SpeakerIcon } from "../components/icons/UiIcons";
import { findLanguage } from "../lib/languages";
import { PASS_CONFIDENCE } from "../lib/curriculum";
import { drawHandSkeleton } from "../lib/handSkeleton";
import PracticeCameraOverlay from "../components/learn/PracticeCameraOverlay";
import { useTranslateAndSpeak } from "../hooks/useTranslateAndSpeak";

const TOP_K = 5;
// Visual-only target the frame meter / REC pill count toward on mobile
// (unaffected by this handoff). Desktop's control strip exposes this as the
// "Clip length" setting (ClipLengthControl) - a PROPOSAL from the design
// handoff, default Standard = 60 frames, same value this constant held
// before the control existed.
const FRAME_TARGET = 60;

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
};

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
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRef = useRef(false);
  const framesRef = useRef<Float32Array[]>([]);

  const { isDesktop } = useResponsive();
  const [handedness, setHandedness] = useHandedness();
  const [clipLengthFrames, setClipLengthFrames] = useClipLength();
  // The classification loop reads FRAME_TARGET's mobile-fixed value below
  // (unaffected by this handoff); desktop's REC pill / frame meter read the
  // live clip-length setting instead.
  const frameTarget = isDesktop ? clipLengthFrames : FRAME_TARGET;

  const [status, setStatus] = useState("Starting...");
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
        if (!cancelled) setStatus(`Word model load failed: ${e?.message ?? e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);
  // The camera preview comes up before the landmarker is built (see setup()),
  // but frames are only captured once loop() is running - so Record stays
  // off until then instead of silently recording an empty or truncated clip.
  const [detectorReady, setDetectorReady] = useState(false);
  // The desktop and mobile layouts render CameraDevice in different tree
  // positions, so crossing the breakpoint mounts a fresh, empty <video>.
  // Kept here so the effect below can re-attach the shared stream to it.
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
      // with the OS/driver actually freeing the device (CAMERA_BUG_HANDOFF.md
      // H1), which is what caused the black panel on the first tab switch.
      trace("awaiting shared camera stream...");
      stream = await getCameraStream();
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
      const canvas = canvasRef.current;

      if (video.readyState >= 2) {
        // Detection runs on the RAW (unmirrored) video frame - the preview
        // is mirrored purely via CSS (see CameraDevice's videoStyle), same
        // as the alphabet screen. Feeding a visually-flipped frame into the
        // detector would be a real train/inference mismatch, not just a
        // cosmetic choice, since the training videos were not mirrored.
        // Timestamps use performance.now() (matching LiveTranslatorScreen)
        // rather than a locally incremented counter: the landmarker is now
        // shared and outlives this mount (see useSharedLandmarkers), and
        // MediaPipe requires timestamps to strictly increase across a
        // landmarker's whole lifetime - a counter reset to 0 on every mount
        // would violate that as soon as you switched back to Words.
        const result = holisticLandmarker.detectForVideo(video, performance.now());

        if (canvas) {
          const ctx = canvas.getContext("2d");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawLandmarks(ctx, canvas, result);
          }
        }

        if (modeRef.current === "auto") {
          const seg = segmenterRef.current;
          const event = seg.push(landmarksToVector(result), performance.now());
          if (event?.type === "start") {
            setSegmentActive(true);
            setStatus("Reading sign...");
          } else if (event?.type === "end") {
            setSegmentActive(false);
            setFrameCount(event.frames.length);
            autoClassifyRef.current(event.frames);
          } else if (event?.type === "discard") {
            setSegmentActive(false);
            setFrameCount(0);
            setStatus("Too brief to read as a sign - " + readyText().charAt(0).toLowerCase() + readyText().slice(1));
          }
          if (seg.isActive) setFrameCount(seg.length);
        } else if (recordingRef.current) {
          framesRef.current.push(landmarksToVector(result));
          setFrameCount(framesRef.current.length);
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
    const clip = trimToHandSpan(raw, lang === "fsl" ? TRIM_MARGIN : ASL_TRIM_MARGIN);
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

      const ranked = avgProbs
        .map((p, i) => ({ word: classes[i] ?? "?", confidence: p * 100 }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, TOP_K);

      // Language switched while this was scoring: the old vocabulary's
      // matches would show (and be spoken) under the new language's toggle.
      if (languageRef.current !== lang) {
        settle(readyText());
        return;
      }

      if (targetSign && onPracticeResult) {
        const targetIndex = classes.indexOf(targetSign);
        const targetConfidence = targetIndex >= 0 ? avgProbs[targetIndex] : 0;
        const top = ranked[0];
        onPracticeResult({
          passed: !!top && top.word === targetSign && targetConfidence >= PASS_CONFIDENCE,
          confidence: targetConfidence,
          predicted: top && top.confidence >= MIN_CONFIDENCE ? top.word : null,
        });
      }

      if (ranked.length === 0 || ranked[0].confidence < MIN_CONFIDENCE) {
        // Unsure: display nothing and say nothing (see MIN_CONFIDENCE). The
        // previous word and its translation are cleared too, so they can't
        // read as the answer to this sign.
        setPredictions([]);
        resetSpeech();
        settle(
          auto
            ? "Not sure what that was - try the sign again."
            : "Not sure what that was - press Record and try again."
        );
        return;
      }
      setPredictions(ranked);
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

  // Desktop-only bay-3 action (design handoff PROPOSAL): discards the
  // buffered clip and the ranked matches, returning the bay to its empty
  // state. No backspace equivalent on Words - nothing accumulates.
  function handleClear() {
    segmenterRef.current.reset();
    pendingSegmentRef.current = null;
    setSegmentActive(false);
    framesRef.current = [];
    setFrameCount(0);
    setPredictions([]);
    resetSpeech();
    setStatus(readyText());
  }

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
  const emptyText = isAuto
    ? "No sign yet - sign a word and the top 5 matches appear here."
    : "No prediction yet - record a sign to see the top 5 matches here.";
  const recordTitle = isAuto
    ? segmentActive ? "Reading sign" : classifying ? "Classifying" : "Hands-free"
    : recording ? "Recording" : classifying ? "Classifying" : "Ready to record";
  const visibleRanks = isDesktop ? predictions : predictions.slice(0, 4);
  const top = predictions[0];
  const spokenLine = speechStatus === "translating" ? "Translating..." : translatedText || top?.word;

  const recordButtonSize = isDesktop ? 74 : 88;
  const recordCapSize = isDesktop ? 56 : 66;
  const glyphSize = isDesktop ? 18 : 20;
  const meterBarCount = isDesktop ? 12 : 9;
  const activeBars = Math.min(meterBarCount, Math.round((frameCount / frameTarget) * meterBarCount));

  const topMatchesPanel = (
    <GlassCard radius={22} padding={isDesktop ? 24 : 18} style={styles.panel}>
      <View style={styles.panelHeaderRow}>
        <Text style={[typography.meta, styles.eyebrow]}>TOP MATCHES</Text>
        <Text style={[typography.caption, { fontSize: 10, color: colors.textTertiary }]}>
          {frameCount > 0 ? `${frameCount} frames` : ""}
        </Text>
      </View>

      {!top ? (
        <Text style={[typography.bodySm, styles.emptyMatches]}>
          {emptyText}
        </Text>
      ) : (
        <>
          <View
            style={[
              styles.rankOneSlab,
              { borderRadius: isDesktop ? 18 : 16, padding: isDesktop ? 18 : 14 },
              neuRaised("md"),
            ]}
          >
            <View style={styles.rankOneRow}>
              <Text style={[typography.h1, { fontSize: isDesktop ? 32 : 26, color: colors.textPrimary }]} numberOfLines={1}>
                {top.word}
              </Text>
              <Text style={[typography.h3, { fontSize: isDesktop ? 20 : 17, color: colors.success }]}>
                {top.confidence.toFixed(0)}%
              </Text>
            </View>
            <View style={[styles.trough, { height: isDesktop ? 12 : 11 }, neuInset("sm")]}>
              <LinearGradient
                colors={["#2E9A58", "#3FB56A"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.troughFill,
                  {
                    width: `${Math.max(2, Math.min(100, top.confidence))}%`,
                    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: "rgba(63,181,106,0.55)" }],
                  } as any,
                ]}
              />
            </View>
            <View style={styles.rankOneFooter}>
              <View style={styles.successDot} />
              <Text style={[typography.caption, { fontSize: 11, color: colors.textSecondary }]} numberOfLines={1}>
                {spokenLine} · spoken in {languageName}
              </Text>
            </View>
            {speechError && (
              <Text style={[typography.caption, { fontSize: 10.5, color: colors.needsPractice, marginTop: 4 }]}>
                {speechError}
              </Text>
            )}
          </View>

          <View style={styles.ranksList}>
            {visibleRanks.slice(1).map((p, i) => {
              const rank = i + 2; // ranks list starts at #2
              const dim = rank >= 4;
              return (
                <View key={p.word + rank} style={styles.rankRow}>
                  <View style={styles.rankLabelRow}>
                    <Text style={[typography.label, { color: dim ? "#8F98A6" : colors.textPrimary }]}>{p.word}</Text>
                    <Text style={[typography.labelSm, { color: dim ? "#8F98A6" : colors.textSecondary }]}>
                      {p.confidence.toFixed(0)}%
                    </Text>
                  </View>
                  <View style={[styles.trough, { height: 8 }, neuInset("sm")]}>
                    <View
                      style={[
                        styles.troughFill,
                        {
                          width: `${Math.max(2, Math.min(100, p.confidence))}%`,
                          backgroundColor: dim ? colors.primaryTealDark : colors.primaryTeal,
                        },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </GlassCard>
  );

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
        style={[
          styles.recordBezelFill,
          { width: recordButtonSize, height: recordButtonSize, borderRadius: recordButtonSize },
        ]}
      >
        <LinearGradient
          colors={["#E0525F", "#A8303C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.recordCap,
            { width: recordCapSize, height: recordCapSize, borderRadius: recordCapSize },
          ]}
        >
          {capturing ? (
            <View style={{ width: glyphSize, height: glyphSize, borderRadius: 5, backgroundColor: "#FFFFFF" }} />
          ) : (
            <View
              style={{
                width: glyphSize,
                height: glyphSize,
                borderRadius: glyphSize,
                backgroundColor: "#FFFFFF",
              }}
            />
          )}
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );

  const recordingPanel = (
    <GlassCard radius={22} padding={isDesktop ? 18 : 16} contentStyle={styles.recordingContent} style={isDesktop ? styles.recordingPanelDesktop : undefined}>
      {recordButton}

      <View style={styles.recordTextBlock}>
        <Text style={[typography.h3, { fontSize: 17, color: colors.textPrimary }]}>
          {recordTitle}
        </Text>
        <Text style={[typography.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
          {recording ? "Hold the sign steady. Tap again to classify." : status}
        </Text>
        <View style={[styles.frameMeter, { height: 18 }]}>
          {Array.from({ length: meterBarCount }).map((_, i) => {
            const height = 30 + ((i * 37) % 71); // deterministic 30-100% spread
            const isActive = i < activeBars;
            const isCurrent = capturing && i === activeBars - 1;
            const isMarker = !capturing && i === Math.floor(meterBarCount * 0.6);
            const barColor = isCurrent
              ? colors.needsPractice
              : isMarker
                ? colors.primaryTeal
                : isActive
                  ? i % 2 === 0 ? "#4B5364" : "#5B647A"
                  : "#3F4655";
            return (
              <View
                key={i}
                style={[styles.frameBar, { height: `${height}%`, backgroundColor: barColor }]}
              />
            );
          })}
        </View>
      </View>
    </GlassCard>
  );

  const leftColumn = (
    <View style={styles.leftColMobile}>
      {topMatchesPanel}
      {recordingPanel}
    </View>
  );

  // Desktop overlays are REC pill + hand plate only - translation moved into
  // bay 3 (the shared panel shell) for the instrument-panel handoff, so the
  // on-video translation bar below is mobile-only now (unaffected screen).
  const cameraOverlays = (
    <>
      {capturing && (
        <GlassCard
          overVideo
          radius={999}
          padding={0}
          style={[styles.recPill, isDesktop ? styles.recPillDesktop : styles.recPillMobile]}
          contentStyle={styles.recPillContent}
        >
          <View style={styles.recDot} />
          <Text style={[typography.labelSm, { color: "#FFFFFF" }]}>{isAuto ? "READING" : "REC"}</Text>
          <Text style={[typography.caption, { fontSize: 11, color: "rgba(255,255,255,0.72)" }]}>
            {isAuto
              ? `${frameCount} frames`
              : isDesktop ? `${frameCount} / ${frameTarget} frames` : `${frameCount}/${frameTarget}`}
          </Text>
        </GlassCard>
      )}

      <GlassCard
        overVideo
        radius={999}
        padding={0}
        style={[styles.handPlate, isDesktop ? styles.handPlateDesktop : styles.handPlateMobile]}
        contentStyle={styles.handPlateContent}
      >
        <Text style={[typography.meta, { fontSize: 11, color: "rgba(255,255,255,0.8)" }]}>
          {handedness.toUpperCase()} HAND
        </Text>
      </GlassCard>

      {!isDesktop && top && (
        <GlassCard
          overVideo
          radius={14}
          padding={12}
          style={[styles.translationBar, styles.translationBarMobile]}
          contentStyle={styles.translationBarContent}
        >
          <View style={styles.translationTextBlock}>
            <Text style={[typography.meta, { fontSize: 9.5, color: "rgba(255,255,255,0.7)" }]}>TRANSLATION</Text>
            <Text style={[typography.h1, { fontSize: 20, color: "#FFFFFF" }]} numberOfLines={1}>
              {spokenLine}
            </Text>
          </View>
          <Pressable
            onPress={() => speak(top.word)}
            style={styles.speakPill}
            accessibilityRole="button"
            accessibilityLabel={`Speak ${top.word}`}
          >
            <SpeakerIcon size={16} color={colors.textOnAccent} />
          </Pressable>
        </GlassCard>
      )}
    </>
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

  if (isDesktop) {
    const translationTag =
      speechStatus === "translating" ? "translating…" : speechStatus === "speaking" ? "speaking…" : "ready";

    const bay2 = (
      <View style={styles.bay2ColumnWords}>
        <View style={styles.panelHeaderRow}>
          <Text style={[typography.meta, styles.eyebrow]}>TOP MATCHES</Text>
          <Text style={[typography.caption, { fontSize: 10, color: colors.textTertiary }]}>
            {frameCount > 0 ? `${frameCount} frames` : ""}
          </Text>
        </View>

        {!top ? (
          <Text style={[typography.bodySm, styles.emptyMatches]}>
            {emptyText}
          </Text>
        ) : (
          <>
            <View style={[styles.rankOneSlab, { borderRadius: 18, padding: 18 }, neuRaised("md")]}>
              <View style={styles.rankOneRow}>
                <Text style={[typography.h1, { fontSize: 32, color: colors.textPrimary }]} numberOfLines={1}>
                  {top.word}
                </Text>
                <Text style={[typography.h3, { fontSize: 20, color: colors.success }]}>
                  {top.confidence.toFixed(0)}%
                </Text>
              </View>
              <View style={[styles.trough, { height: 12 }, neuInset("sm")]}>
                <LinearGradient
                  colors={["#2E9A58", "#3FB56A"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.troughFill,
                    {
                      width: `${Math.max(2, Math.min(100, top.confidence))}%`,
                      boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: "rgba(63,181,106,0.55)" }],
                    } as any,
                  ]}
                />
              </View>
              <View style={styles.rankOneFooter}>
                <View style={styles.successDot} />
                <Text style={[typography.caption, { fontSize: 11, color: colors.textSecondary }]} numberOfLines={1}>
                  {spokenLine} · spoken in {languageName}
                </Text>
              </View>
              {speechError && (
                <Text style={[typography.caption, { fontSize: 10.5, color: colors.needsPractice, marginTop: 4 }]}>
                  {speechError}
                </Text>
              )}
            </View>

            <View style={styles.ranksList}>
              {visibleRanks.slice(1).map((p, i) => {
                const rank = i + 2;
                const dim = rank >= 4;
                return (
                  <View key={p.word + rank} style={styles.rankRow}>
                    <View style={styles.rankLabelRow}>
                      <Text style={[typography.label, { color: dim ? "#8F98A6" : colors.textPrimary }]}>{p.word}</Text>
                      <Text style={[typography.labelSm, { color: dim ? "#8F98A6" : colors.textSecondary }]}>
                        {p.confidence.toFixed(0)}%
                      </Text>
                    </View>
                    <View style={[styles.trough, { height: 8 }, neuInset("sm")]}>
                      <View
                        style={[
                          styles.troughFill,
                          {
                            width: `${Math.max(2, Math.min(100, p.confidence))}%`,
                            backgroundColor: dim ? colors.primaryTealDark : colors.primaryTeal,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>
    );

    const recordingCell = (
      <View style={styles.recordingCell}>
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
              {capturing ? (
                <View style={{ width: glyphSize, height: glyphSize, borderRadius: 5, backgroundColor: "#FFFFFF" }} />
              ) : (
                <View style={{ width: glyphSize, height: glyphSize, borderRadius: glyphSize, backgroundColor: "#FFFFFF" }} />
              )}
            </LinearGradient>
          </LinearGradient>
        </Pressable>

        <View style={styles.recordTextBlock}>
          <Text style={[typography.h3, { fontSize: 16, color: colors.textPrimary }]}>
            {recordTitle}
          </Text>
          <Text style={styles.recordSubtitle} numberOfLines={1}>
            {recording ? "Tap again to classify." : status}
          </Text>
          <View style={[styles.frameMeter, { height: 16 }]}>
            {Array.from({ length: meterBarCount }).map((_, i) => {
              const height = 30 + ((i * 37) % 71);
              const isActive = i < activeBars;
              const isCurrent = capturing && i === activeBars - 1;
              const isMarker = !capturing && i === Math.floor(meterBarCount * 0.6);
              const barColor = isCurrent
                ? colors.needsPractice
                : isMarker
                  ? colors.primaryTeal
                  : isActive
                    ? i % 2 === 0 ? "#4B5364" : "#5B647A"
                    : "#3F4655";
              return <View key={i} style={[styles.frameBar, { height: `${height}%`, backgroundColor: barColor }]} />;
            })}
          </View>
        </View>
      </View>
    );

    const signingHandCell = (
      <View style={styles.stripCellFlexWords}>
        <View style={styles.stripCellHeader}>
          <Text style={[typography.meta, styles.eyebrow]}>SIGNING HAND</Text>
          <Text style={styles.stripCellAccent}>affects accuracy</Text>
        </View>
        <HandednessPicker value={handedness} onChange={setHandedness} />
      </View>
    );

    const clipLengthCell = (
      <View style={styles.stripCellFlexWords}>
        <View style={styles.stripCellHeader}>
          <Text style={[typography.meta, styles.eyebrow]}>CLIP LENGTH</Text>
          <Text style={styles.stripCellAccent}>{clipLengthFrames} frames</Text>
        </View>
        <ClipLengthControl value={clipLengthFrames} onChange={setClipLengthFrames} />
      </View>
    );

    const actionsRow = (
      <Pressable
        onPress={handleClear}
        style={styles.clearButtonFull}
        accessibilityRole="button"
        accessibilityLabel="Clear the buffered clip and matches"
      >
        <Text style={styles.clearLabel}>Clear</Text>
      </Pressable>
    );

    return (
      <View style={styles.instrumentBody}>
        <TranslatorPanel
          cameraDevice={
            <CameraDevice
              isDesktop
              videoRef={videoRef}
              canvasRef={canvasRef}
              ledColor={capturing ? colors.needsPractice : colors.success}
              statusText={
                capturing || classifying
                  ? `CLASSIFYING · ${frameCount} FRAMES BUFFERED`
                  : isAuto ? "HANDS-FREE · WATCHING" : "30 FPS · MODEL READY"
              }
              overlays={cameraOverlays}
              style={styles.cameraDesktopSize}
            />
          }
          bay2={bay2}
          translationText={top ? spokenLine ?? "—" : "—"}
          statusLabel={`${languageName} · ${translationTag}`}
          helperText={
            isAuto
              ? "Hands-free: sign a word, then lower or still your hands - it's read and spoken automatically. If the model isn't confident, nothing is shown - just sign it again."
              : "Record a sign, hold it steady, then stop to classify. If the model isn't confident, nothing is shown. Clear discards the clip and the ranked matches."
          }
          onSpeak={() => top && speak(top.word)}
          speakDisabled={!top}
          actionsRow={actionsRow}
          stripCells={[recordingCell, signingHandCell, clipLengthCell]}
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, styles.rootMobile]}>
      {leftColumn}
      <CameraDevice
        isDesktop={false}
        videoRef={videoRef}
        canvasRef={canvasRef}
        ledColor={capturing ? colors.needsPractice : colors.success}
        statusText={
          capturing || classifying
                  ? `CLASSIFYING · ${frameCount} FRAMES BUFFERED`
                  : isAuto ? "HANDS-FREE · WATCHING" : "30 FPS · MODEL READY"
        }
        mobileScreenHeight={282}
        overlays={cameraOverlays}
        style={styles.cameraMobile}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  nativeFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  root: {
    flex: 1,
    minHeight: 0,
  },
  // Practice variant: camera fills the box PracticeScreen gives it, record row below.
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
  // Desktop root: fills the hub's body. Must STRETCH (not shrink-center) so
  // TranslatorPanel's own onLayout measurement of this space is accurate -
  // see LiveTranslatorScreen's instrumentBody for the full rationale.
  instrumentBody: {
    flex: 1,
    minHeight: 0,
    padding: 16,
  },
  cameraDesktopSize: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    width: 540,
    height: 398,
  },
  // column-reverse keeps the CameraDevice instance (declared second in JSX)
  // mounted in the same tree position across the breakpoint — only its
  // VISUAL order flips so mobile shows camera above the results without
  // ever remounting the <video>/<canvas> (see WordTranslatorScreen history:
  // remounting mid-session drops the live getUserMedia stream).
  rootMobile: {
    flexDirection: "column-reverse",
    alignItems: "stretch",
    gap: 14,
    padding: 16,
  },
  cameraMobile: {
    marginHorizontal: 0,
  },
  leftColMobile: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    gap: 14,
  },
  panel: {},
  panelHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  eyebrow: {
    color: colors.textTertiary,
  },
  emptyMatches: {
    color: colors.textOnGlass,
  },
  rankOneSlab: {
    backgroundColor: colors.neuBase,
    marginBottom: 16,
  },
  rankOneRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  trough: {
    borderRadius: 999,
    backgroundColor: colors.neuWell,
    overflow: "hidden",
    justifyContent: "center",
  },
  troughFill: {
    height: "100%",
    borderRadius: 999,
  },
  rankOneFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  successDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  ranksList: {
    gap: 13,
  },
  rankRow: {
    gap: 6,
  },
  rankLabelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  recordingPanelDesktop: {
    marginTop: "auto",
  },
  recordingContent: {
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
  frameMeter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    marginTop: 8,
  },
  frameBar: {
    flex: 1,
    borderRadius: 2,
  },
  recPill: {
    position: "absolute",
  },
  recPillDesktop: {
    top: 14,
    left: 16,
  },
  recPillMobile: {
    top: 12,
    left: 12,
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
  handPlate: {
    position: "absolute",
  },
  handPlateDesktop: {
    top: 14,
    right: 16,
  },
  handPlateMobile: {
    top: 12,
    right: 12,
  },
  handPlateContent: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  translationBar: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  translationBarMobile: {
    bottom: 12,
    marginHorizontal: 12,
  },
  translationBarContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  translationTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  speakPill: {
    flexShrink: 0,
    backgroundColor: colors.accentCoral,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 18,
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: "rgba(242,178,62,0.3)" }],
  } as any,

  // --- Desktop instrument-panel bay 2 (Top matches) ---
  bay2ColumnWords: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },

  // --- Desktop control-strip cells ---
  recordingCell: {
    width: 394,
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  recordSubtitle: {
    fontFamily: typography.body.fontFamily,
    fontSize: 11,
    lineHeight: 16.5,
    color: colors.textSecondary,
  },
  stripCellFlexWords: {
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

  // --- Desktop bay-3 action (Clear, full width) ---
  clearButtonFull: {
    width: "100%",
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
});
