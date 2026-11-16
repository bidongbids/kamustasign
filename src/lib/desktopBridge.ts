// The desktop app's window.lcsignDesktop (electron/preload.js): background
// update status, "Restart to update", and the log folder. null in browsers
// and the Android app.
import { useEffect, useState } from "react";

export type DesktopUpdateState = "off" | "checking" | "current" | "downloading" | "ready" | "error";

export type DesktopUpdateStatus = {
  state: DesktopUpdateState;
  /** The new version (downloading / ready). */
  version?: string;
  /** Download progress, 0-100. */
  percent?: number;
  /** What went wrong (error). */
  message?: string;
};

type DesktopBridge = {
  getUpdateStatus: () => Promise<DesktopUpdateStatus | null>;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  installUpdate: () => Promise<boolean>;
  openLogFolder: () => Promise<boolean>;
};

export function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  return (window as { lcsignDesktop?: DesktopBridge }).lcsignDesktop ?? null;
}

/** The background updater's status, live; null outside the desktop app. */
export function useDesktopUpdate(): DesktopUpdateStatus | null {
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let live = true;
    bridge.getUpdateStatus().then((s) => live && s && setStatus(s), () => {});
    const stop = bridge.onUpdateStatus((s) => live && setStatus(s));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return status;
}
