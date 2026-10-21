-- Row Level Security for public.lesson_progress (0005_lesson_progress.sql),
-- following the patterns in 0002_rls.sql. Plus the baseline grants this
-- project needs for every new table (see 0003_grants.sql for why: "auto-
-- expose new tables" is off, so without a GRANT every request fails before
-- RLS is even evaluated).

alter table public.lesson_progress enable row level security;

-- ── student: own rows only ─────────────────────────────────────────────
-- Split per command rather than one "for all", because a student may
-- select/insert/update their own progress but never delete it.
create policy "lesson_progress: student reads own rows"
  on public.lesson_progress for select
  using (student_id = auth.uid());

create policy "lesson_progress: student inserts own rows"
  on public.lesson_progress for insert
  with check (student_id = auth.uid());

create policy "lesson_progress: student updates own rows"
  on public.lesson_progress for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- ── teacher: read-only, students in a class they own ───────────────────
-- Same shape as the "submission videos: teacher reads own class students'
-- files" policy in 0002_rls.sql.
create policy "lesson_progress: teacher reads own class students"
  on public.lesson_progress for select
  using (
    public.current_user_role() = 'teacher'
    and student_id in (
      select p.id from public.profiles p
      join public.classes c on c.id = p.class_id
      where c.teacher_id = auth.uid()
    )
  );

-- ── admin: read all ─────────────────────────────────────────────────────
create policy "lesson_progress: admin reads all"
  on public.lesson_progress for select
  using (public.is_admin());

-- ── grants ──────────────────────────────────────────────────────────────
-- No delete grant: nothing in the app deletes progress (a student's rows go
-- with their profile via on delete cascade).
grant select, insert, update on public.lesson_progress to authenticated;

-- With "auto-expose" off, functions don't get EXECUTE for authenticated by
-- default either. The function itself is security invoker, so this grant
-- adds no access beyond the policies above.
revoke execute on function public.record_lesson_attempt(uuid, text, text, text, boolean, numeric) from public;
grant execute on function public.record_lesson_attempt(uuid, text, text, text, boolean, numeric) to authenticated;
