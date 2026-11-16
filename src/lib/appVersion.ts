// Which LCSign this is: the version (app.json, kept in step with the
// installers by scripts/set-version.mjs) and where it runs. Shown in
// Appearance > About LCSign, put at the top of error reports, and compared
// with the app_release table (0018) to tell an old copy to update.
import appJson from "../../app.json";
import { isAndroidApp } from "./androidApp";

export const APP_VERSION: string = appJson.expo.version;

export type AppPlatform = "desktop" | "android" | "web";

export const PLATFORM_LABEL: Record<AppPlatform, string> = {
  desktop: "Windows app",
  android: "Android app",
  web: "Web",
};

/** The desktop app's preload adds window.lcsignDesktop; the Android app has Capacitor. */
export function appPlatform(): AppPlatform {
  if (isAndroidApp()) return "android";
  if (typeof window !== "undefined" && (window as { lcsignDesktop?: unknown }).lcsignDesktop) return "desktop";
  return "web";
}

/**
 * Compares "major.minor.patch" versions: negative when a is older than b,
 * 0 when equal, positive when newer. Missing parts count as 0 ("1.2" ==
 * "1.2.0"); anything that isn't a version compares as equal, so a typo in
 * the database can't lock everyone out.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => (/^\d+(\.\d+){0,2}$/.test(v.trim()) ? v.trim().split(".").map(Number) : null);
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}
