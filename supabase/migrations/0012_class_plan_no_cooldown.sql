-- Classroom changes (Oct 2026):
--  - class learning plans: a teacher picks which word categories, and which
--    words in each, their class learns. Students see only those words, and
--    every progress figure counts only them (curriculum.ts planSigns);
--  - no more pass cooldown ("resting" stars): one pass learns a sign
--    (MASTERY_PASSES = 1), so the 10-minute wait from 0007 only ever showed
--    up as a sleeping star after a sign was already learned.
--
-- Run after 0011_auth_hardening.sql.

-- ── class learning plans ───────────────────────────────────────────────
-- One row per class + language: the planned words, in no particular order
-- (the client shows them in curriculum order). No row = every word. Like
-- module_signs, signs aren't foreign keys - the curriculum lives in code,
-- and the client drops any word a model no longer has.
create table public.class_word_plans (
  class_id uuid not null references public.classes (id) on delete cascade,
  language text not null check (language in ('asl', 'fsl')),
  signs text[] not null default '{}'
    check (cardinality(signs) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (class_id, language)
);

alter table public.class_word_plans enable row level security;

-- Same shape as 0011's modules: an approved, 2FA-satisfied teacher of the
-- class (is_teacher()), and the restrictive aal2 policy on top.
create policy "class_word_plans: teacher manages own classes' plans"
  on public.class_word_plans for all
  using (
    (select public.is_teacher())
    and class_id in (select id from public.classes where teacher_id = auth.uid())
  )
  with check (
    (select public.is_teacher())
    and class_id in (select id from public.classes where teacher_id = auth.uid())
  );

create policy "class_word_plans: student reads own class plan"
  on public.class_word_plans for select
  using (class_id = public.current_user_class_id());

create policy "mfa: aal2 when the account has 2FA" on public.class_word_plans
  as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- "Auto-expose" is off for this project (see 0003_grants.sql).
grant select, insert, update, delete on public.class_word_plans to authenticated;

-- ── record_lesson_attempt without the cooldown ─────────────────────────
-- Same checks and signature as 0010; every pass now counts.
create or replace function public.record_lesson_attempt(
  p_student_id uuid,
  p_language text,
  p_sign_group text,
  p_sign text,
  p_passed boolean,
  p_confidence numeric
)
returns public.lesson_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.lesson_progress;
begin
  if p_student_id is distinct from auth.uid() then
    raise exception 'You can only record your own practice.' using errcode = '42501';
  end if;
  if public.current_user_role() is distinct from 'student' then
    raise exception 'Only student accounts record practice.' using errcode = '42501';
  end if;
  if p_sign is null or length(p_sign) = 0 or length(p_sign) > 64 then
    raise exception 'Invalid sign.' using errcode = '22023';
  end if;

  insert into public.lesson_progress as lp (
    student_id, language, sign_group, sign,
    attempts, passes, best_confidence, first_passed_at, last_passed_at, updated_at
  )
  values (
    p_student_id, p_language, p_sign_group, p_sign,
    1,
    case when p_passed then 1 else 0 end,
    greatest(0, least(1, coalesce(p_confidence, 0))),
    case when p_passed then now() end,
    case when p_passed then now() end,
    now()
  )
  on conflict (student_id, language, sign_group, sign) do update set
    attempts = lp.attempts + 1,
    passes = lp.passes + case when p_passed then 1 else 0 end,
    best_confidence = greatest(lp.best_confidence, excluded.best_confidence),
    first_passed_at = coalesce(lp.first_passed_at, excluded.first_passed_at),
    last_passed_at = case when p_passed then now() else lp.last_passed_at end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;
