// Is the LCSign server reachable? Logging in needs it; the Translator and
// offline Classroom practice don't (the models, MediaPipe and reference
// media all ship with the app - see mediapipeVision.ts and electron/main.js).
// The start screen asks this to decide whether to offer practice without an
// account, and App asks it so a launch with no internet doesn't sit on the
// loading spinner while supabase-js retries its token refresh (~25 s of
// backoff, auth-js _refreshAccessToken).
//
// navigator.onLine === false means offline for sure. true only means a
// network adapter is up - a school Wi-Fi with no internet behind it still
// says true - so the server is asked too: any answer at all (even a 401) is
// online; a failed fetch or no answer in PROBE_TIMEOUT_MS is offline. The
// probe is no-cors, so the browser never needs CORS headers on the reply;
// no-cors can't send an apikey header, so the (public, already bundled) anon
// key rides in the query - without it the gateway answers 401, which still
// means online but leaves an error in the console every minute.
//
// One shared state for the whole app; it is re-checked only while some
// component uses it (useConnection), more often while offline so the start
// screen notices the internet coming back.
import { useEffect, useState } from "react";

export type Connection = "checking" | "online" | "offline";

const SERVER_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const PROBE_TIMEOUT_MS = 6000;
const RECHECK_OFFLINE_MS = 15_000;
const RECHECK_ONLINE_MS = 60_000;

type FetchLike = (url: string, init?: any) => Promise<unknown>;

const browserSaysOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/** One reachability check. No server configured counts as offline: nothing to log in to. */
export async function probeServer(
  url: string | undefined = SERVER_URL,
  fetchImpl: FetchLike = (u, init) => fetch(u, init),
  timeoutMs = PROBE_TIMEOUT_MS,
  apiKey: string | undefined = ANON_KEY
): Promise<boolean> {
  if (browserSaysOffline() || !url) return false;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve(false);
    }, timeoutMs);
  });
  const query = apiKey ? `?apikey=${encodeURIComponent(apiKey)}` : "";
  const attempt = fetchImpl(`${url.replace(/\/+$/, "")}/auth/v1/health${query}`, {
    mode: "no-cors",
    cache: "no-store",
    signal: controller?.signal,
  }).then(
    () => true,
    () => false
  );
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

let current: Connection = "checking";
const listeners = new Set<(c: Connection) => void>();
let inFlight: Promise<Connection> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

function publish(next: Connection) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l(next));
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = listeners.size ? setTimeout(() => void recheckConnection(), current === "offline" ? RECHECK_OFFLINE_MS : RECHECK_ONLINE_MS) : null;
}

/** Check now (e.g. after a login failed on the network). Overlapping calls share one probe. */
export function recheckConnection(): Promise<Connection> {
  if (!inFlight) {
    inFlight = probeServer()
      .then((ok) => {
        publish(ok ? "online" : "offline");
        return current;
      })
      .finally(() => {
        inFlight = null;
        schedule();
      });
  }
  return inFlight;
}

const onBrowserOffline = () => publish("offline");
const onBrowserOnline = () => void recheckConnection();

function subscribe(listener: (c: Connection) => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("offline", onBrowserOffline);
      window.addEventListener("online", onBrowserOnline);
    }
    void recheckConnection();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    if (typeof window !== "undefined" && window.removeEventListener) {
      window.removeEventListener("offline", onBrowserOffline);
      window.removeEventListener("online", onBrowserOnline);
    }
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/**
 * The server's reachability, kept up to date while `active`. Inactive, it
 * stops checking and returns the last known answer.
 */
export function useConnection(active = true): Connection {
  const [connection, setConnection] = useState<Connection>(current);
  useEffect(() => {
    if (!active) return;
    setConnection(current);
    return subscribe(setConnection);
  }, [active]);
  return connection;
}
