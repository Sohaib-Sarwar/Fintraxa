-- Mutual funds: statement import → staging → approval → append-only ledger.
--
-- Additive only. `mutual_fund_transactions` is not touched; its rows are
-- copied (not moved) into the ledger by the next migration.
--
-- Design notes
--   * Every money / unit / price column is `numeric`. Nothing is float.
--   * NULL means "not reported". 0 means "reported as zero". Never coerced.
--   * Clients get SELECT on their own rows and nothing else. Every write goes
--     through a SECURITY DEFINER function in the non-exposed `mf_private`
--     schema, reached through a thin SECURITY INVOKER wrapper in `public`
--     (so no definer function is directly callable over the Data API).
--   * The Edge Function (deterministic per-AMC parsers) writes import/staging rows with the service role.
--   * New tables are not auto-exposed to the Data API on this project
--     (Supabase change enforced 2026-10-30), hence the explicit GRANTs.
--   * Vocabulary columns are `text` + CHECK rather than enum types, so a new
--     value is one constraint swap instead of an `ALTER TYPE` dance.

create schema if not exists mf_private;
revoke all on schema mf_private from public, anon, authenticated;
grant usage on schema mf_private to authenticated, service_role;

-- ─── Reference data ──────────────────────────────────────────────────────────

create table if not exists public.mf_amcs (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name                  text not null,
  -- Lower-case POSIX regexes (word-bounded with \m \M) that identify the AMC
  -- in statement text or a fund name. Regex, not substring: 'abl' must not
  -- match "Stable Fund".
  match_patterns        text[] not null default '{}',
  -- Statement conventions consulted by validation/reconciliation (see
  -- docs/mutual-funds/MUTUAL_FUND_STATEMENT_ANALYSIS.md §5).
  statement_profile     jsonb not null default '{}'::jsonb,
  cost_method           text not null default 'fifo' check (cost_method in ('fifo')),
  cost_method_evidence  text not null default 'industry_default'
                        check (cost_method_evidence in ('statement_stated', 'statement_consistent', 'industry_default')),
  cost_method_note      text,
  created_at            timestamptz not null default now()
);

create table if not exists public.mf_funds (
  id          uuid primary key default gen_random_uuid(),
  amc_id      uuid not null references public.mf_amcs(id),
  name        text not null,
  -- MUFAP slug: how the live price feed addresses the fund. Null until mapped.
  mufap_slug  text unique check (mufap_slug is null or mufap_slug ~ '^[a-z0-9-]+$'),
  category    text,
  currency    text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  created_at  timestamptz not null default now(),
  constraint mf_funds_amc_name_key unique (amc_id, name)
);

-- Statement spellings of a fund ("AMMF", "AL MEEZAN MUTUAL FUND (AMMF)").
create table if not exists public.mf_fund_aliases (
  amc_id      uuid not null references public.mf_amcs(id),
  alias_norm  text not null check (alias_norm = lower(alias_norm)),
  fund_id     uuid not null references public.mf_funds(id),
  source      text not null default 'system' check (source in ('system', 'user', 'mufap')),
  created_at  timestamptz not null default now(),
  primary key (amc_id, alias_norm)
);

-- ─── Accounts ────────────────────────────────────────────────────────────────

create table if not exists public.mf_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  amc_id              uuid not null references public.mf_amcs(id),
  -- sha256(user_id:amc_code:normalised account number), hex. The raw number
  -- is never stored. 'manual' for the per-AMC bucket of hand-entered trades.
  account_ref_hash    text not null check (account_ref_hash = 'manual' or account_ref_hash ~ '^[0-9a-f]{64}$'),
  account_ref_masked  text not null,
  label               text,
  created_at          timestamptz not null default now(),
  constraint mf_accounts_user_amc_ref_key unique (user_id, amc_id, account_ref_hash)
);
create index if not exists mf_accounts_user_idx on public.mf_accounts (user_id);

-- ─── Imports ─────────────────────────────────────────────────────────────────

create table if not exists public.mf_statement_imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  file_sha256      text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path     text not null,
  file_size_bytes  integer not null check (file_size_bytes > 0),
  -- Display-safe: the client sends a sanitised base name only.
  file_label       text,
  page_count       integer,
  amc_id           uuid references public.mf_amcs(id),
  account_id       uuid references public.mf_accounts(id),
  period_start     date,
  period_end       date,
  status           text not null default 'uploaded' check (status in (
                     'uploaded', 'parsing', 'redacting', 'extracting', 'validating',
                     'awaiting_approval', 'partially_approved', 'approved',
                     'rejected', 'failed', 'completed_with_warnings')),
  stage            text,
  progress         jsonb not null default '{}'::jsonb,
  parser_version   text,           -- which deterministic parser produced the rows
  error_category   text,
  error_message    text,          -- human-readable, never document text
  retryable        boolean,
  recovery_action  text,
  reconciliation   jsonb,
  summary          jsonb,
  attempts         integer not null default 0,
  lease_until      timestamptz,   -- processing lock; see the Edge Function
  correlation_id   uuid not null default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  -- The same PDF twice is the same import, however it arrives.
  constraint mf_statement_imports_user_file_key unique (user_id, file_sha256),
  constraint mf_statement_imports_period_chk check (period_end is null or period_start is null or period_end >= period_start)
);
create index if not exists mf_imports_user_created_idx on public.mf_statement_imports (user_id, created_at desc);

