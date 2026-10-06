// Reusable sign-recognition loop, parameterized by a <video> ref instead of
// owning its own camera - so it can run independently against either the
// local preview or the incoming peer stream during a video call (see
// SESSION_SUMMARY_for_UI_and_VideoChat.md's "each device runs its own local
// copy of the recognition pipeline... applied to two video streams").
// Translation is never computed from a remote source or sent over the
// network - each side just points this same on-device pipeline at whichever
// <video> element it's given.
//
// Deliberately a standalone copy of the alphabet-model loop in
// LiveTranslatorScreen.tsx rather than a shared refactor of it - that screen
// is being actively edited elsewhere, so this trades a bit of duplication
// for not touching a file mid-edit in a parallel chat.
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as tf from "@tensorflow/tfjs";
import { loadModel, getLabelForIndex } from "../ml/modelLoader";

declare global {
  interface Window {
    __mpVision?: any;
  }
}

function loadMediapipeVisionFromCDN(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.__mpVision) {
      resolve(window.__mpVision);
      return;
    }
    window.addEventListener("mp-vision-ready", () => resolve(window.__mpVision), { once: true });

    const script = document.createElement("script");
    script.type = "module";
    script.textContent =
      'import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs"; ' +
      'window.__mpVision = { FilesetResolver, HandLandmarker }; ' +
      'window.dispatchEvent(new Event("mp-vision-ready"));';
    script.onerror = () => reject(new Error("Failed to load MediaPipe vision bundle from CDN"));
    document.head.appendChild(script);
  });
}

export function useSignRecognitionOverlay(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean
) {
  const [prediction, setPrediction] = useState("-");
  const [confidence, setConfidence] = useState(0);

  useEffect(() => {
    if (!active || Platform.OS !== "web") return;

    let handLandmarker: any = null;
    let model: any = null;
    let animationId: number | null = null;
    let stopped = false;

    async function setup() {
      model = await loadModel();
      const mpVision = await loadMediapipeVisionFromCDN();
      const vision = await mpVision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      handLandmarker = await mpVision.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (!stopped) loop();
    }

    function loop() {
      if (stopped) return;
      const video = videoRef.current;

      if (handLandmarker && model && video && video.readyState >= 2) {
        const result = handLandmarker.detectForVideo(video, performance.now());

        if (result.landmarks && result.landmarks.length > 0) {
          const flat: number[] = [];
          for (const lm of result.landmarks[0]) flat.push(lm.x, lm.y, lm.z);

          const inputTensor = tf.tensor2d([flat], [1, 63]);
          const outputTensor = model.predict(inputTensor);
          outputTensor
            .data()
            .then((data: Float32Array | Int32Array | Uint8Array) => {
              const arr = Array.from(data as unknown as number[]);
              const maxIndex = arr.indexOf(Math.max(...arr));
              setPrediction(getLabelForIndex(maxIndex));
              setConfidence(arr[maxIndex] * 100);
            });
          inputTensor.dispose();
          outputTensor.dispose();
        } else {
          setPrediction("-");
          setConfidence(0);
        }
      }

      animationId = requestAnimationFrame(loop);
    }

    setup().catch(() => {
      // Overlay is best-effort during a call - a load failure just means no
      // caption for that tile, it shouldn't tear down the call itself.
    });

    return () => {
      stopped = true;
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [active, videoRef]);

  return { prediction, confidence };
}
