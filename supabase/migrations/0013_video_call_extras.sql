-- Video call extras (Oct 2026):
--  - online status: Realtime presence on the private call topics, so a
--    teacher sees which students are online (or already on a call) and a
--    student sees whether their teacher is;
--  - missed calls: a call nobody answered is recorded for the person who
--    was called, with a "call back" on their dashboard;
--  - call notes: after a call the teacher can keep what was signed on each
--    side, and how the student did on any signs practised in the call.
--
-- Run after 0012_class_plan_no_cooldown.sql.

-- ── presence on the call topics ────────────────────────────────────────
-- 0011 only allowed the broadcast extension. Presence uses the same topic
-- (call:<class_id>:<student_id>) and the same rule: the student and their
-- class's approved teacher, nobody else.
create policy "call presence: student and their class teacher can see"
  on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'presence' and public.can_use_call_topic((select realtime.topic())));

create policy "call presence: student and their class teacher can join"
  on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.can_use_call_topic((select realtime.topic())));

-- ── who may call whom ──────────────────────────────────────────────────
-- True when the caller and p_other can be on a call together in p_class_id:
-- a student and their class's teacher, either way round. The teacher side
-- reuses the call-topic rule (approved teacher, student in their class).
create or replace function public.is_call_partner(p_class_id uuid, p_other uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if p_class_id is null or p_other is null then
    return false;
  end if;
  if public.current_user_role() = 'student' then
    return public.current_user_class_id() = p_class_id
      and exists (select 1 from public.classes c where c.id = p_class_id and c.teacher_id = p_other);
  end if;
  return public.can_use_call_topic('call:' || p_class_id::text || ':' || p_other::text);
end;
$$;

revoke execute on function public.is_call_partner(uuid, uuid) from public;
grant execute on function public.is_call_partner(uuid, uuid) to authenticated;

-- ── missed calls ───────────────────────────────────────────────────────
-- Written by the caller when a ring goes unanswered. The person called can
-- read it and mark it seen; nobody can edit who called or when.
create table public.missed_calls (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index missed_calls_callee_idx on public.missed_calls (callee_id, created_at desc);

alter table public.missed_calls enable row level security;

create policy "missed_calls: caller records an unanswered call"
  on public.missed_calls for insert
  with check (caller_id = auth.uid() and public.is_call_partner(class_id, callee_id));

create policy "missed_calls: caller and callee read"
  on public.missed_calls for select
  using (caller_id = auth.uid() or callee_id = auth.uid());

create policy "missed_calls: callee marks seen"
  on public.missed_calls for update
  using (callee_id = auth.uid())
  with check (callee_id = auth.uid());

create policy "mfa: aal2 when the account has 2FA" on public.missed_calls
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

grant select, insert on public.missed_calls to authenticated;
-- Only seen_at can change.
grant update (seen_at) on public.missed_calls to authenticated;

-- ── call notes ─────────────────────────────────────────────────────────
-- Saved by the teacher from the "Call ended" screen. Both people on the
-- call can read them; the teacher can delete their own.
create table public.call_notes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds >= 0),
  teacher_text text not null default '' check (length(teacher_text) <= 5000),
  student_text text not null default '' check (length(student_text) <= 5000),
  -- [{ "sign", "language", "group", "passed", "confidence", "tries" }]
  practice jsonb not null default '[]'::jsonb
    check (jsonb_typeof(practice) = 'array' and jsonb_array_length(practice) <= 200),
  created_at timestamptz not null default now()
);

create index call_notes_class_idx on public.call_notes (class_id, created_at desc);

alter table public.call_notes enable row level security;

create policy "call_notes: teacher saves notes for a call with their student"
  on public.call_notes for insert
  with check (
    teacher_id = auth.uid()
    and (select public.is_teacher())
    and public.is_call_partner(class_id, student_id)
  );

create policy "call_notes: teacher and student read"
  on public.call_notes for select
  using (teacher_id = auth.uid() or student_id = auth.uid());

create policy "call_notes: teacher deletes own"
  on public.call_notes for delete
  using (teacher_id = auth.uid());

create policy "mfa: aal2 when the account has 2FA" on public.call_notes
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

grant select, insert, delete on public.call_notes to authenticated;
