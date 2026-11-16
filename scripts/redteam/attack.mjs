// LCSign red-team run against a separate TEST project only (env.json).
// Each attack is something a dishonest user could try with the public key and
// their own login, skipping the app's screens. "blocked" = the server refused;
// "VULNERABLE" = it worked when it shouldn't; "allowed" = works by design.
import { writeFileSync } from "node:fs";
import { anonClient, login as rawLogin, creds, totp, record, results, env } from "./lib.mjs";
// Space log-ins out: Supabase allows 30 sign-ins per 5 minutes per address.
const login = async (name) => { await new Promise((r) => setTimeout(r, 4000)); return rawLogin(name); };

const c = creds();
const A = "00000000-0000-4000-b000-0000000000aa";
const B = "00000000-0000-4000-b000-0000000000bb";
const MOD_B = "00000000-0000-4000-c000-0000000000bb";
const TABLES = ["profiles", "classes", "assignments", "submissions", "scores", "lesson_progress", "modules", "module_signs",
  "class_word_plans", "missed_calls", "call_notes", "call_bookings", "app_release"];

async function aal2(name) {
  const sb = await login(name);
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: c[name].factorId, code: totp(c[name].totpSecret) });
  if (error) throw new Error(`${name} 2FA: ${error.message}`);
  return sb;
}
const errText = (e) => (e ? `${e.code ?? ""} ${e.message}`.trim().slice(0, 110) : "");

// Expect the read to return nothing (or an error).
async function noRows(area, attack, q) {
  const { data, error } = await q;
  if (error) return record(area, attack, "blocked", errText(error));
  if (!data || (Array.isArray(data) && data.length === 0)) return record(area, attack, "blocked", "0 rows");
  record(area, attack, "VULNERABLE", `${Array.isArray(data) ? data.length : 1} row(s): ${JSON.stringify(data).slice(0, 140)}`);
}
// Expect the call to fail (or change nothing: an update/delete/insert that returns no rows).
async function refused(area, attack, q) {
  let data, error;
  try { ({ data, error } = await q); } catch (e) { return record(area, attack, "blocked", "threw " + e.message.slice(0, 80)); }
  if (error) return record(area, attack, "blocked", errText(error));
  if (data == null || (Array.isArray(data) && data.length === 0)) return record(area, attack, "blocked", "no rows changed");
  record(area, attack, "VULNERABLE", JSON.stringify(data).slice(0, 160));
}
async function realtimeJoin(sb, topic) {
  const { data } = await sb.auth.getSession();
  sb.realtime.setAuth(data.session?.access_token ?? env.anon);
  return new Promise((resolve) => {
    const ch = sb.channel(topic, { config: { private: true, broadcast: { self: false, ack: true } } });
    let finished = false;
    const done = (r) => {
      if (finished) return;
      finished = true;
      clearTimeout(t);
      resolve(r);
      setTimeout(() => sb.removeChannel(ch).catch(() => {}), 0);
    };
    const t = setTimeout(() => done("timeout"), 8000);
    ch.subscribe(async (status, err) => {
      if (status === "SUBSCRIBED") {
        const sent = await ch.send({ type: "broadcast", event: "call-signal", payload: { kind: "hangup", from: "attacker" } });
        done(`SUBSCRIBED, send=${sent}`);
      } else if (status === "CHANNEL_ERROR" || status === "CLOSED" || status === "TIMED_OUT") done(`${status} ${err?.message ?? ""}`.trim());
    });
  });
}
async function rt(area, attack, sb, topic) {
  const r = await realtimeJoin(sb, topic);
  record(area, attack, r.startsWith("SUBSCRIBED") ? "VULNERABLE" : "blocked", r);
}

