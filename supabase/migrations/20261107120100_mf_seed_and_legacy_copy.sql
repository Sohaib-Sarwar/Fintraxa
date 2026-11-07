-- Mutual funds: reference data, and a non-destructive copy of the legacy
-- `mutual_fund_transactions` rows into the ledger.
--
-- The legacy table is read, never modified. Each copied entry carries
-- `legacy_txn_id`, which is unique, so this file can run any number of times.
-- An AFTER INSERT trigger keeps copying while an older build of the app (one
-- that still writes the legacy table) is in the field.

-- ─── AMCs ────────────────────────────────────────────────────────────────────
-- cost_method_evidence records *why* FIFO is used for each AMC
-- (docs/mutual-funds/MUTUAL_FUND_STATEMENT_ANALYSIS.md):
--   statement_stated      the statement says so (NBP)
--   statement_consistent  reported CGT reproduces under FIFO, not average cost
--   industry_default      Sec. 37A / NCCPL practice; not confirmed by a statement

insert into public.mf_amcs (code, name, match_patterns, statement_profile, cost_method_evidence, cost_method_note) values
  ('atlas',  'Atlas Asset Management Limited', array['\matlas\M'],
     '{"amount_dp": 2, "units_dp": 4, "running_balance": true, "purchase_label_is_amc_side": true}',
     'industry_default', 'Atlas does not state a method. Reported CGT is not reproducible from a flat rate, so it is stored as reported.'),
  ('mcb',    'MCB Investment Management Limited', array['\mmcb\M', '\malhamra\M', 'mcb[- ]arif habib'],
     '{"amount_dp": 2, "units_dp": 4, "running_balance": true, "redemption_rows": 2}',
     'industry_default', 'MCB does not state a method; FIFO per Sec. 37A / NCCPL practice.'),
  ('meezan', 'Al Meezan Investment Management Limited', array['\mmeezan\M', '\malmeezan\M'],
     '{"amount_dp": 0, "units_dp": 4, "running_balance": true, "redemption_rows": 2, "single_amount_outflow": "net_of_tax"}',
     'statement_consistent', 'Reported CGT on same-day conversions reproduces under FIFO and not under average cost.'),
  ('nbp',    'NBP Fund Management Limited', array['\mnbp\M', 'national bank of pakistan'],
     '{"amount_dp": 2, "units_dp": 4, "running_balance": false, "redemption_rows": 3}',
     'statement_stated', 'Statement: "Upon redemption for capital gain tax purpose, First In First Out method applies."'),
  ('ubl',    'UBL Fund Managers Limited', array['\mubl\M', '\mal[- ]ameen\M'],
     '{"amount_dp": 0, "units_dp": 2, "running_balance": true}',
     'statement_consistent', 'Reported CGT reproduces at the 15% filer rate under FIFO.'),
  ('hbl',    'HBL Asset Management Limited', array['\mhbl\M'], '{}', 'industry_default', null),
  ('abl',    'ABL Asset Management Company Limited', array['\mabl\M', 'allied asset'], '{}', 'industry_default', null),
  ('faysal', 'Faysal Asset Management Limited', array['\mfaysal\M'], '{}', 'industry_default', null),
  ('alfalah','Alfalah Asset Management Limited', array['\malfalah\M'], '{}', 'industry_default', null),
  ('js',     'JS Investments Limited', array['\mjs investments\M', '\mjs (islamic|cash|income|growth|value|large)'], '{}', 'industry_default', null),
  ('lakson', 'Lakson Investments Limited', array['\mlakson\M'], '{}', 'industry_default', null),
  ('nit',    'National Investment Trust Limited', array['national investment trust', '\mnit\M'], '{}', 'industry_default', null),
  ('akd',    'AKD Investment Management Limited', array['\makd\M'], '{}', 'industry_default', null),
  ('askari', 'Askari Investment Management Limited', array['\maskari\M'], '{}', 'industry_default', null),
  ('pak_oman','Pak Oman Asset Management Company Limited', array['pak[- ]?oman'], '{}', 'industry_default', null),
  ('mahaana','Mahaana Wealth Limited', array['\mmahaana\M'], '{}', 'industry_default', null),
  ('awt',    'AWT Investments Limited', array['\mawt\M'], '{}', 'industry_default', null),
  ('first_capital', 'First Capital Investments Limited', array['first capital'], '{}', 'industry_default', null),
  ('i786',   '786 Investments Limited', array['\m786\M'], '{}', 'industry_default', null),
  ('unmapped','Unmapped AMC', array[]::text[], '{}', 'industry_default', 'Placeholder for funds whose AMC could not be identified.')
