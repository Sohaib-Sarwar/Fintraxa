-- Daily snapshots of every user's holdings and portfolio.
--
-- The market-data job (20261107140000_market_price_history.sql) already keeps
-- every PSX close and every MUFAP NAV the app tracks. This keeps, per user and
-- per day, what those prices made each holding worth: units, FIFO cost, price,
-- value, unrealized gain, and what was realized that day. With these rows the
-- profit of any window is one subtraction:
--
--     profit(a, b] = unrealized(b) − unrealized(a) + Σ realized in (a, b]
--
-- Rows are written only by the Edge Function `portfolio-snapshot`, which runs
-- the same engines the screens use (src/lib/snapshots/build.js). It runs:
--   * nightly after the price capture (00:05, 02:45 and 08:45 PKT; reruns are idempotent),
--   * after any change to a user's ledger, trades, transactions, dividends or
--     statement NAVs: a trigger records the earliest affected date and the next
--     run recomputes from there (a back-dated statement upload rewrites history).

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.portfolio_snapshots (
  user_id           uuid not null references auth.users (id) on delete cascade,
  snap_date         date not null,
  funds_value       numeric(18, 2) not null default 0,
  funds_cost        numeric(18, 2) not null default 0,
  funds_unrealized  numeric(18, 2) not null default 0,
  stocks_value      numeric(18, 2) not null default 0,
  stocks_cost       numeric(18, 2) not null default 0,
  stocks_unrealized numeric(18, 2) not null default 0,
  savings           numeric(18, 2) not null default 0,
  net_worth         numeric(18, 2) not null default 0,
  funds_realized_day  numeric(18, 2) not null default 0,
  stocks_realized_day numeric(18, 2) not null default 0,
  realized_day      numeric(18, 2) not null default 0,
  tax_day           numeric(18, 2) not null default 0,
  engine_version    text not null,
  computed_at       timestamptz not null default now(),
  primary key (user_id, snap_date)
);

create table if not exists public.holding_snapshots (
  user_id       uuid not null references auth.users (id) on delete cascade,
  snap_date     date not null,
  asset_type    text not null check (asset_type in ('mf', 'psx')),
  asset_key     text not null check (length(asset_key) between 1 and 200),
  name          text,
  units         numeric not null default 0,
  cost          numeric(18, 2) not null default 0,
  price         numeric,
  price_date    date,
  value         numeric(18, 2) not null default 0,
  unrealized    numeric(18, 2) not null default 0,
  realized_day  numeric(18, 2) not null default 0,
  tax_day       numeric(18, 2) not null default 0,
  primary key (user_id, asset_type, asset_key, snap_date)
);
create index if not exists holding_snapshots_user_date_idx on public.holding_snapshots (user_id, snap_date);

-- Read your own rows; nobody writes from the client (the job uses the service role).
alter table public.portfolio_snapshots enable row level security;
alter table public.holding_snapshots enable row level security;
drop policy if exists "portfolio_snapshots_own_read" on public.portfolio_snapshots;
create policy "portfolio_snapshots_own_read" on public.portfolio_snapshots for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "holding_snapshots_own_read" on public.holding_snapshots;
create policy "holding_snapshots_own_read" on public.holding_snapshots for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.portfolio_snapshots, public.holding_snapshots from anon, authenticated;
grant select on public.portfolio_snapshots, public.holding_snapshots to authenticated;
grant all on public.portfolio_snapshots, public.holding_snapshots to service_role;

-- ─── "Recompute from" markers ───────────────────────────────────────────────

create schema if not exists snapshot_private;
revoke all on schema snapshot_private from public, anon, authenticated;
grant usage on schema snapshot_private to service_role;

create table if not exists snapshot_private.dirty (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  from_date  date not null,
  marked_at  timestamptz not null default now()
);
grant select, insert, update, delete on snapshot_private.dirty to service_role;

create or replace function snapshot_private.mark_dirty(p_user uuid, p_date date)
returns void language sql security definer
set search_path = ''
as $$
  insert into snapshot_private.dirty (user_id, from_date) values (p_user, p_date)
  on conflict (user_id) do update
    set from_date = least(snapshot_private.dirty.from_date, excluded.from_date), marked_at = now();
$$;

