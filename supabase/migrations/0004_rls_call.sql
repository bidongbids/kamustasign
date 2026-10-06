-- Video call feature (see KamustaSign_UI_CRUD_Handoff.md Section 5.3) needs
-- a student to look up their own class's teacher (to know who to call - see
-- src/lib/queries.ts getClassTeacher()). 0002_rls.sql only lets a student
-- read their own profile row or their own class's row; there was no path to
-- the teacher's profile row itself, so that lookup would silently come back
-- null under RLS without this.
--
-- The reverse direction (teacher reading student profiles in their own
-- class, for src/lib/queries.ts getStudentsForClass()) already works via the
-- existing "profiles: teacher reads own class roster" policy - no new policy
-- needed for that side.
create policy "profiles: student reads own class teacher"
  on public.profiles for select
  using (
    role = 'teacher'
    and id in (
      select teacher_id from public.classes where id = public.current_user_class_id()
    )
  );
