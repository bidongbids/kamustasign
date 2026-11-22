-- 0019: app errors, sent to the school's admins.
--
-- Each copy of the app keeps its last 30 errors on the device
-- (src/lib/errorLog.ts). From this migration on, the app also sends them
-- here while someone is signed in, so an admin can see what went wrong on
-- every computer and phone without asking anyone to copy a report.
--
-- What a row holds: what went wrong (the error text, with email addresses
-- and log-in tokens taken out by the app), where in the app, how many
-- times, the app version, the kind of device (Windows app / Android app /
-- web, and the browser line), and which account was signed in. Errors from
-- before anyone signed in on that device go with the next account that
-- does, marked before_sign_in.
--
-- Privacy (the students are minors): only admins can read or delete rows;
-- nobody can change one. Rows are deleted after 30 days, and when the
-- account is deleted. Nothing goes to any service outside the school's own
-- database.
--
-- Writes only through report_errors(): it checks the caller, cuts long
-- text, and limits how much one account (50 new rows a day) and everyone
-- together (20,000 rows) can store, so the free database can't be filled.
-- The same error again on the same device updates its row (count, time)
-- instead of adding one.
--
-- Run after 0018_app_release.sql.

create table public.error_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The device's own id for this error (errorLog.ts), so a repeat updates the row.
  client_key text not null check (client_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- When it last happened, by the device's clock (never later than reported_at).
  happened_at timestamptz not null,
  -- When the server last got it (server clock): what the 30 days count from.
  reported_at timestamptz not null default now(),
  app_version text not null check (char_length(app_version) <= 20),
  platform text not null check (platform in ('desktop', 'android', 'web')),
  source text not null check (char_length(source) <= 40),
  message text not null check (char_length(message) <= 1500),
  count integer not null default 1 check (count >= 1),
  before_sign_in boolean not null default false,
  device text check (char_length(device) <= 300),
  unique (user_id, client_key)
);

create index error_reports_reported_at on public.error_reports (reported_at desc);

alter table public.error_reports enable row level security;

create policy "error_reports: admins read"
  on public.error_reports for select
  to authenticated
  using (public.is_admin());

create policy "error_reports: admins delete"
  on public.error_reports for delete
  to authenticated
  using (public.is_admin());

revoke all on public.error_reports from anon, authenticated;
grant select, delete on public.error_reports to authenticated;

-- p_entries: a JSON array of at most 30 of
--   { key, at, version, platform, source, message, count, before_sign_in, device }
-- Returns how many were saved. Entries that don't fit (a bad key or
-- platform, empty text, over the limits) are skipped, not an error, so one
-- bad entry can't hold back the rest.
create or replace function public.report_errors(p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_entry jsonb;
  v_key text;
  v_at timestamptz;
  v_platform text;
  v_message text;
  v_count integer;
  v_new_today integer;
  v_total integer;
  v_saved integer := 0;
begin
  -- Signed in, approved, and (admins) with 2FA - the same test as every
  -- other feature (current_user_role, 0011/0014/0016).
  if v_uid is null or public.current_user_role() is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then
    raise exception 'p_entries must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 30 then
    raise exception 'at most 30 entries at a time' using errcode = '22023';
  end if;

  -- 30 days, for everyone: the cheapest place to do it is here.
  delete from public.error_reports where reported_at < now() - interval '30 days';

  select count(*) into v_new_today
  from public.error_reports
  where user_id = v_uid and reported_at > now() - interval '1 day';
  select count(*) into v_total from public.error_reports;

  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_entry) <> 'object' then
      continue;
    end if;
    v_key := v_entry ->> 'key';
    v_platform := v_entry ->> 'platform';
    v_message := left(coalesce(v_entry ->> 'message', ''), 1500);
    if v_key is null or v_key !~ '^[A-Za-z0-9_-]{8,64}$'
       or v_platform is null or v_platform not in ('desktop', 'android', 'web')
       or btrim(v_message) = '' then
      continue;
    end if;
    begin
      v_at := (v_entry ->> 'at')::timestamptz;
    exception when others then
      v_at := null;
    end;
    v_at := least(coalesce(v_at, now()), now());
    if v_at < now() - interval '30 days' then
      continue;
    end if;
    begin
      v_count := greatest(1, least(coalesce((v_entry ->> 'count')::integer, 1), 1000000));
    exception when others then
      v_count := 1;
    end;

    if exists (select 1 from public.error_reports where user_id = v_uid and client_key = v_key) then
      update public.error_reports
      set count = greatest(count, v_count),
          happened_at = greatest(happened_at, v_at),
          reported_at = now()
      where user_id = v_uid and client_key = v_key;
      v_saved := v_saved + 1;
    elsif v_new_today < 50 and v_total < 20000 then
      insert into public.error_reports
        (user_id, client_key, happened_at, app_version, platform, source, message, count, before_sign_in, device)
      values (
        v_uid,
        v_key,
        v_at,
        left(coalesce(nullif(btrim(v_entry ->> 'version'), ''), 'unknown'), 20),
        v_platform,
        left(coalesce(nullif(btrim(v_entry ->> 'source'), ''), 'unknown'), 40),
        v_message,
        v_count,
        coalesce((v_entry ->> 'before_sign_in') = 'true', false),
        left(nullif(btrim(v_entry ->> 'device'), ''), 300)
      );
      v_new_today := v_new_today + 1;
      v_total := v_total + 1;
      v_saved := v_saved + 1;
    end if;
  end loop;
  return v_saved;
end;
$$;

revoke execute on function public.report_errors(jsonb) from public, anon;
grant execute on function public.report_errors(jsonb) to authenticated;
