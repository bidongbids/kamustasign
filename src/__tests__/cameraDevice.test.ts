import { isVirtualCamera, openCamera } from "../lib/cameraDevice";

type Cam = { deviceId: string; label: string };

/**
 * A fake navigator.mediaDevices: `cams` in enumeration order; with no
 * deviceId, `fallback` is opened. `oneAtATime`: like many phones, a camera
 * can't open while another is still live.
 */
function fakeDevices(
  cams: Cam[],
  opts: { hideLabelsUntilGrant?: boolean; fallback?: string; fail?: Record<string, string>; oneAtATime?: boolean } = {}
) {
  let granted = !opts.hideLabelsUntilGrant;
  const opened: { device: string; stopped: boolean }[] = [];
  const stream = (device: string) => {
    if (opts.oneAtATime && opened.some((o) => !o.stopped)) throw Object.assign(new Error("busy"), { name: "NotReadableError" });
    const rec = { device, stopped: false };
    opened.push(rec);
    const label = cams.find((c) => c.deviceId === device)?.label ?? "";
    const track = { label, stop: () => (rec.stopped = true), getSettings: () => ({ deviceId: device }) };
    return { getVideoTracks: () => [track], getTracks: () => [track], device } as unknown as MediaStream & { device: string };
  };
  const md = {
    enumerateDevices: jest.fn(async () =>
      cams.map((c) => ({ kind: "videoinput", deviceId: granted ? c.deviceId : "", label: granted ? c.label : "" }))
    ),
    getUserMedia: jest.fn(async (c: { video: MediaTrackConstraints & { deviceId?: { exact: string } } }) => {
      const device = c.video.deviceId?.exact ?? opts.fallback ?? cams[0].deviceId;
      const err = opts.fail?.[device];
      if (err) throw Object.assign(new Error(err), { name: err });
      granted = true;
      return stream(device);
    }),
  };
  Object.defineProperty(globalThis, "navigator", { value: { mediaDevices: md }, configurable: true });
  return { md, opened };
}

const ACER = { deviceId: "acer", label: "ACER HD User Facing (0408:403d)" };
const LOGI = { deviceId: "logi", label: "Logi Capture" };
const OBS = { deviceId: "obs", label: "OBS Virtual Camera" };
const EMEET = { deviceId: "emeet", label: "EMEET STUDIO Virtual Camera" };
const VIDEO = { width: { ideal: 960 }, height: { ideal: 720 } };
// Android's labels (Chrome and the app's web view).
const BACK = { deviceId: "back", label: "camera2 0, facing back" };
const FRONT = { deviceId: "front", label: "camera2 1, facing front" };

describe("camera choice", () => {
  it("recognises virtual cameras but not real or phone cameras", () => {
    for (const l of ["Logi Capture", "OBS Virtual Camera", "EMEET STUDIO Virtual Camera", "Snap Camera", "NVIDIA Broadcast"])
      expect(isVirtualCamera(l)).toBe(true);
    for (const l of ["ACER HD User Facing (0408:403d)", "HD Pro Webcam C920", "EMEET SmartCam C60E 4K", "DroidCam Source 3", "Integrated Camera"])
      expect(isVirtualCamera(l)).toBe(false);
  });

  it("names the real camera when a virtual one is listed (the 2026-11-04 Logi Capture bug)", async () => {
    const { md } = fakeDevices([EMEET, LOGI, ACER, OBS], { fallback: "logi" });
    const s = (await openCamera(VIDEO)) as MediaStream & { device: string };
    expect(s.device).toBe("acer");
    expect(md.getUserMedia).toHaveBeenCalledWith({ video: { ...VIDEO, deviceId: { exact: "acer" } }, audio: false });
  });

  it("uses a virtual camera when it is the only one", async () => {
    fakeDevices([OBS], { fallback: "obs" });
    expect(((await openCamera(VIDEO)) as MediaStream & { device: string }).device).toBe("obs");
  });

  it("first browser grant: names hidden, Chromium picks a virtual camera, so it moves to the real one", async () => {
    const { opened } = fakeDevices([ACER, LOGI], { hideLabelsUntilGrant: true, fallback: "logi" });
    const s = (await openCamera(VIDEO, true)) as MediaStream & { device: string };
    expect(s.device).toBe("acer");
    expect(opened).toEqual([{ device: "logi", stopped: true }, { device: "acer", stopped: false }]);
  });

  it("first grant with one webcam opens it once (no second open of the same camera)", async () => {
    const { opened } = fakeDevices([ACER], { hideLabelsUntilGrant: true });
    expect(((await openCamera(VIDEO)) as MediaStream & { device: string }).device).toBe("acer");
    expect(opened).toEqual([{ device: "acer", stopped: false }]);
  });

  it("phone: the selfie camera is used, whatever order the cameras are listed in", async () => {
    const { md } = fakeDevices([BACK, FRONT]);
    expect(((await openCamera(VIDEO)) as MediaStream & { device: string }).device).toBe("front");
    expect(md.getUserMedia).toHaveBeenCalledWith({ video: { ...VIDEO, deviceId: { exact: "front" } }, audio: false });
  });

  it("phone first grant: asks for the selfie camera, and moves off the back camera if it got that", async () => {
    const asked = fakeDevices([BACK, FRONT], { hideLabelsUntilGrant: true });
    await openCamera(VIDEO);
    expect(asked.md.getUserMedia.mock.calls[0][0]).toEqual({ video: { facingMode: "user", ...VIDEO }, audio: false });

    // The phone ignored facingMode and opened the back camera; it can't run
    // two cameras, so the back one is let go before the front one opens.
    const { opened } = fakeDevices([BACK, FRONT], { hideLabelsUntilGrant: true, oneAtATime: true });
    expect(((await openCamera(VIDEO)) as MediaStream & { device: string }).device).toBe("front");
    expect(opened).toEqual([{ device: "back", stopped: true }, { device: "front", stopped: false }]);
  });

  it("a busy real camera falls back to the unnamed request; a refusal is not retried", async () => {
    const busy = fakeDevices([ACER, LOGI], { fallback: "logi", fail: { acer: "NotReadableError" } });
    expect(((await openCamera(VIDEO)) as MediaStream & { device: string }).device).toBe("logi");
    expect(busy.md.getUserMedia).toHaveBeenCalledTimes(2);

    const refused = fakeDevices([ACER], { fail: { acer: "NotAllowedError" } });
    await expect(openCamera(VIDEO)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(refused.md.getUserMedia).toHaveBeenCalledTimes(1);
  });
});
