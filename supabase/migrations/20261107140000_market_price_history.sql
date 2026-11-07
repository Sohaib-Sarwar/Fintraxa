-- Daily closing prices, captured in the database.
--
-- The market-data microservice publishes today's board only (no history), so
-- a past month-end could not be valued. This captures every published close:
--   * PSX: every listed stock → public.psx_price_history (one row per stock per trading day)
--   * MUFAP: funds Fintraxa knows (mf_funds.mufap_slug) → public.mf_nav_history (source 'mufap')
-- Month-end and fiscal-year-end values are then "the last close on or before
-- that date". Daily capture (not only month-end) means a missed run on the
-- last day of a month still leaves the previous trading day's close.
--
-- How it runs, entirely inside Postgres (no keys, no Edge Function):
--   pg_cron → market_private.request_snapshots() → pg_net HTTP GET (async)
--   pg_cron → market_private.ingest_snapshots()  → parse the responses, upsert
-- The feeds publish around 01:00 PKT; requests run at 02:15 and 08:15 PKT.
-- Re-capturing the same trading day is a no-op (upsert / unique index).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ─── PSX closes ──────────────────────────────────────────────────────────────

create table if not exists public.psx_price_history (
  symbol       text not null check (symbol = upper(symbol) and length(symbol) between 1 and 20),
  price_date   date not null,
  close        numeric not null check (close > 0),
  change       numeric,
  change_pct   numeric,
  captured_at  timestamptz not null default now(),
  primary key (symbol, price_date)
);
create index if not exists psx_price_history_date_idx on public.psx_price_history (price_date);

-- Public market data: readable by any signed-in user, written only by the job.
alter table public.psx_price_history enable row level security;
drop policy if exists "psx_price_history_read" on public.psx_price_history;
create policy "psx_price_history_read" on public.psx_price_history for select to authenticated using (true);
revoke all on public.psx_price_history from anon, authenticated;
grant select on public.psx_price_history to authenticated;

-- ─── Capture job ─────────────────────────────────────────────────────────────

create schema if not exists market_private;
revoke all on schema market_private from public, anon, authenticated;

create table if not exists market_private.snapshot_requests (
  request_id    bigint primary key,
  feed          text not null check (feed in ('psx', 'mufap')),
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz,
  data_as_of    date,
  rows_written  integer,
  error         text
);

-- Lenient numeric cast for feed values ("", null, "N/A" → null).
create or replace function market_private.num(p text)
returns numeric language plpgsql immutable
set search_path = ''
as $$
begin
  if p is null or btrim(p) = '' then return null; end if;
  return p::numeric;
exception when others then
  return null;
end;
$$;

create or replace function market_private.request_snapshots()
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  v_base text := 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api';
begin
  insert into market_private.snapshot_requests (request_id, feed) values
    (net.http_get(url := v_base || '/psx/stocks.json', timeout_milliseconds := 30000), 'psx'),
    (net.http_get(url := v_base || '/mufap/funds.json', timeout_milliseconds := 30000), 'mufap');
end;
$$;

create or replace function market_private.ingest_snapshots()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
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
      -- pg_net keeps responses for a few hours; give up on a request after two.
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
      -- The board is stamped with the PSX session it belongs to (PKT).
      v_as_of := ((v_doc -> 'freshness' ->> 'data_as_of')::timestamptz at time zone 'Asia/Karachi')::date;
      insert into public.psx_price_history (symbol, price_date, close, change, change_pct)
      select upper(x ->> 'symbol'), v_as_of, market_private.num(x ->> 'current'),
             market_private.num(x ->> 'change'), market_private.num(x ->> 'change_pct')
        from jsonb_array_elements(v_doc -> 'data') x
       where coalesce(x ->> 'symbol', '') <> '' and market_private.num(x ->> 'current') > 0
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
$$;

revoke all on function market_private.num(text), market_private.request_snapshots(), market_private.ingest_snapshots()
  from public, anon, authenticated;

-- ─── Schedules (UTC; PKT = UTC+5) ────────────────────────────────────────────

do $$
declare j text;
begin
  foreach j in array array['market-snapshot-request-night', 'market-snapshot-request-morning', 'market-snapshot-ingest'] loop
    perform cron.unschedule(jobid) from cron.job where jobname = j;
  end loop;
end;
$$;

select cron.schedule('market-snapshot-request-night',   '15 21 * * *',  $$select market_private.request_snapshots()$$);
select cron.schedule('market-snapshot-request-morning', '15 3 * * *',   $$select market_private.request_snapshots()$$);
select cron.schedule('market-snapshot-ingest',          '*/20 * * * *', $$select market_private.ingest_snapshots()$$);
