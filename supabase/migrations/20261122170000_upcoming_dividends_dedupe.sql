-- Upcoming dividends never duplicate (owner, 2026-11-22: "deal with already added and duplicates, all scenarios").
--  1) One announcement per stock, book-closure start and type: a corrected amount updates it (pending rows follow);
--     a letter read by AI never adds a second entry next to one PSX's table already gave.
--  2) A dividend already on file (uploaded report or typed by hand) is linked as 'matched' instead of asking again —
--     at once when it is saved (trigger), and on every scan. One payment is linked to at most one upcoming entry.
--  3) Approving goes through dividends_save (fills an existing row, never a second amount) — unchanged.

alter table public.psx_dividend_announcements drop constraint if exists psx_dividend_announcements_key;
alter table public.psx_dividend_announcements add constraint psx_dividend_announcements_key unique (symbol, book_closure_from, dividend_type);

-- Link pending upcoming rows to dividends already recorded: paid from 3 days before book closure to 75 days after,
-- gross within 5% (at least Rs 1) or the same DPS; each recorded payment used once, closest date first.
create or replace function market_private.link_upcoming(p_user uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  with cand as (
    select u.id as upcoming_id, d.id as dividend_id, abs(d.payment_date - a.book_closure_from) as dist
      from public.upcoming_dividends u
      join public.psx_dividend_announcements a on a.id = u.announcement_id
      join public.stock_dividends d on d.user_id = u.user_id and d.symbol = u.symbol
       and d.payment_date between a.book_closure_from - 3 and a.book_closure_from + 75
       and (abs(d.gross_amount - u.gross) <= greatest(1, u.gross * 0.05) or (d.dps is not null and abs(d.dps - u.dps) < 0.01))
     where u.status = 'pending' and (p_user is null or u.user_id = p_user)
       and not exists (select 1 from public.upcoming_dividends o where o.dividend_id = d.id)
  ), by_div as (
    select distinct on (dividend_id) upcoming_id, dividend_id, dist from cand order by dividend_id, dist
  ), pick as (
    select distinct on (upcoming_id) upcoming_id, dividend_id from by_div order by upcoming_id, dist
  )
  update public.upcoming_dividends u set status = 'matched', dividend_id = p.dividend_id, decided_at = now(), updated_at = now()
    from pick p where u.id = p.upcoming_id;
  get diagnostics v_n = row_count;
  return v_n;
end; $$;
revoke all on function market_private.link_upcoming(uuid) from public, anon, authenticated;

-- A dividend saved by hand or from a report links its upcoming entry immediately.
create or replace function market_private.on_dividend_saved()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform market_private.link_upcoming(new.user_id);
  return null;
end; $$;
drop trigger if exists stock_dividends_link_upcoming on public.stock_dividends;
create trigger stock_dividends_link_upcoming after insert on public.stock_dividends
  for each row execute function market_private.on_dividend_saved();

-- A deleted dividend frees its upcoming entry (back to the list).
create or replace function market_private.on_dividend_deleted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.upcoming_dividends set status = 'pending', dividend_id = null, decided_at = null, updated_at = now()
   where dividend_id = old.id and status in ('approved', 'matched');
  return old; -- a BEFORE DELETE trigger must return OLD, or the delete is skipped
end; $$;
drop trigger if exists stock_dividends_unlink_upcoming on public.stock_dividends;
create trigger stock_dividends_unlink_upcoming before delete on public.stock_dividends
  for each row execute function market_private.on_dividend_deleted();

create or replace function public.dividends_upcoming_sync(p_rows jsonb, p_user uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; v_bc date; v_ex date; v_cum date; v_type text; v_agm date; v_src text; v_sym text;
  v_ann int := 0; v_pending int; v_matched int; v_removed int; v_reset int;
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
      -- PSX's table corrects anything; an AI read only fills what is missing.
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

  -- Approved / matched whose dividend was deleted (the delete trigger normally handles it) → back to the list.
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

  return jsonb_build_object('announcements', v_ann, 'pending', v_pending, 'matched', v_matched, 'removed', v_removed, 'reset', v_reset);
end; $$;
revoke all on function public.dividends_upcoming_sync(jsonb, uuid) from public, anon, authenticated;

-- Approve: as before, but a payment already linked to another upcoming entry is never linked twice.
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

  -- The row is marked first, so the insert trigger (link_upcoming) does not also link it as 'matched'.
  update public.upcoming_dividends set status = 'approved', decided_at = now(), updated_at = now(),
    shares = v_shares, gross = v_gross, tax = v_gross - p_net, net = p_net
   where id = p_id;

  v_res := public.dividends_save(jsonb_build_array(jsonb_build_object(
    'symbol', u.symbol, 'company_name', a.company_name, 'payment_date', p_payment_date, 'shares', v_shares,
    'gross_amount', v_gross, 'tax_amount', v_gross - p_net, 'net_amount', p_net,
    'filer_status', u.filer_status, 'dividend_type', a.dividend_type, 'dps', round(v_gross / v_shares, 4),
    'notes', left(format('Approved from upcoming: book closure %s, ex-date %s', a.book_closure_from, a.ex_date), 500))));

  select d.id into v_div from public.stock_dividends d
   where d.user_id = v_uid and d.symbol = u.symbol and abs(d.payment_date - p_payment_date) <= 7
     and not exists (select 1 from public.upcoming_dividends o where o.dividend_id = d.id and o.id <> p_id)
   order by abs(d.payment_date - p_payment_date), abs(d.net_amount - p_net) limit 1;

  update public.upcoming_dividends set dividend_id = v_div where id = p_id;
  return v_res || jsonb_build_object('dividend_id', v_div);
end; $$;
revoke all on function public.upcoming_dividend_approve(uuid, date, numeric, numeric, numeric) from public, anon;
grant execute on function public.upcoming_dividend_approve(uuid, date, numeric, numeric, numeric) to authenticated;
