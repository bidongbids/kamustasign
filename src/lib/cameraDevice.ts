// Opens the webcam, preferring a real camera over a virtual one.
//
// The app asks for 960x720 (CAMERA_VIDEO) without naming a device. Chromium
// then picks whichever camera FITS that best, not the default one, and
// virtual cameras (Logitech's "Logi Capture", OBS, EMEET Studio, Snap Camera,
// ...) advertise nearly every size. On a PC with one installed, the
// Translator showed that software's placeholder picture instead of the
// webcam (2026-11-04, the dev PC: ACER HD User Facing lost to Logi Capture).
// So: name the first real camera explicitly, and only fall back to a virtual
// one when it is all there is.

/**
 * Software cameras that re-publish or generate a picture. Phone-as-webcam
 * apps (DroidCam, Iriun, Camo) are left out on purpose: they are a real
 * camera someone chose to plug in.
 */
const VIRTUAL_CAMERA =
  /virtual|\bobs\b|logi capture|snap camera|manycam|xsplit|nvidia broadcast|mmhmm|streamlabs|chromacam|youcam|splitcam/i;

export function isVirtualCamera(label: string): boolean {
  return VIRTUAL_CAMERA.test(label);
}

/**
 * Phones and tablets name the way each camera faces ("camera2 1, facing
 * front" on Android, "Front Camera" on iPad). Signing is done facing the
 * screen, so the selfie camera wins there; PC webcams rarely say "front", so
 * they keep the first real camera.
 */
const FRONT_CAMERA = /\bfront\b/i;

/**
 * The deviceId of the camera to use - the front camera when one is named,
 * else the first real camera - or null when there is none or the browser
 * hides camera names (no camera permission granted yet).
 */
export async function preferredCameraId(): Promise<string | null> {
  const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput" && d.deviceId);
  if (!cams.some((d) => d.label)) return null;
  const real = cams.filter((d) => !isVirtualCamera(d.label));
  return (real.find((d) => FRONT_CAMERA.test(d.label)) ?? real[0])?.deviceId ?? null;
}

const isPermissionError = (e: unknown) => {
  const name = (e as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
};

/** getUserMedia for `video` (+ mic if `audio`), on a real camera when there is one. */
export async function openCamera(video: MediaTrackConstraints, audio = false): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  const onDevice = (deviceId: string) => md.getUserMedia({ video: { ...video, deviceId: { exact: deviceId } }, audio });

  const id = await preferredCameraId().catch(() => null);
  if (id) {
    try {
      return await onDevice(id);
    } catch (e) {
      // A refusal is the user's answer; anything else (camera busy or
      // unplugged since it was listed) gets the unnamed request below.
      if (isPermissionError(e)) throw e;
    }
  }

  // facingMode is only a preference: it steers a phone to its selfie camera
  // and is ignored by webcams, which don't report one.
  const stream = await md.getUserMedia({ video: { facingMode: "user", ...video }, audio });
  // In a browser the names are hidden until the first permission grant, so
  // the pick above can't happen and Chromium may have chosen a virtual
  // camera (or a phone's back camera). The names are visible now: move to
  // the preferred camera if this isn't it. It is a different device, so it
  // can open while this one is live.
  const track = stream.getVideoTracks()[0];
  if (track && (isVirtualCamera(track.label) || !FRONT_CAMERA.test(track.label))) {
    const realId = await preferredCameraId().catch(() => null);
    if (realId && realId !== id && realId !== track.getSettings?.().deviceId) {
      // (realId === id: that camera was just tried by name and failed)
      try {
        const real = await onDevice(realId);
        stream.getTracks().forEach((t) => t.stop());
        return real;
      } catch {
        // A virtual camera is kept rather than none. A real one (a phone's
        // back camera) is let go: phones often can't run two cameras at
        // once, so the front camera gets a second try on its own.
        if (!isVirtualCamera(track.label)) {
          stream.getTracks().forEach((t) => t.stop());
          try {
            return await onDevice(realId);
          } catch {
            return md.getUserMedia({ video: { facingMode: "user", ...video }, audio });
          }
        }
      }
    }
  }
  return stream;
}