-- One trigger function for every source table; each passes which columns hold the user and the date.
create or replace function snapshot_private.on_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid; v_date date; v_old date; v_new date;
begin
  if tg_table_name = 'mf_ledger_components' then
    -- A component is dated by its entry.
    select e.user_id, e.trade_date into v_user, v_date
      from public.mf_ledger_entries e where e.id = coalesce(new.entry_id, old.entry_id);
    if v_user is not null then perform snapshot_private.mark_dirty(v_user, v_date); end if;
    return null;
  end if;

  if tg_op <> 'INSERT' then
    v_user := (to_jsonb(old) ->> 'user_id')::uuid;
    v_old := (to_jsonb(old) ->> tg_argv[0])::date;
  end if;
  if tg_op <> 'DELETE' then
    v_user := coalesce((to_jsonb(new) ->> 'user_id')::uuid, v_user);
    v_new := (to_jsonb(new) ->> tg_argv[0])::date;
  end if;
  v_date := least(coalesce(v_old, v_new), coalesce(v_new, v_old));
  -- Public market prices (no user) are picked up by the nightly rerun of recent days.
  if v_user is not null and v_date is not null then perform snapshot_private.mark_dirty(v_user, v_date); end if;
  return null;
end;
$$;

do $$
declare t record;
begin
  for t in select * from (values
    ('mf_ledger_entries', 'trade_date'), ('mf_ledger_components', 'entry_id'), ('stock_transactions', 'date'),
    ('stock_dividends', 'payment_date'), ('income_expense_transactions', 'date'), ('mf_nav_history', 'nav_date')
  ) as v(tbl, col) loop
    execute format('drop trigger if exists snapshot_dirty on public.%I', t.tbl);
    execute format('create trigger snapshot_dirty after insert or update or delete on public.%I
                    for each row execute function snapshot_private.on_change(%L)', t.tbl, t.col);
  end loop;
end $$;

-- ─── Schedule: pg_cron → pg_net → the Edge Function ────────────────────────
-- The call carries a random secret generated here and kept in Vault; the
-- function checks it through verify_cron_secret (service role only). It is
-- never written in code or logs.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'snapshot_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'snapshot_cron_secret', 'Authorises pg_cron calls to the portfolio-snapshot function');
  end if;
end $$;

-- The Edge Function talks to these through PostgREST, so they live in public,
-- callable by the service role only.
create or replace function public.snapshot_verify_cron_secret(p_secret text)
returns boolean language sql security definer stable
set search_path = ''
as $$
  select coalesce(length(p_secret) >= 32 and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_cron_secret'), false);
$$;

-- Who needs snapshots, and from which day: the earliest of a recorded change,
-- the last snapshot minus 3 days (late NAVs and price corrections), or the
-- first activity when nothing has been snapshotted yet.
create or replace function public.snapshot_work(p_user uuid default null)
returns table (user_id uuid, from_date date, started_at timestamptz)
language sql security definer stable
set search_path = ''
as $$
  with acts as (
    select e.user_id, min(e.trade_date) d from public.mf_ledger_entries e group by 1
    union all select t.user_id, min(t.date::date) from public.stock_transactions t group by 1
    union all select x.user_id, min(x.date) from public.income_expense_transactions x group by 1
    union all select v.user_id, min(v.payment_date) from public.stock_dividends v group by 1
  ), first_act as (
    select a.user_id, min(a.d) d from acts a where a.user_id is not null group by 1
  )
  select f.user_id,
         least(coalesce(dy.from_date, base.d), base.d) as from_date,
         now() as started_at
    from first_act f
    left join snapshot_private.dirty dy on dy.user_id = f.user_id
    cross join lateral (
      select coalesce((select max(s.snap_date) - 3 from public.portfolio_snapshots s where s.user_id = f.user_id), f.d) as d
    ) base
   where p_user is null or f.user_id = p_user;
$$;

-- Done up to `p_started`: a change recorded after the run began stays queued.
create or replace function public.snapshot_done(p_user uuid, p_started timestamptz)
returns void language sql security definer
set search_path = ''
as $$
  delete from snapshot_private.dirty where user_id = p_user and marked_at <= p_started;
$$;

revoke all on function public.snapshot_verify_cron_secret(text), public.snapshot_work(uuid), public.snapshot_done(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.snapshot_verify_cron_secret(text), public.snapshot_work(uuid), public.snapshot_done(uuid, timestamptz) to service_role;
revoke all on function snapshot_private.mark_dirty(uuid, date) from public, anon, authenticated;

create or replace function snapshot_private.request_run()
returns bigint language plpgsql security definer
set search_path = ''
as $$
begin
  return net.http_post(
    url := 'https://qrekpudclwesajfhrokv.supabase.co/functions/v1/portfolio-snapshot',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_cron_secret')),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function snapshot_private.request_run() from public, anon, authenticated;

-- UTC times: 00:05, 02:45 and 08:45 in Pakistan (PKT = UTC+5), after the price capture at 02:15 and 08:15.
select cron.unschedule(jobname) from cron.job where jobname like 'portfolio-snapshot-%';
select cron.schedule('portfolio-snapshot-midnight', '5 19 * * *', $$select snapshot_private.request_run()$$);
select cron.schedule('portfolio-snapshot-after-prices', '45 21 * * *', $$select snapshot_private.request_run()$$);
select cron.schedule('portfolio-snapshot-morning', '45 3 * * *', $$select snapshot_private.request_run()$$);

-- ─── Capture only what someone holds ────────────────────────────────────────
-- The nightly market capture used to store the whole PSX board (~750 stocks a
-- day). Only instruments a user actually holds are needed: a holding's value
-- only matters while it is held. Same function as before, two filters added.

-- Symbols with a positive net share count across all users.
create or replace function market_private.held_symbols()
returns table (symbol text) language sql stable security definer
set search_path = ''
as $$
  select upper(t.symbol) from public.stock_transactions t
   group by upper(t.symbol)
  having sum(case when t.type = 'buy' then t.quantity else -t.quantity end) > 0;
$$;

-- Funds with units still held in some account (reversals carry negated units, so sums cancel).
create or replace function market_private.held_funds()
returns table (fund_id uuid) language sql stable security definer
set search_path = ''
as $$
  select distinct h.fund_id from (
    select e.user_id, e.account_id, e.fund_id from public.mf_ledger_entries e
     group by e.user_id, e.account_id, e.fund_id, e.unit_class
    having coalesce(sum(e.unit_delta), 0) > 0.01
  ) h;
$$;

create or replace function market_private.ingest_snapshots()
returns jsonb language plpgsql security definer
set search_path = ''
as $function$
declare
  r record;
  v_status integer; v_content text; v_err text; v_found boolean;
  v_doc jsonb; v_as_of date; v_n integer;
  v_out jsonb := '[]'::jsonb;
begin
  for r in select * from market_private.snapshot_requests where processed_at is null order by requested_at loop
    select status_code, content, error_msg, true into v_status, v_content, v_err, v_found
      from net._http_response where id = r.request_id;
    if v_found is not true then
      if r.requested_at < now() - interval '2 hours' then
        update market_private.snapshot_requests set processed_at = now(), error = 'no response'
         where request_id = r.request_id;
      end if;
      continue;
    end if;
    v_found := null;
    if v_status is distinct from 200 then
      update market_private.snapshot_requests set processed_at = now(), error = coalesce(v_err, 'HTTP ' || v_status)
       where request_id = r.request_id;
      continue;
    end if;
    begin
      v_doc := v_content::jsonb;
    exception when others then
      update market_private.snapshot_requests set processed_at = now(), error = 'response is not JSON'
       where request_id = r.request_id;
      continue;
    end;

    if r.feed = 'psx' then
      v_as_of := ((v_doc -> 'freshness' ->> 'data_as_of')::timestamptz at time zone 'Asia/Karachi')::date;
      insert into public.psx_price_history (symbol, price_date, close, change, change_pct)
      select upper(x ->> 'symbol'), v_as_of, market_private.num(x ->> 'current'),
             market_private.num(x ->> 'change'), market_private.num(x ->> 'change_pct')
        from jsonb_array_elements(v_doc -> 'data') x
       where coalesce(x ->> 'symbol', '') <> '' and market_private.num(x ->> 'current') > 0
         and upper(x ->> 'symbol') in (select h.symbol from market_private.held_symbols() h)
      on conflict (symbol, price_date) do update
         set close = excluded.close, change = excluded.change, change_pct = excluded.change_pct, captured_at = now();
      get diagnostics v_n = row_count;
    else
      v_as_of := (v_doc -> 'freshness' ->> 'data_as_of')::date;
      insert into public.mf_nav_history (fund_id, user_id, nav_date, price, price_kind, source, source_ref, verified)
      select f.id, null,
             coalesce((nullif(x ->> 'validity_date', ''))::date, v_as_of),
             coalesce(market_private.num(x ->> 'repurchase_price'), market_private.num(x ->> 'nav')),
             case when market_private.num(x ->> 'repurchase_price') is not null then 'repurchase' else 'nav' end,
             'mufap', f.mufap_slug, false
        from jsonb_array_elements(v_doc -> 'data') x
        join public.mf_funds f on f.mufap_slug = x ->> 'slug'
       where coalesce(market_private.num(x ->> 'repurchase_price'), market_private.num(x ->> 'nav')) > 0
         and f.id in (select h.fund_id from market_private.held_funds() h)
      on conflict do nothing;
      get diagnostics v_n = row_count;
    end if;

    update market_private.snapshot_requests
       set processed_at = now(), data_as_of = v_as_of, rows_written = v_n
     where request_id = r.request_id;
    v_out := v_out || jsonb_build_object('feed', r.feed, 'as_of', v_as_of, 'rows', v_n);
  end loop;
  delete from market_private.snapshot_requests where requested_at < now() - interval '60 days';
  return v_out;
end;
$function$;

-- Drop the closes already captured for stocks nobody holds (public market data, a few days old).
delete from public.psx_price_history p
 where not exists (select 1 from market_private.held_symbols() h where h.symbol = p.symbol);
