-- 1. Automatic PSX price history for every held stock.
--    The daily capture only saves closes from the day someone holds a stock; a back-dated
--    trade in a new stock left the days before that without prices (valued at the trade
--    price). The Edge Function psx-backfill fills those gaps from PSX's per-day market
--    summaries (dps.psx.com.pk/download/mkt_summary/<date>.Z): nightly, and right after a
--    trade in a stock with no prices around its date.
--
--      public.psx_backfill_work(n)   which (symbol, day) closes are missing, oldest n days
--      public.psx_backfill_save(..)  store them, remember what was read, mark users for recompute
--      market_private.psx_summary_days  days already read (and the symbols looked up), or no file (holiday)
--
-- 2. Feed health: public.market_feed_health() tells the app when each feed last brought
--    new data, so a stalled feed shows a warning instead of silently keeping old prices.

-- ─── Days already read ──────────────────────────────────────────────────────
create table if not exists market_private.psx_summary_days (
  day        date primary key,
  status     text not null check (status in ('loaded', 'no_file')),
  symbols    text[] not null default '{}',   -- symbols looked up that day (found or not traded)
  fetched_at timestamptz not null default now()
);
revoke all on market_private.psx_summary_days from public, anon, authenticated;

-- Seed with what the manual backfill already read: every stored close counts as read for its symbol.
insert into market_private.psx_summary_days (day, status, symbols)
select price_date, 'loaded', array_agg(distinct symbol order by symbol)
  from public.psx_price_history where price_date between '2026-03-02' and '2026-11-06'
 group by price_date
on conflict (day) do nothing;
-- Market holidays in that span (no summary file was published for these weekdays).
insert into market_private.psx_summary_days (day, status)
select d::date, 'no_file' from unnest(array['2026-03-20', '2026-03-23', '2026-05-01', '2026-05-26', '2026-05-27',
  '2026-05-28', '2026-06-25', '2026-06-26', '2026-08-14', '2026-08-26']) d
on conflict (day) do nothing;
-- A one-day exchange glitch dropped on purpose (MIIETF printed 18.68 between ~16.7 closes).
update market_private.psx_summary_days set symbols = array_append(symbols, 'MIIETF')
 where day = '2026-08-24' and not ('MIIETF' = any(symbols));

-- ─── Work list ──────────────────────────────────────────────────────────────
-- Per symbol, closes are needed from 10 days before its first trade until it was fully sold
-- (or until yesterday while someone holds it). Missing = no close stored, and the day has
-- not been read for that symbol (and was not a holiday).
create or replace function public.psx_backfill_work(p_days integer default 30)
returns table (symbol text, day date)
language sql stable security definer
set search_path = ''
as $$
  with need as (
    select upper(trim(t.symbol)) as sym, min(t.date) - 10 as f,
           case when sum(case when t.type = 'buy' then t.quantity else -t.quantity end) > 0
                then (now() at time zone 'Asia/Karachi')::date - 1 else max(t.date) end as t
      from public.stock_transactions t
     where coalesce(trim(t.symbol), '') <> ''
     group by 1
  ),
  span as (select min(f) as a, max(t) as b from need),
  days as (
    select d::date as day from span, generate_series(span.a, span.b, interval '1 day') d
     where extract(isodow from d) < 6
  ),
  missing as (
    select n.sym, d.day
      from need n join days d on d.day between n.f and n.t
     where not exists (select 1 from public.psx_price_history p where p.symbol = n.sym and p.price_date = d.day)
       and not exists (select 1 from market_private.psx_summary_days s
                        where s.day = d.day and (s.status = 'no_file' or n.sym = any(s.symbols)))
  ),
  first_days as (select distinct m.day from missing m order by m.day limit greatest(1, least(p_days, 120)))
  select m.sym, m.day from missing m join first_days f on f.day = m.day order by m.day, m.sym;
$$;

