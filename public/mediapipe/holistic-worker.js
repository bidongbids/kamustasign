// MediaPipe Holistic (body + hands tracking for the word models) in a Web
// Worker, so its ~65 ms per camera frame on the CPU no longer blocks the
// page: the camera preview, buttons and animations stay smooth while it
// works. Driven by src/lib/holisticTracker.ts, which falls back to running
// Holistic on the page itself if this worker can't start.
//
// Messages in:  {type: "init", modelUrl, options}
//               {type: "detect", id, frame: ImageBitmap, ts}   (frame is transferred)
//               {type: "close"}
// Messages out: {type: "ready"} | {type: "error", message}      (init)
//               {type: "result", id, result} | {type: "error", id, message}
//
// Same runtime version, model file, CPU delegate and options as the page
// version, so the landmarks - and therefore the word models' input - match.
// Kept as a plain file under public/ (not bundled) like the rest of
// /mediapipe; the service worker caches it with them.

const LOCAL = new URL("./tasks-vision/", self.location.href).href;
// Must match TASKS_VISION_VERSION in src/lib/mediapipeVision.ts.
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/";

let landmarker = null;

async function loadBundle() {
  try {
    return { m: await import(LOCAL + "vision_bundle.js"), base: LOCAL + "wasm" };
  } catch (localErr) {
    console.warn("[holistic-worker] local bundle unavailable, using CDN", localErr);
    return { m: await import(CDN + "vision_bundle.mjs"), base: CDN + "wasm" };
  }
}

async function init({ modelUrl, options }) {
  const { m, base } = await loadBundle();
  const fileset = await m.FilesetResolver.forVisionTasks(base);
  // The runtime loads its WASM glue with importScripts(), which module
  // workers don't have (it throws). Run the glue here instead, as a classic
  // script in the worker's global scope - that defines self.ModuleFactory -
  // and leave wasmLoaderPath out so the runtime goes straight to it.
  if (!self.ModuleFactory) {
    const res = await fetch(fileset.wasmLoaderPath);
    if (!res.ok) throw new Error(`MediaPipe WASM loader: HTTP ${res.status}`);
    (0, eval)(await res.text());
  }
  if (!self.ModuleFactory) throw new Error("MediaPipe WASM loader did not define ModuleFactory");
  landmarker = await m.HolisticLandmarker.createFromOptions(
    { wasmBinaryPath: fileset.wasmBinaryPath },
    {
      baseOptions: { modelAssetPath: modelUrl, delegate: "CPU" },
      runningMode: "VIDEO",
      ...options,
    }
  );
}

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    try {
      await init(msg);
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "error", message: String((err && err.message) || err) });
    }
  } else if (msg.type === "detect") {
    const { id, frame, ts } = msg;
    try {
      const r = landmarker.detectForVideo(frame, ts);
      // Only what the word models and the overlay use (not the 478-point face).
      self.postMessage({
        type: "result",
        id,
        result: {
          poseLandmarks: r.poseLandmarks,
          leftHandLandmarks: r.leftHandLandmarks,
          rightHandLandmarks: r.rightHandLandmarks,
        },
      });
    } catch (err) {
      self.postMessage({ type: "error", id, message: String((err && err.message) || err) });
    } finally {
      frame.close();
    }
  } else if (msg.type === "close") {
    try {
      if (landmarker) landmarker.close();
    } catch (err) {
      // already closed
    }
    landmarker = null;
    self.close();
  }
};
