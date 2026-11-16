// Builds the Android app (an .apk) from the web export in ../dist.
// Run from the repo root with `npm run mobile:build` (that exports the web
// build first), or `node build-apk.mjs` in mobile/ to reuse the current dist.
//
// Needs Android Studio (for its Java, "jbr") and the Android SDK it installs.
// JAVA_HOME / ANDROID_HOME are used when set; otherwise the default install
// locations are tried.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const win = process.platform === "win32";
const first = (paths) => paths.find((p) => p && existsSync(p));

const javaHome = first([
  process.env.JAVA_HOME,
  "C:/Program Files/Android/Android Studio/jbr",
  "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  "/opt/android-studio/jbr",
]);
const sdk = first([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
  join(homedir(), "Library", "Android", "sdk"),
  join(homedir(), "Android", "Sdk"),
]);
if (!javaHome) throw new Error("No Java found: install Android Studio, or set JAVA_HOME to a JDK 21.");
if (!sdk) throw new Error("No Android SDK found: open Android Studio once to install it, or set ANDROID_HOME.");
if (!existsSync(join(here, "..", "dist", "index.html"))) throw new Error("No ../dist: run `npx expo export --platform web` first.");

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const run = (command, cwd) => execSync(command, { cwd, env, stdio: "inherit" });

// Copies ../dist into the Android project (android/app/src/main/assets/public)
// and registers the plugins in package.json (TextToSpeech).
run("npx cap sync android", here);
// Full path: cmd.exe doesn't always look in the current folder
// (NoDefaultCurrentDirectoryInExePath).
const gradlew = join(here, "android", win ? "gradlew.bat" : "gradlew");

// Release (signed with LCSign's key, see android/app/build.gradle) when
// android/keystore.properties is there; otherwise a debug build, which this
// PC's debug key signs - fine for testing, but phones can't take an update
// to it from any other PC. `--debug` forces a debug build.
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
const release = !process.argv.includes("--debug") && existsSync(join(here, "android", "keystore.properties"));
mkdirSync(join(here, "dist"), { recursive: true });
if (release) {
  // .apk to install directly on phones; .aab is what the Play Store takes.
  run(`"${gradlew}" assembleRelease bundleRelease --console=plain`, join(here, "android"));
  const outputs = join(here, "android", "app", "build", "outputs");
  const apk = join(here, "dist", `LCSign-${version}.apk`);
  const aab = join(here, "dist", `LCSign-${version}.aab`);
  copyFileSync(join(outputs, "apk", "release", "app-release.apk"), apk);
  copyFileSync(join(outputs, "bundle", "release", "app-release.aab"), aab);
  console.log(`\nAndroid app (release, signed): ${apk}\nPlay Store bundle: ${aab}`);
} else {
  if (!process.argv.includes("--debug")) console.warn("\nNo android/keystore.properties - building a DEBUG app (see android/app/build.gradle).");
  run(`"${gradlew}" assembleDebug --console=plain`, join(here, "android"));
  const out = join(here, "dist", `LCSign-${version}-debug.apk`);
  copyFileSync(join(here, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"), out);
  console.log(`\nAndroid app (debug): ${out}`);
}