// ── 1. No account: just the public key ─────────────────────────────────
{
  const sb = anonClient(), area = "anon";
  for (const t of TABLES) {
    if (t === "app_release") {
      const { data } = await sb.from(t).select("*");
      record(area, "read app_release (by design)", data?.length === 2 ? "allowed" : "VULNERABLE", `${data?.length} rows`);
      await refused(area, "change app_release update_feed_url", sb.from(t).update({ update_feed_url: "https://evil.example/" }).eq("platform", "desktop").select());
      continue;
    }
    await noRows(area, `read ${t}`, sb.from(t).select("*").limit(5));
  }
  await refused(area, "insert a profile", sb.from("profiles").insert({ id: crypto.randomUUID(), full_name: "x", role: "admin" }).select());
  for (const [fn, args] of [["admin_list_accounts", {}], ["list_unassigned_students", {}], ["new_class_code", {}],
    ["regenerate_class_code", { p_class_id: A }], ["join_class_with_code", { p_code: "AAAAAA" }],
    ["add_students_to_class", { p_class_id: A, p_student_ids: [c.s3.id] }], ["remove_student_from_class", { p_student_id: c.s1.id }],
    ["decline_signup", { p_profile_id: c.s4.id }], ["set_module_signs", { p_module_id: MOD_B, p_signs: ["x"] }],
    ["record_lesson_attempt", { p_student_id: c.s1.id, p_language: "asl", p_sign_group: "words", p_sign: "hello", p_passed: true, p_confidence: 1 }],
    ["can_use_call_topic", { p_topic: `call:${B}:${c.s2.id}` }], ["is_call_partner", { p_class_id: B, p_other: c.s2.id }],
    ["other_admin_exists", { p_id: c.sa.id }], ["is_superadmin", {}]]) {
    await refused(area, `call ${fn}()`, sb.rpc(fn, args));
  }
  const root = await fetch(`${env.url}/rest/v1/`, { headers: { apikey: env.anon } });
  const body = await root.text();
  record(area, "list the API's tables (OpenAPI)", /"paths"\s*:\s*\{\s*"\/[a-z]/.test(body) ? "VULNERABLE" : "blocked", `HTTP ${root.status}, ${body.length} bytes`);
  await rt(area, "listen on class B's call channel", sb, `call:${B}:${c.s2.id}`);
}

// ── 2. Student S1 (class A) ────────────────────────────────────────────
{
  const sb = await login("s1"), area = "student";
  const { data: seen } = await sb.from("profiles").select("full_name, role, class_id");
  const others = (seen ?? []).filter((p) => !["RT Student One", "RT Teacher One"].includes(p.full_name));
  record(area, "read other people's profiles", others.length ? "VULNERABLE" : "blocked", `sees: ${(seen ?? []).map((p) => p.full_name).join(", ")}`);
  for (const [field, value] of [["role", "teacher"], ["role", "admin"], ["superadmin", true], ["approved", false], ["class_id", B]]) {
    await refused(area, `set own ${field} = ${value}`, sb.from("profiles").update({ [field]: value }).eq("id", c.s1.id).select());
  }
  await refused(area, "rename student S2", sb.from("profiles").update({ full_name: "hacked" }).eq("id", c.s2.id).select());
  const { data: classes } = await sb.from("classes").select("id, name, join_code");
  const leak = (classes ?? []).filter((x) => x.id !== A);
  record(area, "see other classes or their join codes", leak.length ? "VULNERABLE" : "blocked", JSON.stringify(classes));
  const own = (classes ?? []).find((x) => x.id === A);
  record(area, "see own class's join code", own?.join_code ? "info" : "blocked", own?.join_code ? "join code visible to students" : "");
  await noRows(area, "read S2's practice progress", sb.from("lesson_progress").select("*").eq("student_id", c.s2.id));
  await refused(area, "write progress row for S2", sb.from("lesson_progress").insert({ student_id: c.s2.id, language: "asl", sign_group: "words", sign: "bye", attempts: 1, passes: 1, best_confidence: 1 }).select());
  await refused(area, "edit S2's progress row", sb.from("lesson_progress").update({ passes: 99 }).eq("student_id", c.s2.id).select());
  await refused(area, "write own progress row directly (skip the RPC)", sb.from("lesson_progress").insert({ student_id: c.s1.id, language: "asl", sign_group: "words", sign: "bye", attempts: 1, passes: 50, best_confidence: 1 }).select());
  await refused(area, "record a pass for S2 via the RPC", sb.rpc("record_lesson_attempt", { p_student_id: c.s2.id, p_language: "asl", p_sign_group: "words", p_sign: "bye", p_passed: true, p_confidence: 1 }));
  // Known design limit: a student can report a pass for a sign they never made.
  const fake = await sb.rpc("record_lesson_attempt", { p_student_id: c.s1.id, p_language: "asl", p_sign_group: "words", p_sign: "thank you", p_passed: true, p_confidence: 1 });
  record(area, "report a pass without signing (forged star)", fake.error ? "blocked" : "VULNERABLE", fake.error ? errText(fake.error) : "accepted: stars can be faked by calling the API");
  // Since 0012 there is no pass cooldown (one pass learns a sign), so every pass counts - by design.
  await Promise.all(Array.from({ length: 20 }, () => sb.rpc("record_lesson_attempt", { p_student_id: c.s1.id, p_language: "asl", p_sign_group: "words", p_sign: "yes", p_passed: true, p_confidence: 1 })));
  const { data: race } = await sb.from("lesson_progress").select("attempts, passes").eq("student_id", c.s1.id).eq("sign", "yes").single();
  record(area, "20 simultaneous passes (no cooldown since 0012)", "info", `passes counted: ${race?.passes}, attempts: ${race?.attempts}`);
  await noRows(area, "read class B's modules", sb.from("modules").select("*").eq("class_id", B));
  await refused(area, "add a module to own class", sb.from("modules").insert({ class_id: A, title: "student module", language: "asl", sign_group: "words" }).select());
  await refused(area, "change class B's module signs", sb.rpc("set_module_signs", { p_module_id: MOD_B, p_signs: ["hacked"] }));
  await noRows(area, "read class B's word plan", sb.from("class_word_plans").select("*").eq("class_id", B));
  await refused(area, "write own class's word plan", sb.from("class_word_plans").upsert({ class_id: A, language: "fsl", signs: ["x"] }).select());
  await noRows(area, "read class B's call notes", sb.from("call_notes").select("*").eq("class_id", B));
  await refused(area, "write a call note as if from the teacher", sb.from("call_notes").insert({ class_id: A, teacher_id: c.t1.id, student_id: c.s1.id, started_at: new Date().toISOString(), duration_seconds: 5, teacher_text: "fake" }).select());
  await noRows(area, "read class B's call bookings", sb.from("call_bookings").select("*").eq("class_id", B));
  await refused(area, "book own call (teacher's job)", sb.from("call_bookings").insert({ class_id: A, teacher_id: c.t1.id, student_id: c.s1.id, starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), ends_at: new Date(Date.now() + 3 * 864e5 + 18e5).toISOString() }).select());
  await refused(area, "stretch own booking to 2 days", sb.from("call_bookings").update({ ends_at: new Date(Date.now() + 2 * 864e5).toISOString() }).eq("student_id", c.s1.id).select());
  await refused(area, "fake a missed call from teacher T2 to S2", sb.from("missed_calls").insert({ class_id: B, caller_id: c.t2.id, callee_id: c.s2.id }).select());
  for (const [fn, args] of [["admin_list_accounts", {}], ["list_unassigned_students", {}], ["regenerate_class_code", { p_class_id: A }],
    ["add_students_to_class", { p_class_id: A, p_student_ids: [c.s3.id] }], ["remove_student_from_class", { p_student_id: c.s2.id }],
    ["decline_signup", { p_profile_id: c.s4.id }], ["join_class_with_code", { p_code: "ZZZZZZ" }]]) {
    await refused(area, `call ${fn}()`, sb.rpc(fn, args));
  }
  await refused(area, "change app_release", sb.from("app_release").update({ min_version: "9.9.9" }).eq("platform", "desktop").select());
  for (const t of ["assignments", "submissions", "scores"]) await noRows(area, `read legacy table ${t}`, sb.from(t).select("*"));
  await rt(area, "listen on class B's call (S2 + T2)", sb, `call:${B}:${c.s2.id}`);
  const ownCall = await realtimeJoin(sb, `call:${A}:${c.s1.id}`);
  record(area, "join own call channel (by design)", ownCall.startsWith("SUBSCRIBED") ? "allowed" : "VULNERABLE", ownCall);
}

// ── 3. Waiting (unapproved) student S4 ─────────────────────────────────
{
  const t1 = await login("t1");
  const { data: cls } = await t1.from("classes").select("join_code").eq("id", A).single();
  const sb = await login("s4"), area = "pending student";
  await refused(area, "join a class with a valid code before approval", sb.rpc("join_class_with_code", { p_code: cls.join_code }));
  await refused(area, "record practice before approval", sb.rpc("record_lesson_attempt", { p_student_id: c.s4.id, p_language: "asl", p_sign_group: "words", p_sign: "hello", p_passed: true, p_confidence: 1 }));
  await refused(area, "approve itself", sb.from("profiles").update({ approved: true }).eq("id", c.s4.id).select());
  const { data: seen } = await sb.from("profiles").select("full_name");
  record(area, "see other people's profiles", (seen ?? []).some((p) => p.full_name !== "RT Student Pending") ? "VULNERABLE" : "blocked", `sees: ${(seen ?? []).map((p) => p.full_name).join(", ")}`);
}

// ── 4. Student with no class S3: guessing join codes ───────────────────
{
  const sb = await login("s3"), area = "join codes";
  const t0 = Date.now();
  const codes = Array.from({ length: 60 }, (_, i) => `QQ${String(1000 + i)}`.slice(0, 6));
  const outs = await Promise.all(codes.map((p_code) => sb.rpc("join_class_with_code", { p_code })));
  const limited = outs.filter((o) => o.error?.message?.match(/rate|too many/i) || o.status === 429).length;
  const secs = (Date.now() - t0) / 1000;
  record(area, "60 code guesses in a burst are rate-limited", limited ? "blocked" : "weak", `${limited}/60 limited, ${secs.toFixed(1)} s; 31^6 = 887M codes`);
}

// ── 5. Teacher T1 (class A) ────────────────────────────────────────────
{
  const sb = await login("t1"), area = "teacher";
  const { data: ps } = await sb.from("profiles").select("full_name");
  const outside = (ps ?? []).filter((p) => !["RT Teacher One", "RT Student One"].includes(p.full_name)).map((p) => p.full_name);
  record(area, "see profiles outside own class", outside.some((n) => ["RT Student Two", "RT Teacher Two", "RT Admin", "RT Super Admin"].includes(n)) ? "VULNERABLE" : outside.length ? "info" : "blocked", `extra: ${outside.join(", ") || "none"}`);
  await noRows(area, "read S2's progress (class B)", sb.from("lesson_progress").select("*").eq("student_id", c.s2.id));
  await noRows(area, "read class B's call notes", sb.from("call_notes").select("*").eq("class_id", B));
  await noRows(area, "read class B's modules", sb.from("modules").select("*").eq("class_id", B));
  await refused(area, "take over class B (set teacher_id)", sb.from("classes").update({ teacher_id: c.t1.id }).eq("id", B).select());
  await refused(area, "rename class B", sb.from("classes").update({ name: "pwned" }).eq("id", B).select());
  await refused(area, "move own class to another teacher", sb.from("classes").update({ teacher_id: c.t2.id }).eq("id", A).select());
  await refused(area, "change class B's join code", sb.rpc("regenerate_class_code", { p_class_id: B }));
  await refused(area, "pull S2 out of class B", sb.rpc("remove_student_from_class", { p_student_id: c.s2.id }));
  await refused(area, "add S2 (class B) to own class", sb.rpc("add_students_to_class", { p_class_id: A, p_student_ids: [c.s2.id] }));
  await refused(area, "add students to class B", sb.rpc("add_students_to_class", { p_class_id: B, p_student_ids: [c.s3.id] }));
  await refused(area, "add a module to class B", sb.from("modules").insert({ class_id: B, title: "x", language: "asl", sign_group: "words" }).select());
  await refused(area, "change class B's module signs", sb.rpc("set_module_signs", { p_module_id: MOD_B, p_signs: ["x"] }));
  await refused(area, "book a call with S2 (not own student)", sb.from("call_bookings").insert({ class_id: B, teacher_id: c.t1.id, student_id: c.s2.id, starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), ends_at: new Date(Date.now() + 5 * 864e5 + 18e5).toISOString() }).select());
  await refused(area, "book a call in T2's name", sb.from("call_bookings").insert({ class_id: A, teacher_id: c.t2.id, student_id: c.s1.id, starts_at: new Date(Date.now() + 6 * 864e5).toISOString(), ends_at: new Date(Date.now() + 6 * 864e5 + 18e5).toISOString() }).select());
  await refused(area, "write a call note about S2", sb.from("call_notes").insert({ class_id: B, teacher_id: c.t1.id, student_id: c.s2.id, started_at: new Date().toISOString(), duration_seconds: 5 }).select());
  await refused(area, "edit own student S1's progress", sb.from("lesson_progress").update({ passes: 99 }).eq("student_id", c.s1.id).select());
  await refused(area, "make itself admin", sb.from("profiles").update({ role: "admin" }).eq("id", c.t1.id).select());
  await refused(area, "approve waiting teacher T3", sb.from("profiles").update({ approved: true }).eq("id", c.t3.id).select());
  await refused(area, "rename own student S1", sb.from("profiles").update({ full_name: "renamed by teacher" }).eq("id", c.s1.id).select());
  await refused(area, "list all accounts", sb.rpc("admin_list_accounts"));
  await refused(area, "decline a sign-up", sb.rpc("decline_signup", { p_profile_id: c.s4.id }));
  await refused(area, "change app_release", sb.from("app_release").update({ latest_version: "9.9.9" }).eq("platform", "android").select());
  await rt(area, "listen on class B's call", sb, `call:${B}:${c.s2.id}`);
  await rt(area, "listen on a made-up call with S2 under own class", sb, `call:${A}:${c.s2.id}`);
  const { data: un } = await sb.rpc("list_unassigned_students");
  record(area, "list students with no class (by design)", "info", `${(un ?? []).length} shown: ${(un ?? []).map((u) => u.email).join(", ")}`);
}

