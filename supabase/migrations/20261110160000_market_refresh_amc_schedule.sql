-- Latest prices without waiting on MUFAP or GitHub.
--
-- 1. Fund prices from each fund's manager (AMC). MUFAP's industry table has been refusing
--    datacenter addresses (Cloudflare challenge) since 2026-11-06, so held funds' NAVs stopped
--    moving. Every manager publishes the same prices on its own website, usually hours before
--    MUFAP; refresh-prices now reads those too and keeps the newest. They are stored with
--    source 'amc' (source_ref = the manager's page), next to MUFAP's own rows.
--
-- 2. A scheduled refresh of everyone's holdings. The published feed only moves when a GitHub
--    Actions run publishes it, and on 2026-11-09 one stuck run blocked every publish for a day.
--    pg_cron now also calls refresh-prices for all held stocks and funds three times a day, so
--    held instruments are current even when the feed is late. The feed jobs are unchanged.
--
-- A scheduled run is logged in market_refresh_runs with user_id null; users only ever read
-- their own runs, so nobody sees what anyone else holds.

-- ─── 'amc' as a price source ─────────────────────────────────────────────────
alter table public.mf_nav_history drop constraint if exists mf_nav_history_source_check;
alter table public.mf_nav_history add constraint mf_nav_history_source_check
  check (source in ('statement', 'mufap', 'manual', 'amc'));

-- ─── scheduled runs in the run log ───────────────────────────────────────────
alter table public.market_refresh_runs alter column user_id drop not null;
alter table public.market_refresh_runs
  add column if not exists kind text not null default 'user' check (kind in ('user', 'scheduled'));
create index if not exists market_refresh_runs_scheduled_idx
  on public.market_refresh_runs (requested_at desc) where user_id is null;

-- ─── what is held: one user's holdings, or (p_user null) everyone's ──────────
-- Holdings are summed per user, so one user's sale never hides another user's position.
create or replace function public.market_refresh_targets(p_user uuid)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'psx', coalesce((
      select jsonb_agg(distinct s.symbol order by s.symbol) from (
        select upper(t.symbol) as symbol from public.stock_transactions t
         where p_user is null or t.user_id = p_user
         group by t.user_id, upper(t.symbol)
        having sum(case when t.type = 'buy' then t.quantity else -t.quantity end) > 0
      ) s), '[]'::jsonb),
    'funds', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'category', f.category, 'slug', f.mufap_slug) order by f.name)
        from public.mf_funds f
       where f.id in (
           select e.fund_id from public.mf_ledger_entries e
            where p_user is null or e.user_id = p_user
            group by e.user_id, e.account_id, e.fund_id, e.unit_class
           having coalesce(sum(e.unit_delta), 0) > 0.01)
    ), '[]'::jsonb)
  );
$$;

-- ─── save: as before, plus the price's source ────────────────────────────────
-- p_funds: [{ fund_id, nav_date, price, kind, source: 'mufap' | 'amc', slug }]
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
           case when x ->> 'kind' = 'repurchase' then 'repurchase' else 'nav' end,
           case when x ->> 'source' = 'amc' then 'amc' else 'mufap' end,
           left(x ->> 'slug', 300), false
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

-- ─── the schedule ────────────────────────────────────────────────────────────
-- Same secret and check as the portfolio snapshot (vault 'snapshot_cron_secret').
create or replace function market_private.request_holdings_refresh()
returns bigint language plpgsql security definer
set search_path = ''
as $$
begin
  return net.http_post(
    url := 'https://qrekpudclwesajfhrokv.supabase.co/functions/v1/refresh-prices',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_cron_secret')),
    body := '{"mode":"cron"}'::jsonb, timeout_milliseconds := 120000);
end;
$$;
revoke all on function market_private.request_holdings_refresh() from public, anon, authenticated;

-- 16:40 PKT on trading days (PSX's close is final), then 20:40 and 23:40 PKT every day, when
-- the managers have posted the day's NAVs. Each lands before a portfolio snapshot job.
do $$
begin
  perform cron.unschedule(jobname) from cron.job where jobname like 'market-refresh-holdings-%';
end $$;
select cron.schedule('market-refresh-holdings-close',   '40 11 * * 1-5', 'select market_private.request_holdings_refresh()');
select cron.schedule('market-refresh-holdings-evening', '40 15 * * *',   'select market_private.request_holdings_refresh()');
select cron.schedule('market-refresh-holdings-night',   '40 18 * * *',   'select market_private.request_holdings_refresh()');
