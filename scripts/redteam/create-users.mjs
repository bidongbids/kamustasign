import crypto from "node:crypto";
import { anonClient, creds, saveCreds } from "./lib.mjs";
const people = {
  sa: ["RT Super Admin", "admin"], ad: ["RT Admin", "admin"], ap: ["RT Admin Pending", "admin"],
  t1: ["RT Teacher One", "teacher"], t2: ["RT Teacher Two", "teacher"], t3: ["RT Teacher Pending", "teacher"],
  s1: ["RT Student One", "student"], s2: ["RT Student Two", "student"], s3: ["RT Student NoClass", "student"], s4: ["RT Student Pending", "student"],
};
const c = creds();
for (const [key, [name, role]] of Object.entries(people)) {
  if (c[key]?.id) { console.log(key, "exists"); continue; }
  const email = `rt-${key}@example.com`;
  const password = crypto.randomBytes(15).toString("base64url");
  const { data, error } = await anonClient().auth.signUp({ email, password, options: { data: { full_name: name, role } } });
  if (error) { console.log(key, "ERROR", error.message); continue; }
  c[key] = { email, password, id: data.user.id, role };
  console.log(key, data.user.id, data.session ? "session" : "no session");
}
saveCreds(c);
