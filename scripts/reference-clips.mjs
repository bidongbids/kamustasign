// The "How to make it" sign videos, and how they reach builds made on GitHub.
//
// *.mp4 is git-ignored, so a build made from a fresh checkout (the desktop
// installer workflow) used to have no word videos at all: the 1.2.0
// installer showed "No picture for this sign yet" for every word and for
// the FSL numbers. Since 1.2.1:
//
// - FSL clips (public/reference/fsl-words, from FSL-105, CC BY 4.0, which
//   allows sharing with credit) are committed as normal files.
// - ASL word clips (public/reference/asl-words, from ASL Citizen and WLASL)
//   have research-only licenses that don't allow sharing them, and this
//   repository is public. They are committed as one encrypted file,
//   locked-media/asl-words.lcpack, that only the key opens. The key is
//   LCSIGN_CLIPS_KEY: in .env on the development PC (never bundled - only
//   EXPO_PUBLIC_* values reach the app) and a repository secret on GitHub.
//
//   node scripts/reference-clips.mjs lock          after the ASL clips change
//                                                   (export_reference_media.py)
//   node scripts/reference-clips.mjs unlock [dir]  before building from a fresh
//                                                   checkout (the workflow does it)
//   node scripts/reference-clips.mjs check [dir]   every file the app lists is in
//                                                   dir (default dist), else exit 1
//
// Losing the key costs nothing: run lock again (it makes a new key when
// none is set) and replace the GitHub secret.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(root, "public", "reference", "asl-words");
const PACK = join(root, "locked-media", "asl-words.lcpack");
const TABLE = join(root, "src", "data", "referenceMedia.json");
const ENV_FILE = join(root, ".env");
const MAGIC = Buffer.from("LCSPACK1");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readKey() {
  if (process.env.LCSIGN_CLIPS_KEY) return process.env.LCSIGN_CLIPS_KEY.trim();
  if (!existsSync(ENV_FILE)) return null;
  const line = readFileSync(ENV_FILE, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("LCSIGN_CLIPS_KEY="));
  return line ? line.slice("LCSIGN_CLIPS_KEY=".length).trim() || null : null;
}

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

// Plain layout: [uint32 header length][header JSON [{name, size}]][file bytes...]
function packFiles(files) {
  const header = Buffer.from(JSON.stringify(files.map((f) => ({ name: f.name, size: f.data.length }))));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(header.length);
  return Buffer.concat([len, header, ...files.map((f) => f.data)]);
}

function unpackFiles(plain) {
  const len = plain.readUInt32BE(0);
  const header = JSON.parse(plain.subarray(4, 4 + len).toString("utf8"));
  let at = 4 + len;
  return header.map(({ name, size }) => {
    const data = plain.subarray(at, at + size);
    at += size;
    return { name, data };
  });
}

// Sealed layout: MAGIC, salt (16), iv (12), GCM tag (16), ciphertext.
function seal(plain, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** The plain pack, or null when the key is wrong or the file is damaged. */
function open(sealed, passphrase) {
  if (!sealed.subarray(0, 8).equals(MAGIC)) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, sealed.subarray(8, 24)), sealed.subarray(24, 36));
    decipher.setAuthTag(sealed.subarray(36, 52));
    return Buffer.concat([decipher.update(sealed.subarray(52)), decipher.final()]);
  } catch {
    return null;
  }
}

function sameFiles(a, b) {
  return a.length === b.length && a.every((f, i) => f.name === b[i].name && f.data.equals(b[i].data));
}

function lock() {
  if (!existsSync(CLIPS)) fail(`No clips to lock: ${CLIPS} doesn't exist.`);
  const files = readdirSync(CLIPS)
    .filter((n) => n.endsWith(".mp4"))
    .sort()
    .map((name) => ({ name, data: readFileSync(join(CLIPS, name)) }));
  if (files.length === 0) fail(`No .mp4 files in ${CLIPS}.`);

  let key = readKey();
  if (!key) {
    key = randomBytes(32).toString("base64url");
    const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    const sep = existing === "" || existing.endsWith("\n") ? "" : "\n";
    appendFileSync(ENV_FILE, `${sep}# Opens locked-media/asl-words.lcpack (scripts/reference-clips.mjs). Not bundled into the app.\nLCSIGN_CLIPS_KEY=${key}\n`);
    console.log("Made a new key and saved it in .env as LCSIGN_CLIPS_KEY.");
    console.log("Add the same value on GitHub: Settings > Secrets and variables > Actions > New repository secret, name LCSIGN_CLIPS_KEY.");
  }

  // Re-sealing identical clips would still give a new file (fresh salt and
  // iv), and every new file adds ~19 MB to git history. Skip it.
  // A different key or a damaged file just seals again.
  if (existsSync(PACK)) {
    const plain = open(readFileSync(PACK), key);
    if (plain && sameFiles(unpackFiles(plain), files)) {
      console.log(`locked-media/asl-words.lcpack already holds these ${files.length} clips. Nothing to do.`);
      return;
    }
  }

  mkdirSync(dirname(PACK), { recursive: true });
  writeFileSync(PACK, seal(packFiles(files), key));
  const mb = (statSync(PACK).size / 1024 / 1024).toFixed(1);
  console.log(`Locked ${files.length} ASL word clips into locked-media/asl-words.lcpack (${mb} MB). Commit it.`);
}

function unlock(dir = CLIPS) {
  if (!existsSync(PACK)) fail("locked-media/asl-words.lcpack is missing.");
  const key = readKey();
  if (!key) {
    fail(
      "LCSIGN_CLIPS_KEY isn't set, so the ASL word videos can't be unlocked.\n" +
        "On GitHub: add the repository secret LCSIGN_CLIPS_KEY (the value is in the development PC's .env).",
    );
  }
  const plain = open(readFileSync(PACK), key);
  if (!plain) fail("Wrong LCSIGN_CLIPS_KEY: it doesn't open locked-media/asl-words.lcpack.");
  const files = unpackFiles(plain);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f.name), f.data);
  console.log(`Unlocked ${files.length} ASL word clips into ${dir}.`);
}

function check(dir = join(root, "dist")) {
  const table = JSON.parse(readFileSync(TABLE, "utf8"));
  const missing = [];
  for (const [sign, entry] of Object.entries(table)) {
    const file = join(dir, ...entry.uri.split("/").filter(Boolean));
    if (!existsSync(file) || statSync(file).size === 0) missing.push(`${sign} -> ${entry.uri}`);
  }
  const total = Object.keys(table).length;
  if (missing.length) {
    console.error(`${missing.length} of ${total} "How to make it" files are missing from ${dir}:`);
    for (const m of missing.slice(0, 20)) console.error(`  ${m}`);
    if (missing.length > 20) console.error(`  ... and ${missing.length - 20} more`);
    process.exit(1);
  }
  console.log(`All ${total} "How to make it" files are in ${dir}.`);
}

const [command, arg] = process.argv.slice(2);
if (command === "lock") lock();
else if (command === "unlock") unlock(arg ? resolve(arg) : undefined);
else if (command === "check") check(arg ? resolve(arg) : undefined);
else fail("Usage: node scripts/reference-clips.mjs lock | unlock [dir] | check [dir]");
