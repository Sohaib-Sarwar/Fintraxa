-- Profiles, avatars and sign-in by username.
--
-- profiles: what the user edits about themselves (username, name, date of
--   birth) and the tax facts that drive defaults: filer status (Active
--   Taxpayer List: dividends 15% vs 30%, bank profit 20% vs 40%) and zakat
--   exemption (CZ-50 declaration filed, so no zakat on savings or dividends).
-- avatars: private bucket, one folder per user; files are read with signed URLs.
-- username sign-in: Supabase Auth signs in by email, so the username-login
--   Edge Function looks the email up server-side (it is never sent to the
--   browser) and signs in for the user. Failed attempts are throttled per
--   username: five failures in 15 minutes lock that username briefly. The
--   lookup and the attempt log are reachable only with the service role.

-- ── profiles ────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  user_id        uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  username       text check (username ~ '^[a-z0-9][a-z0-9._]{1,22}[a-z0-9]$'),          -- lowercase, 3–24 chars
  full_name      text check (full_name is null or char_length(btrim(full_name)) between 1 and 80),
  date_of_birth  date check (date_of_birth is null or date_of_birth between '1900-01-01' and '2100-01-01'),
  filer_status   text not null default 'filer' check (filer_status in ('filer', 'non_filer')),
  zakat_exempt   boolean not null default false,
  avatar_path    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_avatar_path_check check (avatar_path is null or (char_length(avatar_path) <= 200 and avatar_path like user_id::text || '/%'))
);
create unique index if not exists profiles_username_key on public.profiles (username) where username is not null;

comment on table public.profiles is 'User-editable profile: username, name, date of birth, filer status, zakat exemption, avatar. Own row only (RLS).';

alter table public.profiles enable row level security;
create policy "Profiles: read own" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Profiles: add own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Profiles: edit own" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

/** Is this username free? (for the form; the unique index is the real guard). Signed-in users only. */
create or replace function public.username_available(p_username text)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select not exists (select 1 from public.profiles where username = lower(btrim(p_username)) and user_id <> auth.uid());
$$;
revoke execute on function public.username_available(text) from anon, public;
grant execute on function public.username_available(text) to authenticated;

-- ── avatars bucket ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "Avatars: read own" on storage.objects
  for select to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: add own" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: replace own" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Avatars: delete own" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── username sign-in (service role only) ────────────────────────────────────
create schema if not exists fx_private;
revoke all on schema fx_private from public, anon, authenticated;

create table if not exists fx_private.login_attempts (
  id           bigint generated always as identity primary key,
  username     text not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_username_time_idx on fx_private.login_attempts (username, attempted_at desc);

/**
 * For the username-login Edge Function: the account behind a username and
 * whether it is locked. Same shape whether or not the username exists, so the
 * function can answer every failure identically.
 */
create or replace function public.username_login_check(p_username text)
returns jsonb language sql security definer stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'locked', (select count(*) from fx_private.login_attempts a
               where a.username = lower(btrim(p_username)) and not a.succeeded and a.attempted_at > now() - interval '15 minutes') >= 5,
    'email', (select u.email::text from public.profiles p join auth.users u on u.id = p.user_id where p.username = lower(btrim(p_username)))
  );
$$;

/** Log an attempt; a success clears that username's failures; rows older than a day are pruned. */
create or replace function public.username_login_record(p_username text, p_ok boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_ok then
    delete from fx_private.login_attempts where username = lower(btrim(p_username)) and not succeeded;
  end if;
  insert into fx_private.login_attempts (username, succeeded) values (lower(btrim(p_username)), p_ok);
  delete from fx_private.login_attempts where attempted_at < now() - interval '1 day';
end;
$$;

revoke execute on function public.username_login_check(text) from public, anon, authenticated;
revoke execute on function public.username_login_record(text, boolean) from public, anon, authenticated;
grant execute on function public.username_login_check(text) to service_role;
grant execute on function public.username_login_record(text, boolean) to service_role;
