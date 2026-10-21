-- RLS / access-rule checks for the classroom schema (migrations 0001-0010).
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
  ('00000000-0000-4000-a000-0000000000c1', 'rls-ad@test.invalid', '{"full_name":"RLS AD","role":"admin"}');

do $$ begin
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000c1') <> 'student' then
    raise exception 'FAIL: sign-up metadata role=admin was trusted';
  end if;
  if (select role from public.profiles where id = '00000000-0000-4000-a000-0000000000a1') <> 'teacher' then
    raise exception 'FAIL: teacher sign-up did not create a teacher profile';
  end if;
end $$;

-- Promote AD the way a real admin is made (by hand / by another admin).
update public.profiles set role = 'admin' where id = '00000000-0000-4000-a000-0000000000c1';

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

  -- record_lesson_attempt: own rows only, cooldown enforced.
  begin
    perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b2', 'asl', 'letters', 'A', true, 0.9);
    raise exception 'FAIL: student can record an attempt for another student';
  exception when insufficient_privilege then null;
  end;
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 0.9);
  perform public.record_lesson_attempt('00000000-0000-4000-a000-0000000000b1', 'asl', 'letters', 'C', true, 0.9);
  if (select passes from public.lesson_progress
      where student_id = '00000000-0000-4000-a000-0000000000b1' and sign = 'C') <> 1 then
    raise exception 'FAIL: two passes inside the cooldown both counted';
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
end $$;

reset role;

-- ── as AD (admin) ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000c1","role":"authenticated"}', true);
set local role authenticated;

do $$ begin
  if (select count(*) from public.profiles where id::text like '00000000-0000-4000-a000-%') <> 6 then
    raise exception 'FAIL: admin cannot read every profile';
  end if;
  if (select count(*) from public.classes where id::text like '00000000-0000-4000-b000-%') <> 2 then
    raise exception 'FAIL: admin cannot read every class';
  end if;
end $$;

reset role;

do $$ begin raise notice 'RLS tests: all passed'; end $$;

rollback;
