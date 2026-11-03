// Body + hands tracking (MediaPipe Holistic) for the word models, run in a
// Web Worker (public/mediapipe/holistic-worker.js) when the browser allows.
//
// Holistic costs ~65 ms per frame on the CPU (the GPU delegate is slower and
// hangs on some machines - see useSharedLandmarkers), so on the page's own
// thread it froze the camera preview and the rest of the screen for most of
// every frame. In the worker the page stays smooth. Recognition runs at the
// same ~12-15 frames a second either way: the frame rate is set by
// Holistic itself.
//
// If the worker can't start (no module workers / OffscreenCanvas, or the
// worker errors while loading), this falls back to the page-thread
// landmarker, once per session, so tracking never stops working because of it.
import { loadTasksVision, getVisionFileset } from "./mediapipeVision";

/** The Holistic result fields the word pipeline uses (see landmarksToVector). */
export type HolisticResult = {
  poseLandmarks?: any;
  leftHandLandmarks?: any;
  rightHandLandmarks?: any;
};

export interface HolisticTracker {
  /** Where tracking runs, for logs and tests. */
  readonly where: "worker" | "page";
  /** True while a frame is being tracked: detect() returns null then. */
  readonly busy: boolean;
  /**
   * Tracks the video's current frame. Null when the previous frame is still
   * being tracked (skip this one). Resolves null if the tracker was closed
   * meanwhile. Timestamps must increase from call to call.
   */
  detect(video: HTMLVideoElement, timestampMs: number): Promise<HolisticResult | null> | null;
  close(): void;
}

const MODEL_PATH = "/mediapipe/holistic_landmarker.task";
const WORKER_PATH = "/mediapipe/holistic-worker.js";
const OPTIONS = { minPoseDetectionConfidence: 0.4, minHandLandmarksConfidence: 0.4 };
// The model is 13.6 MB: give a slow first download time, but never hang forever.
const WORKER_START_TIMEOUT_MS = 60_000;

let workerFailed = false;

export async function createHolisticTracker(): Promise<HolisticTracker> {
  if (!workerFailed && workerSupported()) {
    try {
      return await createWorkerTracker();
    } catch (err) {
      workerFailed = true;
      console.warn("[holistic] worker unavailable, tracking on the page thread instead:", err);
    }
  }
  return createPageTracker();
}

function workerSupported(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function"
  );
}

function createWorkerTracker(): Promise<HolisticTracker> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, { type: "module" });
    let ready = false;
    let closed = false;
    let busy = false;
    let nextId = 0;
    const pending = new Map<number, { resolve: (r: HolisticResult | null) => void; reject: (e: Error) => void }>();

    const settleAll = (err: Error | null) => {
      pending.forEach((p) => (err ? p.reject(err) : p.resolve(null)));
      pending.clear();
      busy = false;
    };
    const failStart = (err: Error) => {
      clearTimeout(timer);
      closed = true;
      worker.terminate();
      reject(err);
    };
    const timer = setTimeout(() => failStart(new Error("worker took too long to start")), WORKER_START_TIMEOUT_MS);

    worker.onerror = (e) => {
      const err = new Error(e.message || "worker error");
      if (!ready) failStart(err);
      else settleAll(err);
    };
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "ready") {
        clearTimeout(timer);
        ready = true;
        resolve(tracker);
      } else if (msg.type === "error" && msg.id === undefined) {
        failStart(new Error(msg.message));
      } else if (msg.type === "result" || msg.type === "error") {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        busy = false;
        if (msg.type === "result") p?.resolve(msg.result);
        else p?.reject(new Error(msg.message));
      }
    };

    const tracker: HolisticTracker = {
      where: "worker",
      get busy() {
        return busy;
      },
      detect(video, timestampMs) {
        if (busy || closed) return null;
        busy = true;
        const id = nextId++;
        return createImageBitmap(video).then(
          (frame) =>
            new Promise<HolisticResult | null>((res, rej) => {
              if (closed) {
                frame.close();
                busy = false;
                res(null);
                return;
              }
              pending.set(id, { resolve: res, reject: rej });
              worker.postMessage({ type: "detect", id, frame, ts: timestampMs }, [frame]);
            }),
          (err) => {
            busy = false;
            throw err;
          }
        );
      },
      close() {
        if (closed) return;
        closed = true;
        settleAll(null);
        worker.postMessage({ type: "close" });
        // The worker closes itself; terminate in case it is stuck mid-frame.
        setTimeout(() => worker.terminate(), 2000);
      },
    };

    worker.postMessage({
      type: "init",
      modelUrl: new URL(MODEL_PATH, self.location.href).href,
      options: OPTIONS,
    });
  });
}

async function createPageTracker(): Promise<HolisticTracker> {
  const [vision, mp] = await Promise.all([getVisionFileset(), loadTasksVision()]);
  const landmarker = await mp.HolisticLandmarker.createFromOptions(vision, {
    // CPU: the GPU delegate's build hung indefinitely on this hardware, in
    // Electron and in Chrome (see useSharedLandmarkers).
    baseOptions: { modelAssetPath: MODEL_PATH, delegate: "CPU" },
    runningMode: "VIDEO",
    ...OPTIONS,
  });
  let closed = false;
  return {
    where: "page",
    busy: false,
    detect(video, timestampMs) {
      if (closed) return null;
      try {
        return Promise.resolve(landmarker.detectForVideo(video, timestampMs));
      } catch (err) {
        return Promise.reject(err);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      landmarker.close();
    },
  };
}
