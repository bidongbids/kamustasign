const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");

// Prod serves the web export over app://kamustasign/ instead of file://.
// The app asks for everything by root path (/_expo/..., /fsl-model,
// /mediapipe, /reference/fsl-words/*.mp4); under file:// those resolve to
// the drive root and fail. A standard + secure scheme also keeps camera
// access (secure context) and lets <video> stream and seek.
const SCHEME = "app";
const HOST = "kamustasign";
const DEV_URL = "http://localhost:8081";
const IS_DEV = !app.isPackaged && !process.env.KAMUSTASIGN_PROD;
// The only place the app's own pages come from. Camera access and in-window
// navigation are limited to it (see below).
const APP_ORIGIN = IS_DEV ? DEV_URL : `${SCHEME}://${HOST}`;

/** "scheme://host[:port]" of a URL (Node gives custom schemes an origin of "null"). */
function originOf(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
const isAppUrl = (url) => originOf(url) === APP_ORIGIN;

// ── Error log ───────────────────────────────────────────────────────────
// %APPDATA%\LCSign\logs\lcsign.log: page errors (anything the app writes
// with console.error, and errors nothing caught), crashes and freezes of
// the page, and the updater. Nothing is sent anywhere; "Open the log
// folder" in Appearance > About LCSign shows the file so a teacher can
// send it to whoever looks after LCSign. At 1 MB it moves to lcsign.old.log
// and a new file starts, so it never grows past ~2 MB.
const LOG_MAX_BYTES = 1_000_000;
const PAGE_LINES_PER_MINUTE = 60;
let pageLines = { minute: 0, count: 0 };

function logDir() {
  return app.getPath("logs");
}

function log(kind, message) {
  try {
    const dir = logDir();
    const file = path.join(dir, "lcsign.log");
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > LOG_MAX_BYTES) {
      fs.renameSync(file, path.join(dir, "lcsign.old.log"));
    }
    const text = String(message).replace(/\s+$/, "").slice(0, 4000);
    fs.appendFileSync(file, `${new Date().toISOString()} [${kind}] ${text}\n`);
  } catch {
    // Logging must never be what breaks the app.
  }
}

// A page error repeating every frame (the trackers run ~30 times a second)
// would fill the file in minutes: keep the first few each minute.
function logPageError(message) {
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== pageLines.minute) pageLines = { minute, count: 0 };
  pageLines.count += 1;
  if (pageLines.count <= PAGE_LINES_PER_MINUTE) log("page", message);
  else if (pageLines.count === PAGE_LINES_PER_MINUTE + 1) log("page", "(more page errors this minute not written)");
}

process.on("uncaughtException", (err) => log("main", (err && err.stack) || err));
process.on("unhandledRejection", (reason) => log("main", `unhandled rejection: ${(reason && reason.stack) || reason}`));

// Only web links leave the app, and they open in the normal browser.
function openOutside(url) {
  try {
    if (new URL(url).protocol === "https:") shell.openExternal(url);
  } catch {
    // not a URL - ignore
  }
}

// Content-Security-Policy for the app's pages (prod only; the Expo dev
// server needs eval). It stops injected code from running or sending data
// anywhere the app doesn't already talk to:
//  - script-src: the app's own files only - no inline scripts, no eval.
//    'wasm-unsafe-eval' lets MediaPipe and TF.js compile WebAssembly. No
//    CDN: the installer always carries MediaPipe (public/mediapipe), and a
//    CDN like jsdelivr serves anyone's files, so allowing it would let
//    injected HTML load any script (red team, 2026-11-17).
//  - style-src 'unsafe-inline': react-native-web writes its styles into
//    <style> tags while running.
//  - connect-src: this build's own Supabase project only (API + realtime;
//    from server.json, else any *.supabase.co), the leaked-password check,
//    MyMemory translation, the Metered TURN credentials URL. Moving
//    EXPO_PUBLIC_TURN_CREDENTIALS_URL to another provider means adding its
//    host here, or video calls lose their relay.
function supabaseSources() {
  try {
    const { supabaseUrl } = JSON.parse(fs.readFileSync(path.join(__dirname, "server.json"), "utf8"));
    const u = new URL(supabaseUrl);
    if (u.protocol === "https:" && u.hostname.endsWith(".supabase.co")) return `https://${u.host} wss://${u.host}`;
  } catch {
    // no server.json (development): fall back to any Supabase project
  }
  return "https://*.supabase.co wss://*.supabase.co";
}

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${supabaseSources()} https://api.pwnedpasswords.com https://api.mymemory.translated.net https://*.metered.live`,
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".bin": "application/octet-stream",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function webRoot() {
  // Packaged: electron-builder copies ../dist to resources/web (extraResources).
  return app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "../dist");
}

