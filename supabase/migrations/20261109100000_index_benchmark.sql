-- Benchmark: KSE-100 daily closes, and the portfolio's own daily return, so the
-- PSX dashboard can compare "my return since 1 January" with the index.
--
--   public.market_index_history   one close per index per trading day (public market data)
--   public.market_index_daily     the same with each day's return (view, security invoker)
--   portfolio_snapshots           + stocks_flow_day, stocks_dividend_day, stocks_return_day
--                                 written by the portfolio-snapshot function (src/lib/snapshots/build.js)
--
-- Daily return of the share portfolio (time-weighted, so buying or selling does not
-- count as profit or loss):
--   buys on a day   r = (V_today − V_yesterday − F + D) / (V_yesterday + F)
--   net sales       r = (V_today − V_yesterday − F + D) / V_yesterday
--   F = cash put into shares that day (buys incl. fees − sale proceeds after fees)
--   D = dividends received that day (net, as paid)
-- KSE-100 is a total-return index (PSX publishes the price-only one as KSE100PR),
-- which is why dividends are part of the portfolio's return too.

-- ─── Index closes ───────────────────────────────────────────────────────────
create table if not exists public.market_index_history (
  index_code  text not null,
  price_date  date not null,
  close       numeric not null check (close > 0),
  captured_at timestamptz not null default now(),
  primary key (index_code, price_date)
);
comment on table public.market_index_history is 'Daily index closes (KSE100, ...). Public market data; written by market_private.ingest_snapshots and backfills.';

alter table public.market_index_history enable row level security;
drop policy if exists "Index closes: signed-in users read" on public.market_index_history;
create policy "Index closes: signed-in users read" on public.market_index_history
  for select to authenticated using (true);
revoke all on public.market_index_history from anon, authenticated;
grant select on public.market_index_history to authenticated;

create or replace view public.market_index_daily
with (security_invoker = true) as
select index_code, price_date, close,
       close / nullif(lag(close) over (partition by index_code order by price_date), 0) - 1 as day_return
  from public.market_index_history;
comment on view public.market_index_daily is 'Index closes with the return since the previous trading day.';
revoke all on public.market_index_daily from anon, authenticated;
grant select on public.market_index_daily to authenticated;

-- ─── Portfolio daily return fields ──────────────────────────────────────────
alter table public.portfolio_snapshots
  add column if not exists stocks_flow_day     numeric not null default 0,
  add column if not exists stocks_dividend_day numeric not null default 0,
  add column if not exists stocks_return_day   numeric;
comment on column public.portfolio_snapshots.stocks_flow_day is 'Cash put into shares that day: buys incl. fees minus sale proceeds after fees.';
comment on column public.portfolio_snapshots.stocks_dividend_day is 'Dividends received that day (net).';
comment on column public.portfolio_snapshots.stocks_return_day is 'Time-weighted return of the share portfolio that day (0.012 = 1.2%); null when nothing was held.';

-- ─── Daily capture: also fetch the indices feed ─────────────────────────────
alter table market_private.snapshot_requests drop constraint if exists snapshot_requests_feed_check;
alter table market_private.snapshot_requests add constraint snapshot_requests_feed_check
  check (feed in ('psx', 'mufap', 'psx_indices'));

create or replace function market_private.request_snapshots()
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_base text := 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api';
begin
  insert into market_private.snapshot_requests (request_id, feed) values
    (net.http_get(url := v_base || '/psx/stocks.json', timeout_milliseconds := 30000), 'psx'),
    (net.http_get(url := v_base || '/mufap/funds.json', timeout_milliseconds := 30000), 'mufap'),
    (net.http_get(url := v_base || '/psx/indices.json', timeout_milliseconds := 30000), 'psx_indices');
end;
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
    elsif r.feed = 'psx_indices' then
      v_as_of := ((v_doc -> 'freshness' ->> 'data_as_of')::timestamptz at time zone 'Asia/Karachi')::date;
      insert into public.market_index_history (index_code, price_date, close)
      select upper(coalesce(x ->> 'index_name', x ->> 'name')), v_as_of, market_private.num(x ->> 'current')
        from jsonb_array_elements(v_doc -> 'data') x
       where upper(coalesce(x ->> 'index_name', x ->> 'name')) in ('KSE100', 'KSE100PR', 'KSE30', 'KMI30', 'ALLSHR')
         and market_private.num(x ->> 'current') > 0
      on conflict (index_code, price_date) do update set close = excluded.close, captured_at = now();
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

revoke all on function market_private.request_snapshots(), market_private.ingest_snapshots() from public, anon, authenticated;

-- Every portfolio is recomputed once with the new return fields.
insert into snapshot_private.dirty (user_id, from_date, marked_at)
select distinct user_id, date '2000-01-01', now() from public.portfolio_snapshots
on conflict (user_id) do update set from_date = least(snapshot_private.dirty.from_date, excluded.from_date), marked_at = now();
