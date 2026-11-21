-- Upcoming dividends (owner, 2026-11-22): every day, look only at the stocks people hold; when a held company announces
-- a cash dividend and the holder still owns it at the end of the last cum-dividend day, show it as "upcoming" with the
-- expected gross, tax (15% filer / 30% non-filer) and net. Nothing counts in any figure until the owner approves it
-- with the amount and date actually received; approval goes through dividends_save (never a second amount).
--
-- Entitlement (PSX, T+1 since 9 Feb 2026; NCCPL: securities in the CDS account at the end of the day before book
-- closure starts):  ex-date = last PSX business day before book closure starts; last cum day = the business day before
-- the ex-date. Shares bought on or before the last cum day (trade date) are entitled; selling on/after the ex-date
-- keeps the dividend.

-- ── market data: cash dividend announcements of held companies ──
create table if not exists public.psx_dividend_announcements (
  id uuid primary key default gen_random_uuid(),
  symbol text not null check (symbol ~ '^[A-Z0-9][A-Z0-9.\-]{0,15}$'),
  company_name text check (char_length(company_name) <= 200),
  announced_on date,
  period text check (char_length(period) <= 40),
  dividend_type text not null check (dividend_type in ('interim', 'final', 'special')),
  interim_no smallint check (interim_no between 1 and 4),
  percent numeric(10, 4) check (percent is null or percent > 0),
  dps numeric(14, 4) not null check (dps > 0),
  face_value numeric(10, 4) check (face_value is null or face_value > 0),
  book_closure_from date not null,
  book_closure_to date,
  agm_date date,
  ex_date date not null,
  last_cum_date date not null,
  expected_pay_by date,
  source text not null check (source in ('psx_announcements', 'psx_letter_ai')),
  source_url text check (char_length(source_url) <= 300),
  raw text check (char_length(raw) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint psx_dividend_announcements_key unique (symbol, book_closure_from, dps)
);
create index if not exists psx_dividend_announcements_bc on public.psx_dividend_announcements (book_closure_from);

alter table public.psx_dividend_announcements enable row level security;
revoke all on public.psx_dividend_announcements from anon, authenticated;
grant select on public.psx_dividend_announcements to authenticated;
drop policy if exists "announcements are public market data" on public.psx_dividend_announcements;
create policy "announcements are public market data" on public.psx_dividend_announcements
  for select to authenticated using (true);

-- ── per user: the upcoming list ──
create table if not exists public.upcoming_dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  announcement_id uuid not null references public.psx_dividend_announcements (id) on delete cascade,
  symbol text not null,
  shares numeric(18, 4) not null check (shares > 0),
  dps numeric(14, 4) not null,
  gross numeric(14, 2) not null,
  tax_rate numeric(5, 4) not null,
  tax numeric(14, 2) not null,
  net numeric(14, 2) not null,
  filer_status text not null default 'unknown' check (filer_status in ('filer', 'non_filer', 'unknown')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'matched')),
  dividend_id uuid references public.stock_dividends (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upcoming_dividends_key unique (user_id, announcement_id)
);
create index if not exists upcoming_dividends_user_status on public.upcoming_dividends (user_id, status);
create index if not exists upcoming_dividends_announcement on public.upcoming_dividends (announcement_id);
create index if not exists upcoming_dividends_dividend on public.upcoming_dividends (dividend_id);

alter table public.upcoming_dividends enable row level security;
revoke all on public.upcoming_dividends from anon, authenticated;
grant select on public.upcoming_dividends to authenticated;
drop policy if exists "own upcoming dividends" on public.upcoming_dividends;
create policy "own upcoming dividends" on public.upcoming_dividends
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── calendar helpers: PSX business days (weekends + days PSX published no market summary) ──
create or replace function market_private.psx_prev_business_day(p_day date)
returns date language plpgsql stable set search_path = '' as $$
declare d date := p_day - 1;
begin
  while extract(isodow from d) > 5
     or exists (select 1 from market_private.psx_summary_days s where s.day = d and s.status = 'no_file') loop
    d := d - 1;
  end loop;
  return d;
end; $$;

