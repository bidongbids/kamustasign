-- Login / RBAC hardening pass. Run after 0010_lesson_progress_write_lock.sql.
--
--  1. 2FA is enforced by the database, not just the login screen. Supabase
--     hands out a working (aal1) session right after the password step, so
--     anyone with a password could skip Verify2FAScreen and call the REST
--     API directly. Now an account with a verified TOTP factor gets nothing
--     until its session is aal2.
--  2. Teacher sign-ups need an admin's approval. Picking "Teacher" at sign-up
--     used to be enough to list every unassigned student's name and email
--     and pull them into a class (then read their progress and video-call
--     them). A teacher now starts with approved = false and has no teacher
--     powers until an admin approves them.
--  3. Every teacher check also re-checks the role, so a teacher an admin has
--     demoted (or not yet approved) can't keep using an old class through
--     the SECURITY DEFINER functions, which only compared teacher_id.
--  4. profiles: a user can only ever change their own name; class_id is
--     cleared for non-students; the last admin can't be demoted; admins can
--     read and update accounts but no longer insert or delete profile rows
--     (deleting one left an auth user with no profile).
--  5. The legacy assignments / submissions / scores tables (unused since the
--     classroom redesign) are closed: students could still insert their own
--     "correct" score rows.
--  6. Video call signaling moves to private Realtime channels, one per
--     student: call:<class_id>:<student_id>, joinable only by that student
--     and their (approved) class teacher. The old public call-<class_id>
--     channel let anyone with the anon key and a class id listen in or ring
--     a student pretending to be their teacher. After running this, turn OFF
--     "Allow public access" in Dashboard -> Realtime -> Settings.
--  7. Class join codes come from a cryptographic RNG (gen_random_uuid)
--     instead of random().

-- ── 1. 2FA ─────────────────────────────────────────────────────────────
-- True when this session has done everything its account requires: aal2 if
-- the account has a verified factor, otherwise aal1 is enough.
create or replace function public.mfa_ok()
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

-- Every role check in the policies and functions goes through this, so an
-- aal1 session on a 2FA account has no role at all.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and public.mfa_ok();
$$;

create or replace function public.current_user_class_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select class_id from public.profiles where id = auth.uid() and public.mfa_ok();
$$;

-- Policies keyed only on auth.uid() ("read own row") don't call the helpers
-- above, so each table also gets a RESTRICTIVE policy: it is ANDed with
-- whatever permissive policy matched. `(select ...)` makes Postgres run it
-- once per statement instead of once per row.
create policy "mfa: aal2 when the account has 2FA" on public.profiles
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa: aal2 when the account has 2FA" on public.classes
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa: aal2 when the account has 2FA" on public.modules
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa: aal2 when the account has 2FA" on public.module_signs
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));
create policy "mfa: aal2 when the account has 2FA" on public.lesson_progress
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- ── 2. teacher approval ────────────────────────────────────────────────
-- Only meaningful for teachers. Existing teachers were already trusted.
alter table public.profiles add column approved boolean not null default true;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teacher boolean := coalesce(new.raw_user_meta_data ->> 'role' = 'teacher', false);
begin
  insert into public.profiles (id, full_name, role, approved)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100),
    case when v_teacher then 'teacher' else 'student' end::public.user_role,
    not v_teacher
  );
  return new;
end;
$$;

-- A teacher an admin has approved, on a session that passed 2FA.
create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher' and approved and public.mfa_ok()
  );
$$;

-- ── 3. teacher checks re-check the role ────────────────────────────────
drop policy if exists "profiles: teacher reads own class roster" on public.profiles;
create policy "profiles: teacher reads own class roster"
  on public.profiles for select
  using (
    (select public.is_teacher())
    and class_id is not null
    and class_id in (select id from public.classes where teacher_id = auth.uid())
  );

drop policy if exists "classes: teacher manages own classes" on public.classes;
create policy "classes: teacher manages own classes"
  on public.classes for all
  using (teacher_id = auth.uid() and (select public.is_teacher()))
  with check (teacher_id = auth.uid() and (select public.is_teacher()));

-- modules / module_signs reach classes through a subquery, which is itself
-- filtered by the classes policy above, so they inherit the role check.

drop policy if exists "lesson_progress: teacher reads own class students" on public.lesson_progress;
create policy "lesson_progress: teacher reads own class students"
  on public.lesson_progress for select
  using (
    (select public.is_teacher())
    and student_id in (
      select p.id from public.profiles p
      join public.classes c on c.id = p.class_id
      where c.teacher_id = auth.uid()
    )
  );