function serveFile(request) {
  const root = webRoot();
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  let file = path.normalize(path.join(root, pathname));
  // root + separator: a bare startsWith(root) would also let ..%2f reach a
  // sibling folder whose name starts the same (resources/web-something).
  if (file !== root && !file.startsWith(root + path.sep)) return new Response("Forbidden", { status: 403 });
  // Single-page app: unknown paths get index.html.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");

  const size = fs.statSync(file).size;
  const ext = path.extname(file).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  if (ext === ".html") headers["Content-Security-Policy"] = CSP;

  // Chromium's media player fetches video in byte ranges; answering with
  // the whole file breaks seeking and makes looping clips stall.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") || "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(size - Number(range[2]), 0);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const body = Readable.toWeb(fs.createReadStream(file, { start, end }));
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(file));
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // window.lcsignDesktop: update status and the log folder (preload.js).
      preload: path.join(__dirname, "preload.js"),
    },
  });
  watchForCrashes(win);

  if (IS_DEV) {
    // Dev: point at the running `expo start --web` dev server. It's
    // started concurrently with Electron (see electron:dev), so it's
    // often not ready yet on the first attempt - retry instead of
    // failing outright.
    loadWithRetry(win, DEV_URL);
  } else {
    // Prod: the static export (see electron:build), served by app://.
    // KAMUSTASIGN_PROD=1 runs that path unpackaged against ../dist.
    win.loadURL(`${SCHEME}://${HOST}/`);
  }
}

// ── Crashes and freezes ─────────────────────────────────────────────────
// Without these a crashed page leaves a white window and a frozen one just
// stops; now both say so and offer Reload. CrashBoundary in the app covers
// errors while drawing a screen; this covers the page process itself dying
// (out of memory, the GPU driver, a renderer bug) or hanging.
function watchForCrashes(win) {
  let open = null; // the dialog on screen, so a second problem doesn't stack another
  let reloadingAfterHang = false;

  const ask = (options) => {
    if (open || win.isDestroyed()) return Promise.resolve(null);
    const controller = new AbortController();
    open = controller;
    return dialog
      .showMessageBox(win, { type: "warning", title: "LCSign", noLink: true, signal: controller.signal, ...options })
      .then(({ response }) => (controller.signal.aborted ? null : response))
      .finally(() => {
        open = null;
      });
  };

  win.webContents.on("render-process-gone", (_event, details) => {
    log("crash", `page stopped: ${details.reason} (exit code ${details.exitCode})`);
    if (details.reason === "clean-exit" || win.isDestroyed()) return;
    if (reloadingAfterHang) {
      reloadingAfterHang = false;
      win.webContents.reload();
      return;
    }
    ask({
      type: "error",
      message: "LCSign stopped working",
      detail:
        "Reload to carry on. If it keeps happening, open Appearance > About LCSign > Open the log folder and send lcsign.log to whoever looks after LCSign.",
      buttons: ["Reload", "Close LCSign"],
      defaultId: 0,
      cancelId: 1,
    }).then((response) => {
      if (response === 0) win.webContents.reload();
      else if (response === 1) app.quit();
    });
  });

  win.on("unresponsive", () => {
    log("freeze", "page not responding");
    ask({
      message: "LCSign isn't responding",
      detail: "It may still be loading the sign models. Wait a little, or reload it.",
      buttons: ["Wait", "Reload"],
      defaultId: 0,
      cancelId: 0,
    }).then((response) => {
      if (response !== 1 || win.isDestroyed()) return;
      log("freeze", "reloading after a freeze");
      // A hung page can't reload itself: end it, then reload (render-process-gone above).
      reloadingAfterHang = true;
      win.webContents.forcefullyCrashRenderer();
    });
  });
  win.on("responsive", () => {
    if (!open) return;
    open.abort();
    log("freeze", "page responding again");
  });
}

function loadWithRetry(win, url, attempt = 1) {
  win.loadURL(url).catch(() => {});
  const onFail = () => {
    if (attempt >= 30) {
      console.error(`Gave up connecting to ${url} after ${attempt} attempts.`);
      return;
    }
    setTimeout(() => loadWithRetry(win, url, attempt + 1), 1000);
  };
  win.webContents.once("did-fail-load", onFail);
  win.webContents.once("did-finish-load", () => {
    win.webContents.removeListener("did-fail-load", onFail);
  });
}

