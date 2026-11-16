// Loads the MediaPipe tasks-vision runtime for the page and hands it to
// src/lib/mediapipeVision.ts (loadTasksVision), which adds this file as a
// <script type="module" src=...>. It's a plain file under public/ rather than
// an inline script so the desktop app's Content-Security-Policy can refuse
// every inline script (electron/main.js); Metro can't bundle a URL import, so
// it isn't bundled either. The service worker caches it with the rest of
// /mediapipe.
//
// Local copy first (works offline), then the pinned CDN build.

const LOCAL = new URL("./tasks-vision/", import.meta.url).href;
// Must match TASKS_VISION_VERSION in src/lib/mediapipeVision.ts.
const CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/";

let m, base;
try {
  m = await import(LOCAL + "vision_bundle.js");
  base = LOCAL + "wasm";
} catch (localErr) {
  console.warn("[mediapipe] local bundle unavailable, using CDN", localErr);
  try {
    m = await import(CDN + "vision_bundle.mjs");
    base = CDN + "wasm";
  } catch (cdnErr) {
    window.__mpTasksVisionError = "Couldn't load MediaPipe (no local copy and the CDN is unreachable).";
  }
}
if (m) {
  window.__mpTasksVision = {
    FilesetResolver: m.FilesetResolver,
    HandLandmarker: m.HandLandmarker,
    HolisticLandmarker: m.HolisticLandmarker,
    wasmBase: base,
  };
}
window.dispatchEvent(new Event("mp-tasks-vision-ready"));
