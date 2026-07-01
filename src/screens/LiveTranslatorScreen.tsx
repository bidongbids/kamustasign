import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { loadModel, getLabelForIndex } from "../ml/modelLoader";
import * as tf from "@tensorflow/tfjs";
import { colors, fonts, spacing, radii } from "../theme/theme";

function loadMediapipeVisionFromCDN() {
  return new Promise((resolve, reject) => {
    if (window.__mpVision) {
      resolve(window.__mpVision);
      return;
    }
    window.addEventListener("mp-vision-ready", () => {
      resolve(window.__mpVision);
    }, { once: true });

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

export default function LiveTranslatorScreen() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [prediction, setPrediction] = useState("-");
  const [confidence, setConfidence] = useState(0);
  const [status, setStatus] = useState("Starting...");

  useEffect(() => {
    if (Platform.OS !== "web") {
      setStatus("Live translator currently supports web only.");
      return;
    }

    let handLandmarker = null;
    let animationId = null;
    let stream = null;
    let model = null;
    let stopped = false;

    async function setup() {
      setStatus("Loading model...");
      model = await loadModel();

      setStatus("Loading hand detector from CDN...");
      const mpVision = await loadMediapipeVisionFromCDN();

      const vision = await mpVision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      handLandmarker = await mpVision.HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/mediapipe/hand_landmarker.task",
        },
        runningMode: "VIDEO",
        numHands: 1,
      });

      setStatus("Requesting camera access...");
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus("Running.");
      loop();
    }

    function loop() {
      if (stopped || !handLandmarker || !videoRef.current || !model) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const nowMs = performance.now();

      if (video.readyState >= 2) {
        const result = handLandmarker.detectForVideo(video, nowMs);

        let ctx = null;
        if (canvas) {
          ctx = canvas.getContext("2d");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (result.landmarks && result.landmarks.length > 0) {
          const landmarks = result.landmarks[0];

          if (ctx) {
            ctx.fillStyle = "#F2A93B";
            for (const lm of landmarks) {
              ctx.beginPath();
              ctx.arc(lm.x * canvas.width, lm.y * canvas.height, 4, 0, 2 * Math.PI);
              ctx.fill();
            }
          }

          const flat = [];
          for (const lm of landmarks) {
            flat.push(lm.x, lm.y, lm.z);
          }

          const inputTensor = tf.tensor2d([flat], [1, 63]);
          const outputTensor = model.predict(inputTensor);
          outputTensor.data().then((data) => {
            const arr = Array.from(data);
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

    setup().catch((err) => {
      setStatus("ERROR: " + (err && err.message ? err.message : String(err)));
    });

    return () => {
      stopped = true;
      if (animationId) cancelAnimationFrame(animationId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live Translator (Web Test)</Text>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.videoWrap}>
        <video ref={videoRef} style={styles.video} playsInline muted />
        <canvas ref={canvasRef} style={styles.canvas} />
      </View>

      <View style={styles.resultBox}>
        <Text style={styles.resultLabel}>Detected sign:</Text>
        <Text style={styles.resultValue}>{prediction}</Text>
        <Text style={styles.resultConfidence}>{confidence.toFixed(1)}% confidence</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primaryTeal,
    marginBottom: spacing.xs,
  },
  status: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  videoWrap: {
    width: 480,
    height: 360,
    backgroundColor: "#000",
    borderRadius: radii.md,
    overflow: "hidden",
    marginBottom: spacing.lg,
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    transform: [{ scaleX: -1 }],
  },
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    transform: [{ scaleX: -1 }],
  },
  resultBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    alignItems: "center",
    minWidth: 240,
  },
  resultLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  resultValue: {
    fontFamily: fonts.heading,
    fontSize: 48,
    color: colors.primaryTeal,
  },
  resultConfidence: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
});
