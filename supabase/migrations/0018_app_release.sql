-- 0018: which LCSign versions are current (src/lib/appRelease.ts).
--
-- One row per installed app. The app reads its row at start-up - before
-- anyone logs in, so the anon role can read this table (and only this one):
--   - older than min_version: "Update LCSign" instead of the login screen
--   - older than latest_version: "Update available" in Appearance > About
-- The desktop app's main process also reads update_feed_url: where it
-- downloads updates from by itself (electron/main.js). Null = no automatic
-- updates.
--
-- Nobody edits this from the app. Whoever looks after LCSign changes the row
-- in the Supabase Table Editor when they publish a new build:
--   1. Build, and put the files where download_url / update_feed_url point.
--   2. Set latest_version to the new version.
--   3. Raise min_version only when old copies must stop (a server change
--      they can't handle) - and only once the new build is downloadable.
--
-- Run after 0017_call_bookings.sql.

create table public.app_release (
  platform text primary key check (platform in ('desktop', 'android')),
  latest_version text not null check (latest_version ~ '^\d+\.\d+\.\d+$'),
  min_version text not null check (min_version ~ '^\d+\.\d+\.\d+$'),
  -- A page or file people open to install it by hand (https only).
  download_url text check (download_url ~ '^https://'),
  -- Desktop only: the folder with latest.yml + the installer (https only).
  update_feed_url text check (update_feed_url ~ '^https://'),
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.app_release enable row level security;

create policy "app_release: anyone can read"
  on public.app_release for select
  to anon, authenticated
  using (true);

-- Read-only for the app. No insert/update/delete policy or grant: changes
-- come from the dashboard (postgres / service role), which bypasses RLS.
grant usage on schema public to anon;
grant select on public.app_release to anon, authenticated;

create or replace function public.app_release_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_release_touch
  before update on public.app_release
  for each row execute function public.app_release_touch();

insert into public.app_release (platform, latest_version, min_version)
values ('desktop', '1.1.0', '1.0.0'), ('android', '1.1.0', '1.0.0');
