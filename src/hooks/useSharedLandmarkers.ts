import { useRef } from "react";
import { loadTasksVision, getVisionFileset } from "../lib/mediapipeVision";

// NOTE: landmarker instances are NOT hoisted/shared the way the camera stream
// is (see useSharedCameraStream). Each screen builds its own landmarker fresh
// on mount and closes it on unmount; only the FilesetResolver `vision`
// fileset (not a live graph, just resolved asset locators) and the runtime
// script load are cached (in lib/mediapipeVision), since those are safe to reuse.
//
// Builds here used to hang indefinitely (no error, no console output), and
// that was blamed on two Tasks Vision graphs deadlocking in one WASM runtime.
// It wasn't that: HolisticLandmarker builds in well under a second with a
// HandLandmarker still alive, or right after closing one. The real cause was
// the builder's /mediapipe/*.task fetch starving behind the word-model shard
// downloads, which had wedged every connection to the origin - see
// drainingFetch in modelLoader.ts.
export function useSharedLandmarkers() {
  // Every create/close goes through this single promise chain, so only one
  // landmarker (and its WebGL context) is ever alive. The flip side: a job
  // that never settles blocks every job queued after it, which is how the
  // Words build stalling (see NOTE above) also left Letters black after
  // switching back.
  const queueRef = useRef<Promise<any>>(Promise.resolve());
  const activeRef = useRef<any>(null);

  /** Run `job` after every previously queued landmarker operation finishes. */
  function serialize<T>(job: () => Promise<T>): Promise<T> {
    const run = queueRef.current.then(job, job);
    // Keep the chain alive regardless of whether this job succeeded.
    queueRef.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }


  /** Close whatever graph is currently alive and let the runtime settle. */
  async function closeActive() {
    const active = activeRef.current;
    if (!active) return;
    activeRef.current = null;
    try {
      active.close();
    } catch {
      // A double-close is harmless; losing the queue to it would not be.
    }
    // close() returns before the WASM side has finished unwinding. Yielding a
    // macrotask gives it a turn to actually finish before the next graph is
    // built - without this the new createFromOptions() can still hang.
    await new Promise((r) => setTimeout(r, 0));
  }

  /** Release a landmarker from a component cleanup (synchronous callers). */
  function releaseLandmarker(instance: any) {
    if (!instance) return;
    void serialize(async () => {
      if (activeRef.current === instance) await closeActive();
    });
  }

  async function createHandLandmarker(): Promise<any> {
    return serialize(async () => {
      await closeActive();
      const [vision, mp] = await Promise.all([getVisionFileset(), loadTasksVision()]);
      const instance = await mp.HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      activeRef.current = instance;
      return instance;
    });
  }

  async function createHolisticLandmarker(): Promise<any> {
    return serialize(async () => {
      await closeActive();
      const [vision, mp] = await Promise.all([getVisionFileset(), loadTasksVision()]);
      const instance = await mp.HolisticLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/mediapipe/holistic_landmarker.task",
        // HolisticLandmarker defaults to the GPU delegate (same as
        // HandLandmarker, which builds fine on this hardware), but its graph
        // is much heavier - it includes segmentation-mask smoothing that
        // HandLandmarker doesn't have at all - and createFromOptions() was
        // observed to hang indefinitely (no error, no console output, not
        // even the "GL version:" log HandLandmarker prints almost
        // immediately) both in Electron and in plain Chrome on this machine.
        // That points at a GPU-shader-specific stall rather than a fetch or
        // JS-side bug. Forcing CPU sidesteps whatever that GPU codepath is
        // doing. Revert to GPU (or drop this line) if this turns out not to
        // be the cause once tested.
        delegate: "CPU",
      },
        runningMode: "VIDEO",
        minPoseDetectionConfidence: 0.4,
        minHandLandmarksConfidence: 0.4,
      });
      activeRef.current = instance;
      return instance;
    });
  }

  return { createHandLandmarker, createHolisticLandmarker, releaseLandmarker };
}
