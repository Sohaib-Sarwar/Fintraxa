-- Mobile app (docs/mobile/MOBILE_APP_PLAN.md §9.4), approved by the owner 2026-11-13.
-- Additive only: the web app and every installed APK keep working (plan §12.4).
--
-- 1. user_preferences: what the user tracks (drives which tabs/cards the app shows) and the
--    auto-lock delay for fingerprint unlock. Defaults keep today's behaviour: everything on, 5 min.
-- 2. app_releases: the APK release catalogue. The app reads it to show "a new version is available"
--    and, when its build is older than min_supported_code, a blocking update screen.
--    Readable by signed-in users; written only by the owner (SQL / service role).
-- In-app feedback (app_feedback) was declined by the owner; not created.

alter table public.user_preferences
  add column if not exists tracks jsonb not null default '{"spending": true, "funds": true, "stocks": true}'::jsonb,
  add column if not exists auto_lock_minutes integer not null default 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_tracks_shape') then
    alter table public.user_preferences add constraint user_preferences_tracks_shape check (
      jsonb_typeof(tracks) = 'object'
      and jsonb_typeof(coalesce(tracks -> 'spending', 'true')) = 'boolean'
      and jsonb_typeof(coalesce(tracks -> 'funds', 'true')) = 'boolean'
      and jsonb_typeof(coalesce(tracks -> 'stocks', 'true')) = 'boolean'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_preferences_auto_lock_range') then
    -- 0 = lock as soon as the app leaves the screen; at most 60 minutes.
    alter table public.user_preferences add constraint user_preferences_auto_lock_range
      check (auto_lock_minutes between 0 and 60);
  end if;
end $$;

create table if not exists public.app_releases (
  version_code       integer primary key check (version_code > 0),
  version_name       text not null check (length(version_name) between 1 and 32),
  channel            text not null default 'production' check (channel in ('preview', 'production')),
  released_at        timestamptz not null default now(),
  apk_url            text not null check (apk_url ~ '^https://'),
  notes              text not null default '',
  min_supported_code integer not null default 1 check (min_supported_code > 0),
  migrations         text[] not null default '{}',
  created_at         timestamptz not null default now()
);

comment on table public.app_releases is
  'Sideloaded Android APK releases. Newest row per channel drives the in-app update banner; '
  'min_supported_code forces an update for older builds. Never delete rows (rollback = new row / lower min).';

create index if not exists app_releases_channel_released_idx
  on public.app_releases (channel, released_at desc);

alter table public.app_releases enable row level security;

drop policy if exists app_releases_read on public.app_releases;
create policy app_releases_read on public.app_releases
  for select to authenticated using (true);

-- Supabase's default privileges grant ALL (incl. TRUNCATE, which RLS does not cover) to anon and
-- authenticated on new tables: take everything back, then give signed-in users read only.
revoke all on public.app_releases from anon, authenticated;
grant select on public.app_releases to authenticated;
grant all on public.app_releases to service_role;
