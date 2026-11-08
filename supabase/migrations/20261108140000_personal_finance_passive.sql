-- Personal finance: active vs passive income, transfers vs spending, savings
-- profit with tax, and mutual-fund realized profit posted monthly.
--
-- 1. categories.kind
--      income  → 'active' (salary, business…) | 'passive' (savings profit, investment returns)
--      expense → 'spend' (consumption)        | 'transfer' (money moved into savings or
--                                                investments: not an expense)
--    Filled automatically on insert (income → active, expense → spend).
-- 2. categories.default_tax_rate: an income category with a rate (Savings profit, 20%)
--    asks for the gross amount and withholds tax.
-- 3. income_expense_transactions.gross_amount / tax_amount / tax_rate: when set,
--    amount (the net received) must equal gross − tax exactly.
-- 4. passive_income_postings: each closed month's mutual-fund realized profit
--    (gross, CGT, charges, net) as computed from the ledger, written by
--    sync_passive_postings() in one transaction: new months inserted, changed
--    months updated, months that no longer have activity removed.

-- ── 1–2. Category kind and default tax rate ────────────────────────────────
alter table public.categories
  add column if not exists kind text,
  add column if not exists default_tax_rate numeric(5, 4)
    check (default_tax_rate is null or (default_tax_rate >= 0 and default_tax_rate < 1));

update public.categories set kind = case
  when type = 'income' and name in ('Investment Returns', 'Savings profit') then 'passive'
  when type = 'income' then 'active'
  when type = 'expense' and (name = 'Savings' or name like 'Investment - %') then 'transfer'
  else 'spend'
end
where kind is null;

create or replace function public.categories_default_kind()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.kind is null then
    new.kind := case when new.type = 'income' then 'active' else 'spend' end;
  end if;
  return new;
end;
$$;
revoke execute on function public.categories_default_kind() from anon, authenticated, public;

drop trigger if exists categories_default_kind on public.categories;
create trigger categories_default_kind before insert or update of type, kind on public.categories
  for each row execute function public.categories_default_kind();

alter table public.categories alter column kind set not null;
alter table public.categories add constraint categories_kind_check check (
  (type = 'income' and kind in ('active', 'passive')) or (type = 'expense' and kind in ('spend', 'transfer'))
);

-- A "Savings profit" the app seeded before this migration (older schema) becomes passive with the 20% rate.
update public.categories set kind = 'passive', default_tax_rate = coalesce(default_tax_rate, 0.20)
where type = 'income' and name = 'Savings profit';

-- Savings profit for every user who already has categories (new users get it from the app's seed list).
insert into public.categories (user_id, name, type, icon, is_default, kind, default_tax_rate)
select distinct user_id, 'Savings profit', 'income', 'Savings', true, 'passive', 0.20
from public.categories where user_id is not null
on conflict (user_id, name) do nothing;

-- ── 3. Gross / tax on a transaction ────────────────────────────────────────
alter table public.income_expense_transactions
  add column if not exists gross_amount numeric(14, 2),
  add column if not exists tax_amount numeric(14, 2),
  add column if not exists tax_rate numeric(5, 4);

alter table public.income_expense_transactions add constraint income_expense_transactions_tax_check check (
  (gross_amount is null and tax_amount is null and tax_rate is null)
  or (
    -- explicit NOT NULLs: a CHECK that evaluates to NULL would pass
    gross_amount is not null and tax_amount is not null
    and gross_amount > 0 and tax_amount >= 0 and tax_amount <= gross_amount
    and amount = gross_amount - tax_amount
    and (tax_rate is null or (tax_rate >= 0 and tax_rate < 1))
  )
);

-- ── 4. Monthly passive-income postings ─────────────────────────────────────
create table if not exists public.passive_income_postings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source         text not null check (source in ('mutual_funds')),
  period         date not null check (extract(day from period) = 1),   -- first day of the month posted
  gross          numeric(16, 2) not null,                               -- may be negative (a realized loss)
  tax            numeric(16, 2) not null,                               -- may be negative (a CGT refund)
  charges        numeric(16, 2) not null default 0 check (charges >= 0),
  net            numeric(16, 2) not null,
  sales          integer not null default 0 check (sales >= 0),
  engine_version text not null check (char_length(engine_version) <= 40),
  posted_at      timestamptz not null default now(),
  constraint passive_income_postings_net_check check (net = gross - tax - charges),
  constraint passive_income_postings_period_key unique (user_id, source, period)
);

comment on table public.passive_income_postings is
  'Closed months of passive income computed from source ledgers (mutual funds: realized profit per src/lib/mf/profit.js). Written only through sync_passive_postings().';

alter table public.passive_income_postings enable row level security;
create policy "Postings: read own" on public.passive_income_postings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Postings: add own" on public.passive_income_postings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Postings: edit own" on public.passive_income_postings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Postings: delete own" on public.passive_income_postings
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.passive_income_postings from anon;
grant select, insert, update, delete on public.passive_income_postings to authenticated;

/**
 * Replace one source's postings with the given closed months, atomically.
 * p_rows: [{ "period": "2026-07-01", "gross": 0, "tax": 0, "charges": 0, "net": 0, "sales": 0 }]
 * Runs as the caller (SECURITY INVOKER): RLS limits it to the caller's own rows.
 * Returns { changed, removed }.
 */
create or replace function public.sync_passive_postings(p_source text, p_rows jsonb, p_engine text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_changed integer := 0;
  v_removed integer := 0;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if p_source is distinct from 'mutual_funds' then raise exception 'Unknown passive income source' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be an array' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(period date)
    where r.period is null or r.period >= date_trunc('month', current_date)::date
  ) then
    raise exception 'Only closed months can be posted' using errcode = '22023';
  end if;

  insert into public.passive_income_postings (user_id, source, period, gross, tax, charges, net, sales, engine_version)
  select v_uid, p_source, r.period, r.gross, r.tax, coalesce(r.charges, 0), r.net, coalesce(r.sales, 0), p_engine
  from jsonb_to_recordset(p_rows) as r(period date, gross numeric, tax numeric, charges numeric, net numeric, sales integer)
  on conflict (user_id, source, period) do update
    set gross = excluded.gross, tax = excluded.tax, charges = excluded.charges, net = excluded.net,
        sales = excluded.sales, engine_version = excluded.engine_version, posted_at = now()
    where (passive_income_postings.gross, passive_income_postings.tax, passive_income_postings.charges,
           passive_income_postings.net, passive_income_postings.sales, passive_income_postings.engine_version)
      is distinct from (excluded.gross, excluded.tax, excluded.charges, excluded.net, excluded.sales, excluded.engine_version);
  get diagnostics v_changed = row_count;

  delete from public.passive_income_postings p
  where p.user_id = v_uid and p.source = p_source
    and not exists (select 1 from jsonb_to_recordset(p_rows) as r(period date) where r.period = p.period);
  get diagnostics v_removed = row_count;

  return jsonb_build_object('changed', v_changed, 'removed', v_removed);
end;
$$;
revoke execute on function public.sync_passive_postings(text, jsonb, text) from anon, public;
grant execute on function public.sync_passive_postings(text, jsonb, text) to authenticated;
