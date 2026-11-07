-- PSX cash dividends, one row per dividend warrant.
--
-- Source of truth is the CDC / share-registrar dividend statement: payment
-- date, issue date, security, account, warrant, filer status, securities held,
-- gross, withholding tax, joint-holder tax, zakat and the net amount actually
-- paid. Amounts are stored exactly as printed. The statement's net is what
-- reached the bank and is sometimes rounded to whole rupees, so net is NOT
-- forced to equal gross − deductions; the app flags any gap instead.
--
-- Writes come straight from the client under RLS (own rows only), the same
-- model as stock_transactions. Re-importing a statement is idempotent: the
-- unique key (user, symbol, payment date, warrant) makes a repeat a no-op,
-- while manual rows without a warrant number never collide with each other.

create table public.stock_dividends (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol            text not null check (symbol ~ '^[A-Z0-9][A-Z0-9.\-]{0,15}$'),
  company_name      text check (char_length(company_name) <= 200),
  payment_date      date not null,
  issue_date        date,
  account_ref       text check (char_length(account_ref) <= 40),     -- "Part. ID - A/c # / Folio #"
  warrant_no        text check (char_length(warrant_no) <= 40),
  filer_status      text not null default 'unknown' check (filer_status in ('filer', 'non_filer', 'unknown')),
  filer_status_raw  text check (char_length(filer_status_raw) <= 40), -- as printed: "Filer", "Non Filler", "30%"
  shares            numeric(20, 4) not null check (shares > 0),
  gross_amount      numeric(16, 2) not null check (gross_amount >= 0),
  tax_amount        numeric(16, 2) not null default 0 check (tax_amount >= 0),
  jh_tax_amount     numeric(16, 2) not null default 0 check (jh_tax_amount >= 0),
  zakat_amount      numeric(16, 2) not null default 0 check (zakat_amount >= 0),
  net_amount        numeric(16, 2) not null check (net_amount >= 0),
  source            text not null default 'manual' check (source in ('manual', 'statement')),
  notes             text check (char_length(notes) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint stock_dividends_dates_check check (issue_date is null or issue_date <= payment_date),
  constraint stock_dividends_deductions_check check (tax_amount + jh_tax_amount + zakat_amount <= gross_amount),
  constraint stock_dividends_warrant_key unique (user_id, symbol, payment_date, warrant_no)
);

comment on table public.stock_dividends is 'PSX cash dividends per warrant, as printed on the dividend statement. Own rows only (RLS).';
comment on column public.stock_dividends.net_amount is 'Net paid as printed on the statement; may differ from gross − deductions by statement rounding.';

create index stock_dividends_user_date_idx on public.stock_dividends (user_id, payment_date desc);

alter table public.stock_dividends enable row level security;

create policy "Dividends: read own" on public.stock_dividends
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Dividends: add own" on public.stock_dividends
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Dividends: edit own" on public.stock_dividends
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Dividends: delete own" on public.stock_dividends
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.stock_dividends from anon;
grant select, insert, update, delete on public.stock_dividends to authenticated;

-- Same housekeeping as stock_transactions: updated_at, and deletes kept in deletion_log.
create trigger update_stock_dividends_updated_at before update on public.stock_dividends
  for each row execute function public.update_updated_at_column();
create trigger log_stock_dividends_deletion before delete on public.stock_dividends
  for each row execute function public.log_deletion();