on conflict (code) do update set
  name = excluded.name,
  match_patterns = excluded.match_patterns,
  statement_profile = excluded.statement_profile,
  cost_method_evidence = excluded.cost_method_evidence,
  cost_method_note = excluded.cost_method_note;

-- ─── Legacy copy ─────────────────────────────────────────────────────────────

create or replace function mf_private.amc_for_text(p_text text)
returns uuid language sql stable
set search_path = ''
as $$
  select coalesce(
    (select a.id from public.mf_amcs a
      where exists (select 1 from unnest(a.match_patterns) p where lower(coalesce(p_text, '')) ~ p)
      order by a.code limit 1),
    (select id from public.mf_amcs where code = 'unmapped'))
$$;

create or replace function mf_private.copy_legacy_row(t public.mutual_fund_transactions)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare
  v_amc uuid; v_fund uuid; v_acct uuid; v_id uuid;
begin
  if t.units is null or t.units <= 0 or t.investment_amount is null or t.investment_amount <= 0 then
    return null;  -- not representable; left in the legacy table, reported by the verification query
  end if;
  v_amc := mf_private.amc_for_text(t.fund_name);
  v_fund := mf_private.ensure_fund(
    v_amc, t.fund_name,
    -- New rows store the MUFAP slug in fund_id; pre-slug rows store the name.
    nullif(mf_private.slugify(case when t.fund_id ~ '^[a-z0-9-]+$' then t.fund_id else t.fund_name end), 'other'),
    t.fund_category);
  v_acct := mf_private.manual_account(t.user_id, v_amc);

  insert into public.mf_ledger_entries (
    user_id, account_id, fund_id, entry_type, original_label, trade_date, price_date, nav,
    unit_delta, gross_amount, net_amount, cash_direction, description, origin,
    legacy_txn_id, approval_mode, created_at)
  values (
    t.user_id, v_acct, v_fund,
    case when t.type = 'sell' then 'redemption' else 'purchase' end,
    'Manual ' || case when t.type = 'sell' then 'sale' else 'purchase' end,
    t.date, t.date, case when t.nav > 0 then t.nav end,
    case when t.type = 'sell' then -t.units else t.units end,
    t.investment_amount, t.investment_amount,
    case when t.type = 'sell' then 'investor_receives' else 'investor_pays' end,
    t.notes, 'legacy_migration', t.id, 'system', coalesce(t.created_at, now()))
  on conflict (legacy_txn_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function mf_private.copy_legacy_row(public.mutual_fund_transactions) from public, anon, authenticated;
revoke all on function mf_private.amc_for_text(text) from public, anon, authenticated;

select mf_private.copy_legacy_row(t)
  from public.mutual_fund_transactions t
 order by t.date, t.created_at;

create or replace function mf_private.mirror_legacy_insert()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  perform mf_private.copy_legacy_row(new);
  return new;
end;
$$;
revoke all on function mf_private.mirror_legacy_insert() from public, anon, authenticated;

drop trigger if exists mf_mirror_legacy_insert on public.mutual_fund_transactions;
create trigger mf_mirror_legacy_insert after insert on public.mutual_fund_transactions
  for each row execute function mf_private.mirror_legacy_insert();

-- ─── Verification ────────────────────────────────────────────────────────────
-- Fails the migration (and so rolls it back) unless every representable
-- legacy row landed with identical units and amount.
do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.mutual_fund_transactions t
    left join public.mf_ledger_entries e on e.legacy_txn_id = t.id
   where t.units > 0 and t.investment_amount > 0
     and (e.id is null
          or abs(e.unit_delta) <> t.units
          or e.gross_amount <> t.investment_amount
          or e.trade_date <> t.date);
  if v_bad > 0 then
    raise exception 'Legacy copy verification failed for % row(s)', v_bad;
  end if;
end;
$$;
