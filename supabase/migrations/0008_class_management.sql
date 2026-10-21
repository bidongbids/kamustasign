-- Class roster management for the teacher and admin dashboards.
--
-- Before this, a teacher could create a class but never put a student in it:
-- class membership is profiles.class_id, and 0002_rls.sql gives teachers no
-- UPDATE on profiles at all (only admins could move students, by picking
-- them from a name-only list). These SECURITY DEFINER functions are the one
-- narrow path for that - each re-checks who is calling before touching a row,
-- the same way 0002's helpers bypass RLS for exactly one read.
--
-- Emails live in auth.users, which the client can never read directly.
-- admin_list_accounts() and add_student_to_class() are the only places that
-- join to it, and both refuse callers who aren't allowed to see the result.

-- ── admin: account directory with emails ───────────────────────────────
create or replace function public.admin_list_accounts()
returns table (
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  class_id uuid,
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
    select p.id, p.full_name, u.email::text, p.role, p.class_id, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc;
end;
$$;

-- ── teacher/admin: add a student to a class by email ───────────────────
-- A teacher can only add to a class they own, and only a student who isn't
-- already in some other teacher's class (moving a student between classes
-- is an admin decision). An admin can do either.
create or replace function public.add_student_to_class(p_class_id uuid, p_email text)
returns table (student_id uuid, student_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner uuid;
  v_id uuid;
  v_name text;
  v_role public.user_role;
  v_current_class uuid;
begin
  select c.teacher_id into v_owner from public.classes c where c.id = p_class_id;
  if not found then
    raise exception 'That class no longer exists.' using errcode = 'P0002';
  end if;
  if not (public.is_admin() or v_owner = auth.uid()) then
    raise exception 'You can only add students to your own class.' using errcode = '42501';
  end if;

  select p.id, p.full_name, p.role, p.class_id
    into v_id, v_name, v_role, v_current_class
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'No account uses that email. The student needs to sign up first.' using errcode = 'P0002';
  end if;
  if v_role <> 'student' then
    raise exception 'That email belongs to a % account, not a student.', v_role using errcode = '22023';
  end if;
  if v_current_class = p_class_id then
    raise exception '% is already in this class.', coalesce(nullif(v_name, ''), 'That student') using errcode = '23505';
  end if;
  if v_current_class is not null and not public.is_admin() then
    raise exception '% is already in another class. Ask an admin to move them.', coalesce(nullif(v_name, ''), 'That student')
      using errcode = '42501';
  end if;

  update public.profiles set class_id = p_class_id where profiles.id = v_id;
  return query select v_id, v_name;
end;
$$;

-- ── teacher/admin: take a student out of their class ───────────────────
create or replace function public.remove_student_from_class(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
  v_owner uuid;
begin
  select p.class_id into v_class
  from public.profiles p
  where p.id = p_student_id and p.role = 'student';

  if v_class is null then
    raise exception 'That student is not in a class.' using errcode = 'P0002';
  end if;

  select c.teacher_id into v_owner from public.classes c where c.id = v_class;
  if not (public.is_admin() or v_owner = auth.uid()) then
    raise exception 'You can only remove students from your own class.' using errcode = '42501';
  end if;

  update public.profiles set class_id = null where profiles.id = p_student_id;
end;
$$;

-- ── close: students choosing their own class ───────────────────────────
-- 0002's self-update policy pinned `role` but not `class_id`, so any student
-- could write any class id onto their own row - joining a class uninvited,
-- reading its teacher's profile (0004) and ringing them on the video call.
-- current_user_class_id() is STABLE, so inside WITH CHECK it still returns
-- the pre-update value (the same reason the existing role check works).
drop policy if exists "profiles: update own row (not role)" on public.profiles;

create policy "profiles: update own row (not role or class)"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.current_user_role()
    and class_id is not distinct from public.current_user_class_id()
  );

-- ── grants ──────────────────────────────────────────────────────────────
-- "Auto-expose" is off for this project (see 0003_grants.sql), so functions
-- need an explicit EXECUTE grant; each one checks the caller itself.
revoke execute on function public.admin_list_accounts() from public;
revoke execute on function public.add_student_to_class(uuid, text) from public;
revoke execute on function public.remove_student_from_class(uuid) from public;
grant execute on function public.admin_list_accounts() to authenticated;
grant execute on function public.add_student_to_class(uuid, text) to authenticated;
grant execute on function public.remove_student_from_class(uuid) to authenticated;
