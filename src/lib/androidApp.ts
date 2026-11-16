/**
 * True inside the Android app (mobile/: the web build in Capacitor's web
 * view); false in browsers and the desktop app. Capacitor's bridge puts
 * window.Capacitor on the page before the app's own scripts run.
 */
export function isAndroidApp(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  );
}