// ── 6. Waiting teacher T3 ──────────────────────────────────────────────
{
  const sb = await login("t3"), area = "pending teacher";
  await refused(area, "create a class before approval", sb.from("classes").insert({ name: "sneaky", teacher_id: c.t3.id }).select());
  await refused(area, "list students with no class", sb.rpc("list_unassigned_students"));
  await refused(area, "add students to a class", sb.rpc("add_students_to_class", { p_class_id: A, p_student_ids: [c.s3.id] }));
}

// ── 7. Admins ──────────────────────────────────────────────────────────
{
  const area = "admin";
  const ad1 = await login("ad");
  await refused(area, "list accounts without passing 2FA (aal1)", ad1.rpc("admin_list_accounts"));
  await refused(area, "approve a student without passing 2FA", ad1.from("profiles").update({ approved: true }).eq("id", c.s4.id).select());
  const un = await ad1.auth.mfa.unenroll({ factorId: c.ad.factorId });
  record(area, "turn off own 2FA without passing 2FA", un.error ? "blocked" : "VULNERABLE", errText(un.error));
  const ad = await aal2("ad");
  const { data: list } = await ad.rpc("admin_list_accounts");
  record(area, "list accounts with 2FA (by design)", list?.length ? "allowed" : "info", `${list?.length} accounts`);
  await refused(area, "approve the waiting ADMIN (super admin's job)", ad.from("profiles").update({ approved: true }).eq("id", c.ap.id).select());
  await refused(area, "make itself super admin", ad.from("profiles").update({ superadmin: true }).eq("id", c.ad.id).select());
  await refused(area, "demote the super admin to student", ad.from("profiles").update({ role: "student" }).eq("id", c.sa.id).select());
  await refused(area, "remove the super admin's superadmin flag", ad.from("profiles").update({ superadmin: false }).eq("id", c.sa.id).select());
  await refused(area, "decline (delete) the super admin", ad.rpc("decline_signup", { p_profile_id: c.sa.id }));
  await refused(area, "decline an approved teacher", ad.rpc("decline_signup", { p_profile_id: c.t2.id }));
  await refused(area, "change app_release", ad.from("app_release").update({ update_feed_url: "https://evil.example/" }).eq("platform", "desktop").select());
  await noRows(area, "read call notes (teacher + student only)", ad.from("call_notes").select("*"));
  await rt(area, "listen on class B's call", ad, `call:${B}:${c.s2.id}`);
  const ap = await login("ap");
  await refused("pending admin", "list accounts", ap.rpc("admin_list_accounts"));
  await refused("pending admin", "approve itself", ap.from("profiles").update({ approved: true }).eq("id", c.ap.id).select());
  const sa = await aal2("sa");
  await refused(area, "super admin removes own superadmin flag (lock-out guard)", sa.from("profiles").update({ superadmin: false }).eq("id", c.sa.id).select());
}

