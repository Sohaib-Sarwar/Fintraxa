-- CDC report completes dividends entered by hand (client report, 2026-11-26: "a dividend added by hand without the
-- warrant number is not filled in when the CDC report is uploaded later").
--
-- The server merge (dividends_save) was already right; the apps never sent those rows (they were flagged "possible
-- duplicate" and left unticked). The apps now classify rows with the same rules (src/lib/psx/dividends.js
-- dividendMatches). This migration only adds:
--  1) dividends_save: when a row on file is completed and has no DPS, it gets gross ÷ shares (4 dp), so its receipt
--     can show the per-share rate. Matching and amounts are unchanged (amounts on file are never overwritten).
--  2) dividends_upcoming_sync also returns `waiting` (pending entries after linking) and `recorded` (entries of the
--     last 60 days already recorded / approved), so "Check now" can say what is really waiting instead of how many
--     announcements PSX lists for the user's stocks.

create or replace function public.dividends_save(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r jsonb;
  v_id uuid;
  v_added int := 0; v_completed int := 0; v_skipped int := 0;
  v_symbol text; v_date date; v_warrant text; v_net numeric; v_gross numeric; v_n int; v_pay date; v_issue date;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be an array' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_symbol := upper(trim(r->>'symbol'));
    v_date := (r->>'payment_date')::date;
    v_warrant := nullif(trim(coalesce(r->>'warrant_no', '')), '');
    v_net := nullif(r->>'net_amount', '')::numeric;
    v_gross := nullif(r->>'gross_amount', '')::numeric;
    v_id := null;
    v_issue := nullif(r->>'issue_date', '')::date;

    -- a) the same warrant already on file (within a week either side: a completed row keeps the owner's own date)
    if v_warrant is not null then
      select d.id, d.payment_date into v_id, v_pay from public.stock_dividends d
       where d.user_id = v_uid and d.symbol = v_symbol and d.warrant_no = v_warrant and abs(d.payment_date - v_date) <= 7
       order by abs(d.payment_date - v_date)
       limit 1;
    end if;

    -- b) the same payment recorded another way (one side without a warrant, within a week, amount within 2% / Rs 1)
    if v_id is null then
      select d.id, d.payment_date into v_id, v_pay from public.stock_dividends d
       where d.user_id = v_uid and d.symbol = v_symbol
         and (v_warrant is null or d.warrant_no is null)
         and abs(d.payment_date - v_date) <= 7
         and ((v_net is not null and abs(d.net_amount - v_net) <= greatest(1, abs(v_net) * 0.02))
           or (v_gross is not null and abs(d.gross_amount - v_gross) <= greatest(1, abs(v_gross) * 0.02)))
       order by abs(d.payment_date - v_date), abs(d.net_amount - coalesce(v_net, d.net_amount))
       limit 1;
    end if;

    if v_id is not null then
      if v_issue is not null and v_issue > v_pay then v_issue := null; end if;
      update public.stock_dividends d set
        warrant_no       = coalesce(d.warrant_no, v_warrant),
        issue_date       = coalesce(d.issue_date, v_issue),
        account_ref      = coalesce(d.account_ref, nullif(r->>'account_ref', '')),
        company_name     = coalesce(d.company_name, nullif(r->>'company_name', '')),
        filer_status     = case when d.filer_status = 'unknown' and coalesce(r->>'filer_status', 'unknown') in ('filer', 'non_filer')
                                then r->>'filer_status' else d.filer_status end,
        filer_status_raw = coalesce(d.filer_status_raw, nullif(r->>'filer_status_raw', '')),
        notes            = coalesce(d.notes, nullif(r->>'notes', '')),
        dividend_type    = coalesce(d.dividend_type, nullif(r->>'dividend_type', '')),
        dps              = coalesce(d.dps, nullif(r->>'dps', '')::numeric, round(d.gross_amount / nullif(d.shares, 0), 4)),
        updated_at       = now()
       where d.id = v_id
         and (d.warrant_no is null and v_warrant is not null
           or d.issue_date is null and v_issue is not null
           or d.account_ref is null and nullif(r->>'account_ref', '') is not null
           or d.company_name is null and nullif(r->>'company_name', '') is not null
           or d.filer_status = 'unknown' and coalesce(r->>'filer_status', 'unknown') in ('filer', 'non_filer')
           or d.filer_status_raw is null and nullif(r->>'filer_status_raw', '') is not null
           or d.dividend_type is null and nullif(r->>'dividend_type', '') is not null
           or d.dps is null and nullif(r->>'dps', '') is not null);
      get diagnostics v_n = row_count;
      if v_n > 0 then v_completed := v_completed + 1; else v_skipped := v_skipped + 1; end if;
      continue;
    end if;

    -- c) new
    insert into public.stock_dividends (user_id, symbol, company_name, payment_date, issue_date, account_ref, warrant_no,
      filer_status, filer_status_raw, shares, gross_amount, tax_amount, jh_tax_amount, zakat_amount, net_amount, source, notes, dividend_type, dps)
    values (v_uid, v_symbol, nullif(r->>'company_name', ''), v_date, v_issue, nullif(r->>'account_ref', ''), v_warrant,
      coalesce(nullif(r->>'filer_status', ''), 'unknown'), nullif(r->>'filer_status_raw', ''),
      (r->>'shares')::numeric, v_gross, coalesce(nullif(r->>'tax_amount', '')::numeric, 0), coalesce(nullif(r->>'jh_tax_amount', '')::numeric, 0),
      coalesce(nullif(r->>'zakat_amount', '')::numeric, 0), v_net, case when r->>'source' = 'statement' then 'statement' else 'manual' end,
      nullif(r->>'notes', ''), nullif(r->>'dividend_type', ''), nullif(r->>'dps', '')::numeric)
    on conflict (user_id, symbol, payment_date, warrant_no) do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then v_added := v_added + 1; else v_skipped := v_skipped + 1; end if;
  end loop;

  return jsonb_build_object('added', v_added, 'completed', v_completed, 'skipped', v_skipped);
