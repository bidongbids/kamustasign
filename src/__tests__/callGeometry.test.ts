import { callLayout, type CallLayoutInput, type Rect } from "../screens/videocall/callGeometry";

const base: CallLayoutInput = { width: 1440, height: 900, role: "teacher", toolsOpen: false, asked: false, showBig: false, twoRows: false };
const within = (r: Rect, w: number, h: number) => r.left >= 0 && r.top >= 0 && r.left + r.width <= w && r.top + r.height <= h;
const overlaps = (a: Rect, b: Rect) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const inside = (inner: Rect, outer: Rect) =>
  inner.left >= outer.left &&
  inner.top >= outer.top &&
  inner.left + inner.width <= outer.left + outer.width &&
  inner.top + inner.height <= outer.top + outer.height;

describe("callLayout, desktop", () => {
  it("drawer closed: the remote video takes the stage, the self view is a PiP inside it", () => {
    const l = callLayout(base);
    expect(l.phone).toBe(false);
    expect(l.panel).toBeNull();
    expect(inside(l.self, l.remote)).toBe(true);
    expect(overlaps(l.remote, l.caption!)).toBe(false);
    expect(overlaps(l.remote, l.controls)).toBe(false);
    expect(within(l.remote, 1440, 900)).toBe(true);
  });

  it("a panel open: the drawer sits beside the video, never on it", () => {
    const l = callLayout({ ...base, toolsOpen: true });
    expect(l.panel!.width).toBe(400);
    expect(overlaps(l.remote, l.panel!)).toBe(false);
    expect(overlaps(l.caption!, l.panel!)).toBe(false);
    expect(l.remote.width).toBeLessThan(callLayout(base).remote.width);
  });

  it("the drawer grows with the screen: 360 below 1280, 400, then 440 from 1600", () => {
    expect(callLayout({ ...base, width: 1100, toolsOpen: true }).panel!.width).toBe(360);
    expect(callLayout({ ...base, width: 1600, toolsOpen: true }).panel!.width).toBe(440);
  });

  it("a laptop height (1366×768) gets the compact bars and the 400 drawer", () => {
    const l = callLayout({ ...base, width: 1366, height: 768, toolsOpen: true });
    expect(l.compact).toBe(true);
    expect(l.panel!.width).toBe(400);
    expect(l.controls.height).toBe(80);
    expect(l.remote.height).toBeGreaterThan(400);
  });

  it("student asked to sign: their own video is the big tile on top of the request column", () => {
    const l = callLayout({ ...base, role: "student", asked: true });
    expect(l.selfBig).toBe(true);
    expect(l.self.left).toBe(l.panel!.left);
    expect(l.self.top + l.self.height).toBeLessThan(l.panel!.top);
    expect(overlaps(l.self, l.remote)).toBe(false);
  });

  it("Show big keeps both videos on screen as tiles", () => {
    const l = callLayout({ ...base, showBig: true });
    expect(within(l.remote, 1440, 900)).toBe(true);
    expect(within(l.self, 1440, 900)).toBe(true);
    expect(overlaps(l.remote, l.self)).toBe(false);
    expect(l.remote.width).toBeGreaterThanOrEqual(160);
  });

  it("reading both people grows the caption strip without overlapping the video", () => {
    const one = callLayout(base);
    const two = callLayout({ ...base, twoRows: true });
    expect(two.caption!.height).toBeGreaterThan(one.caption!.height);
    expect(overlaps(two.remote, two.caption!)).toBe(false);
  });
});

describe("callLayout, phone", () => {
  const phone = { ...base, width: 390, height: 844 };

  it("the remote video fills the screen; the caption card floats above the controls", () => {
    const l = callLayout(phone);
    expect(l.phone).toBe(true);
    expect(l.remote).toEqual({ left: 0, top: 0, width: 390, height: 844 });
    expect(l.caption!.top + l.caption!.height).toBeLessThanOrEqual(l.controls.top);
    expect(within(l.self, 390, 844)).toBe(true);
  });

  it("the teacher's Practice / Sign reader sheet shrinks the video but keeps it readable", () => {
    const l = callLayout({ ...phone, toolsOpen: true });
    expect(l.remote.height).toBeGreaterThanOrEqual(300);
    expect(l.remote.width).toBeGreaterThanOrEqual(160);
    expect(l.panel!.top).toBeLessThan(l.remote.height);
    expect(l.panel!.top + l.panel!.height).toBe(l.controls.top);
  });

  it("student asked: self video swaps to the big container, the teacher goes to the PiP", () => {
    const l = callLayout({ ...phone, role: "student", asked: true });
    expect(l.selfBig).toBe(true);
    expect(l.self.width).toBe(390);
    expect(inside(l.remote, l.self)).toBe(true);
  });

  it("safe-area insets push the bars in", () => {
    const l = callLayout({ ...phone, insetTop: 44, insetBottom: 34 });
    expect(l.topBar.top).toBe(44);
    expect(l.controls.height).toBe(92 + 34);
  });
});