// ── 8. Sign-up and log-in ──────────────────────────────────────────────
{
  const area = "auth";
  const email = `rt-evil-${Date.now()}@example.com`;
  const su = await anonClient().auth.signUp({ email, password: "Str0ng-pass-" + Date.now(), options: { data: { full_name: "Evil", role: "admin", superadmin: true, approved: true } } });
  if (su.error) record(area, "sign up asking for superadmin + approved", "blocked", errText(su.error));
  else {
    const sa = await aal2("sa");
    const { data } = await sa.rpc("admin_list_accounts");
    const me = (data ?? []).find((a) => a.id === su.data.user.id);
    record(area, "sign up asking for superadmin + approved", me && (me.approved || me.superadmin) ? "VULNERABLE" : "blocked", me ? `role=${me.role} approved=${me.approved} superadmin=${me.superadmin}` : "profile not listed");
  }
  const short = await anonClient().auth.signUp({ email: `rt-short-${Date.now()}@example.com`, password: "short12" });
  record(area, "sign up with a 7-character password", short.error ? "blocked" : "VULNERABLE", errText(short.error));
  let limitedAt = 0;
  for (let i = 1; i <= 40; i++) {
    const r = await anonClient().auth.signInWithPassword({ email: c.s1.email, password: "wrong-password-" + i });
    if (r.error?.status === 429 || /rate limit|too many/i.test(r.error?.message ?? "")) { limitedAt = i; break; }
  }
  record(area, "40 wrong passwords in a row get rate-limited", limitedAt ? "blocked" : "weak", limitedAt ? `limited at attempt ${limitedAt}` : "no limit within 40 tries");
  const ad = await login("ad");
  let mfaLimited = 0;
  for (let i = 1; i <= 30; i++) {
    const ch = await ad.auth.mfa.challenge({ factorId: c.ad.factorId });
    const r = ch.error ? ch : await ad.auth.mfa.verify({ factorId: c.ad.factorId, challengeId: ch.data.id, code: String(100000 + i) });
    if (r.error?.status === 429 || /rate limit|too many/i.test(r.error?.message ?? "")) { mfaLimited = i; break; }
  }
  record(area, "30 wrong 2FA codes get rate-limited", mfaLimited ? "blocked" : "weak", mfaLimited ? `limited at attempt ${mfaLimited}` : "no limit within 30 tries (1M codes, 30 s window)");
  const fakeJwt = env.anon.split(".").slice(0, 1).concat(Buffer.from(JSON.stringify({ role: "service_role", iss: "supabase", ref: new URL(env.url).hostname.split(".")[0] })).toString("base64url"), "AAAA").join(".");
  const r = await fetch(`${env.url}/rest/v1/profiles?select=*`, { headers: { apikey: env.anon, Authorization: `Bearer ${fakeJwt}` } });
  record(area, "forged service_role token", r.status >= 400 ? "blocked" : "VULNERABLE", `HTTP ${r.status}`);
}

writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));
const n = (o) => results.filter((r) => r.outcome === o).length;
console.log(`\n${results.length} attacks: ${n("blocked")} blocked, ${n("VULNERABLE")} VULNERABLE, ${n("weak")} weak, ${n("allowed")} allowed by design, ${n("info")} info`);
process.exit(0);
