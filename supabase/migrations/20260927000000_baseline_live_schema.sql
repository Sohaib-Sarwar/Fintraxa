-- Fintraxa — baseline schema, reconciled against the live project.
--
-- WHY THIS FILE EXISTS
--
-- Before v1 the repository and the live database disagreed in ways that would
-- have broken anyone rebuilding from source:
--
--   * `stock_transactions.fee` existed live but in no migration. The app reads
--     and writes it, so a rebuilt database failed every trade with PGRST204.
--   * `stock_transactions.quantity` was INTEGER in the migration but numeric
--     live. The app books fractional shares (Math.round(x * 100) / 100), which
--     the INTEGER column would have rejected.
--   * `mutual_fund_transactions.offer_price` / `.repurchase_price` were in the
--     migration and not live. Nothing reads them; they are dropped here.
--   * Four tables — user_profiles, feature_flags, admin_audit_log,
--     deletion_log — and nine functions existed only live, unversioned and
--     unreviewable, including the signup trigger and the whole admin surface.
--   * A migration creating `funds`, `stocks` and `sync_metadata` had never been
--     applied. Its only consumer was dead code; both are deleted.
--
-- This file is now the source of truth. It is idempotent, so it can be applied
-- to the existing project without disturbing it, and it reproduces that project
-- from empty.

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp" with schema extensions;

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.categories (
  id          uuid primary key default extensions.uuid_generate_v4(),
  -- Nullable so a global default row is expressible. In practice the RLS
  -- SELECT policy is `auth.uid() = user_id`, so a NULL-owner row is invisible
  -- to everyone; defaults are seeded per user by the app instead.
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  -- 'income' / 'expense' — note this is NOT the transactions vocabulary.
  type        text not null check (type in ('income', 'expense')),
  icon        text not null default 'Category',
  is_default  boolean default false,
  created_at  timestamptz default now(),
  -- The app seeds defaults with upsert(..., { onConflict: 'user_id,name' }).
  -- Without this constraint that call fails with 42P10 and the user ends up
  -- with no categories at all.
  constraint categories_user_id_name_unique unique (user_id, name)
);

