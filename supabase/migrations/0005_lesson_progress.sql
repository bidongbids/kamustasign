-- Classroom as a fixed learning plan (see docs/CLASSROOM_REDESIGN.md). One row per
-- student per sign they have practised. The curriculum itself is NOT stored
-- here - it lives in src/lib/curriculum.ts, built from each deployed model's
-- label_classes.json - so totals like "7 of 26" are counted client-side and
-- a model's vocabulary changing never needs a seed migration.
--
-- Built alongside the old assignments/submissions/scores tables on purpose:
-- those are dropped in a later migration, only once this flow is demoed.
-- RLS and grants for this table are in 0006_lesson_progress_rls.sql.

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  language text not null check (language in ('asl', 'fsl')),
  sign_group text not null check (sign_group in ('letters', 'numbers', 'words')),
  sign text not null,
  attempts integer not null default 0,
  passes integer not null default 0,
  best_confidence numeric(5, 4) not null default 0
    check (best_confidence >= 0 and best_confidence <= 1),
  first_passed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (student_id, language, sign_group, sign)
);

create index lesson_progress_student_idx
  on public.lesson_progress (student_id, language, sign_group);

-- One practice attempt, recorded atomically. Done in SQL rather than as a
-- read-modify-write from the client, because two rapid attempts would
-- otherwise both read the same counts and one increment would be lost.
--
-- SECURITY INVOKER (the default, stated explicitly): it runs as the caller,
-- so lesson_progress's RLS still decides whether p_student_id is a row the
-- caller may insert/update - a student passing someone else's id is refused
-- by the policy, not by anything in here.
create or replace function public.record_lesson_attempt(
  p_student_id uuid,
  p_language text,
  p_sign_group text,
  p_sign text,
  p_passed boolean,
  p_confidence numeric
)
returns public.lesson_progress
language sql
security invoker
set search_path = public
as $$
  insert into public.lesson_progress as lp (
    student_id, language, sign_group, sign,
    attempts, passes, best_confidence, first_passed_at, updated_at
  )
  values (
    p_student_id, p_language, p_sign_group, p_sign,
    1,
    case when p_passed then 1 else 0 end,
    greatest(0, least(1, coalesce(p_confidence, 0))),
    case when p_passed then now() end,
    now()
  )
  on conflict (student_id, language, sign_group, sign) do update set
    attempts = lp.attempts + 1,
    passes = lp.passes + case when p_passed then 1 else 0 end,
    best_confidence = greatest(lp.best_confidence, excluded.best_confidence),
    first_passed_at = coalesce(lp.first_passed_at, excluded.first_passed_at),
    updated_at = now()
  returning *;
$$;
