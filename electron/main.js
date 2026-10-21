const { app, BrowserWindow, protocol, session } = require("electron");
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
  const { pathname } = new URL(request.url);
  let file = path.normalize(path.join(root, decodeURIComponent(pathname)));
  if (!file.startsWith(root)) return new Response("Forbidden", { status: 403 });
  // Single-page app: unknown paths get index.html.
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");

  const size = fs.statSync(file).size;
  const headers = {
    "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "Accept-Ranges": "bytes",
  };

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
    },
  });

  // Translator needs camera access - Electron blocks getUserMedia by
  // default in packaged apps unless explicitly allowed here.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === "media");
  });

  if (!app.isPackaged && !process.env.KAMUSTASIGN_PROD) {
    // Dev: point at the running `expo start --web` dev server. It's
    // started concurrently with Electron (see electron:dev), so it's
    // often not ready yet on the first attempt - retry instead of
    // failing outright.
    loadWithRetry(win, "http://localhost:8081");
  } else {
    // Prod: the static export (see electron:build), served by app://.
    // KAMUSTASIGN_PROD=1 runs that path unpackaged against ../dist.
    win.loadURL(`${SCHEME}://${HOST}/`);
  }
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

app.whenReady().then(() => {
  protocol.handle(SCHEME, serveFile);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
