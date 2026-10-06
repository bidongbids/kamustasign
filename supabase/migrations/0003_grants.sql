-- Fixes "permission denied for table profiles" (and would hit the same wall
-- on classes/assignments/submissions/scores next).
--
-- Cause: the Supabase project was created with "Automatically expose new
-- tables" turned off (recommended for security - it's what stops a future
-- table from being open-by-default with no RLS policy protecting it). The
-- tradeoff nobody mentioned at the time: it also means new tables don't get
-- baseline query privileges granted automatically. RLS policies (0002_rls.sql)
-- only control *which rows* a query can see - Postgres checks table-level
-- GRANTs first, before RLS is even evaluated. Without this, every request
-- fails at that first gate regardless of how correct the RLS policies are.
--
-- Only granting to `authenticated`, not `anon` - every policy in
-- 0002_rls.sql keys off auth.uid(), so an anonymous request would get zero
-- rows back anyway even if granted table access. Nothing in this schema is
-- meant to be publicly readable.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.submissions to authenticated;
grant select, insert, update, delete on public.scores to authenticated;