end;
$$;

revoke all on function public.dividends_save(jsonb) from public, anon;
grant execute on function public.dividends_save(jsonb) to authenticated;

create or replace function public.dividends_upcoming_sync(p_rows jsonb, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_bc date; v_ex date; v_cum date; v_type text; v_agm date; v_src text; v_sym text;
  v_ann int := 0; v_pending int; v_matched int; v_removed int; v_reset int; v_waiting int; v_recorded int;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_bc := (r->>'book_closure_from')::date;
    v_sym := upper(r->>'symbol');
    v_type := coalesce(nullif(r->>'dividend_type', ''), 'interim');
    v_agm := nullif(r->>'agm_date', '')::date;
    v_src := case when r->>'source' = 'psx_letter_ai' then 'psx_letter_ai' else 'psx_announcements' end;
    if v_bc is null or nullif(r->>'dps', '')::numeric is null or (r->>'dps')::numeric <= 0 then continue; end if;
    -- A letter read by AI never adds or changes an entry PSX's own table already has for that book closure.
    if v_src = 'psx_letter_ai' and exists (select 1 from public.psx_dividend_announcements a
         where a.symbol = v_sym and a.book_closure_from = v_bc and a.source = 'psx_announcements') then continue; end if;
    v_ex := market_private.psx_prev_business_day(v_bc);
    v_cum := market_private.psx_prev_business_day(v_ex);
    insert into public.psx_dividend_announcements as a (symbol, company_name, announced_on, period, dividend_type, interim_no,
      percent, dps, face_value, book_closure_from, book_closure_to, agm_date, ex_date, last_cum_date, expected_pay_by,
      source, source_url, raw)
    values (v_sym, left(r->>'company_name', 200), nullif(r->>'announced_on', '')::date, left(r->>'period', 40),
      v_type, nullif(r->>'interim_no', '')::smallint, nullif(r->>'percent', '')::numeric, (r->>'dps')::numeric,
      nullif(r->>'face_value', '')::numeric, v_bc, nullif(r->>'book_closure_to', '')::date, v_agm, v_ex, v_cum,
      market_private.add_weekdays(case when v_type = 'final' then coalesce(v_agm, nullif(r->>'book_closure_to', '')::date, v_bc) else v_bc end, 10),
      v_src, left(r->>'source_url', 300), left(r->>'raw', 500))
    on conflict (symbol, book_closure_from, dividend_type) do update set
      dps = case when excluded.source = 'psx_announcements' or a.source = 'psx_letter_ai' then excluded.dps else a.dps end,
      percent = case when excluded.source = 'psx_announcements' then coalesce(excluded.percent, a.percent) else coalesce(a.percent, excluded.percent) end,
      company_name = coalesce(excluded.company_name, a.company_name),
      announced_on = coalesce(a.announced_on, excluded.announced_on),
      period = coalesce(excluded.period, a.period),
      interim_no = coalesce(excluded.interim_no, a.interim_no),
      face_value = coalesce(excluded.face_value, a.face_value),
      book_closure_to = coalesce(excluded.book_closure_to, a.book_closure_to), agm_date = coalesce(excluded.agm_date, a.agm_date),
      ex_date = excluded.ex_date, last_cum_date = excluded.last_cum_date, expected_pay_by = excluded.expected_pay_by,
      source = case when a.source = 'psx_announcements' or excluded.source = 'psx_announcements' then 'psx_announcements' else a.source end,
      source_url = case when excluded.source = 'psx_announcements' then excluded.source_url else coalesce(a.source_url, excluded.source_url) end,
      raw = coalesce(excluded.raw, a.raw), updated_at = now();
    v_ann := v_ann + 1;
  end loop;

  update public.upcoming_dividends u set status = 'pending', decided_at = null, updated_at = now()
   where u.status in ('approved', 'matched') and u.dividend_id is null and (p_user is null or u.user_id = p_user);
  get diagnostics v_reset = row_count;

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

  delete from public.upcoming_dividends u
   using public.psx_dividend_announcements a
   where a.id = u.announcement_id and u.status = 'pending' and (p_user is null or u.user_id = p_user)
     and a.book_closure_from >= current_date - 60
     and coalesce((select sum(case when t.type = 'buy' then t.quantity else -t.quantity end)
                     from public.stock_transactions t
                    where t.user_id = u.user_id and upper(t.symbol) = a.symbol and t.date <= a.last_cum_date), 0) <= 0;
  get diagnostics v_removed = row_count;

  v_matched := market_private.link_upcoming(p_user);

  delete from public.psx_dividend_announcements a
   where a.book_closure_from < current_date - 180
     and not exists (select 1 from public.upcoming_dividends u where u.announcement_id = a.id and u.status = 'pending');

  -- What the user is told after "Check now": entries still waiting for them, and recent ones already recorded.
  select count(*) filter (where u.status = 'pending'),
         count(*) filter (where u.status in ('matched', 'approved') and a.book_closure_from >= current_date - 60)
    into v_waiting, v_recorded
    from public.upcoming_dividends u
    join public.psx_dividend_announcements a on a.id = u.announcement_id
   where p_user is null or u.user_id = p_user;

  return jsonb_build_object('announcements', v_ann, 'pending', v_pending, 'matched', v_matched, 'removed', v_removed,
    'reset', v_reset, 'waiting', v_waiting, 'recorded', v_recorded);
end; $$;
revoke all on function public.dividends_upcoming_sync(jsonb, uuid) from public, anon, authenticated;
