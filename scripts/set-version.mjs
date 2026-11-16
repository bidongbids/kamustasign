// Sets LCSign's version everywhere it lives, so the app, the desktop
// installer and the Android app always agree:
//   npm run version:set -- 1.1.1
//
// - app.json expo.version: what the app shows (src/lib/appVersion.ts) and
//   compares with app_release (0018) to tell an old copy to update
// - package.json, electron/package.json: the desktop installer's version
//   (LCSign-Setup-<version>.exe, and what auto-update compares)
// - mobile/package.json, mobile/android/app/build.gradle versionName, and
//   versionCode = major*10000 + minor*100 + patch (Android refuses to
//   install an update whose versionCode isn't higher)
//
// Raise it for every build that leaves this PC, and add a CHANGELOG.md entry.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? "");
if (!m) {
  console.error("Usage: npm run version:set -- <major.minor.patch>   e.g. 1.1.1");
  process.exit(1);
}
const [major, minor, patch] = m.slice(1).map(Number);
if (minor > 99 || patch > 99) {
  console.error("Minor and patch must be 0-99 (they make up the Android versionCode).");
  process.exit(1);
}
const versionCode = major * 10000 + minor * 100 + patch;

function editJson(file, change) {
  const path = join(root, file);
  const json = JSON.parse(readFileSync(path, "utf8"));
  change(json);
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

function editText(file, pattern, replacement) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  if (!pattern.test(text)) throw new Error(`${file}: didn't find ${pattern}`);
  writeFileSync(path, text.replace(pattern, replacement));
}

editJson("app.json", (j) => (j.expo.version = version));
editJson("package.json", (j) => (j.version = version));
editJson("electron/package.json", (j) => (j.version = version));
editJson("mobile/package.json", (j) => (j.version = version));
editText("mobile/android/app/build.gradle", /versionCode \d+/, `versionCode ${versionCode}`);
editText("mobile/android/app/build.gradle", /versionName "[^"]*"/, `versionName "${version}"`);

console.log(`LCSign ${version} (Android versionCode ${versionCode}). Add it to CHANGELOG.md, then build.`);
