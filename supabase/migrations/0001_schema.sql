-- KamustaSign core schema, from the manuscript ERD (see Section 5.1 of
-- KamustaSign_UI_CRUD_Handoff.md). Run once against a fresh Supabase project
-- (paste into the SQL Editor, or `supabase db push` once the CLI is linked).

create type public.user_role as enum ('student', 'teacher', 'admin');

-- One row per auth.users row. Created automatically by the trigger below on
-- signup; role/full_name come from the signup call's user metadata.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'student',
  -- nullable: admins have no class, and a class can't reference a teacher
  -- profile until both rows exist, so this is backfilled after creation.
  class_id uuid,
  created_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  teacher_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Added after both tables exist, to break the profiles <-> classes cycle.
alter table public.profiles
  add constraint profiles_class_id_fkey
  foreign key (class_id) references public.classes (id) on delete set null;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  target_sign text not null,
  due_date timestamptz,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  video_url text not null,
  submitted_at timestamptz not null default now()
);

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  -- one score per submission, per the manuscript ("produces exactly one score")
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  predicted_sign text not null,
  is_correct boolean not null,
  confidence numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),
  scored_at timestamptz not null default now()
);

create index profiles_class_id_idx on public.profiles (class_id);
create index classes_teacher_id_idx on public.classes (teacher_id);
create index assignments_class_id_idx on public.assignments (class_id);
create index assignments_teacher_id_idx on public.assignments (teacher_id);
create index submissions_assignment_id_idx on public.submissions (assignment_id);
create index submissions_student_id_idx on public.submissions (student_id);

-- Auto-create a profile row when someone signs up. Expects role/full_name to
-- be passed as auth signup metadata, e.g.:
--   supabase.auth.signUp({ email, password, options: { data: { full_name, role } } })
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
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'student')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
