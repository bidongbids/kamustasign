// Measured recognition frame rate for the camera status line (it used to be
// a hard-coded "30 FPS"). Call tick(video) after each detection; only NEW
// camera frames count - the loop runs on requestAnimationFrame and can see
// the same frame twice. (currentTime can't tell: on a live stream it is a
// continuous clock, not a frame stamp; the decoded-frame counter is.) fps
// updates once a second, so this re-renders at 1 Hz, not per frame. 0 until
// the first second is measured.
import { useCallback, useEffect, useRef, useState } from "react";

export function useFpsMeter() {
  const frames = useRef(0);
  const lastFrame = useRef(-1);
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

  const tick = useCallback((video: HTMLVideoElement) => {
    const frame = video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime;
    if (frame === lastFrame.current) return;
    lastFrame.current = frame;
    frames.current++;
  }, []);

  return { fps, tick };
}

export function fpsLabel(fps: number) {
  return fps > 0 ? `${fps} FPS` : "-- FPS";
}