-- ─── Save ───────────────────────────────────────────────────────────────────
-- p_closes: [{ symbol, day, close }]   p_days: [{ day, status: 'loaded'|'no_file', symbols: [..] }]
-- Users who held a symbol that got earlier closes are recomputed from the earliest such day.
create or replace function public.psx_backfill_save(p_closes jsonb, p_days jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
  r record;
begin
  with ins as (
    insert into public.psx_price_history (symbol, price_date, close)
    select upper(x ->> 'symbol'), (x ->> 'day')::date, (x ->> 'close')::numeric
      from jsonb_array_elements(coalesce(p_closes, '[]'::jsonb)) x
     where (x ->> 'close')::numeric > 0
    on conflict (symbol, price_date) do nothing
    returning symbol
  )
  select count(*) into v_inserted from ins;

  insert into market_private.psx_summary_days as s (day, status, symbols, fetched_at)
  select (x ->> 'day')::date, x ->> 'status',
         coalesce(array(select upper(jsonb_array_elements_text(x -> 'symbols'))), '{}'), now()
    from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) x
  on conflict (day) do update
     set status = case when s.status = 'loaded' or excluded.status = 'loaded' then 'loaded' else 'no_file' end,
         symbols = array(select distinct unnest(s.symbols || excluded.symbols) order by 1),
         fetched_at = now();

  -- Recompute everyone who traded a symbol that got new closes, from its earliest new day.
  for r in
    select t.user_id, min(x.d) as from_date
      from (select upper(c ->> 'symbol') as sym, min((c ->> 'day')::date) as d
              from jsonb_array_elements(coalesce(p_closes, '[]'::jsonb)) c group by 1) x
      join public.stock_transactions t on upper(trim(t.symbol)) = x.sym
     group by t.user_id
  loop
    perform snapshot_private.mark_dirty(r.user_id, r.from_date);
  end loop;
  if v_inserted > 0 then perform snapshot_private.request_run(); end if;
  return jsonb_build_object('closes', v_inserted, 'days', jsonb_array_length(coalesce(p_days, '[]'::jsonb)));
end;
$$;

revoke all on function public.psx_backfill_work(integer), public.psx_backfill_save(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.psx_backfill_work(integer), public.psx_backfill_save(jsonb, jsonb) to service_role;

-- ─── Trigger the function ───────────────────────────────────────────────────
create or replace function market_private.request_backfill()
returns bigint language plpgsql security definer
set search_path = ''
as $$
begin
  return net.http_post(
    url := 'https://qrekpudclwesajfhrokv.supabase.co/functions/v1/psx-backfill',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_cron_secret')),
    body := '{"mode":"cron"}'::jsonb,
    timeout_milliseconds := 150000
  );
end;
$$;
revoke all on function market_private.request_backfill() from public, anon, authenticated;

-- After trades are saved: if any is in a stock with no close within 10 days before its
-- date, ask for a backfill now (one request per statement, not per row).
create or replace function market_private.on_trades_backfill()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from new_rows n
     where coalesce(trim(n.symbol), '') <> ''
       and n.date < (now() at time zone 'Asia/Karachi')::date
       and not exists (select 1 from public.psx_price_history p
                        where p.symbol = upper(trim(n.symbol)) and p.price_date between n.date - 10 and n.date)
  ) then
    perform market_private.request_backfill();
  end if;
  return null;
end;
$$;
drop trigger if exists stock_transactions_backfill on public.stock_transactions;
create trigger stock_transactions_backfill
  after insert on public.stock_transactions
  referencing new table as new_rows
  for each statement execute function market_private.on_trades_backfill();

-- Nightly at 02:35 PKT: after the price capture (02:15), before the snapshot run (02:45).
select cron.unschedule(jobname) from cron.job where jobname = 'psx-backfill-nightly';
select cron.schedule('psx-backfill-nightly', '35 21 * * *', $$select market_private.request_backfill()$$);

-- ─── Feed health ────────────────────────────────────────────────────────────
-- Per feed: the newest data captured, when a capture last succeeded, and the last error.
-- Market metadata only; no user data.
create or replace function public.market_feed_health()
returns table (feed text, latest_data date, last_success timestamptz, last_error text, last_error_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select f.feed,
         (select max(r.data_as_of) from market_private.snapshot_requests r where r.feed = f.feed and r.error is null),
         (select max(r.processed_at) from market_private.snapshot_requests r where r.feed = f.feed and r.error is null and r.processed_at is not null),
         (select r.error from market_private.snapshot_requests r where r.feed = f.feed and r.error is not null order by r.requested_at desc limit 1),
         (select max(r.requested_at) from market_private.snapshot_requests r where r.feed = f.feed and r.error is not null)
    from (values ('psx'), ('mufap'), ('psx_indices')) f(feed);
$$;
revoke all on function public.market_feed_health() from public, anon;
grant execute on function public.market_feed_health() to authenticated;