-- Redacted, row-rebuilt statement text: the evidence shown in review.
create table if not exists public.mf_import_lines (
  import_id  uuid not null references public.mf_statement_imports(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  line_id    text not null,
  page       integer not null,
  n          integer not null,
  text       text not null,
  primary key (import_id, line_id)
);

-- ─── Vocabulary ──────────────────────────────────────────────────────────────

create or replace function mf_private.entry_types()
returns text[] language sql immutable
set search_path = ''
as $$
  select array[
    'purchase', 'redemption', 'switch_in', 'switch_out', 'transfer_in', 'transfer_out',
    'dividend_cash', 'dividend_reinvest', 'bonus_units', 'capital_refund_units',
    'cgt_deduction', 'cgt_reversal', 'cgt_refund_cash', 'cgt_refund_reinvest',
    'zakat_deduction', 'wht_deduction', 'sales_load', 'fee_charge',
    'other_adjustment', 'unknown']::text[]
$$;

create or replace function mf_private.component_types()
returns text[] language sql immutable
set search_path = ''
as $$
  select array[
    'cgt', 'cgt_reversal', 'cgt_refund', 'zakat', 'wht',
    'front_load', 'back_load', 'load_tax', 'transaction_cost', 'charge',
    'other_deduction', 'other_credit']::text[]
$$;

-- Unit direction each event type must have. Enforced on the ledger.
create or replace function mf_private.unit_rule(p_type text)
returns text language sql immutable
set search_path = ''
as $$
  select case
    when p_type in ('purchase', 'switch_in', 'transfer_in', 'dividend_reinvest',
                    'bonus_units', 'capital_refund_units', 'cgt_refund_reinvest') then 'in'
    when p_type in ('redemption', 'switch_out', 'transfer_out') then 'out'
    when p_type in ('dividend_cash', 'cgt_deduction', 'cgt_reversal', 'cgt_refund_cash',
                    'zakat_deduction', 'wht_deduction', 'sales_load', 'fee_charge') then 'none'
    else 'any'
  end
$$;

-- ─── Staging ─────────────────────────────────────────────────────────────────

create table if not exists public.mf_staged_transactions (
  id                     uuid primary key default gen_random_uuid(),
  import_id              uuid not null references public.mf_statement_imports(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  source_key             text not null,            -- primary cited line id
  seq                    integer not null,         -- statement order
  line_ids               text[] not null,
  page                   integer,
  section_key            text,
  fund_name_printed      text,
  unit_class             text not null default '',
  fund_id                uuid references public.mf_funds(id),
  original_labels        text[] not null default '{}',
  original_label         text not null,
  entry_type             text not null check (entry_type = any (mf_private.entry_types())),
  trade_date             date,
  price_date             date,
  nav                    numeric,
  unit_delta             numeric,
  gross_amount           numeric check (gross_amount is null or gross_amount >= 0),
  net_amount             numeric check (net_amount is null or net_amount >= 0),
  cash_direction         text check (cash_direction in ('investor_pays', 'investor_receives', 'internal', 'none')),
  currency               text not null default 'PKR',
  external_ref           text,
  running_balance_units  numeric,
  components             jsonb not null default '[]'::jsonb,
  raw_extraction         jsonb not null,           -- parser output, verbatim (figures as printed)
  ai_values              jsonb,                    -- normalised values before any human edit
  user_edits             jsonb,                    -- {field: value} a person changed
  warnings               jsonb not null default '[]'::jsonb,
  missing_fields         text[] not null default '{}',
  evidence_ok            boolean not null default false,
  confidence             text,
  fingerprint            text,
  occurrence_index       integer,
  duplicate_status       text not null default 'unchecked' check (duplicate_status in (
                           'unchecked', 'new', 'exact_duplicate', 'probable_duplicate',
                           'same_date_different', 'ambiguous')),
  duplicate_of           uuid,
  duplicate_note         text,
  review_status          text not null default 'pending_review' check (review_status in (
                           'pending_review', 'approved', 'rejected', 'excluded', 'duplicate', 'requires_attention')),
  ledger_entry_id        uuid,
  reviewed_by            uuid,
  reviewed_at            timestamptz,
  review_note            text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Re-running a chunk cannot stage the same event twice.
  constraint mf_staged_import_source_key unique (import_id, source_key)
);
create index if not exists mf_staged_import_idx on public.mf_staged_transactions (import_id, seq);
create index if not exists mf_staged_user_idx on public.mf_staged_transactions (user_id);

-- ─── Ledger ──────────────────────────────────────────────────────────────────

create table if not exists public.mf_ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  account_id         uuid not null references public.mf_accounts(id),
  fund_id            uuid not null references public.mf_funds(id),
  unit_class         text not null default '',
  entry_type         text not null check (entry_type = any (mf_private.entry_types()) and entry_type <> 'unknown'),
  original_label     text,
  trade_date         date not null,
  price_date         date,
  seq                integer not null default 0,
  nav                numeric check (nav is null or nav > 0),
  unit_delta         numeric,
  gross_amount       numeric check (gross_amount is null or gross_amount >= 0),
  net_amount         numeric check (net_amount is null or net_amount >= 0),
  cash_direction     text not null check (cash_direction in ('investor_pays', 'investor_receives', 'internal', 'none')),
  currency           text not null default 'PKR' check (currency ~ '^[A-Z]{3}$'),
  external_ref       text,
  description        text,
  origin             text not null check (origin in ('statement', 'manual', 'legacy_migration', 'correction')),
  source_import_id   uuid references public.mf_statement_imports(id),
  source_staged_id   uuid unique references public.mf_staged_transactions(id),
  source_page        integer,
  legacy_txn_id      uuid unique,
  fingerprint        text,
  occurrence_index   integer,
  reverses_entry_id  uuid unique references public.mf_ledger_entries(id),
  approval_mode      text not null default 'manual' check (approval_mode in ('auto', 'manual', 'system')),
  approved_by        uuid,
  approved_at        timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  -- A reversal mirrors its target, so the unit rule applies to originals only.
  constraint mf_ledger_unit_direction_chk check (
    reverses_entry_id is not null
    or (mf_private.unit_rule(entry_type) = 'in'   and unit_delta > 0)
    or (mf_private.unit_rule(entry_type) = 'out'  and unit_delta < 0)
    or (mf_private.unit_rule(entry_type) = 'none' and coalesce(unit_delta, 0) = 0)
    or  mf_private.unit_rule(entry_type) = 'any'),
  -- The idempotency key of a statement event: same position, same
  -- fingerprint, same occurrence. NULL fingerprints (manual, reversals) are
  -- distinct and never collide.
  constraint mf_ledger_fingerprint_key unique (user_id, account_id, fund_id, unit_class, fingerprint, occurrence_index)
);
create index if not exists mf_ledger_user_position_idx on public.mf_ledger_entries (user_id, fund_id, account_id, trade_date, seq);
create index if not exists mf_ledger_position_date_idx on public.mf_ledger_entries (account_id, fund_id, unit_class, trade_date);
create index if not exists mf_ledger_import_idx on public.mf_ledger_entries (source_import_id);

create table if not exists public.mf_ledger_components (
  id               uuid primary key default gen_random_uuid(),
  entry_id         uuid not null references public.mf_ledger_entries(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  component_type   text not null check (component_type = any (mf_private.component_types())),
  amount           numeric not null check (amount >= 0),
  original_label   text,
  -- A CGT reversal/refund pointing at the deduction it reverses, when the
  -- statement makes that link. Unlinked adjustments are allowed.
  linked_entry_id  uuid references public.mf_ledger_entries(id),
  created_at       timestamptz not null default now()
);
create index if not exists mf_components_entry_idx on public.mf_ledger_components (entry_id);
create index if not exists mf_components_user_idx on public.mf_ledger_components (user_id);

-- Price observations. Market-wide rows (user_id null) are visible to every
-- signed-in user; statement rows reveal a holding, so only to their owner.
create table if not exists public.mf_nav_history (
  id           bigint generated always as identity primary key,
  fund_id      uuid not null references public.mf_funds(id),
  user_id      uuid references auth.users(id) on delete cascade,
  nav_date     date not null,
  price        numeric not null check (price > 0),
  price_kind   text not null default 'nav' check (price_kind in ('nav', 'repurchase', 'offer')),
  source       text not null check (source in ('statement', 'mufap', 'manual')),
  source_ref   text,
  verified     boolean not null default false,
  imported_at  timestamptz not null default now()
);
-- Insert-only; a correction is a new row. Re-observing the same value is a no-op.
create unique index if not exists mf_nav_history_obs_key
  on public.mf_nav_history (fund_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), nav_date, price_kind, source, price);
create index if not exists mf_nav_history_fund_date_idx on public.mf_nav_history (fund_id, nav_date desc);

create table if not exists public.mf_audit_log (
  id              bigint generated always as identity primary key,
  user_id         uuid not null,
  actor_id        uuid,
  action          text not null,
  entity          text not null,
  entity_id       uuid,
  details         jsonb,
  correlation_id  uuid,
  created_at      timestamptz not null default now()
);
create index if not exists mf_audit_user_idx on public.mf_audit_log (user_id, created_at desc);

create table if not exists public.mf_approval_requests (
  idempotency_key  uuid primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  import_id        uuid,
  result           jsonb not null,
  created_at       timestamptz not null default now()
);

-- ─── Append-only guards ──────────────────────────────────────────────────────
--
-- Clients have no UPDATE/DELETE grant on these tables anyway; this is the
-- second wall, so a future grant mistake still cannot rewrite history. The
-- owner (postgres) keeps the ability so `on delete cascade` from auth.users
-- and the QA purge still work.

create or replace function mf_private.forbid_mutation()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon', 'service_role') then
    raise exception '% is append-only', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['mf_ledger_entries', 'mf_ledger_components', 'mf_audit_log', 'mf_nav_history'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I
                    for each row execute function mf_private.forbid_mutation()', t || '_append_only', t);
  end loop;
end;
$$;

create or replace function mf_private.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mf_imports_touch on public.mf_statement_imports;
create trigger mf_imports_touch before update on public.mf_statement_imports
  for each row execute function mf_private.touch_updated_at();
drop trigger if exists mf_staged_touch on public.mf_staged_transactions;
create trigger mf_staged_touch before update on public.mf_staged_transactions
  for each row execute function mf_private.touch_updated_at();

-- ─── Grants + RLS ────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'mf_amcs', 'mf_funds', 'mf_fund_aliases', 'mf_accounts', 'mf_statement_imports',
    'mf_import_lines', 'mf_staged_transactions', 'mf_ledger_entries',
    'mf_ledger_components', 'mf_nav_history', 'mf_audit_log', 'mf_approval_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;
grant usage on all sequences in schema public to service_role;

-- Reference data: any signed-in user may read.
drop policy if exists "mf_ref_read" on public.mf_amcs;
create policy "mf_ref_read" on public.mf_amcs for select to authenticated using (true);
drop policy if exists "mf_ref_read" on public.mf_funds;
create policy "mf_ref_read" on public.mf_funds for select to authenticated using (true);
drop policy if exists "mf_ref_read" on public.mf_fund_aliases;
create policy "mf_ref_read" on public.mf_fund_aliases for select to authenticated using (true);

-- Owned data: the owner reads; nobody writes through the Data API.
do $$
declare t text;
begin
  foreach t in array array[
    'mf_accounts', 'mf_statement_imports', 'mf_import_lines',
    'mf_staged_transactions', 'mf_ledger_entries', 'mf_ledger_components',
    'mf_audit_log', 'mf_approval_requests'] loop
    execute format('drop policy if exists "mf_own_read" on public.%I', t);
    execute format('create policy "mf_own_read" on public.%I for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

drop policy if exists "mf_nav_read" on public.mf_nav_history;
create policy "mf_nav_read" on public.mf_nav_history for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function mf_private.slugify(p text)
returns text language sql immutable
set search_path = ''
as $$
  -- Mirrors src/lib/api.js `slugify`, which mirrors the market service.
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(p, 'other')), '[^a-z0-9]+', '-', 'g')), ''), 'other')
$$;

