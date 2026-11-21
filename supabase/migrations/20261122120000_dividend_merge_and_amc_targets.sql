-- 1) Dividend report uploads complete existing rows instead of duplicating them (owner, 2026-11-22: "if anything is
--    missing on an existing dividend — filer status, warrant number — don't duplicate the amount, just update the
--    missing info"). One function for web and mobile, in one transaction, under the caller's RLS.
--    For each incoming row:
--      a) same stock and warrant number on file (paid within ±7 days)   → fill the empty fields of that row;
--      b) otherwise the same payment recorded another way — same stock, paid within ±7 days, net or gross within
--         2% (at least Rs 1), and at least one side without a warrant      → complete that row (closest date, then amount);
--      c) otherwise                                                      → insert.
--    Amounts on an existing row are never changed; only empty details are filled.
--    Returns { added, completed, skipped }.
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

    -- a) the same warrant already on file
    if v_warrant is not null then
      -- A warrant number identifies one payment; within a week either side, so a row completed earlier (which kept
      -- the owner's own payment date) is still recognised when the same report is uploaded again.
      select d.id, d.payment_date into v_id, v_pay from public.stock_dividends d
       where d.user_id = v_uid and d.symbol = v_symbol and d.warrant_no = v_warrant and abs(d.payment_date - v_date) <= 7
       order by abs(d.payment_date - v_date)
       limit 1;
    end if;

    -- b) the same payment recorded another way: a report row (warrant) completes a hand-added row (no warrant);
    --    a hand-added row (no warrant) matches anything already on file — it is then not added a second time.
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
      -- The payment date on file stays (the owner's); an issue date after it would break issue ≤ payment — leave it out.
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
        dps              = coalesce(d.dps, nullif(r->>'dps', '')::numeric),
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

-- 2) Price refresh targets carry each fund's own manager (mf_amcs), so the managers' own price pages are asked even
--    when MUFAP's published list is late or doesn't carry the fund (owner, 2026-11-22: "don't depend on MUFAP").
create or replace function public.market_refresh_targets(p_user uuid)
returns jsonb
language sql
stable security definer
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
      select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'category', f.category, 'slug', f.mufap_slug,
                                          'amc_code', a.code, 'amc_name', a.name) order by f.name)
        from public.mf_funds f
        left join public.mf_amcs a on a.id = f.amc_id
       where f.id in (
           select e.fund_id from public.mf_ledger_entries e
            where p_user is null or e.user_id = p_user
            group by e.user_id, e.account_id, e.fund_id, e.unit_class
           having coalesce(sum(e.unit_delta), 0) > 0.01)
    ), '[]'::jsonb)
  );
$$;
