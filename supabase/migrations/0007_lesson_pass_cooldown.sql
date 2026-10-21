-- "Mastered = passed on 3 separate occasions" (docs/CLASSROOM_REDESIGN.md section
-- 4) was first enforced as "one pass per practice session". Leaving the
-- practice screen and reopening it started a new session, so that rule only
-- added friction - three passes in a minute still counted. Instead, a pass now
-- counts only if the previous counted pass for that sign was at least
-- 10 minutes ago. Every pass is sent; this function decides.
--
-- Keep the interval in sync with PASS_COOLDOWN_MINUTES in
-- src/lib/curriculum.ts (the client only uses it to tell the student when
-- their next pass will count; this is where the rule is applied).

alter table public.lesson_progress add column last_passed_at timestamptz;

-- Best available approximation for rows written before this column existed.
update public.lesson_progress set last_passed_at = updated_at where passes > 0;

-- Same signature and return type as 0005, so its grants carry over.
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
    passes = lp.passes + case
      when p_passed and (lp.last_passed_at is null or lp.last_passed_at <= now() - interval '10 minutes')
      then 1 else 0 end,
    best_confidence = greatest(lp.best_confidence, excluded.best_confidence),
    first_passed_at = coalesce(lp.first_passed_at, excluded.first_passed_at),
    last_passed_at = case
      when p_passed and (lp.last_passed_at is null or lp.last_passed_at <= now() - interval '10 minutes')
      then now() else lp.last_passed_at end,
    updated_at = now()
  returning *;
$$;
