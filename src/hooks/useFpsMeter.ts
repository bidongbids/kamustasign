// Measured recognition frame rate for the camera status line (it used to be
// a hard-coded "30 FPS"). Call tick(video) once per loop iteration, before
// detecting: it returns false when the camera hasn't produced a new frame
// since the last call, and the loop should skip detection then. The loops
// run on requestAnimationFrame (60+ Hz) while webcams deliver ~30 fps, so
// without the check every frame was run through MediaPipe and the model
// twice - doubling the main-thread work for nothing - and the Words
// segmenter saw the repeat as a zero-speed sample mid-sign. (currentTime
// can't tell: on a live stream it is a continuous clock, not a frame stamp;
// the decoded-frame counter is.) fps updates once a second, so this
// re-renders at 1 Hz, not per frame. 0 until the first second is measured.
import { useCallback, useEffect, useRef, useState } from "react";

// If a browser's counter doesn't advance for a camera stream, no frame would
// ever look new and detection would stop; after this long, treat it as new.
const STALE_FRAME_MS = 100;

/**
 * Returns a check that is true when `video` has a frame the caller hasn't
 * seen yet (see the note above). One per loop.
 */
export function createFrameGate(): (video: HTMLVideoElement) => boolean {
  let last = -1;
  let lastAt = 0;
  return (video) => {
    const frame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;
    const now = performance.now();
    if (frame === last && now - lastAt < STALE_FRAME_MS) return false;
    last = frame;
    lastAt = now;
    return true;
  };
}

export function useFpsMeter() {
  const frames = useRef(0);
  const gate = useRef(createFrameGate());
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      setFps(Math.round((frames.current * 1000) / (now - last)));
      frames.current = 0;
      last = now;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /** True when `video` has a frame the loop hasn't seen yet (and counts it). */
  const tick = useCallback((video: HTMLVideoElement): boolean => {
    if (!gate.current(video)) return false;
    frames.current++;
    return true;
  }, []);

  return { fps, tick };
}

export function fpsLabel(fps: number) {
  return fps > 0 ? `${fps} FPS` : "-- FPS";
}
