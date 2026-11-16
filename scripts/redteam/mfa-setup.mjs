// Turn on 2FA (TOTP) for the test admins, the way the app's Setup2FA does.
import { login, creds, saveCreds, totp } from "./lib.mjs";
const c = creds();
for (const who of ["sa", "ad"]) {
  if (c[who].totpSecret) { console.log(who, "already has 2FA"); continue; }
  const sb = await login(who);
  const { data: f, error: e1 } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "redteam" });
  if (e1) { console.log(who, "enroll error", e1.message); continue; }
  const secret = f.totp.secret;
  const { error: e2 } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: totp(secret) });
  console.log(who, e2 ? "verify error " + e2.message : "2FA on, factor " + f.id);
  if (!e2) { c[who].totpSecret = secret; c[who].factorId = f.id; }
}
saveCreds(c);
