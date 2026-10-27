// Where everything goes on the call screen, as absolute rectangles in the
// screen's own coordinates. The two <video> elements are created once and
// only moved and resized with these numbers, so a layout change (the Tools
// drawer, a practice request, Show big, crossing the phone breakpoint) never
// re-creates them. Re-creating them is what left both videos black after a
// window was resized mid-call (design_handoff_teacher_admin_videocall
// README, RN note 1).

export type Rect = { left: number; top: number; width: number; height: number };

export type CallLayoutInput = {
  width: number;
  height: number;
  role: "teacher" | "student";
  /** Teacher: the Tools drawer (desktop) or sheet (phone) is open. */
  toolsOpen: boolean;
  /** Student: a practice request is up - their own video becomes the big one. */
  asked: boolean;
  showBig: boolean;
  /** Desktop caption strip grows a second "You: …" row (reading both people). */
  twoRows: boolean;
  insetTop?: number;
  insetBottom?: number;
};

export type CallLayout = {
  phone: boolean;
  /** A laptop-height desktop (1366×768): smaller bars, same structure. */
  compact: boolean;
  topBar: Rect;
  controls: Rect;
  remote: Rect;
  self: Rect;
  /** The self video is the big "the computer is watching your hand" tile. */
  selfBig: boolean;
  /** Desktop caption strip, or the phone's floating caption card. */
  caption: Rect | null;
  /** Desktop: the teacher's drawer or the student's request column. Phone: the sheet. */
  panel: Rect | null;
};

/** Below this width the call uses the phone layout. */
export const PHONE_MAX = 768;

export function callLayout(i: CallLayoutInput): CallLayout {
  return i.width < PHONE_MAX ? phoneLayout(i) : desktopLayout(i);
}

function desktopLayout({ width, height, role, toolsOpen, asked, showBig, twoRows }: CallLayoutInput): CallLayout {
  const compact = height < 820;
  const pad = compact ? 20 : 24;
  const gap = 16;
  const topH = 64;
  const controlsH = compact ? 80 : 104;
  const panelW = width < 1400 ? 360 : 388;
  const areaTop = topH + (compact ? 12 : 20);
  const areaBottom = height - controlsH - 10;

  const topBar = { left: 0, top: 0, width, height: topH };
  const controls = { left: 0, top: height - controlsH, width, height: controlsH };

  const panelOpen = role === "teacher" ? toolsOpen : asked;
  const leftW = width - 2 * pad - (panelOpen ? panelW + gap : 0);
  const captionH =
    (role === "student" ? (compact ? 100 : 116) : compact ? 96 : 104) + (twoRows ? (compact ? 34 : 40) : 0);
  const caption = { left: pad, top: areaBottom - captionH, width: leftW, height: captionH };
  const remote = { left: pad, top: areaTop, width: leftW, height: Math.max(120, caption.top - gap - areaTop) };

  let panel: Rect | null = panelOpen ? { left: width - pad - panelW, top: areaTop, width: panelW, height: areaBottom - areaTop } : null;
  let self: Rect;
  const selfBig = role === "student" && asked;
  if (selfBig && panel) {
    // The practice check reads the student's own camera, so it has to be big
    // and visible: the top of the right column, with the request below it.
    const h = compact ? 170 : 212;
    self = { left: panel.left, top: areaTop, width: panelW, height: h };
    panel = { left: panel.left, top: areaTop + h + gap, width: panelW, height: areaBottom - (areaTop + h + gap) };
  } else {
    const scale = compact ? 0.85 : 1;
    const w = Math.round((role === "student" ? 300 : 232) * scale);
    const h = Math.round((role === "student" ? 170 : 130) * scale);
    self = { left: remote.left + remote.width - 16 - w, top: remote.top + remote.height - 16 - h, width: w, height: h };
  }

  if (showBig) {
    // Both stay on screen as tiles: the reader can't read a hidden video.
    return {
      phone: false,
      compact,
      topBar,
      controls,
      remote: { left: 32, top: height - 32 - 168, width: 300, height: 168 },
      self: { left: width - 32 - 200, top: height - 32 - 112, width: 200, height: 112 },
      selfBig: false,
      caption: null,
      panel: null,
    };
  }
  return { phone: false, compact, topBar, controls, remote, self, selfBig, caption, panel };
}

function phoneLayout({ width, height, role, toolsOpen, asked, showBig, insetTop = 0, insetBottom = 0 }: CallLayoutInput): CallLayout {
  const controlsH = 92 + insetBottom;
  const controls = { left: 0, top: height - controlsH, width, height: controlsH };
  const topBar = { left: 0, top: insetTop, width, height: 64 };

  if (showBig) {
    return {
      phone: true,
      compact: false,
      topBar,
      controls,
      remote: { left: 12, top: height - insetBottom - 12 - 110, width: 160, height: 110 },
      self: { left: width - 12 - 96, top: height - insetBottom - 12 - 128, width: 96, height: 128 },
      selfBig: false,
      caption: null,
      panel: null,
    };
  }
  if (role === "teacher" && toolsOpen) {
    // The sheet covers the lower half; the student's video shrinks to the
    // top but stays on screen, so their signs can still be read.
    const remoteH = Math.min(400, Math.round(height * 0.48));
    return {
      phone: true,
      compact: false,
      topBar,
      controls,
      remote: { left: 0, top: 0, width, height: remoteH },
      self: { left: width - 12 - 78, top: remoteH - 32 - 112, width: 78, height: 112 },
      selfBig: false,
      caption: null,
      panel: { left: 0, top: remoteH - 20, width, height: controls.top - (remoteH - 20) },
    };
  }
  if (role === "student" && asked) {
    const selfH = Math.round(height * 0.52);
    return {
      phone: true,
      compact: false,
      topBar,
      controls,
      remote: { left: width - 12 - 90, top: selfH - 28 - 120, width: 90, height: 120 },
      self: { left: 0, top: 0, width, height: selfH },
      selfBig: true,
      caption: null,
      panel: { left: 0, top: selfH - 16, width, height: controls.top - (selfH - 16) },
    };
  }
  const capH = role === "student" ? 104 : 96;
  return {
    phone: true,
    compact: false,
    topBar,
    controls,
    remote: { left: 0, top: 0, width, height },
    self: { left: width - 12 - 104, top: insetTop + 72, width: 104, height: 150 },
    selfBig: false,
    caption: { left: 12, top: controls.top - 12 - capH, width: width - 24, height: capH },
    panel: null,
  };
}
