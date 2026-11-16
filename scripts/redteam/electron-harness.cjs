// Loads electron/main.js with a fake "electron" module and tests serveFile,
// isAppUrl and allowedFeedUrl directly (Electron can't run on this PC).
const fs = require("fs"), path = require("path"), vm = require("vm");
// Usage: node electron-harness.cjs <empty scratch folder>  (makes web/, web-secret/, webroot-secret/ in it)
const BASE = process.argv[2];
if (!BASE) throw new Error("usage: node electron-harness.cjs <scratch folder>");
for (const [p, t] of [["web/index.html", "<html>index</html>"], ["web/sub/a.txt", "inside"], ["web-secret/s.txt", "SECRET"], ["webroot-secret/s.txt", "SECRET"]]) {
  fs.mkdirSync(path.dirname(path.join(BASE, p)), { recursive: true });
  fs.writeFileSync(path.join(BASE, p), t);
}
const ROOT = path.join(BASE, "web");
const src = fs.readFileSync(path.join(__dirname, "../../electron/main.js"), "utf8") + "\n;module.exports = { serveFile, isAppUrl, allowedFeedUrl, CSP };";
const fake = {
  app: { isPackaged: true, getPath: () => path.join(ROOT, "..", "logs"), whenReady: () => new Promise(() => {}), on() {}, getVersion: () => "1.1.0" },
  BrowserWindow: { getAllWindows: () => [] }, dialog: {}, ipcMain: { handle() {} }, net: {}, session: {}, shell: {},
  protocol: { registerSchemesAsPrivileged() {}, handle() {} },
};
const mod = { exports: {} };
const req = (n) => (n === "electron" ? fake : require(n));
const ctx = vm.createContext({ require: req, module: mod, exports: mod.exports, process: { ...process, resourcesPath: path.join(ROOT, ".."), on() {} }, console, URL, Response, setTimeout, setInterval, setImmediate, Buffer, AbortController, __dirname: path.join(__dirname, "../../electron") });
vm.runInContext(src, ctx, { filename: "main.js" });
const { serveFile, isAppUrl, allowedFeedUrl, CSP } = mod.exports;
// serveFile uses webRoot() = resourcesPath/web when packaged
let fails = 0;
const ok = (c, m) => { console.log((c ? "ok    " : "!! VULN ") + m); if (!c) fails++; };
(async () => {
  const get = async (u) => { const r = serveFile({ url: u, headers: new Map() }); const body = r.body ? await new Response(r.body).text() : ""; return { status: r.status, body }; };
  const cases = ["app://kamustasign/../webroot-secret/s.txt", "app://kamustasign/..%2f..%2fwebroot-secret%2fs.txt", "app://kamustasign/..%5cwebroot-secret%5cs.txt",
    "app://kamustasign/%2e%2e/webroot-secret/s.txt", "app://kamustasign/sub/..%2f..%2f..%2fwebroot-secret/s.txt", "app://kamustasign/C:%5cWindows%5cwin.ini",
    "app://kamustasign/%00../../webroot-secret/s.txt", "app://kamustasign/web-secret/s.txt", "app://kamustasign/..%2fweb-secret%2fs.txt", "app://kamustasign/..%5cweb-secret%5cs.txt"];
  for (const u of cases) { const r = await get(u); ok(!r.body.includes("SECRET"), `path trick ${u.replace("app://kamustasign", "")} -> ${r.status} ${r.body.slice(0, 20).replace(/\n/g, "")}`); }
  ok((await get("app://kamustasign/sub/a.txt")).body.includes("inside"), "a normal file is still served");
  for (const u of ["app://kamustasign/", "app://kamustasign/x/y"]) ok(isAppUrl(u), `isAppUrl(${u}) = true`);
  for (const u of ["app://evil/", "https://kamustasign/", "app://kamustasign.evil.com/", "app://kamustasign@evil/", "javascript:alert(1)", "file:///C:/"]) ok(!isAppUrl(u), `isAppUrl(${u}) = false`);
  for (const u of ["https://github.com/x/y/releases/latest/download", "http://127.0.0.1:9000/"]) ok(allowedFeedUrl(u), `update feed allowed: ${u}`);
  for (const u of ["http://evil.example/", "file:///C:/evil/", "ftp://x/", "http://127.0.0.1.evil.com/", "http://localhost.evil.com/", "javascript:x"]) ok(!allowedFeedUrl(u), `update feed refused: ${u}`);
  console.log("CSP script-src:", CSP.split("; ").find((d) => d.startsWith("script-src")));
  console.log("CSP connect-src:", CSP.split("; ").find((d) => d.startsWith("connect-src")));
  console.log(fails ? `${fails} FAILED` : "all passed");
})();
