-- Teacher-run classrooms (adviser feedback, Oct 2026):
--  - teachers create their classes and invite students - by ticking them
--    from a list of students who have no class yet, or by a join code the
--    student types in;
--  - teachers author modules: a named set of signs from one language+group
--    of the curriculum (src/lib/curriculum.ts), in their chosen order;
--  - admins handle account management only - they can still see class names
--    (the accounts list shows which class a student is in) but no longer
--    create, edit or delete classes.
--
-- Run after 0008_class_management.sql.

-- ── admin: read classes, nothing more ──────────────────────────────────
drop policy if exists "classes: admin manages all" on public.classes;

create policy "classes: admin reads all"
  on public.classes for select
  using (public.is_admin());

-- 0001's signup trigger trusted the role in signup metadata, so anyone
-- calling the auth API directly could sign up as an admin. Sign-up can only
-- make students and teachers (what RegisterScreen offers); an admin is made
-- by another admin changing the role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when new.raw_user_meta_data ->> 'role' = 'teacher' then 'teacher' else 'student' end::public.user_role
  );
  return new;
end;
$$;

-- 0002's teacher policy only checked teacher_id = me, so a student could
-- create a "class" naming themselves its teacher.
drop policy if exists "classes: teacher manages own classes" on public.classes;

create policy "classes: teacher manages own classes"
  on public.classes for all
  using (teacher_id = auth.uid() and public.current_user_role() = 'teacher')
  with check (teacher_id = auth.uid() and public.current_user_role() = 'teacher');

-- ── join codes ─────────────────────────────────────────────────────────
-- Six characters, no 0/O/1/I/L so a child can copy it off the board.
-- SECURITY DEFINER so the uniqueness check sees every class, not just the
-- caller's (it runs as the column default on a teacher's insert).
create or replace function public.new_class_code()
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.classes where join_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.classes add column join_code text;
update public.classes set join_code = public.new_class_code() where join_code is null;
alter table public.classes alter column join_code set default public.new_class_code();
alter table public.classes alter column join_code set not null;
alter table public.classes add constraint classes_join_code_key unique (join_code);

-- Student: join the class whose code this is. Only a student with no class
-- can join - switching classes means their current teacher removes them
-- first, so a code passed around can't pull a student out of a class.
create or replace function public.join_class_with_code(p_code text)
returns table (class_id uuid, class_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
  v_name text;
  v_role public.user_role;
  v_current uuid;
begin
  select p.role, p.class_id into v_role, v_current from public.profiles p where p.id = auth.uid();
  if v_role is distinct from 'student' then
    raise exception 'Only student accounts can join a class with a code.' using errcode = '42501';
  end if;

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

-- Teacher: replace a class's code (e.g. after it was shared too widely).
create or replace function public.regenerate_class_code(p_class_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid()) then
    raise exception 'You can only change the code of your own class.' using errcode = '42501';
  end if;
  v_code := public.new_class_code();
  update public.classes set join_code = v_code where id = p_class_id;
  return v_code;
end;
$$;

-- ── checkbox invites ───────────────────────────────────────────────────
-- Teacher: the students who aren't in any class yet - the list they tick
-- from. Students already in a class are never listed, so one teacher can't
-- see (or take) another teacher's roster.
create or replace function public.list_unassigned_students()
returns table (id uuid, full_name text, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
stable
as $$
begin
  if public.current_user_role() is distinct from 'teacher' then
    raise exception 'Only teachers can invite students.' using errcode = '42501';
  end if;

  return query
    select p.id, p.full_name, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'student' and p.class_id is null
    order by p.full_name;
end;
$$;

-- Teacher: put the ticked students in their class. Anyone who joined another
-- class in the meantime is skipped rather than moved; the caller is told
-- who actually got added.
create or replace function public.add_students_to_class(p_class_id uuid, p_student_ids uuid[])
returns table (student_id uuid, student_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid()) then
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

-- 0008's remove_student_from_class let an admin remove too; now only the
-- class's own teacher can.
create or replace function public.remove_student_from_class(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class uuid;
begin
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

-- The email path (0008) is replaced by the two above.
drop function if exists public.add_student_to_class(uuid, text);

-- ── modules ────────────────────────────────────────────────────────────
-- A module is one language + one group, so a student practises it on the
-- same screen as that group. Its signs are names from the curriculum lists;
-- like lesson_progress they aren't foreign keys (the curriculum lives in
-- code), and the client drops any sign a model no longer has.
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  language text not null check (language in ('asl', 'fsl')),
  sign_group text not null check (sign_group in ('letters', 'numbers', 'words')),
  due_date date,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index modules_class_idx on public.modules (class_id, position);

create table public.module_signs (
  module_id uuid not null references public.modules (id) on delete cascade,
  sign text not null,
  position integer not null default 0,
  primary key (module_id, sign)
);

alter table public.modules enable row level security;
alter table public.module_signs enable row level security;

create policy "modules: teacher manages own classes' modules"
  on public.modules for all
  using (class_id in (select id from public.classes where teacher_id = auth.uid()))
  with check (class_id in (select id from public.classes where teacher_id = auth.uid()));

create policy "modules: student reads own class modules"
  on public.modules for select
  using (class_id = public.current_user_class_id());

create policy "module_signs: teacher manages own classes' module signs"
  on public.module_signs for all
  using (
    module_id in (
      select m.id from public.modules m
      join public.classes c on c.id = m.class_id
      where c.teacher_id = auth.uid()
    )
  )
  with check (
    module_id in (
      select m.id from public.modules m
      join public.classes c on c.id = m.class_id
      where c.teacher_id = auth.uid()
    )
  );

create policy "module_signs: student reads own class module signs"
  on public.module_signs for select
  using (
    module_id in (select id from public.modules where class_id = public.current_user_class_id())
  );

-- Replace a module's sign list in one call, so a save can't leave it half
-- written. SECURITY INVOKER: module_signs' RLS decides whether the caller
-- may touch this module.
create or replace function public.set_module_signs(p_module_id uuid, p_signs text[])
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.module_signs where module_id = p_module_id;
  insert into public.module_signs (module_id, sign, position)
  select p_module_id, s.sign, s.ord - 1
  from unnest(p_signs) with ordinality as s(sign, ord);
$$;

-- ── grants ─────────────────────────────────────────────────────────────
-- "Auto-expose" is off for this project (see 0003_grants.sql).
grant select, insert, update, delete on public.modules to authenticated;
grant select, insert, update, delete on public.module_signs to authenticated;

revoke execute on function public.new_class_code() from public;
revoke execute on function public.join_class_with_code(text) from public;
revoke execute on function public.regenerate_class_code(uuid) from public;
revoke execute on function public.list_unassigned_students() from public;
revoke execute on function public.add_students_to_class(uuid, uuid[]) from public;
revoke execute on function public.set_module_signs(uuid, text[]) from public;
-- new_class_code() runs as the column default, so the inserting role needs it.
grant execute on function public.new_class_code() to authenticated;
grant execute on function public.join_class_with_code(text) to authenticated;
grant execute on function public.regenerate_class_code(uuid) to authenticated;
grant execute on function public.list_unassigned_students() to authenticated;
grant execute on function public.add_students_to_class(uuid, uuid[]) to authenticated;
grant execute on function public.set_module_signs(uuid, text[]) to authenticated;
