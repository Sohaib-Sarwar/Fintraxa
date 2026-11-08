-- Savings accounts: the user's own bank accounts that pay profit (passive income).
--
-- An account is a PSX-listed commercial bank (by ticker, for its logo), a name the
-- user chooses ("Meezan savings", "UBL AMSA"), an annual profit rate for reference
-- and the tax withheld on its profit (20% for an active filer). Savings profit
-- entries (income_expense_transactions in the Savings profit category) point at
-- the account they were credited to.
--
-- An account with entries cannot be deleted (its history would lose its bank);
-- it is archived instead. Entries may only point at the owner's own accounts:
-- a foreign key alone would let a crafted request reference someone else's id,
-- because FK checks bypass RLS, so a trigger enforces ownership.

create table if not exists public.savings_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bank_symbol  text not null check (bank_symbol ~ '^[A-Z0-9]{2,10}$'),
  bank_name    text not null check (char_length(bank_name) between 1 and 120),
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  profit_rate  numeric(6, 3) check (profit_rate is null or (profit_rate >= 0 and profit_rate <= 100)),  -- % a year
  tax_rate     numeric(5, 4) not null default 0.20 check (tax_rate >= 0 and tax_rate < 1),
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint savings_accounts_name_key unique (user_id, name)
);

comment on table public.savings_accounts is 'Bank savings accounts whose profit is recorded as passive income. Own rows only (RLS).';

alter table public.savings_accounts enable row level security;
create policy "Savings accounts: read own" on public.savings_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Savings accounts: add own" on public.savings_accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Savings accounts: edit own" on public.savings_accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Savings accounts: delete own" on public.savings_accounts
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.savings_accounts from anon;
grant select, insert, update, delete on public.savings_accounts to authenticated;

create trigger update_savings_accounts_updated_at before update on public.savings_accounts
  for each row execute function public.update_updated_at_column();
create trigger log_savings_accounts_deletion before delete on public.savings_accounts
  for each row execute function public.log_deletion();

-- Which account a savings-profit entry was credited to.
alter table public.income_expense_transactions
  add column if not exists savings_account_id uuid references public.savings_accounts (id) on delete restrict;
create index if not exists income_expense_transactions_savings_account_idx
  on public.income_expense_transactions (savings_account_id) where savings_account_id is not null;

create or replace function public.check_savings_account_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.savings_account_id is not null and not exists (
    select 1 from public.savings_accounts a where a.id = new.savings_account_id and a.user_id = new.user_id
  ) then
    raise exception 'That savings account does not belong to you' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_savings_account_owner() from anon, authenticated, public;

drop trigger if exists check_savings_account_owner on public.income_expense_transactions;
create trigger check_savings_account_owner before insert or update of savings_account_id, user_id on public.income_expense_transactions
  for each row execute function public.check_savings_account_owner();
