// Stored-XSS test: plant HTML/script payloads in fields other people see,
// then log in through the real app (built against the TEST project) and check
// nothing runs. Web build = same code as the Windows and Android apps.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { login, creds, totp, record, results } from "./lib.mjs";

const require = createRequire(new URL("../../package.json", import.meta.url)); // needs: npm i --no-save puppeteer-core
const puppeteer = require("puppeteer-core");
const c = creds();
const A = "00000000-0000-4000-b000-0000000000aa";
const DIST = process.env.RT_DIST || fileURLToPath(new URL("./dist-rt", import.meta.url));
const P = {
  name: `<img src=x onerror="window.__xss='name'">`,
  klass: `"><svg/onload=window.__xss='class'>`,
  module: `<script>window.__xss='module'</script>`,
  note: `<iframe srcdoc="<script>parent.__xss='note'</script>"></iframe>`,
};

// 1. Plant the payloads with ordinary logins (all of these are allowed edits).
const s1 = await login("s1");
console.log("S1 name:", (await s1.from("profiles").update({ full_name: P.name }).eq("id", c.s1.id).select("full_name")).error?.message ?? "set");
const t1 = await login("t1");
console.log("class name:", (await t1.from("classes").update({ name: P.klass }).eq("id", A).select("name")).error?.message ?? "set");
console.log("module title:", (await t1.from("modules").update({ title: P.module, description: P.note }).eq("class_id", A).select("title")).error?.message ?? "set");
console.log("call note:", (await t1.from("call_notes").insert({ class_id: A, teacher_id: c.t1.id, student_id: c.s1.id, started_at: new Date().toISOString(), duration_seconds: 30, teacher_text: P.note, student_text: P.name }).select("id")).error?.message ?? "set");

// 2. Serve the test build.
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".wasm": "application/wasm" };
const server = http.createServer((req, res) => {
  let file = path.join(DIST, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8097, "127.0.0.1", r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--window-size=1280,900"], defaultViewport: { width: 1280, height: 900 } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function check(page, where) {
  const s = await page.evaluate(() => ({
    xss: window.__xss ?? null,
    injected: document.querySelectorAll('img[src="x"], svg[onload], iframe[srcdoc]').length,
    shownAsText: ["onerror=", "<script>", "svg/onload", "iframe srcdoc"].filter((t) => document.body.innerText.includes(t)),
  }));
  record("xss", `payloads on ${where}`, s.xss || s.injected ? "VULNERABLE" : "blocked", s.xss ? `ran: ${s.xss}` : `${s.injected} injected elements; shown as plain text: ${s.shownAsText.join(", ") || "-"}`);
}
const clickText = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, "i");
  const el = [...document.querySelectorAll('[role="button"],[role="tab"],[role="link"],button,a')].find((e) => rx.test((e.innerText || e.getAttribute("aria-label") || "").trim()));
  if (!el) return false;
  el.click();
  return true;
}, re.source);

async function session(who, tabs, opts = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto("http://127.0.0.1:8097/", { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector('input[type="email"], input[autocomplete="email"], input[placeholder*="@"]', { timeout: 20000 });
  const email = await page.$('input[type="email"], input[autocomplete="email"], input[placeholder*="@"]');
  await email.type(c[who].email);
  const pw = await page.$('input[type="password"]');
  await pw.type(c[who].password);
  await clickText(page, /^Log In$/);
  await sleep(5000);
  if (opts.totp) {
    const code = await page.$('input[inputmode="numeric"], input[autocomplete="one-time-code"], input[maxlength="6"]');
    if (code) { await code.type(totp(c[who].totpSecret)); await clickText(page, /^(Verify|Continue|Confirm)/); await sleep(5000); }
  }
  await check(page, `${who} dashboard`);
  for (const t of tabs) {
    if (await clickText(page, t)) { await sleep(2500); await check(page, `${who} > ${t.source}`); }
    else console.log(`   (no ${t.source} tab for ${who})`);
  }
  if (opts.print) {
    const popupP = new Promise((r) => browser.once("targetcreated", (tg) => r(tg.page())));
    if (await clickText(page, /^Print$/)) {
      const popup = await Promise.race([popupP, sleep(5000).then(() => null)]);
      if (popup) { await sleep(800); await check(popup, `${who} printed class code`); }
    } else console.log("   (no Print button visible)");
  }
  await page.screenshot({ path: fileURLToPath(new URL(`./xss-${who}.png`, import.meta.url)) });
  await ctx.close();
}

await session("t1", [/^Today/, /^What they learn/, /^Students/, /<img src=x/, /^Progress/]);
await session("s1", [/what|learn|module|class/i, /call/i]);
await session("ad", [/Accounts|People|Users/], { totp: true });

await browser.close();
server.close();
fs.writeFileSync(new URL("./results-xss.json", import.meta.url), JSON.stringify(results, null, 2));
process.exit(0);
