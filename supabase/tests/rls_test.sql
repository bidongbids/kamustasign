-- RLS / access-rule checks for the classroom schema (migrations 0001-0018).
--
-- Run in the Supabase SQL editor (it runs as `postgres`) against a
-- NON-PRODUCTION project with every migration applied. (2026-11-05: also
-- passes in an in-memory Postgres (PGlite) with Supabase's auth, storage and
-- realtime pieces stubbed - the harness isn't in the repo yet.)
-- Everything happens inside one transaction that is rolled back at the end,
-- so no test users or rows are left behind. The first failing rule raises
-- "FAIL: ..." and aborts; a clean run ends with "RLS tests: all passed".
--
-- Cast:
--   SA super admin                AD admin (signs up as admin, SA approves)
--   AP admin sign-up, waiting     AQ admin sign-up SA turns down
--   T1 teacher of class A         T2 teacher of class B
--   T3 teacher awaiting approval
--   S1 student in class A         S2 student in class B, 2FA on
--   S3 student with no class      S4 student awaiting approval
--   S5 student AD approves        S6 student AD turns down
-- Users act through `set local role authenticated` + a JWT `sub` claim, which
-- is exactly what PostgREST does for a signed-in request. Admins need an
-- aal2 claim (0016). Realtime is checked the way the Realtime server does it:
-- realtime.topic set, then a SELECT (listen) / INSERT (send) on
-- realtime.messages as the user.

begin;

-- ── fixtures (as postgres: bypasses RLS) ────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000c2', 'rls-sa@test.invalid', '{"full_name":"RLS SA","role":"admin"}'),
  ('00000000-0000-4000-a000-0000000000c1', 'rls-ad@test.invalid', '{"full_name":"RLS AD","role":"admin"}'),
  ('00000000-0000-4000-a000-0000000000c3', 'rls-ap@test.invalid', '{"full_name":"RLS AP","role":"admin"}'),
  ('00000000-0000-4000-a000-0000000000c4', 'rls-aq@test.invalid', '{"full_name":"RLS AQ","role":"admin"}'),
  ('00000000-0000-4000-a000-0000000000a1', 'rls-t1@test.invalid', '{"full_name":"RLS T1","role":"teacher"}'),
  ('00000000-0000-4000-a000-0000000000a2', 'rls-t2@test.invalid', '{"full_name":"RLS T2","role":"teacher"}'),
  ('00000000-0000-4000-a000-0000000000a3', 'rls-t3@test.invalid', '{"full_name":"RLS T3","role":"teacher"}'),
  ('00000000-0000-4000-a000-0000000000b1', 'rls-s1@test.invalid', '{"full_name":"RLS S1"}'),
  ('00000000-0000-4000-a000-0000000000b2', 'rls-s2@test.invalid', '{"full_name":"RLS S2"}'),
  ('00000000-0000-4000-a000-0000000000b3', 'rls-s3@test.invalid', '{"full_name":"RLS S3"}'),
  -- Asks for roles that don't exist / a superadmin flag; must get a plain student.
  ('00000000-0000-4000-a000-0000000000b4', 'rls-s4@test.invalid', '{"full_name":"RLS S4","role":"superadmin","superadmin":true,"approved":true}'),
  ('00000000-0000-4000-a000-0000000000b5', 'rls-s5@test.invalid', '{"full_name":"RLS S5"}'),
  ('00000000-0000-4000-a000-0000000000b6', 'rls-s6@test.invalid', '{"full_name":"RLS S6"}');

-- Sign-up trigger (0014): any role may be asked for, nobody starts approved.
do $$ begin
  if exists (select 1 from public.profiles where id::text like '00000000-0000-4000-a000-%' and approved) then
    raise exception 'FAIL: a sign-up started out approved (apply 0014)';
  end if;
  if exists (select 1 from public.profiles where id::text like '00000000-0000-4000-a000-%' and superadmin) then
    raise exception 'FAIL: a sign-up started out as super admin';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000b4') <> 'student' then
    raise exception 'FAIL: an unknown role in sign-up metadata was not turned into student';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000c1') <> 'admin' then
    raise exception 'FAIL: an admin sign-up did not create a (waiting) admin profile';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') <> 'teacher' then
    raise exception 'FAIL: teacher sign-up did not create a teacher profile';
  end if;
end $$;

-- Over-long names are cut to 100 characters by the trigger.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000b7', 'rls-s7@test.invalid', jsonb_build_object('full_name', repeat('x', 500)));
do $$ begin
  if (select char_length(full_name) from public.profiles where id = '00000000-0000-4000-a000-0000000000b7') <> 100 then
    raise exception 'FAIL: sign-up full_name was not cut to 100 characters';
  end if;
end $$;

-- ── catalog checks (as postgres) ────────────────────────────────────────
do $$
declare r record;
begin
  -- Every table the API can reach has RLS on.
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    raise exception 'FAIL: row level security is off on public.%', r.relname;
  end loop;

  -- The anon key gets no table privileges at all - except reading
  -- app_release (0018), which the app checks before anyone logs in.
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
      and has_table_privilege('anon', c.oid, 'select, insert, update, delete')
      and c.relname <> 'app_release'
  loop
    raise exception 'FAIL: anon has privileges on public.%', r.relname;
  end loop;
  if not has_table_privilege('anon', 'public.app_release', 'select') then
    raise exception 'FAIL: anon cannot read public.app_release (apply 0018)';
  end if;
  for r in
    select who, priv from unnest(array['anon', 'authenticated']) who
      cross join unnest(array['insert', 'update', 'delete', 'truncate']) priv
    where has_table_privilege(who, 'public.app_release', priv)
  loop
    raise exception 'FAIL: % can % public.app_release', r.who, r.priv;
  end loop;

  -- SECURITY DEFINER functions pin search_path (no hijacking via a
  -- same-named object earlier on the path).
  for r in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    raise exception 'FAIL: SECURITY DEFINER function public.% has no fixed search_path', r.proname;
  end loop;

  -- The anon key can only run the three read-only role helpers (they answer
  -- NULL / false without a login). Trigger functions can't be called directly.
  for r in
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('current_user_role', 'current_user_class_id', 'is_admin')
  loop
    raise exception 'FAIL: anon can run public.%()', r.proname;
  end loop;

  -- The legacy tables are closed to signed-in users too (0011).
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('assignments', 'submissions', 'scores')
      and has_table_privilege('authenticated', c.oid, 'select, insert, update, delete')
  loop
    raise exception 'FAIL: legacy table public.% is still open to signed-in users', r.relname;
  end loop;
end $$;

-- ── approvals, classes, data (as postgres, the way the app would) ───────
update public.profiles set approved = true, superadmin = true where id = '00000000-0000-4000-a000-0000000000c2';
update public.profiles set approved = true where id in (
  '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a2',
  '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-0000000000b2',
  '00000000-0000-4000-a000-0000000000b3');

-- S2 has a verified authenticator (2FA): an aal1 session must get nothing.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('00000000-0000-4000-d000-0000000000b2', '00000000-0000-4000-a000-0000000000b2', 'rls-test', 'totp', 'verified', now(), now());

insert into public.classes (id, name, teacher_id, join_code) values
  ('00000000-0000-4000-b000-00000000000a', 'RLS class A', '00000000-0000-4000-a000-0000000000a1', 'RLSAAA'),
  ('00000000-0000-4000-b000-00000000000b', 'RLS class B', '00000000-0000-4000-a000-0000000000a2', 'RLSBBB');
update public.profiles set class_id = '00000000-0000-4000-b000-00000000000a' where id = '00000000-0000-4000-a000-0000000000b1';
update public.profiles set class_id = '00000000-0000-4000-b000-00000000000b' where id = '00000000-0000-4000-a000-0000000000b2';

insert into public.lesson_progress (student_id, language, sign_group, sign, attempts, passes) values
  ('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'A', 1, 1),
  ('00000000-0000-4000-a000-0000000000b2', 'asl', 'letters', 'A', 1, 1);

insert into public.modules (id, class_id, title, language, sign_group) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-b000-00000000000a', 'A module', 'asl', 'letters'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-b000-00000000000b', 'B module', 'asl', 'letters');

insert into public.class_word_plans (class_id, language, signs) values
  ('00000000-0000-4000-b000-00000000000a', 'asl', array['hello', 'mother']),
  ('00000000-0000-4000-b000-00000000000b', 'asl', array['bye']);

-- One message of each kind on three call topics, for the listen checks.
insert into realtime.messages (topic, extension, event) values
  ('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast', 'ring'),
  ('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'presence', 'sync'),
  ('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b3', 'broadcast', 'ring'),
  ('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'broadcast', 'ring'),
  ('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'presence', 'sync');

-- Realtime helpers, run as the caller (gone at rollback).
create schema rls_test;
grant usage on schema rls_test to anon, authenticated;

-- How many messages of this kind the caller may see on the topic (0 = may not listen).
create function rls_test.listen(p_topic text, p_ext text) returns bigint
language plpgsql security invoker as $$
begin
  perform set_config('realtime.topic', p_topic, true);
  return (select count(*) from realtime.messages m where m.topic = p_topic and m.extension = p_ext);
end $$;

-- Whether the caller may send (broadcast) / track (presence) on the topic.
create function rls_test.send(p_topic text, p_ext text) returns boolean
language plpgsql security invoker as $$
begin
  perform set_config('realtime.topic', p_topic, true);
  insert into realtime.messages (topic, extension, event) values (p_topic, p_ext, 'rls-test');
  return true;
exception when insufficient_privilege then
  return false;
end $$;
grant execute on all functions in schema rls_test to anon, authenticated;

-- ── as anon (just the public key, no login) ────────────────────────────
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'classes', 'modules', 'module_signs', 'lesson_progress',
    'class_word_plans', 'missed_calls', 'call_notes', 'call_bookings', 'assignments', 'submissions', 'scores']
  loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon can query public.%', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: anon can list accounts';
  exception when insufficient_privilege then null;
  end;
  if public.is_admin() or public.current_user_role() is not null then
    raise exception 'FAIL: anon has a role';
  end if;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') <> 0 then
    raise exception 'FAIL: anon can listen on a call topic';
  end if;
  if rls_test.send('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') then
    raise exception 'FAIL: anon can send on a call topic';
  end if;
  -- 0018: the version check works before login, and can't be changed.
  if (select count(*) from public.app_release) <> 2 then
    raise exception 'FAIL: anon cannot read both app_release rows';
  end if;
  begin
    update public.app_release set min_version = '99.0.0';
    raise exception 'FAIL: anon can change app_release';
  exception when insufficient_privilege then null;
  end;
end $;

reset role;

-- ── as SA (super admin) ─────────────────────────────────────────────────
-- 0016: without an authenticator code (aal1) even the super admin has no powers.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$ declare n int;
begin
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: an admin on an aal1 session can list accounts (apply 0016)';
  exception when insufficient_privilege then null;
  end;
  update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: an admin on an aal1 session can approve accounts'; end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$ declare n int;
begin
  -- Approving an admin sign-up is the super admin's job.
  update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: the super admin cannot approve an admin sign-up'; end if;

  begin
    update public.profiles set superadmin = false where id = '00000000-0000-4000-a000-0000000000c2';
    raise exception 'FAIL: the super admin flag can be changed through the API';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set superadmin = true where id = '00000000-0000-4000-a000-0000000000c1';
    raise exception 'FAIL: the super admin can hand out the super admin flag through the API';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'teacher' where id = '00000000-0000-4000-a000-0000000000c2';
    raise exception 'FAIL: the super admin account can be demoted through the API';
  exception when insufficient_privilege then null;
  end;

  perform public.decline_signup('00000000-0000-4000-a000-0000000000c4');
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000c4') then
    raise exception 'FAIL: the super admin cannot turn down an admin sign-up';
  end if;
end $$;

reset role;

-- ── as AD (admin, not super) ────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$ begin
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: an admin on an aal1 session can list accounts (apply 0016)';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: an admin on an aal1 session can read other profiles';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$ declare n int;
begin
  if (select count(*) from public.admin_list_accounts() where email like 'rls-%@test.invalid') < 10 then
    raise exception 'FAIL: admin cannot list accounts';
  end if;
  if (select count(*) from public.profiles where id::text like '00000000-0000-4000-a000-%') < 10 then
    raise exception 'FAIL: admin cannot read every profile';
  end if;
  if (select count(*) from public.classes where id::text like '00000000-0000-4000-b000-%') <> 2 then
    raise exception 'FAIL: admin cannot read every class';
  end if;

  -- Students and teachers: an admin approves them.
  update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000b5';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot approve a student'; end if;
  perform public.decline_signup('00000000-0000-4000-a000-0000000000b6');
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b6') then
    raise exception 'FAIL: admin cannot turn down a student sign-up';
  end if;

  -- Admins: only the super admin.
  begin
    update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000c3';
    raise exception 'FAIL: a plain admin can approve an admin sign-up';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = true, role = 'teacher' where id = '00000000-0000-4000-a000-0000000000c3';
    raise exception 'FAIL: a plain admin can approve an admin sign-up by changing its role in the same update';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000000000b3';
    raise exception 'FAIL: a plain admin can make someone an admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set role = 'teacher' where id = '00000000-0000-4000-a000-0000000000c2';
    raise exception 'FAIL: a plain admin can demote the super admin';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set superadmin = true where id = '00000000-0000-4000-a000-0000000000c1';
    raise exception 'FAIL: an admin can make themselves super admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.decline_signup('00000000-0000-4000-a000-0000000000c3');
    raise exception 'FAIL: a plain admin can turn down an admin sign-up';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.decline_signup('00000000-0000-4000-a000-0000000000b1');
    raise exception 'FAIL: an approved account can be deleted with decline_signup';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = false where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: an approved account can be put back to waiting';
  exception when insufficient_privilege then null;
  end;

  -- Profile rows can't be created or deleted from the client (0011).
  begin
    insert into public.profiles (id, full_name) values ('00000000-0000-4000-a000-0000000000b7', 'dup');
    raise exception 'FAIL: admin can insert a profile row';
  exception when insufficient_privilege then null;
  end;
  delete from public.profiles where id = '00000000-0000-4000-a000-0000000000b3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin can delete a profile row'; end if;

  -- Admins don't run classes (0009).
  begin
    insert into public.classes (name, teacher_id) values ('Admin class', '00000000-0000-4000-a000-0000000000c1');
    raise exception 'FAIL: admin can create a class';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ── as AP (admin sign-up, still waiting) ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c3","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$ declare n int;
begin
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: a waiting admin sign-up can list accounts';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: a waiting admin sign-up can read other profiles';
  end if;
  update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000b4';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a waiting admin sign-up can approve accounts'; end if;
end $$;

reset role;

-- ── as S4 (student sign-up, still waiting) ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b4","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b4') then
    raise exception 'FAIL: a waiting sign-up cannot read its own profile (the app needs it for "Waiting for approval")';
  end if;
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b4', 'asl', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: a waiting student can record practice';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.join_class_with_code('RLSAAA');
    raise exception 'FAIL: a waiting student can join a class with a code';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000b4';
    raise exception 'FAIL: a waiting student can approve themselves';
  exception when insufficient_privilege then null;
  end;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b4') then
    raise exception 'FAIL: a waiting student can use a call topic';
  end if;
end $$;

reset role;

-- ── as S1 (student, class A) ────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  if (select count(*) from public.lesson_progress where student_id = '00000000-0000-4000-a000-0000000000b2') <> 0 then
    raise exception 'FAIL: student can read another student''s progress';
  end if;
  if (select count(*) from public.lesson_progress) <> 1 then
    raise exception 'FAIL: student should see exactly their own progress row';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: student can read a student profile from another class';
  end if;
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') then
    raise exception 'FAIL: student cannot read their own class teacher (video call needs this)';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000a2') then
    raise exception 'FAIL: student can read another class''s teacher';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000c2') then
    raise exception 'FAIL: student can read an admin profile';
  end if;
  if exists (select 1 from public.classes where id = '00000000-0000-4000-b000-00000000000b') then
    raise exception 'FAIL: student can read another class';
  end if;
  if not exists (select 1 from public.classes where id = '00000000-0000-4000-b000-00000000000a') then
    raise exception 'FAIL: student cannot read their own class';
  end if;
  if exists (select 1 from public.modules where id = '00000000-0000-4000-c000-00000000000b') then
    raise exception 'FAIL: student can read another class''s modules';
  end if;
  if not exists (select 1 from public.modules where id = '00000000-0000-4000-c000-00000000000a') then
    raise exception 'FAIL: student cannot read their own class''s modules';
  end if;

  -- Direct progress writes are closed (0010): only record_lesson_attempt().
  begin
    update public.lesson_progress set passes = 99 where student_id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can edit their own lesson_progress directly (apply 0010)';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.lesson_progress (student_id, language, sign_group, sign, passes)
    values ('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'B', 3);
    raise exception 'FAIL: student can insert lesson_progress directly (apply 0010)';
  exception when insufficient_privilege then null;
  end;

  -- Self-promotion, self-enrolment, self-approval, extra profiles.
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can change their own role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set class_id = '00000000-0000-4000-b000-00000000000b'
    where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can move themselves into another class';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set superadmin = true where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can set the super admin flag on themselves';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = false where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can change their own approved flag';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles (id, full_name) values ('00000000-0000-4000-a000-0000000000b7', 'second me');
    raise exception 'FAIL: student can insert a profile row';
  exception when insufficient_privilege then null;
  end;
  delete from public.profiles where id = '00000000-0000-4000-a000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can delete their own profile row'; end if;
  begin
    update public.profiles set full_name = repeat('x', 101) where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: a name over 100 characters was accepted';
  exception when check_violation then null;
  end;
  update public.profiles set full_name = 'RLS S1 renamed' where id = '00000000-0000-4000-a000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: student cannot edit their own name'; end if;

  -- Another student's profile is invisible, so the update touches nothing.
  update public.profiles set full_name = 'hacked' where id = '00000000-0000-4000-a000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can edit another student''s profile'; end if;

  -- Teacher-only tables.
  begin
    insert into public.classes (name, teacher_id) values ('My own class', '00000000-0000-4000-a000-0000000000b1');
    raise exception 'FAIL: student can create a class naming themselves teacher';
  exception when insufficient_privilege then null;
  end;
  update public.classes set name = 'hacked', join_code = 'HACKED' where id = '00000000-0000-4000-b000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can edit their own class'; end if;
  begin
    insert into public.modules (class_id, title, language, sign_group)
    values ('00000000-0000-4000-b000-00000000000a', 'student module', 'asl', 'letters');
    raise exception 'FAIL: student can add a module to their class';
  exception when insufficient_privilege then null;
  end;
  update public.modules set title = 'hacked' where id = '00000000-0000-4000-c000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can edit their class''s module'; end if;
  begin
    perform public.set_module_signs('00000000-0000-4000-c000-00000000000a', array['Z']);
    raise exception 'FAIL: student can set their module''s signs';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1',
       now() + interval '3 hours', now() + interval '3 hours 15 minutes');
    raise exception 'FAIL: student can book their own call';
  exception when insufficient_privilege then null;
  end;

  -- record_lesson_attempt: own rows only, inputs checked; every pass counts (0012).
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b2', 'asl', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: student can record an attempt for another student';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'xx', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: an unknown language was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', repeat('A', 65), true, 0.9);
    raise exception 'FAIL: a 65-character sign was accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 5);
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 0.9);
  if (select passes from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 2 then
    raise exception 'FAIL: a second pass did not count (apply 0012 - no more cooldown)';
  end if;
  if (select attempts from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 2 then
    raise exception 'FAIL: attempts not counted';
  end if;
  if (select best_confidence from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 1 then
    raise exception 'FAIL: a confidence above 1 was not clamped';
  end if;

  begin
    perform public.join_class_with_code('RLSBBB');
    raise exception 'FAIL: a student already in a class could join another with a code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_unassigned_students();
    raise exception 'FAIL: student can list unassigned students (emails)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: student can list accounts';
  exception when insufficient_privilege then null;
  end;

  -- class learning plans: read own class's, nothing else.
  if not exists (select 1 from public.class_word_plans where class_id = '00000000-0000-4000-b000-00000000000a') then
    raise exception 'FAIL: student cannot read their class''s learning plan';
  end if;
  if exists (select 1 from public.class_word_plans where class_id = '00000000-0000-4000-b000-00000000000b') then
    raise exception 'FAIL: student can read another class''s learning plan';
  end if;
  update public.class_word_plans set signs = array['hacked'] where class_id = '00000000-0000-4000-b000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can change their class''s learning plan'; end if;

  -- 0013 missed calls: a student can only record one to their own teacher.
  insert into public.missed_calls (class_id, caller_id, callee_id) values
    ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-0000000000a1');
  begin
    insert into public.missed_calls (class_id, caller_id, callee_id) values
      ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-0000000000a2');
    raise exception 'FAIL: student can record a missed call to another class''s teacher';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.missed_calls (class_id, caller_id, callee_id) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1');
    raise exception 'FAIL: student can record a missed call in their teacher''s name';
  exception when insufficient_privilege then null;
  end;
  update public.missed_calls set seen_at = now() where caller_id = '00000000-0000-4000-a000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: the caller can mark their own missed call seen'; end if;
  begin
    insert into public.call_notes (class_id, teacher_id, student_id, started_at, duration_seconds) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1', now(), 60);
    raise exception 'FAIL: student can save call notes';
  exception when insufficient_privilege then null;
  end;

  -- Realtime call topics (0011 broadcast, 0013 presence).
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') = 0
     or rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'presence') = 0 then
    raise exception 'FAIL: student cannot listen on their own call topic';
  end if;
  if not rls_test.send('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') then
    raise exception 'FAIL: student cannot send on their own call topic';
  end if;
  if rls_test.send('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'postgres_changes') then
    raise exception 'FAIL: call topics accept extensions other than broadcast / presence';
  end if;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b3', 'broadcast') <> 0 then
    raise exception 'FAIL: student can listen on a classmate''s call topic';
  end if;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'presence') <> 0 then
    raise exception 'FAIL: student can see presence on another class''s call topic';
  end if;
  if rls_test.send('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'broadcast') then
    raise exception 'FAIL: student can ring another class''s student';
  end if;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b3') then
    raise exception 'FAIL: student can join a classmate''s call topic';
  end if;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: student can join a call topic for a class they''re not in';
  end if;
  if public.can_use_call_topic('call-00000000-0000-4000-b000-00000000000a') then
    raise exception 'FAIL: the old public class-wide call topic is still allowed';
  end if;
end $$;

reset role;

-- ── as T1 (teacher of class A) ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  if not exists (select 1 from public.lesson_progress where student_id = '00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: teacher cannot read their own student''s progress';
  end if;
  if exists (select 1 from public.lesson_progress where student_id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: teacher can read another class''s progress';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: teacher can read another class''s student';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b3') then
    raise exception 'FAIL: teacher can read a classless student''s profile row';
  end if;

  update public.profiles set full_name = 'renamed by teacher' where id = '00000000-0000-4000-a000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher can edit their student''s profile'; end if;

  update public.classes set name = 'hacked' where id = '00000000-0000-4000-b000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher can rename another teacher''s class'; end if;
  begin
    update public.classes set teacher_id = '00000000-0000-4000-a000-0000000000a2' where id = '00000000-0000-4000-b000-00000000000a';
    raise exception 'FAIL: teacher can hand their class to another teacher';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.modules (class_id, title, language, sign_group)
    values ('00000000-0000-4000-b000-00000000000b', 'intruder', 'asl', 'letters');
    raise exception 'FAIL: teacher can add a module to another teacher''s class';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.modules set class_id = '00000000-0000-4000-b000-00000000000b' where id = '00000000-0000-4000-c000-00000000000a';
    raise exception 'FAIL: teacher can move their module into another teacher''s class';
  exception when insufficient_privilege then null;
  end;

  delete from public.modules where id = '00000000-0000-4000-c000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher can delete another class''s module'; end if;

  begin
    perform public.set_module_signs('00000000-0000-4000-c000-00000000000b', array['A', 'B']);
    raise exception 'FAIL: teacher can set signs on another class''s module';
  exception when insufficient_privilege then null;
  end;
  perform public.set_module_signs('00000000-0000-4000-c000-00000000000a', array['A', 'B']);
  if (select count(*) from public.module_signs where module_id = '00000000-0000-4000-c000-00000000000a') <> 2 then
    raise exception 'FAIL: teacher cannot set signs on their own module';
  end if;

  begin
    perform public.add_students_to_class('00000000-0000-4000-b000-00000000000b',
      array['00000000-0000-4000-a000-0000000000b3']::uuid[]);
    raise exception 'FAIL: teacher can add students to another teacher''s class';
  exception when insufficient_privilege then null;
  end;
  -- A waiting student and another class's student are skipped, not added.
  if exists (select 1 from public.add_students_to_class('00000000-0000-4000-b000-00000000000a',
      array['00000000-0000-4000-a000-0000000000b4', '00000000-0000-4000-a000-0000000000b2']::uuid[])) then
    raise exception 'FAIL: teacher pulled a waiting student or another class''s student into their class';
  end if;
  begin
    perform public.remove_student_from_class('00000000-0000-4000-a000-0000000000b2');
    raise exception 'FAIL: teacher can remove another class''s student';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.regenerate_class_code('00000000-0000-4000-b000-00000000000b');
    raise exception 'FAIL: teacher can change another class''s join code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'D', true, 1);
    raise exception 'FAIL: teacher can record practice on a student''s behalf';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_list_accounts();
    raise exception 'FAIL: teacher can list accounts';
  exception when insufficient_privilege then null;
  end;

  update public.class_word_plans set signs = array['hello'] where class_id = '00000000-0000-4000-b000-00000000000a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher cannot change their own class''s learning plan'; end if;
  insert into public.class_word_plans (class_id, language, signs)
  values ('00000000-0000-4000-b000-00000000000a', 'fsl', array['kumusta']);
  update public.class_word_plans set signs = array['hacked'] where class_id = '00000000-0000-4000-b000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher can change another class''s learning plan'; end if;
  begin
    insert into public.class_word_plans (class_id, language, signs)
    values ('00000000-0000-4000-b000-00000000000b', 'fsl', array['intruder']);
    raise exception 'FAIL: teacher can add a learning plan to another teacher''s class';
  exception when insufficient_privilege then null;
  end;

  -- 0013: the missed call S1 left is visible to T1, who can mark it seen
  -- but not rewrite it.
  update public.missed_calls set seen_at = now() where callee_id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher cannot see / mark seen a missed call from their student'; end if;
  begin
    update public.missed_calls set caller_id = '00000000-0000-4000-a000-0000000000a1' where callee_id = '00000000-0000-4000-a000-0000000000a1';
    raise exception 'FAIL: callee can rewrite who called';
  exception when insufficient_privilege then null;
  end;
  insert into public.missed_calls (class_id, caller_id, callee_id) values
    ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1');
  begin
    insert into public.missed_calls (class_id, caller_id, callee_id) values
      ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b2');
    raise exception 'FAIL: teacher can record a missed call to another class''s student';
  exception when insufficient_privilege then null;
  end;
  insert into public.call_notes (class_id, teacher_id, student_id, started_at, duration_seconds, teacher_text, student_text) values
    ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1', now(), 95, 'hello', 'hello');
  begin
    insert into public.call_notes (class_id, teacher_id, student_id, started_at, duration_seconds) values
      ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b2', now(), 10);
    raise exception 'FAIL: teacher can save call notes about another class''s student';
  exception when insufficient_privilege then null;
  end;

  -- 0017 call bookings.
  insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values
    ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1',
     now() + interval '1 hour', now() + interval '1 hour 15 minutes');
  begin
    insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1',
       now() + interval '1 hour 10 minutes', now() + interval '1 hour 20 minutes');
    raise exception 'FAIL: two overlapping calls could be booked';
  exception when exclusion_violation then null;
  end;
  begin
    insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values
      ('00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b2',
       now() + interval '5 hours', now() + interval '5 hours 15 minutes');
    raise exception 'FAIL: teacher can book a call with another class''s student';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.call_bookings (class_id, teacher_id, student_id, starts_at, ends_at) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a2', '00000000-0000-4000-a000-0000000000b1',
       now() + interval '6 hours', now() + interval '6 hours 15 minutes');
    raise exception 'FAIL: teacher can book a call in another teacher''s name';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.call_bookings set student_id = '00000000-0000-4000-a000-0000000000b2' where teacher_id = '00000000-0000-4000-a000-0000000000a1';
    raise exception 'FAIL: a booking can be moved to another student';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.call_bookings set class_id = '00000000-0000-4000-b000-00000000000b' where teacher_id = '00000000-0000-4000-a000-0000000000a1';
    raise exception 'FAIL: a booking can be moved to another class';
  exception when insufficient_privilege then null;
  end;
  update public.call_bookings set starts_at = starts_at + interval '5 minutes', ends_at = ends_at + interval '5 minutes'
  where teacher_id = '00000000-0000-4000-a000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: teacher cannot move their own booking'; end if;

  -- Realtime: own students only.
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'presence') = 0 then
    raise exception 'FAIL: teacher cannot see presence on their student''s call topic';
  end if;
  if not rls_test.send('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') then
    raise exception 'FAIL: teacher cannot ring their own student';
  end if;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'broadcast') <> 0 then
    raise exception 'FAIL: teacher can listen on another class''s call topic';
  end if;
  if rls_test.send('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'broadcast') then
    raise exception 'FAIL: teacher can ring another class''s student';
  end if;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: teacher can join a topic naming a student outside the class';
  end if;

  if not exists (select 1 from public.list_unassigned_students() where id = '00000000-0000-4000-a000-0000000000b3') then
    raise exception 'FAIL: teacher cannot see unassigned student S3 to invite';
  end if;
  if exists (select 1 from public.list_unassigned_students() where id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: list_unassigned_students includes a student already in a class';
  end if;
  if exists (select 1 from public.list_unassigned_students() where id = '00000000-0000-4000-a000-0000000000b4') then
    raise exception 'FAIL: list_unassigned_students includes a sign-up still waiting for approval';
  end if;
end $$;

reset role;

-- ── S1 again: bookings are read-only for the student ────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$ declare n int;
begin
  if (select count(*) from public.call_bookings) <> 1 then
    raise exception 'FAIL: student cannot see their own booking';
  end if;
  update public.call_bookings set starts_at = now(), ends_at = now() + interval '2 hours';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can move their own booking'; end if;
  delete from public.call_bookings;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can cancel their own booking'; end if;
  delete from public.call_notes;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can delete call notes'; end if;
  if (select count(*) from public.call_notes) <> 1 then
    raise exception 'FAIL: student cannot read notes from their own call';
  end if;
end $$;

reset role;

-- ── T2 (teacher of class B) sees none of T1's call records ──────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;

do $$ declare n int;
begin
  if exists (select 1 from public.call_bookings) or exists (select 1 from public.call_notes)
     or exists (select 1 from public.missed_calls) then
    raise exception 'FAIL: a teacher can see another teacher''s bookings, call notes or missed calls';
  end if;
  delete from public.call_notes;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a teacher can delete another teacher''s call notes'; end if;
end $$;

reset role;

-- ── as S3 (student, no class): joins A by code ──────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b3","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  begin
    perform public.join_class_with_code('NOPE99');
    raise exception 'FAIL: a wrong join code was accepted';
  exception when no_data_found then null;
  end;
  perform public.join_class_with_code(' rlsaaa ');
  if public.current_user_class_id() is distinct from '00000000-0000-4000-b000-00000000000a' then
    raise exception 'FAIL: joining with a valid (lower-case, spaced) code did not work';
  end if;
  -- Now in class A, but S1's calls with T1 stay between them.
  if exists (select 1 from public.call_notes) then
    raise exception 'FAIL: a classmate can read another student''s call notes';
  end if;
  if exists (select 1 from public.missed_calls) then
    raise exception 'FAIL: a classmate can read another student''s missed calls';
  end if;
  if exists (select 1 from public.call_bookings) then
    raise exception 'FAIL: a classmate can see another student''s call bookings';
  end if;
  if exists (select 1 from public.lesson_progress where student_id = '00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: a classmate can read another student''s progress';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: a classmate can read another student''s profile';
  end if;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') <> 0
     or rls_test.send('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1', 'broadcast') then
    raise exception 'FAIL: a classmate can listen or send on another student''s call topic';
  end if;
end $$;

reset role;

-- ── T1 removes S1: their upcoming bookings and call topic go too ────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
select public.remove_student_from_class('00000000-0000-4000-a000-0000000000b1');
reset role;

do $$ begin
  if exists (select 1 from public.call_bookings where student_id = '00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: a removed student kept their upcoming call bookings (0017 trigger)';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: a removed student can still use their old call topic';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') then
    raise exception 'FAIL: a removed student can still read their old teacher''s profile';
  end if;
end $$;

reset role;

-- ── as T3 (teacher sign-up, not approved) ───────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  begin
    insert into public.classes (name, teacher_id) values ('Pending class', '00000000-0000-4000-a000-0000000000a3');
    raise exception 'FAIL: an unapproved teacher can create a class';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.list_unassigned_students();
    raise exception 'FAIL: an unapproved teacher can list unassigned students (emails)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000a3';
    raise exception 'FAIL: a teacher can approve themselves';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- ── as S2 (2FA on): aal1 gets nothing, aal2 works ───────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

do $$ begin
  if exists (select 1 from public.profiles) then
    raise exception 'FAIL: an aal1 session on a 2FA account can read profiles (2FA skipped)';
  end if;
  if exists (select 1 from public.lesson_progress) then
    raise exception 'FAIL: an aal1 session on a 2FA account can read progress (2FA skipped)';
  end if;
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b2', 'asl', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: an aal1 session on a 2FA account can record practice';
  exception when insufficient_privilege then null;
  end;
  if rls_test.listen('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2', 'broadcast') <> 0 then
    raise exception 'FAIL: an aal1 session on a 2FA account can listen on its call topic';
  end if;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $$ begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: an aal2 session cannot read its own profile';
  end if;
end $$;

reset role;

-- ── a demoted teacher loses their old class ─────────────────────────────
update public.profiles set role = 'student' where id = '00000000-0000-4000-a000-0000000000a2';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  begin
    perform public.regenerate_class_code('00000000-0000-4000-b000-00000000000b');
    raise exception 'FAIL: a demoted teacher can still change their old class''s code';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.remove_student_from_class('00000000-0000-4000-a000-0000000000b2');
    raise exception 'FAIL: a demoted teacher can still remove students from their old class';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.lesson_progress where student_id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: a demoted teacher can still read their old class''s progress';
  end if;
end $$;

reset role;

-- ── app_release (0018): a signed-in admin can't change it either ───────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c2","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;

do $ begin
  if (select count(*) from public.app_release) <> 2 then
    raise exception 'FAIL: a signed-in user cannot read app_release';
  end if;
  begin
    update public.app_release set update_feed_url = 'https://attacker.invalid/';
    raise exception 'FAIL: a signed-in user can change where desktop updates come from';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.app_release (platform, latest_version, min_version) values ('desktop', '9.9.9', '9.9.9');
    raise exception 'FAIL: a signed-in user can add an app_release row';
  exception when insufficient_privilege then null;
  end;
end $;

reset role;

do $ begin raise notice 'RLS tests: all passed'; end $;

rollback;
