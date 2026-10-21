// Sign reading for one video feed during a call (local preview or the peer's
// incoming stream), with a choice of model. It runs entirely on this device
// and sends nothing over the network.
//
//  - letters / numbers: HandLandmarker + the fingerspelling model, with the
//    live translator's commit rule (>= COMMIT_PCT held HOLD_MS -> the letter
//    is added; lower the hand to repeat a letter).
//  - words: HolisticLandmarker + SignSegmenter (hands-free, like the Words
//    tab's auto mode) + the ASL or FSL word ensemble; each confident sign
//    adds a word.
//
// Each feed builds its OWN landmarker (not useSharedLandmarkers, which keeps
// exactly one alive for the translator tabs) because a call can read two
// feeds at once. They're closed when the feed stops being read.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as tf from "@tensorflow/tfjs";
import { loadAlphabet, loadWordModels, type SignLanguage } from "../ml/modelLoader";
import {
  landmarksToVector,
  normalizeSequence,
  resampleSequence,
  trimToHandSpan,
  TRIM_MARGIN,
  ASL_TRIM_MARGIN,
  MODEL_FEATURES_PER_FRAME,
  SEQUENCE_LENGTH,
} from "../ml/wordLandmarks";
import { SignSegmenter } from "../ml/signSegmenter";
import { mirrorFlatLandmarks } from "../components/HandednessPicker";
import { loadTasksVision, getVisionFileset } from "../lib/mediapipeVision";

export type CallModel = { kind: "letters" } | { kind: "words"; language: SignLanguage };

export type ReaderPhase = "off" | "loading" | "error" | "no-hand" | "unsure" | "holding" | "added" | "reading" | "checking";

const COMMIT_PCT = 60;
const HOLD_MS = 450;
const WORD_MIN_PCT = 40;

