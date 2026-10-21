-- ── close: students editing their own progress directly ─────────────────
-- 0006 gave students INSERT/UPDATE on their own lesson_progress rows so the
-- SECURITY INVOKER record_lesson_attempt() could write them. But that also
-- let any student skip the function entirely:
--   PATCH /rest/v1/lesson_progress?student_id=eq.<me>  {"passes": 3}
-- marks a sign mastered with no attempt and no cooldown (0007).
--
-- Now the function is the only write path: it runs as SECURITY DEFINER,
-- checks the caller is the student named in p_student_id, and direct
-- INSERT/UPDATE is revoked. Reads (and every read policy) are unchanged, and
-- the function's signature and behaviour are identical, so no client change.
--
-- What this can't fix: p_passed still comes from the client, because the
-- recognition model runs in the browser. A determined student can still
-- report a pass they didn't sign - but only one counted pass per sign per
-- 10 minutes, like everyone else.

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
    passes = lp.passes + case
      when p_passed and (lp.last_passed_at is null or lp.last_passed_at <= now() - interval '10 minutes')
      then 1 else 0 end,
    best_confidence = greatest(lp.best_confidence, excluded.best_confidence),
    first_passed_at = coalesce(lp.first_passed_at, excluded.first_passed_at),
    last_passed_at = case
      when p_passed and (lp.last_passed_at is null or lp.last_passed_at <= now() - interval '10 minutes')
      then now() else lp.last_passed_at end,
    updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

drop policy if exists "lesson_progress: student inserts own rows" on public.lesson_progress;
drop policy if exists "lesson_progress: student updates own rows" on public.lesson_progress;
revoke insert, update, delete on public.lesson_progress from authenticated;

revoke execute on function public.record_lesson_attempt(uuid, text, text, text, boolean, numeric) from public;
grant execute on function public.record_lesson_attempt(uuid, text, text, text, boolean, numeric) to authenticated;
