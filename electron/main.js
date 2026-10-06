const { app, BrowserWindow, session } = require("electron");
const path = require("path");

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

  if (!app.isPackaged) {
    // Dev: point at the running `expo start --web` dev server. It's
    // started concurrently with Electron (see electron:dev), so it's
    // often not ready yet on the first attempt - retry instead of
    // failing outright.
    loadWithRetry(win, "http://localhost:8081");
  } else {
    // Prod: load the static export (see electron:build script).
    win.loadFile(path.join(__dirname, "../dist/index.html"));
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

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
