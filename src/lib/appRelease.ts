// "Is this copy of LCSign still OK to use?" The app_release table
// (0018_app_release.sql) holds, per installed app (desktop, android), the
// newest version, the oldest version that still works with the server, and
// where to download it. Whoever looks after LCSign edits that row in the
// Supabase Table Editor when they publish a new build.
//
// - Older than min_version: the app shows "Update LCSign" instead of
//   logging in (App.tsx). Raise min_version BEFORE a server change that old
//   copies can't handle - like 11-04, when turning on "Confirm email" left
//   older installers stuck at sign-up with no code screen.
// - Older than latest_version: Appearance > About LCSign says an update is
//   out (with the download link on Android; the desktop app downloads it by
//   itself when update_feed_url is set, see electron/main.js).
//
// Fails open: offline, the table not there yet, or any error = carry on as
// normal. The browser version is always current, so it isn't checked.
import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "./supabase";
import { APP_VERSION, appPlatform, compareVersions, type AppPlatform } from "./appVersion";

export type AppRelease = {
  platform: "desktop" | "android";
  latest_version: string;
  min_version: string;
  download_url: string | null;
  notes: string | null;
};

export type UpdateNeed = "required" | "available" | "none";

const FETCH_TIMEOUT_MS = 8000;
const RECHECK_MS = 6 * 60 * 60 * 1000; // school PCs stay open all day
const RETRY_MS = 2 * 60 * 1000;

export function updateNeed(current: string, release: AppRelease | null): UpdateNeed {
  if (!release) return "none";
  if (compareVersions(current, release.min_version) < 0) return "required";
  if (compareVersions(current, release.latest_version) < 0) return "available";
  return "none";
}

export async function fetchAppRelease(platform: AppPlatform): Promise<AppRelease | null> {
  if (platform === "web" || !isSupabaseConfigured) return null;
  const query = supabase
    .from("app_release")
    .select("platform, latest_version, min_version, download_url, notes")
    .eq("platform", platform)
    .maybeSingle()
    .then(({ data, error }) => (error ? null : ((data as AppRelease | null) ?? null)), () => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// One copy for the whole app (App.tsx and the About section both ask).
let latest: AppRelease | null = null;
const listeners = new Set<(r: AppRelease | null) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function refresh() {
  const release = await fetchAppRelease(appPlatform());
  if (release) {
    latest = release;
    listeners.forEach((l) => l(release));
  }
  timer = listeners.size ? setTimeout(refresh, release ? RECHECK_MS : RETRY_MS) : null;
}

/** This copy's update status, re-checked every few hours while the app is open. */
export function useAppRelease(): { release: AppRelease | null; need: UpdateNeed } {
  const [release, setRelease] = useState<AppRelease | null>(latest);
  useEffect(() => {
    listeners.add(setRelease);
    if (listeners.size === 1 && !timer) void refresh();
    return () => {
      listeners.delete(setRelease);
      if (!listeners.size && timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, []);
  return { release, need: updateNeed(APP_VERSION, release) };
}
