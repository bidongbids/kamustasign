// Shared helpers for the red-team scripts. Point env.json at a separate TEST
// Supabase project (see README.md) - they create accounts and try to break things.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import crypto from "node:crypto";
const require = createRequire(new URL("../../package.json", import.meta.url));
export const { createClient } = require("@supabase/supabase-js");
export const env = JSON.parse(readFileSync(new URL("./env.json", import.meta.url)));
// Never against the real project: compare with the app's own .env.
const prodUrl = (() => {
  try {
    return (readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m) || [])[1]?.trim();
  } catch {
    return undefined;
  }
})();
const bare = (u) => (u ?? "").trim().replace(/\/+$/, "");
if (!env.url || bare(env.url) === bare(prodUrl)) throw new Error("refusing: env.json must point at a separate TEST project, not the live one");
export const CREDS = new URL("./creds.json", import.meta.url);
export const creds = () => (existsSync(CREDS) ? JSON.parse(readFileSync(CREDS)) : {});
export const saveCreds = (c) => writeFileSync(CREDS, JSON.stringify(c, null, 2));
export const anonClient = () => createClient(env.url, env.anon, { auth: { persistSession: false, autoRefreshToken: false } });
export async function login(name) {
  const c = creds()[name];
  const sb = anonClient();
  const { data, error } = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
  if (error) throw new Error(`${name} login: ${error.message}`);
  sb.uid = data.user.id;
  return sb;
}
// RFC 6238 TOTP from a base32 secret.
export function totp(secret, t = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = crypto.createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, "0");
}
// Result recorder: expect "blocked" (attack should fail) or "allowed".
export const results = [];
export function record(area, attack, outcome, detail = "") {
  results.push({ area, attack, outcome, detail });
  const tag = outcome === "VULNERABLE" ? "!! VULN" : outcome === "blocked" ? "ok    " : outcome.padEnd(6);
  console.log(`${tag} [${area}] ${attack}${detail ? " - " + detail : ""}`);
}
