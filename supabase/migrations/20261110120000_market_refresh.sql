-- On-demand price refresh for the signed-in user's holdings.
--
-- Settings > Market prices → Edge Function `refresh-prices` → the market-data worker's
-- POST /v1/quotes (fetches PSX / MUFAP now) → market_refresh_save() → the same tables the
-- nightly capture writes (psx_price_history, mf_nav_history), so every page picks the prices up.
-- The scheduled jobs are unchanged.
--
-- Price tables are shared market data, so only the Edge Function (service role) can write them
-- here, and only for instruments the requesting user holds; clients never supply prices.

-- ─── Run log (what Settings shows) ───────────────────────────────────────────

create table if not exists public.market_refresh_runs (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  requested_at     timestamptz not null default now(),
  finished_at      timestamptz,
  status           text not null default 'running' check (status in ('running', 'ok', 'partial', 'failed')),
  psx_requested    integer not null default 0,
  psx_updated      integer not null default 0,
  mufap_requested  integer not null default 0,
  mufap_updated    integer not null default 0,
  duration_ms      integer,
  details          jsonb not null default '{}'::jsonb
);
create index if not exists market_refresh_runs_user_idx on public.market_refresh_runs (user_id, requested_at desc);

alter table public.market_refresh_runs enable row level security;
drop policy if exists "market_refresh_runs_read_own" on public.market_refresh_runs;
create policy "market_refresh_runs_read_own" on public.market_refresh_runs
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.market_refresh_runs from anon, authenticated;
grant select on public.market_refresh_runs to authenticated;

-- ─── What one user holds ─────────────────────────────────────────────────────
-- Same rules as market_private.held_symbols / held_funds, for one user, worked out at every
-- refresh: a stock or fund bought later is included, one sold out is not. Funds without a MUFAP
-- link are included too; the refresh matches them by name and reports them if MUFAP has no match.

create or replace function public.market_refresh_targets(p_user uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'psx', coalesce((
      select jsonb_agg(s.symbol order by s.symbol) from (
        select upper(t.symbol) as symbol from public.stock_transactions t
         where t.user_id = p_user
         group by upper(t.symbol)
        having sum(case when t.type = 'buy' then t.quantity else -t.quantity end) > 0
      ) s), '[]'::jsonb),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'category', f.category, 'slug', f.mufap_slug) order by f.name)
        from public.mf_funds f
       where f.id in (
           select e.fund_id from public.mf_ledger_entries e
            where e.user_id = p_user
            group by e.account_id, e.fund_id, e.unit_class
           having coalesce(sum(e.unit_delta), 0) > 0.01)
    ), '[]'::jsonb)
  );
$$;

-- ─── Save fetched prices ─────────────────────────────────────────────────────
-- p_psx:   [{ symbol, day, close, change, change_pct }]     day = PSX's own "as of" date
-- p_funds: [{ fund_id, nav_date, price, kind, slug }]        nav_date = MUFAP validity date
-- A PSX day is upserted (an intraday price is replaced by the close when the nightly capture
-- runs); a fund observation is append-only, as the nightly capture does. Anything the user
-- does not hold is ignored.

create or replace function public.market_refresh_save(p_user uuid, p_psx jsonb, p_funds jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_targets jsonb := public.market_refresh_targets(p_user);
  v_psx integer := 0;
  v_funds integer := 0;
begin
  with ins as (
    insert into public.psx_price_history as h (symbol, price_date, close, change, change_pct, captured_at)
    select upper(x ->> 'symbol'), (x ->> 'day')::date, (x ->> 'close')::numeric,
           nullif(x ->> 'change', '')::numeric, nullif(x ->> 'change_pct', '')::numeric, now()
      from jsonb_array_elements(coalesce(p_psx, '[]'::jsonb)) x
     where (x ->> 'close')::numeric > 0
       and (x ->> 'day') is not null
       and upper(x ->> 'symbol') in (select jsonb_array_elements_text(v_targets -> 'psx'))
    on conflict (symbol, price_date) do update
       set close = excluded.close, change = excluded.change, change_pct = excluded.change_pct, captured_at = now()
    returning 1
  )
  select count(*) into v_psx from ins;

  with ins as (
    insert into public.mf_nav_history (fund_id, user_id, nav_date, price, price_kind, source, source_ref, verified)
    select (x ->> 'fund_id')::uuid, null, (x ->> 'nav_date')::date, (x ->> 'price')::numeric,
           case when x ->> 'kind' = 'repurchase' then 'repurchase' else 'nav' end, 'mufap', x ->> 'slug', false
      from jsonb_array_elements(coalesce(p_funds, '[]'::jsonb)) x
     where (x ->> 'price')::numeric > 0
       and (x ->> 'nav_date') is not null
       and (x ->> 'fund_id') in (select f ->> 'id' from jsonb_array_elements(v_targets -> 'funds') f)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_funds from ins;

  return jsonb_build_object('psx_saved', v_psx, 'funds_saved', v_funds);
end;
$$;

revoke all on function public.market_refresh_targets(uuid), public.market_refresh_save(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.market_refresh_targets(uuid), public.market_refresh_save(uuid, jsonb, jsonb) to service_role;
