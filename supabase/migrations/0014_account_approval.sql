-- Every new account waits for approval. Run after 0013_video_call_extras.sql.
--
--  1. There's one sign-in screen now; the sign-up form asks for the kind of
--     account (student, teacher or admin), and every new account starts
--     with approved = false. 0011 did this for teachers only.
--  2. An unapproved account has no role at all: current_user_role() only
--     answers for approved accounts, so every policy and function that
--     checks a role (is_admin, is_teacher, the student checks, call topics)
--     refuses it. It can still read its own profile row, which is how the
--     app knows to show "Waiting for approval".
--  3. The super admin (profiles.superadmin, the LCSign owner) is the only one
--     who can approve an admin sign-up, make someone an admin, or change an
--     admin account's role. Other admins approve students and teachers. The
--     flag can only be set from the SQL Editor (see the end of this file),
--     and the super admin's own account can't be changed through the app.
--  4. Admins can turn down a sign-up that is still waiting: decline_signup
--     deletes the auth user (and with it the profile). Approved accounts
--     can't be deleted this way, and can't be put back to waiting.
--  5. Teachers only see and add approved students.
--  6. is_admin() is never NULL (see below).
--
-- Existing accounts were approved = true already (0011's column default),
-- so nobody who can sign in today is locked out.

-- ── 1. the flag ────────────────────────────────────────────────────────
alter table public.profiles add column superadmin boolean not null default false;
alter table public.profiles
  add constraint profiles_superadmin_is_approved_admin check (not superadmin or (role = 'admin' and approved));

-- ── 2. sign-up: any role, waiting ──────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, full_name, role, approved)
  values (
    new.id,
    left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100),
    case when v_role in ('teacher', 'admin') then v_role else 'student' end::public.user_role,
    false
  );
  return new;
end;
$$;

-- ── 3. no role until approved ──────────────────────────────────────────
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and approved and public.mfa_ok();
$$;

create or replace function public.current_user_class_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select class_id from public.profiles where id = auth.uid() and approved and public.mfa_ok();
$$;

-- With no role, `current_user_role() = 'admin'` is NULL, not false, and
-- `if not public.is_admin()` lets NULL through - admin_list_accounts would
-- hand a waiting sign-up (or, since 0011, an aal1 session on a 2FA admin
-- account) every email. Always true or false now.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin()
     and exists (select 1 from public.profiles where id = auth.uid() and superadmin);
$$;

-- The last-admin guard counts admins who can actually act.
create or replace function public.other_admin_exists(p_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles where role = 'admin' and approved and id <> p_id);
$$;

-- Same as 0011, plus the approval and super admin rules.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_api boolean := current_user = 'authenticated';
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'An account''s id and creation date can''t change.' using errcode = '42501';
  end if;

  if v_api and not public.is_admin()
     and (new.role is distinct from old.role
          or new.class_id is distinct from old.class_id
          or new.approved is distinct from old.approved) then
    raise exception 'You can only change your own name.' using errcode = '42501';
  end if;

  if v_api and new.superadmin is distinct from old.superadmin then
    raise exception 'The super admin is set in the database, not in the app.' using errcode = '42501';
  end if;

  if v_api and old.superadmin
     and (new.role is distinct from old.role or new.approved is distinct from old.approved) then
    raise exception 'The super admin account can''t be changed in the app.' using errcode = '42501';
  end if;

  if v_api and old.approved and not new.approved then
    raise exception 'An approved account can''t go back to waiting for approval.' using errcode = '42501';
  end if;

  if v_api and (old.role = 'admin' or new.role = 'admin')
     and (new.role is distinct from old.role or new.approved is distinct from old.approved)
     and not public.is_superadmin() then
    raise exception 'Only the super admin can approve or change admin accounts.' using errcode = '42501';
  end if;

  if old.role = 'admin' and old.approved and new.role <> 'admin' and not public.other_admin_exists(old.id) then
    raise exception 'This is the last admin account - make someone else an admin first.' using errcode = '42501';
  end if;

  -- Only students belong to a class.
  if new.role <> 'student' then
    new.class_id := null;
  end if;
  return new;
end;
$$;

-- ── 4. turning down a sign-up ──────────────────────────────────────────
create or replace function public.decline_signup(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role public.user_role;
  v_approved boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can turn down sign-ups.' using errcode = '42501';
  end if;

  select p.role, p.approved into v_role, v_approved
  from public.profiles p
  where p.id = p_profile_id;
  if not found then
    raise exception 'That sign-up is already gone.' using errcode = 'P0002';
  end if;
  if v_approved then
    raise exception 'Only a sign-up that is still waiting can be turned down.' using errcode = '42501';
  end if;
  if v_role = 'admin' and not public.is_superadmin() then
    raise exception 'Only the super admin can turn down an admin sign-up.' using errcode = '42501';
  end if;

  -- profiles.id references auth.users on delete cascade.
  delete from auth.users where id = p_profile_id;
end;
$$;

-- ── 5. teachers see approved students only ─────────────────────────────
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
    where p.role = 'student' and p.approved and p.class_id is null
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
      where p.id = any (p_student_ids) and p.role = 'student' and p.approved and p.class_id is null
      returning p.id, p.full_name
    )
    select added.id, added.full_name from added;
end;
$$;

-- Return type gains `superadmin`, so it has to be dropped and recreated.
drop function if exists public.admin_list_accounts();
create function public.admin_list_accounts()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  class_id uuid,
  approved boolean,
  superadmin boolean,
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
    select p.id, p.full_name, u.email::text, p.role, p.class_id, p.approved, p.superadmin, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- ── grants ─────────────────────────────────────────────────────────────
-- is_superadmin: the guard trigger is SECURITY INVOKER, so the caller runs it.
revoke execute on function public.is_superadmin() from public;
revoke execute on function public.decline_signup(uuid) from public;
revoke execute on function public.admin_list_accounts() from public;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.decline_signup(uuid) to authenticated;
grant execute on function public.admin_list_accounts() to authenticated;

-- ── the super admin ────────────────────────────────────────────────────
-- Run once in the SQL Editor (it runs as postgres, which the guard allows),
-- with the email of your own admin account:
--
--   update public.profiles set role = 'admin', approved = true, superadmin = true
--   where id = (select id from auth.users where email = 'your-admin-email@example.com');
