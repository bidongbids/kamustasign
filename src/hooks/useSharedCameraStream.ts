import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Letters and Words used to each call getUserMedia in their own mount effect
// and stop() the stream in their own unmount cleanup. Switching tabs unmounts
// one screen and mounts the other in the SAME React commit, so the old
// screen's stream.stop() and the new screen's getUserMedia() ran back to
// back in the same passive-effect flush - no real time for the OS/driver to
// actually release the device before it was asked to hand it back out. On
// Windows that reliably returned a stream whose track was already `ended`
// (or hung), leaving the camera panel black from the very first switch. Fix
// (per docs/CAMERA_BUG_HANDOFF.md H1): acquire the camera once, owned by
// TranslatorHubScreen which outlives every tab, and hand the same live
// MediaStream to whichever screen is mounted. Only the hub's own unmount
// (leaving the Translator entirely) stops the tracks.
// What to ask the webcam for. A bare `video: true` lets Chrome pick 640x480,
// and some webcams' native 640x480 mode is broken: an EMEET SmartCam C60E pads
// most frames with a ~100 px black band on one side, which shows as a black
// strip on the mirrored preview. Its 960x720 mode is clean. `ideal` (not
// `exact`) keeps cameras without that mode working - Chrome takes the closest
// one and crops/scales it to 4:3, the shape the app has always used.
// The trackers resize frames internally, so the extra pixels cost almost nothing.
export const CAMERA_VIDEO: MediaTrackConstraints = {
  width: { ideal: 960 },
  height: { ideal: 720 },
  aspectRatio: { ideal: 4 / 3 },
  frameRate: { ideal: 30 },
};

export function useSharedCameraStream() {
  const streamPromiseRef = useRef<Promise<MediaStream> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      const pending = streamPromiseRef.current;
      streamPromiseRef.current = null;
      streamRef.current = null;
      pending?.then((stream) => stream.getTracks().forEach((t) => t.stop())).catch(() => {});
    };
  }, []);

  function getCameraStream(): Promise<MediaStream> {
    if (Platform.OS !== "web") {
      return Promise.reject(new Error("Camera only supported on web"));
    }
    // A track can end without anyone stopping it (camera unplugged, driver
    // reset, the OS handing the device to another app). Don't keep handing
    // that dead stream to every tab for the rest of the session - drop it
    // and acquire a fresh one.
    const cached = streamRef.current;
    if (cached && !cached.getVideoTracks().some((t) => t.readyState === "live")) {
      cached.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      streamPromiseRef.current = null;
    }
    if (!streamPromiseRef.current) {
      const pending = navigator.mediaDevices.getUserMedia({ video: CAMERA_VIDEO }).then(
        (stream) => {
          if (streamPromiseRef.current === pending) streamRef.current = stream;
          return stream;
        },
        (err) => {
          // Don't cache a failed acquisition (e.g. permission denied) - let
          // the next mount's setup() try again instead of replaying the same
          // rejection forever.
          if (streamPromiseRef.current === pending) streamPromiseRef.current = null;
          throw err;
        }
      );
      streamPromiseRef.current = pending;
    }
    return streamPromiseRef.current;
  }

  return { getCameraStream };
}
