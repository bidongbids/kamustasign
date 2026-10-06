-- Row Level Security for the KamustaSign schema (0001_schema.sql).
-- Role model: student, teacher, admin (public.user_role on profiles.role).

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.scores enable row level security;

-- SECURITY DEFINER helpers: policies on `profiles` itself must not query
-- `profiles` directly (self-referential RLS recursion). Routing the lookup
-- through a definer function bypasses RLS for just this read.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_class_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select class_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_role() = 'admin';
$$;

-- ── profiles ────────────────────────────────────────────────────────────
create policy "profiles: read own row"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: teacher reads own class roster"
  on public.profiles for select
  using (
    public.current_user_role() = 'teacher'
    and class_id is not null
    and class_id in (select id from public.classes where teacher_id = auth.uid())
  );

create policy "profiles: admin reads all"
  on public.profiles for select
  using (public.is_admin());

create policy "profiles: update own row (not role)"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_user_role());

create policy "profiles: admin manages all"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── classes ─────────────────────────────────────────────────────────────
create policy "classes: student reads own class"
  on public.classes for select
  using (id = public.current_user_class_id());

create policy "classes: teacher manages own classes"
  on public.classes for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "classes: admin manages all"
  on public.classes for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── assignments ─────────────────────────────────────────────────────────
create policy "assignments: student reads own class assignments"
  on public.assignments for select
  using (class_id = public.current_user_class_id());

create policy "assignments: teacher manages own assignments"
  on public.assignments for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

create policy "assignments: admin manages all"
  on public.assignments for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── submissions ─────────────────────────────────────────────────────────
create policy "submissions: student manages own submissions"
  on public.submissions for all
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "submissions: teacher reads submissions for own assignments"
  on public.submissions for select
  using (
    assignment_id in (
      select id from public.assignments where teacher_id = auth.uid()
    )
  );

create policy "submissions: admin manages all"
  on public.submissions for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── scores ──────────────────────────────────────────────────────────────
-- Auto-scoring runs on-device (see Section 5.3: inference is never
-- server-side), so the student's own client is what inserts the score row
-- right after grading its own submission.
create policy "scores: student inserts score for own submission"
  on public.scores for insert
  with check (
    submission_id in (
      select id from public.submissions where student_id = auth.uid()
    )
  );

create policy "scores: student reads own scores"
  on public.scores for select
  using (
    submission_id in (
      select id from public.submissions where student_id = auth.uid()
    )
  );

create policy "scores: teacher reads/overrides scores for own assignments"
  on public.scores for all
  using (
    submission_id in (
      select s.id from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where a.teacher_id = auth.uid()
    )
  )
  with check (
    submission_id in (
      select s.id from public.submissions s
      join public.assignments a on a.id = s.assignment_id
      where a.teacher_id = auth.uid()
    )
  );

create policy "scores: admin manages all"
  on public.scores for all
  using (public.is_admin())
  with check (public.is_admin());

-- ── storage: submission videos ─────────────────────────────────────────
-- Bucket path convention: {student_id}/{assignment_id}/{filename}
insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

create policy "submission videos: student manages own folder"
  on storage.objects for all
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "submission videos: teacher reads own class students' files"
  on storage.objects for select
  using (
    bucket_id = 'submissions'
    and public.current_user_role() = 'teacher'
    and (storage.foldername(name))[1]::uuid in (
      select p.id from public.profiles p
      join public.classes c on c.id = p.class_id
      where c.teacher_id = auth.uid()
    )
  );

create policy "submission videos: admin manages all"
  on storage.objects for all
  using (bucket_id = 'submissions' and public.is_admin())
  with check (bucket_id = 'submissions' and public.is_admin());
