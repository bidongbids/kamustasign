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
  resampleSequence,
  normalizeSequence,
  SEQUENCE_LENGTH,
  MODEL_FEATURES_PER_FRAME,
} from "../ml/wordLandmarks";
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
import { useTranslateAndSpeak } from "../hooks/useTranslateAndSpeak";

const TOP_K = 5;
// Visual-only target the frame meter / REC pill count toward on mobile
// (unaffected by this handoff). Desktop's control strip exposes this as the
// "Clip length" setting (ClipLengthControl) - a PROPOSAL from the design
// handoff, default Standard = 60 frames, same value this constant held
// before the control existed.
const FRAME_TARGET = 60;

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
};

export default function WordTranslatorScreen({
  targetLanguage,
  getCameraStream,
  createHolisticLandmarker,
  releaseLandmarker,
  language = "asl",
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
          s.startsWith("Camera ready") ? "Ready. Press Record, sign a word, press Stop." : s
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
          ? "Ready. Press Record, sign a word, press Stop."
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

        if (recordingRef.current) {
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
  }, [isDesktop]);

  function drawLandmarks(ctx: any, canvas: any, result: any) {
    const drawPoints = (points: any, color: string) => {
      if (!points) return;
      const list = Array.isArray(points[0]) ? points[0] : points;
      ctx.fillStyle = color;
      for (const lm of list) {
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
    };
    drawPoints(result.poseLandmarks, "#3BA3F2");
    drawPoints(result.leftHandLandmarks, "#F2A93B");
    drawPoints(result.rightHandLandmarks, "#F2A93B");
  }

  async function classifyBuffer() {
    const raw = framesRef.current;
    if (raw.length < 3) {
      setStatus("Too few frames captured - try signing a bit longer.");
      setPredictions([]);
      setClassifying(false);
      return;
    }

    setClassifying(true);
    setStatus("Classifying...");
    const lang = languageRef.current;
    // FSL was trained on clips trimmed to the hand-active span (see
    // trimToHandSpan); ASL on whole clips, so it gets the buffer as-is.
    const clip = lang === "fsl" ? trimToHandSpan(raw) : raw;
    const resampled = resampleSequence(clip, SEQUENCE_LENGTH);
    const normalized = normalizeSequence(resampled);

    // normalizeSequence widens each frame from the 258 captured values to the
    // 384 the model expects (it appends the wrist-relative hand blocks), so
    // the tensor is built on MODEL_FEATURES_PER_FRAME, not FEATURES_PER_FRAME.
    const flat = new Float32Array(SEQUENCE_LENGTH * MODEL_FEATURES_PER_FRAME);
    normalized.forEach((frame: Float32Array, i: number) =>
      flat.set(frame, i * MODEL_FEATURES_PER_FRAME)
    );

    const { models, classes } = await loadWordModels(lang);
    const inputTensor = tf.tensor3d(flat, [1, SEQUENCE_LENGTH, MODEL_FEATURES_PER_FRAME]);

    try {
      // Run models one at a time, NOT via Promise.all. The GRU layers compile
      // to a TF control-flow "while" loop in the converted graph, and running
      // multiple executeAsync() calls concurrently against that dynamic graph
      // (even on separate model instances) races over shared engine/backend
      // state and disposes tensors still in use by another in-flight call
      // ("Tensor is disposed"). Sequential awaits avoid the race entirely.
      const allProbs: number[][] = [];
      for (const m of models) {
        const out = await (m as any).executeAsync(inputTensor);
        const outTensor = Array.isArray(out) ? out[0] : out;
        const data = await outTensor.data();
        if (Array.isArray(out)) out.forEach((t: any) => t.dispose());
        else outTensor.dispose();
        allProbs.push(Array.from(data) as number[]);
      }

      const numClasses = allProbs[0].length;
      const avgProbs = new Array(numClasses).fill(0);
      for (const probs of allProbs) {
        for (let i = 0; i < numClasses; i++) avgProbs[i] += probs[i] / allProbs.length;
      }

      const ranked = avgProbs
        .map((p, i) => ({ word: classes[i] ?? "?", confidence: p * 100 }))
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, TOP_K);

      // Language switched while this was scoring: the old vocabulary's
      // matches would show (and be spoken) under the new language's toggle.
      if (languageRef.current !== lang) {
        setStatus("Ready. Press Record, sign a word, press Stop.");
        return;
      }

      setPredictions(ranked);
      setStatus("Ready. Press Record, sign a word, press Stop.");
      // Automatic, immediate: the moment a sign is recognized it gets
      // translated (and spoken) in the standing target language, right where
      // the top prediction is computed - no separate "Translate" trigger.
      if (ranked.length > 0) speak(ranked[0].word);
    } finally {
      inputTensor.dispose();
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
    framesRef.current = [];
    setFrameCount(0);
    setPredictions([]);
    resetSpeech();
    setStatus("Ready. Press Record, sign a word, press Stop.");
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
          No prediction yet - record a sign to see the top 5 matches here.
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

  const recordingPanel = (
    <GlassCard radius={22} padding={isDesktop ? 18 : 16} contentStyle={styles.recordingContent} style={isDesktop ? styles.recordingPanelDesktop : undefined}>
      <Pressable
        onPress={toggleRecording}
        disabled={!recording && !detectorReady}
        accessibilityRole="button"
        accessibilityLabel={recording ? "Stop recording" : "Start recording"}
        style={[styles.recordBezel, { width: recordButtonSize, height: recordButtonSize, borderRadius: recordButtonSize }, !recording && !detectorReady && styles.recordDisabled]}
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
            {recording ? (
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

      <View style={styles.recordTextBlock}>
        <Text style={[typography.h3, { fontSize: 17, color: colors.textPrimary }]}>
          {recording ? "Recording" : classifying ? "Classifying" : "Ready to record"}
        </Text>
        <Text style={[typography.bodySm, { color: colors.textSecondary }]} numberOfLines={1}>
          {recording ? "Hold the sign steady. Tap again to classify." : status}
        </Text>
        <View style={[styles.frameMeter, { height: 18 }]}>
          {Array.from({ length: meterBarCount }).map((_, i) => {
            const height = 30 + ((i * 37) % 71); // deterministic 30-100% spread
            const isActive = i < activeBars;
            const isCurrent = recording && i === activeBars - 1;
            const isMarker = !recording && i === Math.floor(meterBarCount * 0.6);
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
      {recording && (
        <GlassCard
          overVideo
          radius={999}
          padding={0}
          style={[styles.recPill, isDesktop ? styles.recPillDesktop : styles.recPillMobile]}
          contentStyle={styles.recPillContent}
        >
          <View style={styles.recDot} />
          <Text style={[typography.labelSm, { color: "#FFFFFF" }]}>REC</Text>
          <Text style={[typography.caption, { fontSize: 11, color: "rgba(255,255,255,0.72)" }]}>
            {isDesktop ? `${frameCount} / ${frameTarget} frames` : `${frameCount}/${frameTarget}`}
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
            No prediction yet - record a sign to see the top 5 matches here.
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
          disabled={!recording && !detectorReady}
          accessibilityRole="button"
          accessibilityLabel={recording ? "Stop recording" : "Start recording"}
          style={[styles.recordBezel, { width: recordButtonSize, height: recordButtonSize, borderRadius: recordButtonSize }, !recording && !detectorReady && styles.recordDisabled]}
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
              {recording ? (
                <View style={{ width: glyphSize, height: glyphSize, borderRadius: 5, backgroundColor: "#FFFFFF" }} />
              ) : (
                <View style={{ width: glyphSize, height: glyphSize, borderRadius: glyphSize, backgroundColor: "#FFFFFF" }} />
              )}
            </LinearGradient>
          </LinearGradient>
        </Pressable>

        <View style={styles.recordTextBlock}>
          <Text style={[typography.h3, { fontSize: 16, color: colors.textPrimary }]}>
            {recording ? "Recording" : classifying ? "Classifying" : "Ready to record"}
          </Text>
          <Text style={styles.recordSubtitle} numberOfLines={1}>
            {recording ? "Tap again to classify." : status}
          </Text>
          <View style={[styles.frameMeter, { height: 16 }]}>
            {Array.from({ length: meterBarCount }).map((_, i) => {
              const height = 30 + ((i * 37) % 71);
              const isActive = i < activeBars;
              const isCurrent = recording && i === activeBars - 1;
              const isMarker = !recording && i === Math.floor(meterBarCount * 0.6);
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
              ledColor={recording ? colors.needsPractice : colors.success}
              statusText={
                recording || classifying ? `CLASSIFYING · ${frameCount} FRAMES BUFFERED` : "30 FPS · MODEL READY"
              }
              overlays={cameraOverlays}
              style={styles.cameraDesktopSize}
            />
          }
          bay2={bay2}
          translationText={top ? spokenLine ?? "—" : "—"}
          statusLabel={`${languageName} · ${translationTag}`}
          helperText="Record a sign, hold it steady, then stop to classify. Clear discards the clip and the ranked matches."
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
        ledColor={recording ? colors.needsPractice : colors.success}
        statusText={
          recording || classifying ? `CLASSIFYING · ${frameCount} FRAMES BUFFERED` : "30 FPS · MODEL READY"
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