// Every window (the main one, and the print window printClassCode opens)
// stays on the app's own pages. Without this a link could load any website
// inside the app, where it would get the camera and the app's window.
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    // printClassCode() opens an empty window and writes the print page into it.
    if (url === "" || url === "about:blank") return { action: "allow" };
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("console-message", (details) => {
    if (details.level === "error") logPageError(`${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
});

app.on("child-process-gone", (_event, details) => {
  if (details.reason !== "clean-exit") log("crash", `${details.type} process stopped: ${details.reason} (exit code ${details.exitCode})`);
});

// ── Updates ─────────────────────────────────────────────────────────────
// The installed app checks for a newer LCSign at launch and every few
// hours, downloads it in the background and installs it when LCSign is
// closed (or straight away from "Restart to update" in Appearance > About).
//
// Where it looks: update_feed_url in the "desktop" row of the app_release
// table (0018_app_release.sql) - a web folder holding latest.yml and the
// installer, e.g. a GitHub release's download link. It is read here, in the
// main process, with the public anon key from server.json (written by
// write-server-config.mjs at build time) - never taken from the page: a
// page that could choose the update source could get any program installed.
// Empty URL (the default) = no update checks.
//
// The installer isn't code-signed, so nothing checks who made an update:
// whoever can change that row, or the files at that URL, decides what gets
// installed. Keep both locked down.
//
// LCSIGN_UPDATE_FEED_URL overrides the row (testing: a folder served on
// 127.0.0.1). The publish URL in package.json is a placeholder that only
// makes the build write latest.yml and app-update.yml; it is never used.
const UPDATE_EVERY_MS = 4 * 60 * 60 * 1000;
let updateStatus = { state: "off" };

function setUpdateStatus(next) {
  updateStatus = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("lcsign:update-status", next);
  }
}

function allowedFeedUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
}

async function updateFeedUrl() {
  if (process.env.LCSIGN_UPDATE_FEED_URL) return process.env.LCSIGN_UPDATE_FEED_URL;
  let server;
  try {
    server = JSON.parse(fs.readFileSync(path.join(__dirname, "server.json"), "utf8"));
  } catch {
    return null; // built without server.json
  }
  if (!server.supabaseUrl || !server.anonKey) return null;
  const res = await net.fetch(`${server.supabaseUrl.replace(/\/+$/, "")}/rest/v1/app_release?platform=eq.desktop&select=update_feed_url`, {
    headers: { apikey: server.anonKey, Authorization: `Bearer ${server.anonKey}` },
  });
  if (!res.ok) throw new Error(`app_release: HTTP ${res.status}`);
  const rows = await res.json();
  return (rows[0] && rows[0].update_feed_url) || null;
}

function startUpdates() {
  if (!app.isPackaged && !process.env.LCSIGN_UPDATE_FEED_URL) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (err) {
    log("update", `updater not available: ${err.message}`);
    return;
  }
  autoUpdater.logger = {
    info: (m) => log("update", m),
    warn: (m) => log("update", m),
    error: (m) => log("update", m),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => setUpdateStatus({ state: "checking" }));
  autoUpdater.on("update-not-available", () => setUpdateStatus({ state: "current" }));
  autoUpdater.on("update-available", (info) => setUpdateStatus({ state: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("download-progress", (p) =>
    setUpdateStatus({ state: "downloading", version: updateStatus.version, percent: Math.round(p.percent) })
  );
  autoUpdater.on("update-downloaded", (info) => setUpdateStatus({ state: "ready", version: info.version }));
  autoUpdater.on("error", (err) => setUpdateStatus({ state: "error", message: (err && err.message) || String(err) }));

  let feed = null;
  const check = async () => {
    if (updateStatus.state === "ready" || updateStatus.state === "downloading") return;
    try {
      const url = await updateFeedUrl();
      if (!url) {
        setUpdateStatus({ state: "off" });
        return;
      }
      if (!allowedFeedUrl(url)) throw new Error(`update URL must be https: ${url}`);
      if (url !== feed) {
        autoUpdater.setFeedURL({ provider: "generic", url });
        feed = url;
      }
      await autoUpdater.checkForUpdates();
    } catch (err) {
      // Offline, or the server can't be reached: try again next time.
      log("update", `check failed: ${(err && err.message) || err}`);
      setUpdateStatus({ state: "error", message: (err && err.message) || String(err) });
    }
  };
  setTimeout(check, 10_000);
  setInterval(check, UPDATE_EVERY_MS);

  ipcMain.handle("lcsign:install-update", (event) => {
    if (!fromApp(event) || updateStatus.state !== "ready") return false;
    log("update", `installing ${updateStatus.version} now`);
    // Silent (no installer pages), then open the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });
}

// IPC from the preload is answered only for the app's own pages.
const fromApp = (event) => !!event.senderFrame && isAppUrl(event.senderFrame.url);

ipcMain.handle("lcsign:update-status", (event) => (fromApp(event) ? updateStatus : null));
ipcMain.handle("lcsign:open-logs", (event) => {
  if (!fromApp(event)) return false;
  fs.mkdirSync(logDir(), { recursive: true });
  shell.openPath(logDir());
  return true;
});

app.whenReady().then(() => {
  // Translator and video calls need the camera and microphone - Electron
  // blocks getUserMedia in packaged apps unless allowed here. Only the app's
  // own pages get them, never a site that somehow ends up in a window.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const url = (details && details.requestingUrl) || webContents.getURL();
    callback(permission === "media" && isAppUrl(url));
  });
  protocol.handle(SCHEME, serveFile);
  log("start", `LCSign ${app.getVersion()} (Electron ${process.versions.electron}, Windows ${require("os").release()})`);
  createWindow();
  startUpdates();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
