// Run a few minutes after attack.mjs (its wrong-password test trips the sign-in limit).
import { writeFileSync, readFileSync } from "node:fs";
import { anonClient, login, creds, record, results, env, totp } from "./lib.mjs";
const c = creds(), area = "auth";
const ad = await login("ad");
let mfaLimited = 0, tries = 0;
for (let i = 1; i <= 35; i++) {
  tries = i;
  const ch = await ad.auth.mfa.challenge({ factorId: c.ad.factorId });
  if (ch.error) { if (ch.error.status === 429 || /rate|too many/i.test(ch.error.message)) { mfaLimited = i; break; } console.log("challenge error", ch.error.message); break; }
  const r = await ad.auth.mfa.verify({ factorId: c.ad.factorId, challengeId: ch.data.id, code: String(100000 + i) });
  if (r.error?.status === 429 || /rate|too many/i.test(r.error?.message ?? "")) { mfaLimited = i; break; }
}
record(area, "wrong 2FA codes get rate-limited", mfaLimited ? "blocked" : "weak", mfaLimited ? `limited at attempt ${mfaLimited}` : `no limit within ${tries} tries`);
const fakeJwt = env.anon.split(".")[0] + "." + Buffer.from(JSON.stringify({ role: "service_role", iss: "supabase", ref: new URL(env.url).hostname.split(".")[0], exp: 4102444800 })).toString("base64url") + ".AAAA";
const r = await fetch(`${env.url}/rest/v1/profiles?select=*`, { headers: { apikey: env.anon, Authorization: `Bearer ${fakeJwt}` } });
record(area, "forged service_role token", r.status >= 400 ? "blocked" : "VULNERABLE", `HTTP ${r.status}`);
const algNone = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ role: "authenticated", sub: c.sa.id, aal: "aal2", exp: 4102444800 })).toString("base64url") + ".";
const r2 = await fetch(`${env.url}/rest/v1/rpc/admin_list_accounts`, { method: "POST", headers: { apikey: env.anon, Authorization: `Bearer ${algNone}`, "Content-Type": "application/json" }, body: "{}" });
record(area, "unsigned (alg=none) token claiming to be the super admin", r2.status >= 400 ? "blocked" : "VULNERABLE", `HTTP ${r2.status}`);
const s1 = await login("s1");
const { data: sess } = await s1.auth.getSession();
const old = sess.session.access_token;
await s1.auth.signOut();
const r3 = await fetch(`${env.url}/rest/v1/profiles?select=full_name`, { headers: { apikey: env.anon, Authorization: `Bearer ${old}` } });
record(area, "use an access token after logging out", r3.status >= 400 ? "blocked" : "weak", `HTTP ${r3.status} (access tokens live until they expire, 1 h by default)`);
writeFileSync(new URL("./results-auth2.json", import.meta.url), JSON.stringify(results, null, 2));