create table if not exists public.income_expense_transactions (
  id           uuid primary key default extensions.uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  amount       numeric not null check (amount > 0),
  -- 'credit' / 'debit' — the money direction, distinct from a category's
  -- 'income' / 'expense'. Two vocabularies, deliberately, for two columns.
  type         text not null check (type in ('credit', 'debit')),
  category_id  uuid references public.categories(id),
  date         date not null default current_date,
  notes        text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists public.mutual_fund_transactions (
  id                uuid primary key default extensions.uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  -- The MUFAP slug, not the display name: a fund rename upstream must not
  -- orphan the holding.
  fund_id           text not null,
  fund_name         text not null,
  fund_category     text,
  nav               numeric not null,
  investment_amount numeric not null check (investment_amount > 0),
  units             numeric not null,
  type              text not null default 'buy' check (type in ('buy', 'sell')),
  date              date not null default current_date,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create table if not exists public.stock_transactions (
  id            uuid primary key default extensions.uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  symbol        text not null,
  company_name  text,
  price         numeric not null check (price > 0),
  -- numeric, not integer: the UI books fractional share counts.
  quantity      numeric not null check (quantity > 0),
  type          text not null check (type in ('buy', 'sell')),
  date          date not null default current_date,
  notes         text,
  -- Brokerage. Subtracted from free cash alongside the trade value.
  fee           numeric default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table if not exists public.favorite_stocks (
  id          uuid primary key default extensions.uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null,
  created_at  timestamptz default now(),
  -- The star is a toggle; without this a double-tap inserts twice.
  constraint favorite_stocks_user_id_symbol_key unique (user_id, symbol)
);

create table if not exists public.user_preferences (
  id          uuid primary key default extensions.uuid_generate_v4(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  currency    text not null default 'PKR',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Written by the log_deletion trigger, never by the client.
create table if not exists public.deletion_log (
  id           uuid primary key default extensions.uuid_generate_v4(),
  user_id      uuid not null,
  table_name   text not null,
  record_id    uuid not null,
  record_data  jsonb not null,
  deleted_at   timestamptz default now()
);

create table if not exists public.user_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  role             text not null default 'user' check (role in ('user', 'admin')),
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  plan_updated_at  timestamptz,
  plan_expires_at  timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create table if not exists public.feature_flags (
  id             uuid primary key default extensions.uuid_generate_v4(),
  key            text not null unique,
  name           text not null,
  description    text,
  enabled        boolean not null default true,
  required_plan  text not null default 'free' check (required_plan in ('free', 'pro')),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table if not exists public.admin_audit_log (
  id              uuid primary key default extensions.uuid_generate_v4(),
  admin_id        uuid not null references auth.users(id),
  action          text not null,
  target_user_id  uuid references auth.users(id),
  details         jsonb,
  ip_address      inet,
  created_at      timestamptz default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
-- Composite (user_id, …) rather than user_id alone: every query in the app is
-- scoped to one user and then narrowed by date or symbol.

create index if not exists idx_cat_user             on public.categories (user_id);
create index if not exists idx_cat_type             on public.categories (type);
create index if not exists idx_ie_user_date         on public.income_expense_transactions (user_id, date);
create index if not exists idx_ie_category          on public.income_expense_transactions (category_id);
create index if not exists idx_ie_type              on public.income_expense_transactions (type);
create index if not exists idx_mf_user_fund         on public.mutual_fund_transactions (user_id, fund_id);
create index if not exists idx_mf_date              on public.mutual_fund_transactions (date);
create index if not exists idx_st_user_symbol       on public.stock_transactions (user_id, symbol);
create index if not exists idx_st_date              on public.stock_transactions (date);
create index if not exists idx_st_type              on public.stock_transactions (type);
create index if not exists idx_fav_user             on public.favorite_stocks (user_id);
create index if not exists idx_deletion_log_user    on public.deletion_log (user_id);
create index if not exists idx_deletion_log_table   on public.deletion_log (table_name);
create index if not exists idx_user_profiles_role   on public.user_profiles (role);
create index if not exists idx_user_profiles_plan   on public.user_profiles (plan);
create index if not exists idx_admin_audit_admin    on public.admin_audit_log (admin_id);
create index if not exists idx_admin_audit_target   on public.admin_audit_log (target_user_id);
create index if not exists idx_admin_audit_action   on public.admin_audit_log (action);
create index if not exists idx_admin_audit_date     on public.admin_audit_log (created_at desc);

-- ─── Functions ───────────────────────────────────────────────────────────────
--
-- Every function pins `search_path`. Without it a SECURITY DEFINER function can
-- be steered to resolve an unqualified table name against an attacker-supplied
-- schema and run it with the definer's rights.

create or replace function public.update_updated_at_column()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.log_deletion()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into deletion_log (user_id, table_name, record_id, record_data)
  values (old.user_id, tg_table_name, old.id, to_jsonb(old));
  return old;
end;
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.user_profiles (id, role, plan)
  values (new.id, 'user', 'free')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.get_user_plan()
returns text language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((select plan from user_profiles where id = auth.uid()), 'free');
$$;

create or replace function public.admin_set_user_role(target_id uuid, new_role text)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin access required';
  end if;
  if new_role not in ('user', 'admin') then
    raise exception 'Invalid role: must be user or admin';
  end if;

  update user_profiles set role = new_role, updated_at = now() where id = target_id;

  insert into admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'role_change', target_id, jsonb_build_object('new_role', new_role));
end;
$$;

create or replace function public.admin_set_user_plan(
  target_id uuid, new_plan text, expires_at timestamptz default null)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin access required';
  end if;
  if new_plan not in ('free', 'pro') then
    raise exception 'Invalid plan: must be free or pro';
  end if;

  update user_profiles
     set plan = new_plan, plan_updated_at = now(),
         plan_expires_at = expires_at, updated_at = now()
   where id = target_id;

  insert into admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(), 'plan_change', target_id,
          jsonb_build_object('new_plan', new_plan, 'expires_at', expires_at));
end;
$$;

create or replace function public.admin_toggle_user_active(target_id uuid, active boolean)
returns void language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin access required';
  end if;

  update user_profiles set is_active = active, updated_at = now() where id = target_id;

  insert into admin_audit_log (admin_id, action, target_user_id, details)
  values (auth.uid(),
          case when active then 'user_activated' else 'user_deactivated' end,
          target_id, jsonb_build_object('is_active', active));
end;
$$;

create or replace function public.admin_get_users()
returns table (
  id uuid, email text, full_name text, role text, plan text,
  plan_expires_at timestamptz, is_active boolean, created_at timestamptz,
  last_sign_in_at timestamptz, ie_count bigint, mf_count bigint, st_count bigint)
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin access required';
  end if;

  return query
  select u.id, u.email::text,
         (u.raw_user_meta_data->>'full_name')::text,
         coalesce(p.role, 'user'), coalesce(p.plan, 'free'),
         p.plan_expires_at, coalesce(p.is_active, true),
         u.created_at, u.last_sign_in_at,
         (select count(*) from income_expense_transactions where user_id = u.id),
         (select count(*) from mutual_fund_transactions   where user_id = u.id),
         (select count(*) from stock_transactions         where user_id = u.id)
    from auth.users u
    left join user_profiles p on p.id = u.id
   order by u.created_at desc;
end;
$$;

create or replace function public.admin_get_audit_log(
  p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid, action text, details jsonb, created_at timestamptz,
  admin_email text, target_email text)
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: admin access required';
  end if;

  return query
  select a.id, a.action, a.details, a.created_at,
         (select u.email from auth.users u where u.id = a.admin_id)::text,
         (select u.email from auth.users u where u.id = a.target_user_id)::text
    from admin_audit_log a
   order by a.created_at desc
   limit p_limit offset p_offset;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────
--
-- Trigger functions: Postgres does not check EXECUTE when firing a trigger, so
-- revoking here removes the /rest/v1/rpc/<name> route without breaking the
-- trigger. log_deletion() in particular is a forgery primitive if callable.
revoke execute on function public.log_deletion()             from anon, authenticated, public;
revoke execute on function public.handle_new_user()          from anon, authenticated, public;
revoke execute on function public.update_updated_at_column() from anon, authenticated, public;

-- Admin surface: each already begins with an is_admin() check, so authenticated
-- keeps EXECUTE — that check, not the grant, separates an admin from a user.
-- Signed-out callers have no business here at all.
revoke execute on function public.admin_set_user_plan(uuid, text, timestamptz) from anon, public;
revoke execute on function public.admin_set_user_role(uuid, text)              from anon, public;
revoke execute on function public.admin_toggle_user_active(uuid, boolean)      from anon, public;
revoke execute on function public.admin_get_users()                            from anon, public;
revoke execute on function public.admin_get_audit_log(integer, integer)        from anon, public;
revoke execute on function public.get_user_plan()                              from anon, public;

-- is_admin() deliberately keeps its anon grant: RLS policy expressions
-- reference it and are evaluated as the querying role, so revoking it makes
-- those tables raise "permission denied for function" instead of returning no
-- rows. It reports only on auth.uid(), so for anon it returns false.

-- ─── Triggers ────────────────────────────────────────────────────────────────

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists update_ie_updated_at on public.income_expense_transactions;
create trigger update_ie_updated_at before update on public.income_expense_transactions
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_mf_updated_at on public.mutual_fund_transactions;
create trigger update_mf_updated_at before update on public.mutual_fund_transactions
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_st_updated_at on public.stock_transactions;
create trigger update_st_updated_at before update on public.stock_transactions
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_user_profiles_updated_at on public.user_profiles;
create trigger update_user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_feature_flags_updated_at on public.feature_flags;
create trigger update_feature_flags_updated_at before update on public.feature_flags
  for each row execute function public.update_updated_at_column();

drop trigger if exists log_ie_deletion on public.income_expense_transactions;
create trigger log_ie_deletion before delete on public.income_expense_transactions
  for each row execute function public.log_deletion();

drop trigger if exists log_mf_deletion on public.mutual_fund_transactions;
create trigger log_mf_deletion before delete on public.mutual_fund_transactions
  for each row execute function public.log_deletion();

drop trigger if exists log_st_deletion on public.stock_transactions;
create trigger log_st_deletion before delete on public.stock_transactions
  for each row execute function public.log_deletion();

-- ─── Row Level Security ──────────────────────────────────────────────────────
--
-- RLS is the whole authorisation model: the client ships a publishable key and
-- every rule below runs on the server.
--
-- Each UPDATE policy carries BOTH `using` and `with check`. `using` tests the
-- row as it was; `with check` tests it as it will be. With only the first, a
-- user could update a row they own and reassign user_id to somebody else in the
-- same statement.

alter table public.categories                  enable row level security;
alter table public.income_expense_transactions enable row level security;
alter table public.mutual_fund_transactions    enable row level security;
alter table public.stock_transactions          enable row level security;
alter table public.favorite_stocks             enable row level security;
alter table public.user_preferences            enable row level security;
alter table public.deletion_log                enable row level security;
alter table public.user_profiles               enable row level security;
alter table public.feature_flags               enable row level security;
alter table public.admin_audit_log             enable row level security;

-- Drop every existing policy on the managed tables first.
--
-- The original project named its policies in prose ("Users can view own
-- categories"). Recreating under new names without this would leave both sets
-- in place; permissive policies are OR-ed, so the old ones would keep granting
-- access and this file would no longer describe what the database does.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'categories', 'income_expense_transactions', 'mutual_fund_transactions',
         'stock_transactions', 'favorite_stocks', 'user_preferences',
         'deletion_log', 'user_profiles', 'feature_flags', 'admin_audit_log')
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

do $$
declare
  t text;
  owned text[] := array[
    'categories', 'income_expense_transactions', 'mutual_fund_transactions',
    'stock_transactions', 'favorite_stocks', 'user_preferences'
  ];
begin
  -- The six user-owned tables share one shape, so they are generated rather
  -- than repeated twenty-four times.
  foreach t in array owned loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format(
      'create policy "own_select" on public.%I for select to authenticated
         using (auth.uid() = user_id)', t);

    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format(
      'create policy "own_insert" on public.%I for insert to authenticated
         with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format(
      'create policy "own_update" on public.%I for update to authenticated
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);

    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format(
      'create policy "own_delete" on public.%I for delete to authenticated
         using (auth.uid() = user_id)', t);

    execute format('drop policy if exists "admin_select_all" on public.%I', t);
    execute format(
      'create policy "admin_select_all" on public.%I for select to authenticated
         using (public.is_admin())', t);
  end loop;
end;
$$;

-- deletion_log: readable by its owner, written only by the trigger (which runs
-- as definer and bypasses RLS). No INSERT policy, deliberately — a client must
-- not be able to forge an audit row.
drop policy if exists "own_select" on public.deletion_log;
create policy "own_select" on public.deletion_log for select to authenticated
  using (auth.uid() = user_id);

-- user_profiles: a user sees and edits their own; an admin sees and edits all.
drop policy if exists "own_select" on public.user_profiles;
create policy "own_select" on public.user_profiles for select to authenticated
  using (auth.uid() = id);

drop policy if exists "own_insert" on public.user_profiles;
create policy "own_insert" on public.user_profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "own_update" on public.user_profiles;
create policy "own_update" on public.user_profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "admin_select_all" on public.user_profiles;
create policy "admin_select_all" on public.user_profiles for select to authenticated
  using (public.is_admin());

drop policy if exists "admin_update_all" on public.user_profiles;
create policy "admin_update_all" on public.user_profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- feature_flags: signed-in readers only. Flag keys name unreleased
-- functionality, which is a roadmap and should need a login.
drop policy if exists "authenticated_read" on public.feature_flags;
create policy "authenticated_read" on public.feature_flags for select to authenticated
  using (true);

drop policy if exists "admin_manage" on public.feature_flags;
create policy "admin_manage" on public.feature_flags for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- admin_audit_log: admins read; rows are written by the SECURITY DEFINER
-- admin_* functions, which bypass RLS.
drop policy if exists "admin_select" on public.admin_audit_log;
create policy "admin_select" on public.admin_audit_log for select to authenticated
  using (public.is_admin());
