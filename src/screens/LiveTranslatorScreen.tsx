import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
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
import { BackspaceIcon } from "../components/icons/UiIcons";
import { useTranslateAndSpeak } from "../hooks/useTranslateAndSpeak";
import { findLanguage } from "../lib/languages";

// Confidence (0-100) a live prediction needs before it's "stable" enough to
// commit to the accumulated word. Keeps a hand pausing mid-transition (low
// confidence) from spamming the strip with noise, while still committing the
// moment a clean letter holds.
const COMMIT_THRESHOLD = 60;

// Camera startup tracing, mirroring WordTranslatorScreen's [words-cam] trace
// (see CAMERA_BUG_HANDOFF.md section 4) - lets you confirm from the console
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
};

export default function LiveTranslatorScreen({
  targetLanguage,
  getCameraStream,
  createHandLandmarker,
  releaseLandmarker,
  alphabet = "letters",
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
      // CAMERA_BUG_HANDOFF.md H1: releasing and re-requesting the camera in
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

    function loop() {
      if (stopped || !handLandmarker || !videoRef.current || !modelRef.current) return;

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
            landmarks.forEach((lm: any, i: number) => {
              const isWrist = i === 0;
              ctx!.beginPath();
              ctx!.fillStyle = isWrist ? colors.accentCoral : colors.primaryTeal;
              ctx!.shadowColor = isWrist ? colors.accentCoral : colors.primaryTeal;
              ctx!.shadowBlur = isWrist ? 10 : 8;
              ctx!.arc(lm.x * canvas!.width, lm.y * canvas!.height, isWrist ? 6 : 4.5, 0, 2 * Math.PI);
              ctx!.fill();
            });
            ctx.shadowBlur = 0;
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
  }, [isDesktop]);

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

  // Desktop detection box is the exact 186x226 @ (52,36) box from the
  // instrument-panel handoff (mock 4a) - the mobile badge+box combo is the
  // earlier material-pass treatment, kept as-is since mobile isn't in scope
  // for this handoff.
  const overlays = (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {handDetected && isDesktop && (
        <Svg width={186} height={226} style={{ position: "absolute", left: 52, top: 36 }}>
          <Rect
            x={0.75}
            y={0.75}
            width={186 - 1.5}
            height={226 - 1.5}
            rx={14}
            fill="none"
            stroke="rgba(124,108,245,0.6)"
            strokeWidth={1.5}
            strokeDasharray="6 5"
          />
        </Svg>
      )}
      {handDetected && !isDesktop && (
        <>
          <View style={[styles.badge, { left: 96, top: 32 }]}>
            <Text style={styles.badgeText}>{landmarkCount} landmarks locked</Text>
          </View>
          <Svg width={158} height={196} style={{ position: "absolute", left: 96, top: 56 }}>
            <Rect
              x={0.75}
              y={0.75}
              width={158 - 1.5}
              height={196 - 1.5}
              rx={14}
              fill="none"
              stroke="rgba(124,108,245,0.6)"
              strokeWidth={1.5}
              strokeDasharray="6 5"
            />
          </Svg>
        </>
      )}
    </View>
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
        {wordText ? `“${wordText}”` : "—"}
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
        <Text style={[typography.label, styles.speakLabel]}>Speak it</Text>
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

  if (isDesktop) {
    // Reading strip: fit as many committed-letter tiles as the measured bay
    // width allows (tile 36 + gap 7), newest last - never wrap, never shrink
    // the tiles (handoff: "compute N from the bay width").
    const fitCount = stripWidth > 0 ? Math.max(1, Math.floor((stripWidth + 7) / 43)) : accumulatedWord.length;
    const stripLetters = accumulatedWord.slice(-fitCount);
    const heldMsClamped = Math.min(heldMs, holdDuration);
    const heldFraction = holdDuration > 0 ? Math.min(1, heldMsClamped / holdDuration) : 0;

    const bay2 = (
      <View style={styles.bay2Column}>
        <Text style={[typography.meta, styles.eyebrow, { marginBottom: 20 }]}>RECOGNIZED</Text>
        <View style={[styles.recognizedRow, { gap: 18 }]}>
          <View style={[styles.letterTileBig, { backgroundColor: colors.neuBase }, neuRaised("lg")]}>
            <Text style={styles.letterGlyphBig}>{prediction}</Text>
          </View>
          <ConfidenceDial size={168} percent={confidence} pctSize={38} metaSize={9} />
        </View>
        <View style={styles.bay2Rule} />
        <View style={styles.readingRow}>
          <Text style={styles.readingRowLabelText}>Reading:</Text>
          <Text style={styles.readingCountText}>{accumulatedWord.length} letters</Text>
        </View>
        <View style={styles.tileStripDesktop} onLayout={(e) => setStripWidth(e.nativeEvent.layout.width)}>
          {stripLetters.length === 0 ? (
            <Text style={styles.tileStripEmpty}>—</Text>
          ) : (
            stripLetters.map((letter, i) => {
              const isNewest = i === stripLetters.length - 1;
              return (
                <View
                  key={`${letter}-${i}`}
                  style={[
                    styles.letterChipBig,
                    { backgroundColor: isNewest ? colors.surfaceElevated : colors.neuWell },
                    isNewest ? neuRaised("sm") : neuInset("sm"),
                  ]}
                >
                  <Text style={[styles.letterChipLabel, { color: isNewest ? colors.accentCoral : colors.adminGray }]}>
                    {letter}
                  </Text>
                </View>
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
          HOLDING · {Math.round(heldMsClamped)} / {holdDuration} ms
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
      <View style={styles.actionsRowDesktop}>
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
          translationText={wordText || "—"}
          statusLabel={`${languageName} · ${translationTag}`}
          helperText="Letters commit to the strip once they hold steady, then translate as a word. Clear empties the strip and starts a new word."
          onSpeak={handleSpeak}
          speakDisabled={!wordText}
          actionsRow={actionsRow}
          stripCells={[signingHandCell, commitSpeedCell, holdingMeterCell]}
        />
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
    marginTop: 24,
    marginBottom: 18,
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
    width: 36,
    height: 44,
    borderRadius: 10,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  letterChipLabel: {
    fontFamily: typography.label.fontFamily,
    fontSize: 18,
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
