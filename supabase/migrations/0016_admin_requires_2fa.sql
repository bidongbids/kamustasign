-- 0016: admin accounts must use 2FA.
--
-- Admins can see and change every account, so their admin powers now need a
-- session that has entered an authenticator code (aal2). Every admin check -
-- is_admin(), is_superadmin(), the policies and functions built on them -
-- goes through current_user_role(), so this changes only that function: for
-- an admin row it returns NULL (no role at all) unless the session is aal2.
--
-- An admin without 2FA can still sign in and read their own profile (the
-- "own row" policy doesn't use the role), so the app sees role = admin and
-- sends them to the 2FA setup screen (App.tsx) - no skipping. Setting it up
-- verifies a code, the session becomes aal2, and the powers come back.
-- Students and teachers are unchanged: 2FA stays optional for them (mfa_ok,
-- 0011), and approval still comes first for everyone (0014).
--
-- Before applying: every admin should set up 2FA (Account > Two-factor
-- sign-in); the app also asks them right after their next login.
-- Lost authenticator: in the SQL Editor,
--   delete from auth.mfa_factors
--   where user_id = (select id from auth.users where email = 'their@email.com');
-- then that admin sets 2FA up again at their next login.
--
-- The last-admin guard (other_admin_exists) still counts every approved
-- admin, with or without 2FA: it protects the row, not the session.

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select case
           when p.role = 'admin' and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
           else p.role
         end
  from public.profiles p
  where p.id = auth.uid() and p.approved and public.mfa_ok();
$$;