-- Canonical fingerprint of an economic event. Description is deliberately
-- excluded: two statements spell the same event differently.
create or replace function mf_private.fingerprint(
  p_account uuid, p_fund uuid, p_class text, p_date date, p_type text,
  p_units numeric, p_gross numeric, p_net numeric, p_nav numeric)
returns text language sql immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(concat_ws('|',
    p_account::text, p_fund::text, coalesce(p_class, ''), p_date::text, p_type,
    coalesce(trim_scale(round(p_units, 4))::text, ''),
    coalesce(trim_scale(round(p_gross, 2))::text, ''),
    coalesce(trim_scale(round(p_net, 2))::text, ''),
    coalesce(trim_scale(round(p_nav, 4))::text, '')), 'UTF8')), 'hex')
$$;

create or replace function mf_private.is_reversed(p_entry uuid)
returns boolean language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.mf_ledger_entries r where r.reverses_entry_id = p_entry)
$$;

create or replace function mf_private.audit(
  p_user uuid, p_action text, p_entity text, p_entity_id uuid, p_details jsonb, p_corr uuid default null)
returns void language sql
set search_path = ''
as $$
  insert into public.mf_audit_log (user_id, actor_id, action, entity, entity_id, details, correlation_id)
  values (p_user, auth.uid(), p_action, p_entity, p_entity_id, p_details, p_corr)