create or replace function market_private.add_weekdays(p_day date, p_n int)
returns date language plpgsql immutable set search_path = '' as $$
declare d date := p_day; n int := 0;
begin
  while n < p_n loop
    d := d + 1;
    if extract(isodow from d) <= 5 then n := n + 1; end if;
  end loop;
  return d;
end; $$;

-- ── which symbols to scan: held now, or traded in the last 120 days (sold after an ex-date still gets paid) ──
create or replace function public.dividend_scan_symbols(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(distinct s.symbol order by s.symbol), '[]'::jsonb) from (
    select upper(t.symbol) as symbol from public.stock_transactions t
     where p_user is null or t.user_id = p_user
     group by t.user_id, upper(t.symbol)
    having sum(case when t.type = 'buy' then t.quantity else -t.quantity end) > 0
        or max(t.date) >= current_date - 120
  ) s;
$$;

-- ── the daily sync (service only): store announcements, then rebuild each holder's pending rows ──
-- p_rows: [{ symbol, company_name, announced_on, period, dividend_type, interim_no, percent, dps, face_value,
--            book_closure_from, book_closure_to, agm_date, source, source_url, raw }]
-- p_user: null = everyone (scheduled run), else only that user's rows (Check now).
create or replace function public.dividends_upcoming_sync(p_rows jsonb, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_bc date; v_ex date; v_cum date; v_type text; v_agm date;
  v_ann int := 0; v_pending int; v_matched int; v_removed int; v_reset int;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_bc := (r->>'book_closure_from')::date;
    v_type := coalesce(nullif(r->>'dividend_type', ''), 'interim');
    v_agm := nullif(r->>'agm_date', '')::date;
    if v_bc is null or nullif(r->>'dps', '')::numeric is null or (r->>'dps')::numeric <= 0 then continue; end if;
    v_ex := market_private.psx_prev_business_day(v_bc);
    v_cum := market_private.psx_prev_business_day(v_ex);
    insert into public.psx_dividend_announcements as a (symbol, company_name, announced_on, period, dividend_type, interim_no,
      percent, dps, face_value, book_closure_from, book_closure_to, agm_date, ex_date, last_cum_date, expected_pay_by,
      source, source_url, raw)
    values (upper(r->>'symbol'), left(r->>'company_name', 200), nullif(r->>'announced_on', '')::date, left(r->>'period', 40),
      v_type, nullif(r->>'interim_no', '')::smallint, nullif(r->>'percent', '')::numeric, (r->>'dps')::numeric,
      nullif(r->>'face_value', '')::numeric, v_bc, nullif(r->>'book_closure_to', '')::date, v_agm, v_ex, v_cum,
      -- Credit within 10 working days of book closure (interim) or of the AGM (final) — PSX Reg. 5.6.10.
      market_private.add_weekdays(case when v_type = 'final' then coalesce(v_agm, nullif(r->>'book_closure_to', '')::date, v_bc) else v_bc end, 10),
      case when r->>'source' = 'psx_letter_ai' then 'psx_letter_ai' else 'psx_announcements' end,
      left(r->>'source_url', 300), left(r->>'raw', 500))
    on conflict (symbol, book_closure_from, dps) do update set
      company_name = coalesce(excluded.company_name, a.company_name),
      announced_on = coalesce(a.announced_on, excluded.announced_on),
      period = coalesce(excluded.period, a.period),
      dividend_type = excluded.dividend_type, interim_no = coalesce(excluded.interim_no, a.interim_no),
      percent = coalesce(excluded.percent, a.percent), face_value = coalesce(excluded.face_value, a.face_value),
      book_closure_to = coalesce(excluded.book_closure_to, a.book_closure_to), agm_date = coalesce(excluded.agm_date, a.agm_date),
      ex_date = excluded.ex_date, last_cum_date = excluded.last_cum_date, expected_pay_by = excluded.expected_pay_by,
      -- The structured PSX table outranks a letter read by AI.
      source = case when a.source = 'psx_announcements' then a.source else excluded.source end,
      source_url = coalesce(case when a.source = 'psx_announcements' then a.source_url end, excluded.source_url, a.source_url),
      raw = coalesce(excluded.raw, a.raw), updated_at = now();
    v_ann := v_ann + 1;
  end loop;

  -- An approved dividend the owner later deleted goes back to the list.
  update public.upcoming_dividends u set status = 'pending', decided_at = null, updated_at = now()
   where u.status in ('approved', 'matched') and u.dividend_id is null and (p_user is null or u.user_id = p_user);
  get diagnostics v_reset = row_count;

  -- Holders at the end of the last cum day, for announcements still current (book closure within the last 60 days or ahead).
  with ann as (
    select * from public.psx_dividend_announcements where book_closure_from >= current_date - 60
  ), held as (
    select a.id as announcement_id, t.user_id, a.symbol, a.dps,
           sum(case when t.type = 'buy' then t.quantity else -t.quantity end) as shares
      from ann a
      join public.stock_transactions t on upper(t.symbol) = a.symbol and t.date <= a.last_cum_date
     where p_user is null or t.user_id = p_user
     group by a.id, t.user_id, a.symbol, a.dps
  ), priced as (
    select h.*, coalesce(p.filer_status, 'unknown') as filer_status,
           case when p.filer_status = 'non_filer' then 0.30 else 0.15 end as rate,
           round(h.shares * h.dps, 2) as gross
      from held h left join public.profiles p on p.user_id = h.user_id
     where h.shares > 0
  ), up as (
    insert into public.upcoming_dividends as u (user_id, announcement_id, symbol, shares, dps, gross, tax_rate, tax, net, filer_status)
    select user_id, announcement_id, symbol, shares, dps, gross, rate, round(gross * rate, 2), gross - round(gross * rate, 2), filer_status
      from priced
    on conflict (user_id, announcement_id) do update set
      shares = excluded.shares, dps = excluded.dps, gross = excluded.gross, tax_rate = excluded.tax_rate, tax = excluded.tax,
      net = excluded.net, filer_status = excluded.filer_status, updated_at = now()
     where u.status = 'pending'
    returning 1
  )
  select count(*) into v_pending from up;

  -- Sold out before the last cum day → no longer entitled (only rows still awaiting a decision are removed).
  delete from public.upcoming_dividends u
   using public.psx_dividend_announcements a
   where a.id = u.announcement_id and u.status = 'pending' and (p_user is null or u.user_id = p_user)
     and a.book_closure_from >= current_date - 60
     and coalesce((select sum(case when t.type = 'buy' then t.quantity else -t.quantity end)
                     from public.stock_transactions t
                    where t.user_id = u.user_id and upper(t.symbol) = a.symbol and t.date <= a.last_cum_date), 0) <= 0;
  get diagnostics v_removed = row_count;

  -- Already recorded (uploaded report or typed by hand): link it instead of asking again.
  with m as (
    select distinct on (u.id) u.id, d.id as dividend_id
      from public.upcoming_dividends u
      join public.psx_dividend_announcements a on a.id = u.announcement_id
      join public.stock_dividends d on d.user_id = u.user_id and d.symbol = u.symbol
       and d.payment_date between a.book_closure_from - 3 and a.book_closure_from + 75
       and (abs(d.gross_amount - u.gross) <= greatest(1, u.gross * 0.05) or (d.dps is not null and abs(d.dps - u.dps) < 0.01))
     where u.status = 'pending' and (p_user is null or u.user_id = p_user)
       and not exists (select 1 from public.upcoming_dividends o where o.dividend_id = d.id and o.id <> u.id)
     order by u.id, abs(d.payment_date - a.book_closure_from)
  )
  update public.upcoming_dividends u set status = 'matched', dividend_id = m.dividend_id, decided_at = now(), updated_at = now()
    from m where u.id = m.id;
  get diagnostics v_matched = row_count;

  -- Keep it lean: announcements nobody needs any more.
  delete from public.psx_dividend_announcements a
   where a.book_closure_from < current_date - 180
     and not exists (select 1 from public.upcoming_dividends u where u.announcement_id = a.id and u.status = 'pending');

  return jsonb_build_object('announcements', v_ann, 'pending', v_pending, 'matched', v_matched, 'removed', v_removed, 'reset', v_reset);
end; $$;

revoke all on function public.dividends_upcoming_sync(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.dividend_scan_symbols(uuid) from public, anon, authenticated;
revoke all on function market_private.psx_prev_business_day(date) from public, anon, authenticated;
revoke all on function market_private.add_weekdays(date, int) from public, anon, authenticated;

-- ── the owner's decisions ──
-- Approve with what actually arrived: net received and the payment date (shares / gross may be corrected too).
-- The difference gross − net is booked as tax. Goes through dividends_save, so a report uploaded before or after
-- never doubles the amount.
create or replace function public.upcoming_dividend_approve(p_id uuid, p_payment_date date, p_net numeric,
  p_gross numeric default null, p_shares numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); u public.upcoming_dividends; a public.psx_dividend_announcements;
  v_gross numeric; v_shares numeric; v_div uuid; v_res jsonb;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select * into u from public.upcoming_dividends where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if u.status not in ('pending', 'rejected') then raise exception 'already decided' using errcode = '22023'; end if;
  select * into a from public.psx_dividend_announcements where id = u.announcement_id;
  v_shares := coalesce(p_shares, u.shares);
  v_gross := coalesce(p_gross, round(v_shares * u.dps, 2));
  if p_payment_date is null or p_payment_date > current_date + 1 then raise exception 'payment date must be a past date' using errcode = '22023'; end if;
  if p_net is null or p_net <= 0 or v_shares <= 0 then raise exception 'amounts must be positive' using errcode = '22023'; end if;
  if p_net > v_gross then raise exception 'received amount is more than the gross dividend' using errcode = '22023'; end if;

  v_res := public.dividends_save(jsonb_build_array(jsonb_build_object(
    'symbol', u.symbol, 'company_name', a.company_name, 'payment_date', p_payment_date, 'shares', v_shares,
    'gross_amount', v_gross, 'tax_amount', v_gross - p_net, 'net_amount', p_net,
    'filer_status', u.filer_status, 'dividend_type', a.dividend_type, 'dps', round(v_gross / v_shares, 4),
    'notes', left(format('Approved from upcoming: book closure %s, ex-date %s', a.book_closure_from, a.ex_date), 500))));

  select d.id into v_div from public.stock_dividends d
   where d.user_id = v_uid and d.symbol = u.symbol and abs(d.payment_date - p_payment_date) <= 7
   order by abs(d.payment_date - p_payment_date), abs(d.net_amount - p_net) limit 1;

  update public.upcoming_dividends set status = 'approved', dividend_id = v_div, decided_at = now(), updated_at = now(),
    shares = v_shares, gross = v_gross, tax = v_gross - p_net, net = p_net
   where id = p_id;
  return v_res || jsonb_build_object('dividend_id', v_div);
end; $$;

create or replace function public.upcoming_dividend_decide(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if p_status not in ('rejected', 'pending') then raise exception 'status must be rejected or pending' using errcode = '22023'; end if;
  update public.upcoming_dividends set status = p_status, decided_at = case when p_status = 'rejected' then now() end, updated_at = now()
   where id = p_id and user_id = auth.uid() and status in ('pending', 'rejected');
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
end; $$;

revoke all on function public.upcoming_dividend_approve(uuid, date, numeric, numeric, numeric) from public, anon;
revoke all on function public.upcoming_dividend_decide(uuid, text) from public, anon;
grant execute on function public.upcoming_dividend_approve(uuid, date, numeric, numeric, numeric) to authenticated;
grant execute on function public.upcoming_dividend_decide(uuid, text) to authenticated;

-- ── nightly, in the one evening pipeline (after the holdings refresh) ──
create or replace function market_private.request_dividends_scan()
returns bigint language plpgsql security definer set search_path = '' as $$
begin
  return net.http_post(
    url := 'https://qrekpudclwesajfhrokv.supabase.co/functions/v1/dividends-scan',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'snapshot_cron_secret')),
    body := '{"mode":"cron"}'::jsonb, timeout_milliseconds := 150000);
end; $$;
revoke all on function market_private.request_dividends_scan() from public, anon, authenticated;