export function useCallSignReader(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
  model: CallModel,
  options: { mirrorLandmarks?: boolean } = {}
) {
  const [phase, setPhase] = useState<ReaderPhase>("off");
  const [guess, setGuess] = useState<{ label: string; confidence: number }>({ label: "", confidence: 0 });
  const [hold, setHold] = useState(0);
  const [text, setText] = useState("");
  const [lastAdded, setLastAdded] = useState<{ token: string; at: number } | null>(null);
  const mirrorRef = useRef(!!options.mirrorLandmarks);
  mirrorRef.current = !!options.mirrorLandmarks;
  const lastCommittedRef = useRef("");

  const modelKey = model.kind === "words" ? `words:${model.language}` : model.kind;

  useEffect(() => {
    if (!active || Platform.OS !== "web") {
      setPhase("off");
      return;
    }
    let stopped = false;
    let landmarker: any = null;
    let raf: number | null = null;
    setPhase("loading");
    setGuess({ label: "", confidence: 0 });
    setHold(0);

    const add = (token: string, isWord: boolean) => {
      setText((prev) => {
        if (token === "del") return prev.slice(0, -1);
        if (token === "space") return prev && !prev.endsWith(" ") ? prev + " " : prev;
        if (isWord) return prev && !prev.endsWith(" ") ? `${prev} ${token}` : prev + token;
        return prev + token;
      });
      setLastAdded({ token, at: Date.now() });
    };

    async function runLetters() {
      const [{ model: clf, classes }, mp] = await Promise.all([loadAlphabet("letters"), loadTasksVision()]);
      const fileset = await getVisionFileset();
      const lm = await mp.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (stopped) return lm.close();
      landmarker = lm;
      setPhase("no-hand");
      let holdLabel: string | null = null;
      let holdStart = 0;
      let busy = false;

      const loop = () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2 && !busy) {
          const now = performance.now();
          const result = lm.detectForVideo(video, now);
          if (result.landmarks?.length) {
            let flat: number[] = [];
            for (const p of result.landmarks[0]) flat.push(p.x, p.y, p.z);
            if (mirrorRef.current) flat = mirrorFlatLandmarks(flat);
            busy = true;
            const input = tf.tensor2d([flat], [1, 63]);
            const out = clf.predict(input) as tf.Tensor;
            out.data().then((data) => {
              busy = false;
              if (stopped) return;
              const arr = Array.from(data as unknown as number[]);
              const i = arr.indexOf(Math.max(...arr));
              const label = classes[i] ?? "?";
              const pct = arr[i] * 100;
              setGuess({ label, confidence: pct });
              if (pct >= COMMIT_PCT && label !== "-" && label !== "nothing") {
                if (label !== holdLabel) {
                  holdLabel = label;
                  holdStart = now;
                  setHold(0);
                  setPhase("holding");
                } else if (now - holdStart >= HOLD_MS && label !== lastCommittedRef.current) {
                  lastCommittedRef.current = label;
                  add(label, false);
                  setHold(1);
                  setPhase("added");
                } else if (label === lastCommittedRef.current) {
                  setHold(1);
                  setPhase("added");
                } else {
                  setHold(Math.min(1, (now - holdStart) / HOLD_MS));
                  setPhase("holding");
                }
              } else {
                holdLabel = null;
                setHold(0);
                setPhase("unsure");
              }
            });
            input.dispose();
            out.dispose();
          } else {
            holdLabel = null;
            lastCommittedRef.current = "";
            setHold(0);
            setGuess((g) => (g.label ? { label: "", confidence: 0 } : g));
            setPhase("no-hand");
          }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    async function runWords(language: SignLanguage) {
      const [{ model: clf, classes }, mp] = await Promise.all([loadWordModels(language), loadTasksVision()]);
      const fileset = await getVisionFileset();
      const lm = await mp.HolisticLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/mediapipe/holistic_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO",
        minPoseDetectionConfidence: 0.4,
        minHandLandmarksConfidence: 0.4,
      });
      if (stopped) return lm.close();
      landmarker = lm;
      setPhase("no-hand");
      const seg = new SignSegmenter();
      let classifying = false;

      const classify = async (frames: Float32Array[]) => {
        if (frames.length < 3 || classifying) return;
        classifying = true;
        setPhase("checking");
        try {
          const clip = trimToHandSpan(frames, language === "fsl" ? TRIM_MARGIN : ASL_TRIM_MARGIN);
          const norm = normalizeSequence(resampleSequence(clip, SEQUENCE_LENGTH));
          const flat = new Float32Array(SEQUENCE_LENGTH * MODEL_FEATURES_PER_FRAME);
          norm.forEach((f, i) => flat.set(f, i * MODEL_FEATURES_PER_FRAME));
          const input = tf.tensor3d(flat, [1, SEQUENCE_LENGTH, MODEL_FEATURES_PER_FRAME]);
          const out = clf.execute(input) as tf.Tensor;
          const probs = Array.from(await out.data());
          input.dispose();
          out.dispose();
          if (stopped) return;
          const i = probs.indexOf(Math.max(...probs));
          const pct = probs[i] * 100;
          if (pct >= WORD_MIN_PCT) {
            setGuess({ label: classes[i] ?? "?", confidence: pct });
            add(classes[i] ?? "?", true);
            setPhase("added");
          } else {
            setGuess({ label: "", confidence: pct });
            setPhase("unsure");
          }
        } finally {
          classifying = false;
        }
      };

      const loop = () => {
        if (stopped) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const now = performance.now();
          const result = lm.detectForVideo(video, now);
          const ev = seg.push(landmarksToVector(result), now);
          if (ev?.type === "start") setPhase("reading");
          else if (ev?.type === "end") void classify(ev.frames);
          else if (ev?.type === "discard") setPhase("unsure");
          const handSeen = !!(result.leftHandLandmarks?.length || result.rightHandLandmarks?.length);
          if (!seg.isActive && !classifying) {
            setPhase((p) => (!handSeen && (p === "reading" || p === "no-hand" || p === "loading") ? "no-hand" : p));
          }
        }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }

    (model.kind === "words" ? runWords(model.language) : runLetters()).catch(() => {
      // Best-effort during a call: a failed load means no captions for this
      // feed, never a dropped call.
      if (!stopped) setPhase("error");
    });

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      try {
        landmarker?.close();
      } catch {
        // already closed
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, modelKey, videoRef]);

  const clear = useCallback(() => {
    setText("");
    lastCommittedRef.current = "";
  }, []);
  const backspace = useCallback(() => {
    setText((t) => (model.kind === "words" ? t.replace(/\s*\S+\s*$/, "") : t.slice(0, -1)));
    lastCommittedRef.current = "";
  }, [model.kind]);
  const addSpace = useCallback(() => {
    setText((t) => (t && !t.endsWith(" ") ? t + " " : t));
    lastCommittedRef.current = "";
  }, []);

  return { phase, guess, hold, text, lastAdded, clear, backspace, addSpace };
}