$$;

create or replace function mf_private.require_uid()
returns uuid language plpgsql stable
set search_path = ''
as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  return v;
end;
$$;

-- ─── Duplicate classification (service + internal) ───────────────────────────
--
-- Recomputes fingerprints and occurrence indexes for one import, then
-- classifies every still-open staged row against the ledger. Date narrows
-- the search; it never decides on its own.

create or replace function mf_private.classify_import(p_import uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_imp public.mf_statement_imports;
  v_result jsonb;
begin
  select * into v_imp from public.mf_statement_imports where id = p_import;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  if v_imp.account_id is null then
    raise exception 'Import has no account yet' using errcode = '22023';
  end if;

  with fp as (
    select s.id,
           mf_private.fingerprint(v_imp.account_id, s.fund_id, s.unit_class, s.trade_date, s.entry_type,
                                  s.unit_delta, s.gross_amount, s.net_amount, s.nav) as f
      from public.mf_staged_transactions s
     where s.import_id = p_import
  ), occ as (
    select fp.id, fp.f,
           row_number() over (partition by fp.f order by s.seq) as k
      from fp join public.mf_staged_transactions s on s.id = fp.id
  )
  update public.mf_staged_transactions s
     set fingerprint = occ.f, occurrence_index = occ.k
    from occ
   where s.id = occ.id;

  with cand as (
    select s.id,
      s.review_status,
      (select e.id from public.mf_ledger_entries e
        where e.user_id = s.user_id and e.account_id = v_imp.account_id
          and e.fund_id = s.fund_id and e.unit_class = s.unit_class
          and e.fingerprint = s.fingerprint and e.occurrence_index = s.occurrence_index
          and e.reverses_entry_id is null and not mf_private.is_reversed(e.id)
        limit 1) as exact_id,
      (select e.id from public.mf_ledger_entries e
        where s.external_ref is not null and e.user_id = s.user_id
          and e.account_id = v_imp.account_id and e.fund_id = s.fund_id
          and e.external_ref = s.external_ref and e.trade_date = s.trade_date
          and e.reverses_entry_id is null and not mf_private.is_reversed(e.id)
        limit 1) as ref_id,
      (select e.id from public.mf_ledger_entries e
        where e.user_id = s.user_id and e.account_id = v_imp.account_id
          and e.fund_id = s.fund_id and e.unit_class = s.unit_class
          and e.trade_date = s.trade_date and e.entry_type = s.entry_type
          and abs(coalesce(e.unit_delta, 0) - coalesce(s.unit_delta, 0)) <= 0.01
          and abs(coalesce(e.gross_amount, e.net_amount, 0) - coalesce(s.gross_amount, s.net_amount, 0)) <= 1
          and e.reverses_entry_id is null and not mf_private.is_reversed(e.id)
        limit 1) as near_id,
      (select e.id from public.mf_ledger_entries e
        where e.user_id = s.user_id and e.fund_id = s.fund_id
          and e.origin in ('manual', 'legacy_migration')
          and abs(e.trade_date - s.trade_date) <= 7
          and sign(coalesce(e.unit_delta, 0)) = sign(coalesce(s.unit_delta, 0))
          and abs(coalesce(e.gross_amount, 0) - coalesce(s.gross_amount, 0))
              <= greatest(1, 0.01 * coalesce(s.gross_amount, 0))
          and e.reverses_entry_id is null and not mf_private.is_reversed(e.id)
        limit 1) as manual_id,
      exists (select 1 from public.mf_ledger_entries e
        where e.user_id = s.user_id and e.account_id = v_imp.account_id
          and e.fund_id = s.fund_id and e.unit_class = s.unit_class
          and e.trade_date = s.trade_date
          and e.reverses_entry_id is null and not mf_private.is_reversed(e.id)) as same_date
    from public.mf_staged_transactions s
    where s.import_id = p_import
      and s.review_status in ('pending_review', 'requires_attention', 'duplicate')
      and s.fund_id is not null and s.trade_date is not null
  )
  update public.mf_staged_transactions s
     set duplicate_status = case
           when c.exact_id is not null then 'exact_duplicate'
           when c.ref_id is not null then 'probable_duplicate'
           when c.near_id is not null then 'probable_duplicate'
           when c.manual_id is not null then 'probable_duplicate'
           when c.same_date then 'same_date_different'
           else 'new' end,
         duplicate_of = coalesce(c.exact_id, c.ref_id, c.near_id, c.manual_id),
         duplicate_note = case
           when c.exact_id is not null then 'Already in your ledger (same fund, date, type, units and amounts).'
           when c.ref_id is not null then 'Same transaction reference as an existing entry, but the values differ.'
           when c.near_id is not null then 'Matches an existing entry on date and type within rounding.'
           when c.manual_id is not null then 'Close to a manually entered transaction within 7 days.'
           when c.same_date then 'Another transaction exists on this date; values differ, so it is kept.'
           else null end,
         review_status = case
           when c.exact_id is not null then 'duplicate'
           when c.review_status = 'duplicate' then 'pending_review'
           else c.review_status end
    from cand c
   where s.id = c.id;

  select jsonb_build_object(
           'total', count(*),
           'new', count(*) filter (where duplicate_status = 'new'),
           'exact_duplicate', count(*) filter (where duplicate_status = 'exact_duplicate'),
           'probable_duplicate', count(*) filter (where duplicate_status = 'probable_duplicate'),
           'same_date_different', count(*) filter (where duplicate_status = 'same_date_different'))
    into v_result
    from public.mf_staged_transactions where import_id = p_import;
  return v_result;
end;
$$;

-- ─── Approval ────────────────────────────────────────────────────────────────

create or replace function mf_private.refresh_import_status(p_import uuid)
returns text language plpgsql security definer
set search_path = ''
as $$
declare
  v_open int; v_approved int; v_total int; v_warn int; v_dupes int; v_status text;
begin
  select count(*) filter (where review_status in ('pending_review', 'requires_attention')),
         count(*) filter (where review_status = 'approved'),
         count(*),
         count(*) filter (where review_status = 'approved'
                          and exists (select 1 from jsonb_array_elements(warnings) w
                                       where w->>'severity' in ('warning', 'error'))),
         count(*) filter (where review_status = 'duplicate')
    into v_open, v_approved, v_total, v_warn, v_dupes
    from public.mf_staged_transactions where import_id = p_import;

  v_status := case
    when v_total = 0 then 'completed_with_warnings'
    when v_open > 0 and v_approved > 0 then 'partially_approved'
    when v_open > 0 then 'awaiting_approval'
    -- Everything already in the ledger (an overlapping re-upload) is a
    -- successful outcome, not a rejection.
    when v_approved = 0 and v_dupes > 0 then 'completed_with_warnings'
    when v_approved = 0 then 'rejected'
    when v_warn > 0 or v_dupes > 0 then 'completed_with_warnings'
    else 'approved' end;

  update public.mf_statement_imports
     set status = v_status,
         completed_at = case when v_open = 0 then coalesce(completed_at, now()) else null end
   where id = p_import
     and status not in ('failed', 'parsing', 'redacting', 'extracting', 'validating', 'uploaded');
  return v_status;
end;
$$;

create or replace function mf_private.approve_staged(
  p_import uuid, p_staged_ids uuid[], p_idempotency_key uuid, p_mode text default 'manual')
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  v_imp public.mf_statement_imports;
  v_prior jsonb;
  s public.mf_staged_transactions;
  v_entry uuid;
  v_approved uuid[] := '{}';
  v_skipped jsonb := '[]'::jsonb;
  v_comp jsonb;
  v_result jsonb;
begin
  if p_mode not in ('manual', 'auto') then
    raise exception 'Invalid approval mode' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if coalesce(array_length(p_staged_ids, 1), 0) = 0 then
    raise exception 'Nothing selected to approve' using errcode = '22023';
  end if;

  -- A retried request returns the original outcome instead of acting twice.
  select result into v_prior from public.mf_approval_requests
   where idempotency_key = p_idempotency_key and user_id = v_uid;
  if found then
    return v_prior || jsonb_build_object('replayed', true);
  end if;

  select * into v_imp from public.mf_statement_imports
   where id = p_import and user_id = v_uid
   for update;
  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;
  if v_imp.account_id is null then
    raise exception 'Import is not ready for approval' using errcode = '22023';
  end if;

  -- Serialise approvals per account: two concurrent requests cannot both
  -- decide the same event is new.
  perform pg_advisory_xact_lock(hashtextextended('mf:' || v_imp.account_id::text, 0));

  -- Re-classify under the lock so the check sees every committed approval.
  perform mf_private.classify_import(p_import);

  for s in
    select * from public.mf_staged_transactions
     where id = any (p_staged_ids) and import_id = p_import and user_id = v_uid
     order by seq
     for update
  loop
    if s.review_status = 'approved' then
      continue;
    end if;
    if s.review_status not in ('pending_review', 'requires_attention') then
      v_skipped := v_skipped || jsonb_build_object('id', s.id, 'reason', s.review_status);
      continue;
    end if;
    if s.duplicate_status = 'exact_duplicate' then
      update public.mf_staged_transactions set review_status = 'duplicate' where id = s.id;
      v_skipped := v_skipped || jsonb_build_object('id', s.id, 'reason', 'exact_duplicate');
      continue;
    end if;
    -- Auto approval never takes anything that needs a human.
    if p_mode = 'auto' and (s.review_status <> 'pending_review' or not s.evidence_ok
        or s.duplicate_status not in ('new', 'same_date_different')) then
      v_skipped := v_skipped || jsonb_build_object('id', s.id, 'reason', 'needs_review');
      continue;
    end if;
    if s.entry_type = 'unknown' then
      raise exception 'Classify the transaction on % before approving it', coalesce(s.trade_date::text, 'this row')
        using errcode = '22023';
    end if;
    if s.fund_id is null or s.trade_date is null then
      raise exception 'A transaction is missing its fund or date' using errcode = '22023';
    end if;
    if s.cash_direction is null then
      raise exception 'A transaction is missing its cash direction' using errcode = '22023';
    end if;

    insert into public.mf_ledger_entries (
      user_id, account_id, fund_id, unit_class, entry_type, original_label,
      trade_date, price_date, seq, nav, unit_delta, gross_amount, net_amount,
      cash_direction, currency, external_ref, description, origin,
      source_import_id, source_staged_id, source_page, fingerprint, occurrence_index,
      approval_mode, approved_by)
    values (
      v_uid, v_imp.account_id, s.fund_id, s.unit_class, s.entry_type, s.original_label,
      s.trade_date, s.price_date, s.seq, s.nav, s.unit_delta, s.gross_amount, s.net_amount,
      s.cash_direction, s.currency, s.external_ref, array_to_string(s.original_labels, ' / '), 'statement',
      p_import, s.id, s.page, s.fingerprint, s.occurrence_index,
      p_mode, v_uid)
    on conflict (user_id, account_id, fund_id, unit_class, fingerprint, occurrence_index) do nothing
    returning id into v_entry;

    if v_entry is null then
      -- Lost a race to an identical event: record it, do not write it twice.
      update public.mf_staged_transactions set review_status = 'duplicate', duplicate_status = 'exact_duplicate'
       where id = s.id;
      v_skipped := v_skipped || jsonb_build_object('id', s.id, 'reason', 'exact_duplicate');
      continue;
    end if;

    for v_comp in select * from jsonb_array_elements(s.components) loop
      insert into public.mf_ledger_components (entry_id, user_id, component_type, amount, original_label)
      values (v_entry, v_uid, v_comp->>'type', (v_comp->>'amount')::numeric, v_comp->>'label');
    end loop;

    if s.nav is not null and s.nav > 0 then
      insert into public.mf_nav_history (fund_id, user_id, nav_date, price, price_kind, source, source_ref, verified)
      values (s.fund_id, v_uid, coalesce(s.price_date, s.trade_date), s.nav, 'nav', 'statement',
              p_import::text, true)
      on conflict do nothing;
    end if;

    update public.mf_staged_transactions
       set review_status = 'approved', ledger_entry_id = v_entry,
           reviewed_by = v_uid, reviewed_at = now()
     where id = s.id;
    v_approved := v_approved || v_entry;
  end loop;

  perform mf_private.audit(v_uid, 'approve', 'mf_statement_imports', p_import,
    jsonb_build_object('mode', p_mode, 'approved', coalesce(array_length(v_approved, 1), 0),
                       'skipped', v_skipped), v_imp.correlation_id);

  v_result := jsonb_build_object(
    'import_id', p_import,
    'approved', coalesce(array_length(v_approved, 1), 0),
    'ledger_entry_ids', to_jsonb(v_approved),
    'skipped', v_skipped,
    'status', mf_private.refresh_import_status(p_import));

  insert into public.mf_approval_requests (idempotency_key, user_id, import_id, result)
  values (p_idempotency_key, v_uid, p_import, v_result);
  return v_result;
end;
$$;

-- ─── Review actions ──────────────────────────────────────────────────────────

create or replace function mf_private.edit_staged(p_staged uuid, p_edits jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  s public.mf_staged_transactions;
  k text;
  v_allowed text[] := array['entry_type', 'trade_date', 'price_date', 'nav', 'unit_delta',
                            'gross_amount', 'net_amount', 'cash_direction', 'fund_id', 'unit_class',
                            'external_ref', 'components'];
begin
  select * into s from public.mf_staged_transactions where id = p_staged and user_id = v_uid for update;
  if not found then
    raise exception 'Transaction not found' using errcode = 'P0002';
  end if;
  if s.review_status = 'approved' then
    raise exception 'An approved transaction cannot be edited; reverse it from the ledger instead'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_edits) <> 'object' then
    raise exception 'Edits must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p_edits) loop
    if not (k = any (v_allowed)) then
      raise exception 'Field % cannot be edited', k using errcode = '22023';
    end if;
  end loop;

  -- Keep the AI's values once, before the first human change.
  if s.ai_values is null then
    s.ai_values := jsonb_build_object(
      'entry_type', s.entry_type, 'trade_date', s.trade_date, 'price_date', s.price_date,
      'nav', s.nav, 'unit_delta', s.unit_delta, 'gross_amount', s.gross_amount,
      'net_amount', s.net_amount, 'cash_direction', s.cash_direction, 'fund_id', s.fund_id,
      'unit_class', s.unit_class, 'external_ref', s.external_ref, 'components', s.components);
  end if;

  update public.mf_staged_transactions t set
    entry_type     = coalesce(p_edits->>'entry_type', t.entry_type),
    trade_date     = case when p_edits ? 'trade_date' then (p_edits->>'trade_date')::date else t.trade_date end,
    price_date     = case when p_edits ? 'price_date' then (p_edits->>'price_date')::date else t.price_date end,
    nav            = case when p_edits ? 'nav' then (p_edits->>'nav')::numeric else t.nav end,
    unit_delta     = case when p_edits ? 'unit_delta' then (p_edits->>'unit_delta')::numeric else t.unit_delta end,
    gross_amount   = case when p_edits ? 'gross_amount' then (p_edits->>'gross_amount')::numeric else t.gross_amount end,
    net_amount     = case when p_edits ? 'net_amount' then (p_edits->>'net_amount')::numeric else t.net_amount end,
    cash_direction = coalesce(p_edits->>'cash_direction', t.cash_direction),
    fund_id        = case when p_edits ? 'fund_id' then (p_edits->>'fund_id')::uuid else t.fund_id end,
    unit_class     = coalesce(upper(p_edits->>'unit_class'), t.unit_class),
    external_ref   = case when p_edits ? 'external_ref' then p_edits->>'external_ref' else t.external_ref end,
    components     = coalesce(p_edits->'components', t.components),
    ai_values      = s.ai_values,
    user_edits     = coalesce(t.user_edits, '{}'::jsonb) || p_edits,
    evidence_ok    = true,   -- a person has now vouched for the values
    review_status  = case when t.review_status = 'duplicate' then 'pending_review' else t.review_status end,
    warnings       = t.warnings || jsonb_build_array(jsonb_build_object(
                       'code', 'EDITED', 'severity', 'info',
                       'message', 'Edited by you; original extraction kept for audit.'))
  where t.id = p_staged;

  perform mf_private.classify_import(s.import_id);
  perform mf_private.audit(v_uid, 'edit_staged', 'mf_staged_transactions', p_staged,
    jsonb_build_object('before', s.ai_values, 'edits', p_edits));
  return (select to_jsonb(t) from public.mf_staged_transactions t where t.id = p_staged);
end;
$$;

create or replace function mf_private.set_review_status(p_ids uuid[], p_status text, p_note text default null)
returns integer language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  v_n int;
  v_imports uuid[];
  i uuid;
begin
  if p_status not in ('pending_review', 'excluded', 'rejected') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  update public.mf_staged_transactions
     set review_status = p_status, review_note = p_note, reviewed_by = v_uid, reviewed_at = now()
   where id = any (p_ids) and user_id = v_uid and review_status <> 'approved';
  get diagnostics v_n = row_count;
  select array_agg(distinct import_id) into v_imports
    from public.mf_staged_transactions where id = any (p_ids) and user_id = v_uid;
  foreach i in array coalesce(v_imports, '{}') loop
    perform mf_private.refresh_import_status(i);
  end loop;
  perform mf_private.audit(v_uid, 'set_review_status', 'mf_staged_transactions', null,
    jsonb_build_object('ids', p_ids, 'status', p_status, 'note', p_note));
  return v_n;
end;
$$;

-- Corrections never edit history: they append a mirror entry that cancels
-- the original. The engine drops both.
create or replace function mf_private.reverse_entry(p_entry uuid, p_reason text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  e public.mf_ledger_entries;
  v_id uuid;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to reverse an entry' using errcode = '22023';
  end if;
  select * into e from public.mf_ledger_entries where id = p_entry and user_id = v_uid for update;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;
  if e.reverses_entry_id is not null then
    raise exception 'A reversal cannot itself be reversed' using errcode = '22023';
  end if;
  if mf_private.is_reversed(p_entry) then
    raise exception 'This entry is already reversed' using errcode = '22023';
  end if;
  insert into public.mf_ledger_entries (
    user_id, account_id, fund_id, unit_class, entry_type, original_label, trade_date, price_date,
    seq, nav, unit_delta, gross_amount, net_amount, cash_direction, currency, description,
    origin, reverses_entry_id, approval_mode, approved_by)
  values (
    v_uid, e.account_id, e.fund_id, e.unit_class, e.entry_type, e.original_label, e.trade_date, e.price_date,
    e.seq, e.nav, case when e.unit_delta is null then null else -e.unit_delta end,
    e.gross_amount, e.net_amount, e.cash_direction, e.currency, 'Reversal: ' || p_reason,
    'correction', p_entry, 'manual', v_uid)
  returning id into v_id;
  perform mf_private.audit(v_uid, 'reverse_entry', 'mf_ledger_entries', p_entry,
    jsonb_build_object('reversal_id', v_id, 'reason', p_reason));
  return v_id;
end;
$$;

create or replace function mf_private.ensure_amc(p_name text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_norm text := lower(coalesce(p_name, ''));
begin
  if v_norm = '' then
    raise exception 'AMC name required' using errcode = '22023';
  end if;
  select id into v_id from public.mf_amcs a
   where exists (select 1 from unnest(a.match_patterns) p where v_norm ~ p)
   order by a.code limit 1;
  if v_id is null then
    insert into public.mf_amcs (code, name, match_patterns)
    values (left(replace(mf_private.slugify(p_name), '-', '_'), 40), p_name,
            array['\m' || regexp_replace(v_norm, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M'])
    on conflict (code) do update set name = excluded.name
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function mf_private.ensure_fund(p_amc uuid, p_name text, p_slug text, p_category text)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_slug is not null then
    select id into v_id from public.mf_funds where mufap_slug = p_slug;
    if found then return v_id; end if;
  end if;
  select id into v_id from public.mf_funds where amc_id = p_amc and lower(name) = lower(p_name);
  if found then
    if p_slug is not null then
      update public.mf_funds set mufap_slug = p_slug where id = v_id and mufap_slug is null;
    end if;
    return v_id;
  end if;
  insert into public.mf_funds (amc_id, name, mufap_slug, category)
  values (p_amc, p_name, p_slug, p_category)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function mf_private.manual_account(p_user uuid, p_amc uuid)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.mf_accounts (user_id, amc_id, account_ref_hash, account_ref_masked, label)
  values (p_user, p_amc, 'manual', 'Manual', 'Manual entries')
  on conflict (user_id, amc_id, account_ref_hash) do nothing;
  select id into v_id from public.mf_accounts
   where user_id = p_user and amc_id = p_amc and account_ref_hash = 'manual';
  return v_id;
end;
$$;

-- Hand-entered purchase/redemption (the "Add Fund" screen).
create or replace function mf_private.record_manual_entry(
  p_fund jsonb, p_entry_type text, p_trade_date date, p_gross numeric,
  p_nav numeric, p_units numeric, p_idempotency_key uuid)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  v_amc uuid; v_fund uuid; v_acct uuid; v_id uuid; v_prior jsonb;
begin
  if p_entry_type not in ('purchase', 'redemption') then
    raise exception 'Only purchases and redemptions can be entered by hand' using errcode = '22023';
  end if;
  if p_gross is null or p_gross <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;
  if p_nav is null or p_nav <= 0 then
    raise exception 'Price must be greater than zero' using errcode = '22023';
  end if;
  if p_units is null or p_units <= 0 then
    raise exception 'Units must be greater than zero' using errcode = '22023';
  end if;
  if p_trade_date is null or p_trade_date > current_date then
    raise exception 'Date cannot be in the future' using errcode = '22023';
  end if;
  if coalesce(p_fund->>'fund_name', '') = '' or coalesce(p_fund->>'amc', '') = '' then
    raise exception 'Fund name and AMC are required' using errcode = '22023';
  end if;
  if p_idempotency_key is not null then
    select result into v_prior from public.mf_approval_requests
     where idempotency_key = p_idempotency_key and user_id = v_uid;
    if found then return (v_prior->>'entry_id')::uuid; end if;
  end if;

  v_amc := mf_private.ensure_amc(p_fund->>'amc');
  v_fund := mf_private.ensure_fund(v_amc, p_fund->>'fund_name',
              nullif(mf_private.slugify(coalesce(p_fund->>'slug', p_fund->>'fund_name')), 'other'),
              p_fund->>'category');
  v_acct := mf_private.manual_account(v_uid, v_amc);

  insert into public.mf_ledger_entries (
    user_id, account_id, fund_id, entry_type, original_label, trade_date, price_date, nav,
    unit_delta, gross_amount, net_amount, cash_direction, origin, approval_mode, approved_by)
  values (
    v_uid, v_acct, v_fund, p_entry_type, 'Manual ' || p_entry_type, p_trade_date, p_trade_date, p_nav,
    case when p_entry_type = 'purchase' then p_units else -p_units end,
    p_gross, p_gross,
    case when p_entry_type = 'purchase' then 'investor_pays' else 'investor_receives' end,
    'manual', 'manual', v_uid)
  returning id into v_id;

  if p_idempotency_key is not null then
    insert into public.mf_approval_requests (idempotency_key, user_id, result)
    values (p_idempotency_key, v_uid, jsonb_build_object('entry_id', v_id));
  end if;
  perform mf_private.audit(v_uid, 'manual_entry', 'mf_ledger_entries', v_id,
    jsonb_build_object('type', p_entry_type, 'fund', v_fund));
  return v_id;
end;
$$;

-- Hand-entered / migrated rows that a statement now covers properly.
create or replace function mf_private.supersede_manual(p_fund uuid, p_reason text default 'Superseded by statement import')
returns integer language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  e record; v_n int := 0;
begin
  for e in select id from public.mf_ledger_entries
            where user_id = v_uid and fund_id = p_fund
              and origin in ('manual', 'legacy_migration')
              and reverses_entry_id is null and not mf_private.is_reversed(id)
            order by trade_date, created_at
  loop
    perform mf_private.reverse_entry(e.id, p_reason);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- QA only: wipe the caller's own mutual-fund data so integration tests can
-- start clean. Gated on app_metadata (server-set, not user-editable).
create or replace function mf_private.qa_purge_my_data()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := mf_private.require_uid();
  v_n jsonb;
begin
  if coalesce((auth.jwt() -> 'app_metadata' ->> 'qa')::boolean, false) is not true then
    raise exception 'Only QA accounts can purge data' using errcode = '42501';
  end if;
  v_n := jsonb_build_object(
    'ledger', (select count(*) from public.mf_ledger_entries where user_id = v_uid),
    'imports', (select count(*) from public.mf_statement_imports where user_id = v_uid));
  delete from public.mf_ledger_components where user_id = v_uid;
  update public.mf_staged_transactions set ledger_entry_id = null, duplicate_of = null where user_id = v_uid;
  -- Reversals first: they reference their targets.
  delete from public.mf_ledger_entries where user_id = v_uid and reverses_entry_id is not null;
  delete from public.mf_ledger_entries where user_id = v_uid;
  delete from public.mf_nav_history where user_id = v_uid;
  delete from public.mf_statement_imports where user_id = v_uid;
  delete from public.mf_approval_requests where user_id = v_uid;
  delete from public.mf_accounts where user_id = v_uid;
  delete from public.mf_audit_log where user_id = v_uid;
  return v_n;
end;
$$;

-- ─── Public API (thin SECURITY INVOKER wrappers) ─────────────────────────────

create or replace function public.mf_approve_staged(
  p_import_id uuid, p_staged_ids uuid[], p_idempotency_key uuid, p_mode text default 'manual')
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.approve_staged(p_import_id, p_staged_ids, p_idempotency_key, p_mode) $$;

create or replace function public.mf_edit_staged(p_staged_id uuid, p_edits jsonb)
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.edit_staged(p_staged_id, p_edits) $$;

create or replace function public.mf_set_review_status(p_staged_ids uuid[], p_status text, p_note text default null)
returns integer language sql security invoker
set search_path = ''
as $$ select mf_private.set_review_status(p_staged_ids, p_status, p_note) $$;

create or replace function public.mf_reverse_entry(p_entry_id uuid, p_reason text)
returns uuid language sql security invoker
set search_path = ''
as $$ select mf_private.reverse_entry(p_entry_id, p_reason) $$;

create or replace function public.mf_record_manual_entry(
  p_fund jsonb, p_entry_type text, p_trade_date date, p_gross numeric,
  p_nav numeric, p_units numeric, p_idempotency_key uuid default null)
returns uuid language sql security invoker
set search_path = ''
as $$ select mf_private.record_manual_entry(p_fund, p_entry_type, p_trade_date, p_gross, p_nav, p_units, p_idempotency_key) $$;

create or replace function public.mf_supersede_manual(p_fund_id uuid)
returns integer language sql security invoker
set search_path = ''
as $$ select mf_private.supersede_manual(p_fund_id) $$;

create or replace function public.mf_qa_purge_my_data()
returns jsonb language sql security invoker
set search_path = ''
as $$ select mf_private.qa_purge_my_data() $$;

-- Service role only (the Edge Function).
create or replace function public.mf_service_classify_import(p_import_id uuid)
returns jsonb language plpgsql security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  return mf_private.classify_import(p_import_id);
end;
$$;

create or replace function public.mf_service_refresh_import(p_import_id uuid)
returns text language plpgsql security invoker
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role only' using errcode = '42501';
  end if;
  return mf_private.refresh_import_status(p_import_id);
end;
$$;

-- Function grants. Postgres grants EXECUTE to PUBLIC by default; take it
-- back everywhere, then hand out exactly what each role needs.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, n.nspname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'mf_private')
        or (n.nspname = 'public' and p.proname like 'mf\_%')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end;
$$;

grant execute on function
  public.mf_approve_staged(uuid, uuid[], uuid, text),
  public.mf_edit_staged(uuid, jsonb),
  public.mf_set_review_status(uuid[], text, text),
  public.mf_reverse_entry(uuid, text),
  public.mf_record_manual_entry(jsonb, text, date, numeric, numeric, numeric, uuid),
  public.mf_supersede_manual(uuid),
  public.mf_qa_purge_my_data()
to authenticated;

-- The wrappers run as the caller, so the caller needs EXECUTE on the private
-- function too. The schema is not exposed over the Data API, so these are
-- reachable only through the wrappers above.
grant execute on function
  mf_private.approve_staged(uuid, uuid[], uuid, text),
  mf_private.edit_staged(uuid, jsonb),
  mf_private.set_review_status(uuid[], text, text),
  mf_private.reverse_entry(uuid, text),
  mf_private.record_manual_entry(jsonb, text, date, numeric, numeric, numeric, uuid),
  mf_private.supersede_manual(uuid, text),
  mf_private.qa_purge_my_data(),
  mf_private.entry_types(), mf_private.component_types(), mf_private.unit_rule(text)
to authenticated, service_role;

grant execute on function public.mf_service_classify_import(uuid), public.mf_service_refresh_import(uuid) to service_role;
grant execute on function mf_private.classify_import(uuid), mf_private.refresh_import_status(uuid) to service_role;
revoke execute on function public.mf_service_classify_import(uuid), public.mf_service_refresh_import(uuid) from authenticated;

-- ─── Storage ─────────────────────────────────────────────────────────────────
-- Private bucket; each user owns the folder named by their uid. No UPDATE
-- policy: the object key is the file's SHA-256, so a re-upload is a no-op,
-- never an overwrite.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mf-statements', 'mf-statements', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "mf_statements_insert_own" on storage.objects;
create policy "mf_statements_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'mf-statements' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mf_statements_read_own" on storage.objects;
create policy "mf_statements_read_own" on storage.objects for select to authenticated
  using (bucket_id = 'mf-statements' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "mf_statements_delete_own" on storage.objects;
create policy "mf_statements_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'mf-statements' and (storage.foldername(name))[1] = (select auth.uid())::text);