create or replace function public.list_unassigned_students()
returns table (id uuid, full_name text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if not public.is_teacher() then
    raise exception 'Only approved teachers can invite students.' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'student' and p.class_id is null
    order by p.full_name;
end;
$$;

create or replace function public.add_students_to_class(p_class_id uuid, p_student_ids uuid[])
returns table (student_id uuid, student_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_teacher()
     or not exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid()) then
    raise exception 'You can only add students to your own class.' using errcode = '42501';
  end if;

  return query
    with added as (
      update public.profiles p
      set class_id = p_class_id
      where p.id = any (p_student_ids) and p.role = 'student' and p.class_id is null
      returning p.id, p.full_name
    )
    select added.id, added.full_name from added;
end;
$$;

create or replace function public.remove_student_from_class(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
begin
  if not public.is_teacher() then
    raise exception 'Only approved teachers can remove students.' using errcode = '42501';
  end if;

  select p.class_id into v_class
  from public.profiles p
  where p.id = p_student_id and p.role = 'student';

  if v_class is null then
    raise exception 'That student is not in a class.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.classes where id = v_class and teacher_id = auth.uid()) then
    raise exception 'You can only remove students from your own class.' using errcode = '42501';
  end if;

  update public.profiles set class_id = null where profiles.id = p_student_id;
end;
$$;

create or replace function public.regenerate_class_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not public.is_teacher()
     or not exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid()) then
    raise exception 'You can only change the code of your own class.' using errcode = '42501';
  end if;
  v_code := public.new_class_code();
  update public.classes set join_code = v_code where id = p_class_id;
  return v_code;
end;
$$;

-- Same as 0009 except the role comes from current_user_role() (2FA-aware)
-- instead of a direct read.
create or replace function public.join_class_with_code(p_code text)
returns table (class_id uuid, class_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
  v_name text;
  v_current uuid;
begin
  if public.current_user_role() is distinct from 'student' then
    raise exception 'Only student accounts can join a class with a code.' using errcode = '42501';
  end if;
  v_current := public.current_user_class_id();

  select c.id, c.name into v_class, v_name
  from public.classes c
  where c.join_code = upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  if v_class is null then
    raise exception 'That code doesn''t match any class. Check it with your teacher.' using errcode = 'P0002';
  end if;

  if v_current = v_class then
    raise exception 'You''re already in %.', v_name using errcode = '23505';
  end if;
  if v_current is not null then
    raise exception 'You''re already in a class. Ask your teacher to remove you first.' using errcode = '42501';
  end if;

  update public.profiles set class_id = v_class where id = auth.uid();
  return query select v_class, v_name;
end;
$$;

-- Return type gains `approved`, so it has to be dropped and recreated.
drop function if exists public.admin_list_accounts();
create function public.admin_list_accounts()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  class_id uuid,
  approved boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can list accounts.' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.role, p.class_id, p.approved, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- ── 4. profiles: who may change what ───────────────────────────────────
drop policy if exists "profiles: admin manages all" on public.profiles;
create policy "profiles: admin updates all"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());
-- (Reads: "profiles: admin reads all" from 0002 is unchanged.)

alter table public.profiles
  add constraint profiles_full_name_length check (char_length(full_name) <= 100) not valid;

create or replace function public.other_admin_exists(p_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where role = 'admin' and id <> p_id);
$$;

-- SECURITY INVOKER on purpose: `current_user` is then the caller's role -
-- 'authenticated' for a direct API write, but the function owner inside the
-- SECURITY DEFINER class-membership functions, which already checked who is
-- calling and are allowed to set class_id.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'An account''s id and creation date can''t change.' using errcode = '42501';
  end if;

  if current_user = 'authenticated' and not public.is_admin()
     and (new.role is distinct from old.role
          or new.class_id is distinct from old.class_id
          or new.approved is distinct from old.approved) then
    raise exception 'You can only change your own name.' using errcode = '42501';
  end if;

  if old.role = 'admin' and new.role <> 'admin' and not public.other_admin_exists(old.id) then
    raise exception 'This is the last admin account - make someone else an admin first.' using errcode = '42501';
  end if;

  -- Only students belong to a class.
  if new.role <> 'student' then
    new.class_id := null;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── 5. legacy tables ───────────────────────────────────────────────────
revoke all on public.assignments, public.submissions, public.scores from authenticated;
drop policy if exists "submission videos: student manages own folder" on storage.objects;
drop policy if exists "submission videos: teacher reads own class students' files" on storage.objects;

-- ── 6. private call signaling ──────────────────────────────────────────
-- Topic: call:<class_id>:<student_id>. The student may join their own topic
-- while in that class; the class's approved teacher may join any topic of a
-- student in their class. Nobody else.
create or replace function public.can_use_call_topic(p_topic text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_class uuid;
  v_student uuid;
begin
  if p_topic is null or p_topic !~ '^call:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_class := split_part(p_topic, ':', 2)::uuid;
  v_student := split_part(p_topic, ':', 3)::uuid;

  if v_student = auth.uid() then
    return public.current_user_role() = 'student' and public.current_user_class_id() = v_class;
  end if;

  return public.is_teacher()
    and exists (select 1 from public.classes c where c.id = v_class and c.teacher_id = auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = v_student and p.role = 'student' and p.class_id = v_class
    );
end;
$$;

create policy "call signaling: student and their class teacher can listen"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.can_use_call_topic((select realtime.topic())));

create policy "call signaling: student and their class teacher can send"
  on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.can_use_call_topic((select realtime.topic())));

-- ── 7. join codes from a CSPRNG ────────────────────────────────────────
-- The first 6 bytes of a v4 UUID are fully random. `% 31` has a slight bias
-- (256 isn't a multiple of 31) that doesn't matter for a join code.
create or replace function public.new_class_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(alphabet, 1 + get_byte(v_bytes, i) % length(alphabet), 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- ── grants ─────────────────────────────────────────────────────────────
-- "Auto-expose" is off for this project (see 0003_grants.sql). Helpers that
-- policies call need EXECUTE for the role evaluating the policy.
revoke execute on function public.mfa_ok() from public;
revoke execute on function public.is_teacher() from public;
revoke execute on function public.other_admin_exists(uuid) from public;
revoke execute on function public.guard_profile_update() from public;
revoke execute on function public.can_use_call_topic(text) from public;
revoke execute on function public.admin_list_accounts() from public;
grant execute on function public.mfa_ok() to authenticated;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.other_admin_exists(uuid) to authenticated;
grant execute on function public.can_use_call_topic(text) to authenticated;
grant execute on function public.admin_list_accounts() to authenticated;
