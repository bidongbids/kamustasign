// One loader for the @mediapipe/tasks-vision runtime (JS bundle + WASM),
// shared by the translator screens and the in-call sign reader.
//
// Local-first: public/mediapipe/tasks-vision/ holds a vendored copy so the
// translator still works with no internet (defense venue Wi-Fi, Electron
// offline). If that folder is missing it falls back to the pinned CDN build.
//
// Pinned, not "@latest": HolisticLandmarker's JS/WASM implementation has a
// long history of version-specific breakage upstream (see
// github.com/google-ai-edge/mediapipe issues #5154 and #5166) - GPU
// delegation has been broken across many releases from 0.10.10 through at
// least 0.10.20+, and on this machine even the CPU delegate hung
// indefinitely (no error, no console output at all) on whatever "@latest"
// (1.0.1) currently resolves to. 0.10.15 has a direct upstream report of
// "Holistic Web runs without error" (issue #5166, 2024-09-23). If a future
// bump of this pin is needed, check that issue thread for which versions
// people report as working before moving off it, and replace the vendored
// files too (see public/mediapipe/tasks-vision/README.md).
// The CDN fallback URLs in public/mediapipe/load-tasks-vision.js and
// holistic-worker.js repeat this version - change them together.
export const TASKS_VISION_VERSION = "0.10.15";

type TasksVision = {
  FilesetResolver: any;
  HandLandmarker: any;
  HolisticLandmarker: any;
  /** Where the bundle actually came from; the WASM is loaded from the same place. */
  wasmBase: string;
};

let tasksVision: Promise<TasksVision> | null = null;
let visionFileset: Promise<any> | null = null;

// public/mediapipe/load-tasks-vision.js does the loading (local copy, then
// CDN) and signals with an "mp-tasks-vision-ready" event. It's added as a
// module <script src> rather than import() so Metro doesn't try to bundle the
// URL, and as a file rather than inline code so the desktop app's
// Content-Security-Policy can refuse inline scripts.
const LOADER_URL = "/mediapipe/load-tasks-vision.js";
// A module runs once per URL, so a retry after a failure needs a fresh one.
let loaderRuns = 0;

export function loadTasksVision(): Promise<TasksVision> {
  if (tasksVision) return tasksVision;
  tasksVision = new Promise<TasksVision>((resolve, reject) => {
    const w = window as any;
    // Survives a Fast Refresh that re-evaluates this module.
    if (w.__mpTasksVision) {
      resolve(w.__mpTasksVision);
      return;
    }
    const onReady = () => {
      if (w.__mpTasksVision) resolve(w.__mpTasksVision);
      else reject(new Error(w.__mpTasksVisionError ?? "Failed to load MediaPipe"));
    };
    window.addEventListener("mp-tasks-vision-ready", onReady, { once: true });

    const script = document.createElement("script");
    script.type = "module";
    script.src = loaderRuns++ === 0 ? LOADER_URL : `${LOADER_URL}?retry=${loaderRuns}`;
    script.onerror = () => {
      window.removeEventListener("mp-tasks-vision-ready", onReady);
      reject(new Error("Couldn't load MediaPipe (its loader script didn't load)."));
    };
    document.head.appendChild(script);
  });
  // Let a later attempt retry (e.g. the network came back) instead of
  // caching the failure forever.
  tasksVision.catch(() => {
    tasksVision = null;
  });
  return tasksVision;
}

/** The FilesetResolver result (resolved WASM locators), cached once per page. */
export function getVisionFileset(): Promise<any> {
  if (!visionFileset) {
    visionFileset = loadTasksVision().then((mp) => mp.FilesetResolver.forVisionTasks(mp.wasmBase));
    visionFileset.catch(() => {
      visionFileset = null;
    });
  }
  return visionFileset;
}
