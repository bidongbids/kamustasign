-- RLS / access-rule checks for the classroom schema (migrations 0001-0013).
--
-- Run in the Supabase SQL editor (it runs as `postgres`) against a
-- NON-PRODUCTION project with every migration applied. Everything happens
-- inside one transaction that is rolled back at the end, so no test users or
-- rows are left behind. The first failing rule raises "FAIL: ..." and aborts;
-- a clean run ends with the notice "RLS tests: all passed".
--
-- Cast:
--   T1 teacher of class A        T2 teacher of class B
--   S1 student in class A        S2 student in class B
--   S3 student with no class     AD admin
--   T3 teacher awaiting approval S2 also has 2FA turned on
-- Users act through `set local role authenticated` + a JWT `sub` claim, which
-- is exactly what PostgREST does for a signed-in request.

begin;

-- ── fixtures (as postgres: bypasses RLS) ────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-a000-0000000000a1', 'rls-t1@test.invalid', '{"full_name":"RLS T1","role":"teacher"}'),
  ('00000000-0000-4000-a000-0000000000a2', 'rls-t2@test.invalid', '{"full_name":"RLS T2","role":"teacher"}'),
  ('00000000-0000-4000-a000-0000000000b1', 'rls-s1@test.invalid', '{"full_name":"RLS S1"}'),
  ('00000000-0000-4000-a000-0000000000b2', 'rls-s2@test.invalid', '{"full_name":"RLS S2"}'),
  ('00000000-0000-4000-a000-0000000000b3', 'rls-s3@test.invalid', '{"full_name":"RLS S3"}'),
  -- Asks to be admin at sign-up; 0009 must ignore that.
  ('00000000-0000-4000-a000-0000000000c1', 'rls-ad@test.invalid', '{"full_name":"RLS AD","role":"admin"}'),
  -- Signs up as a teacher and is never approved (0011).
  ('00000000-0000-4000-a000-0000000000a3', 'rls-t3@test.invalid', '{"full_name":"RLS T3","role":"teacher"}');

do $$ begin
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000c1') <> 'student' then
    raise exception 'FAIL: sign-up metadata role=admin was trusted';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') <> 'teacher' then
    raise exception 'FAIL: teacher sign-up did not create a teacher profile';
  end if;
  if (select approved from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') then
    raise exception 'FAIL: a teacher sign-up was approved without an admin (apply 0011)';
  end if;
  if not (select approved from public.profiles where id = '00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: a student sign-up was left unapproved';
  end if;
end $$;

-- Promote AD the way a real admin is made (by hand / by another admin), and
-- approve T1/T2 the way an admin does from the dashboard. T3 stays pending.
update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000000000c1';
update public.profiles set approved = true
where id in ('00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000a2');

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

  -- Self-promotion and self-enrolment.
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
  update public.profiles set full_name = 'RLS S1 renamed' where id = '00000000-0000-4000-a000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: student cannot edit their own name'; end if;

  -- Another student's profile is invisible, so the update touches nothing.
  update public.profiles set full_name = 'hacked' where id = '00000000-0000-4000-a000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student can edit another student''s profile'; end if;

  -- record_lesson_attempt: own rows only; every pass counts (0012).
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b2', 'asl', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: student can record an attempt for another student';
  exception when insufficient_privilege then null;
  end;
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 0.9);
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 0.9);
  if (select passes from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 2 then
    raise exception 'FAIL: a second pass did not count (apply 0012 - no more cooldown)';
  end if;
  if (select attempts from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 2 then
    raise exception 'FAIL: attempts not counted';
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
  begin
    insert into public.call_notes (class_id, teacher_id, student_id, started_at, duration_seconds) values
      ('00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-a000-0000000000a1', '00000000-0000-4000-a000-0000000000b1', now(), 60);
    raise exception 'FAIL: student can save call notes';
  exception when insufficient_privilege then null;
  end;
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

  update public.classes set name = 'hacked' where id = '00000000-0000-4000-b000-00000000000b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher can rename another teacher''s class'; end if;

  begin
    insert into public.modules (class_id, title, language, sign_group)
    values ('00000000-0000-4000-b000-00000000000b', 'intruder', 'asl', 'letters');
    raise exception 'FAIL: teacher can add a module to another teacher''s class';
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

  if not exists (select 1 from public.list_unassigned_students() where id = '00000000-0000-4000-a000-0000000000b3') then
    raise exception 'FAIL: teacher cannot see unassigned student S3 to invite';
  end if;
  if exists (select 1 from public.list_unassigned_students() where id = '00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: list_unassigned_students includes a student already in a class';
  end if;
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
  -- 0013: now in class A, but S1's calls with T1 stay between them.
  if exists (select 1 from public.call_notes) then
    raise exception 'FAIL: a classmate can read another student''s call notes';
  end if;
  if exists (select 1 from public.missed_calls) then
    raise exception 'FAIL: a classmate can read another student''s missed calls';
  end if;
end $$;

reset role;

-- ── as AD (admin) ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if (select count(*) from public.profiles where id::text like '00000000-0000-4000-a000-%') <> 7 then
    raise exception 'FAIL: admin cannot read every profile';
  end if;
  if (select count(*) from public.classes where id::text like '00000000-0000-4000-b000-%') <> 2 then
    raise exception 'FAIL: admin cannot read every class';
  end if;
end $$;

do $$ declare n int;
begin
  -- 0011: the last admin can't demote themselves, and profile rows can't be
  -- deleted from the client (it would orphan the auth user).
  begin
    update public.profiles set role = 'teacher' where id = '00000000-0000-4000-a000-0000000000c1';
    raise exception 'FAIL: the last admin could demote themselves';
  exception when insufficient_privilege then null;
  end;
  delete from public.profiles where id = '00000000-0000-4000-a000-0000000000b3';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: admin can delete a profile row'; end if;

  -- Approving a teacher is an admin's job.
  update public.profiles set approved = true where id = '00000000-0000-4000-a000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot approve a teacher'; end if;
  update public.profiles set approved = false where id = '00000000-0000-4000-a000-0000000000a3';
end $$;

reset role;

-- ── 0011 as S1 (student, class A): approval, legacy tables, call topics ──
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  begin
    update public.profiles set approved = false where id = '00000000-0000-4000-a000-0000000000b1';
    raise exception 'FAIL: student can change their own approved flag';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.scores;
    raise exception 'FAIL: the legacy scores table is still open to clients';
  exception when insufficient_privilege then null;
  end;

  if not public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: student cannot join their own call topic';
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

-- ── 0011 as T1 (approved teacher of class A): call topics ───────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if not public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b1') then
    raise exception 'FAIL: teacher cannot join their own student''s call topic';
  end if;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000b:00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: teacher can join another class''s call topic';
  end if;
  if public.can_use_call_topic('call:00000000-0000-4000-b000-00000000000a:00000000-0000-4000-a000-0000000000b2') then
    raise exception 'FAIL: teacher can join a topic naming a student outside the class';
  end if;
end $$;

reset role;

-- ── 0011 as T3 (teacher sign-up, not approved) ──────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","role":"authenticated"}', true);
set local role authenticated;

do $$ declare n int;
begin
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
  update public.profiles set full_name = 'RLS T3 renamed' where id = '00000000-0000-4000-a000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: an unapproved teacher cannot edit their own name'; end if;
end $$;

reset role;

-- ── 0011 as S2 (2FA on): aal1 gets nothing, aal2 works ─────────────────
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

-- ── 0011: a demoted teacher loses their old class ───────────────────────
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
end $$;

reset role;

do $$ begin raise notice 'RLS tests: all passed'; end $$;

rollback;
