-- 0017: booked video calls.
--
-- The teacher books each call: a student, a start and an end. A student can
-- only call during their own booked time (from 5 minutes before the start
-- until the end); the teacher can still call any of their students at any
-- time. The app enforces who may ring (src/lib/callSchedule.ts): the
-- student's Call button is off outside the booking, and the teacher's app
-- turns down a ring from a student with no booking open.
--
-- The database makes sure two calls can never be booked for the same time:
-- the exclusion constraints below refuse a booking that overlaps another one
-- for the same teacher (across all their classes) or the same student.
-- Back-to-back calls (2:00-2:15, then 2:15-2:30) are fine.
--
-- Run after 0016_admin_requires_2fa.sql.

-- uuid "=" inside a GiST exclusion constraint.
create extension if not exists btree_gist with schema extensions;

create table public.call_bookings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint call_bookings_order check (ends_at > starts_at),
  constraint call_bookings_length check (ends_at - starts_at <= interval '2 hours'),
  constraint call_bookings_teacher_free
    exclude using gist (teacher_id with =, tstzrange(starts_at, ends_at) with &&),
  constraint call_bookings_student_free
    exclude using gist (student_id with =, tstzrange(starts_at, ends_at) with &&)
);

alter table public.call_bookings enable row level security;

-- The teacher books, moves and cancels calls with students in their own
-- classes (is_call_partner: an approved teacher, the student in that class).
create policy "call_bookings: teacher books calls with their students"
  on public.call_bookings for insert
  with check (
    teacher_id = auth.uid()
    and (select public.is_teacher())
    and public.is_call_partner(class_id, student_id)
  );

create policy "call_bookings: teacher moves own bookings"
  on public.call_bookings for update
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and (select public.is_teacher())
    and public.is_call_partner(class_id, student_id)
  );

create policy "call_bookings: teacher cancels own bookings"
  on public.call_bookings for delete
  using (teacher_id = auth.uid());

-- Each side sees only its own bookings: a student never sees other
-- students' call times.
create policy "call_bookings: teacher and student read"
  on public.call_bookings for select
  using (teacher_id = auth.uid() or student_id = auth.uid());

create policy "mfa: aal2 when the account has 2FA" on public.call_bookings
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

grant select, insert, delete on public.call_bookings to authenticated;
-- Moving a booking changes only its time.
grant update (starts_at, ends_at) on public.call_bookings to authenticated;

-- ── a student who leaves a class loses its upcoming bookings ─────────────
-- Removed from the class, moved to another one, or no longer a student:
-- their future calls with that class's teacher are cancelled, so the slot is
-- free again and they can't ring a teacher who is no longer theirs.
create or replace function public.drop_call_bookings_on_class_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.call_bookings
  where student_id = new.id
    and ends_at > now()
    and (new.role is distinct from 'student' or class_id is distinct from new.class_id);
  return new;
end;
$$;

revoke execute on function public.drop_call_bookings_on_class_change() from public;

create trigger profiles_drop_call_bookings
  after update of class_id, role on public.profiles
  for each row
  when (old.class_id is distinct from new.class_id or old.role is distinct from new.role)
  execute function public.drop_call_bookings_on_class_change();
