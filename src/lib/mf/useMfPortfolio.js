/**
 * The one place the app reads mutual-fund holdings from. Loads the approved
 * ledger (numerics cast to text, so no value passes through a JS float),
 * price observations, and runs the deterministic engine.
 *
 * Also exposes a legacy-shaped view (`buy`/`sell` rows) for screens that
 * still expect the old `mutual_fund_transactions` shape.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Decimal from 'decimal.js';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { mufapFundsQuery, fundBySlug } from '../marketQueries';
import { computePortfolio, growthSeries } from './engine';

export const MF_LEDGER_KEY = 'mf-ledger';

const ENTRY_COLS = [
  'id', 'account_id', 'fund_id', 'unit_class', 'entry_type', 'original_label', 'trade_date', 'price_date', 'seq',
  'created_at', 'reverses_entry_id', 'origin', 'cash_direction', 'external_ref', 'source_import_id',
  'nav::text', 'unit_delta::text', 'gross_amount::text', 'net_amount::text',
].join(',');

/** PostgREST caps a response at 1,000 rows; page through everything. */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export function mfLedgerQuery(userId) {
  return {
    queryKey: [MF_LEDGER_KEY, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      const [entries, components, funds, amcs, accounts, navs] = await Promise.all([
        fetchAll(() => supabase.from('mf_ledger_entries').select(ENTRY_COLS).eq('user_id', userId).order('trade_date').order('seq')),
        fetchAll(() => supabase.from('mf_ledger_components').select('entry_id, component_type, amount::text').eq('user_id', userId)),
        fetchAll(() => supabase.from('mf_funds').select('id, name, amc_id, mufap_slug, category')),
        fetchAll(() => supabase.from('mf_amcs').select('id, code, name, cost_method_evidence, cost_method_note')),
        fetchAll(() => supabase.from('mf_accounts').select('id, amc_id, account_ref_masked, label').eq('user_id', userId)),
        fetchAll(() => supabase.from('mf_nav_history').select('fund_id, nav_date, price::text, price_kind, source')
          .order('nav_date', { ascending: false }).limit(5000)),
      ]);
      return { entries, components, funds, amcs, accounts, navs };
    },
  };
}

export function useMfPortfolio() {
  const user = useAuthStore((s) => s.user);
  const ledger = useQuery(mfLedgerQuery(user?.id));
  const market = useQuery(mufapFundsQuery());

  const portfolio = useMemo(() => {
    const d = ledger.data;
    if (!d) return null;
    const funds = Object.fromEntries(d.funds.map((f) => [f.id, f]));
    const amcs = Object.fromEntries(d.amcs.map((a) => [a.id, a]));
    const bySlug = fundBySlug(market.data);

    const prices = d.navs.map((n) => ({ fund_id: n.fund_id, price: n.price, date: n.nav_date, source: n.source, kind: n.price_kind }));
    for (const f of d.funds) {
      const m = f.mufap_slug ? bySlug[f.mufap_slug] : null;
      const p = m?.repurchase_price || m?.nav;
      if (p && m.validity_date) {
        prices.push({ fund_id: f.id, price: String(p), date: String(m.validity_date).slice(0, 10), source: 'mufap', kind: m.repurchase_price ? 'repurchase' : 'nav' });
      }
    }
    const result = computePortfolio({ entries: d.entries, components: d.components, prices, funds, amcs });
    result.series = growthSeries({ entries: d.entries, components: d.components, prices, funds, amcs });
    for (const p of result.positions) {
      const f = funds[p.fundId];
      const m = f?.mufap_slug ? bySlug[f.mufap_slug] : null;
      p.category = f?.category ?? m?.category ?? null;
      p.fundReturns = m?.returns ?? null;   // MUFAP-published fund performance, distinct from yours
      p.account = d.accounts.find((a) => a.id === p.accountId) ?? null;
      p.methodNote = (f && amcs[f.amc_id]?.cost_method_note) ?? null;
      p.amcCode = (f && amcs[f.amc_id]?.code) ?? null;
      p.entries = d.entries.filter((e) => e.fund_id === p.fundId && e.account_id === p.accountId);
    }
    // Manual / migrated entries in a fund that statements also cover.
    const statementFunds = new Set(d.entries.filter((e) => e.origin === 'statement').map((e) => e.fund_id));
    const reversed = new Set(d.entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
    result.manualOverlaps = [...new Set(d.entries
      .filter((e) => ['manual', 'legacy_migration'].includes(e.origin) && !reversed.has(e.id) && !e.reverses_entry_id && statementFunds.has(e.fund_id))
      .map((e) => e.fund_id))].map((id) => ({ fundId: id, fundName: funds[id]?.name ?? 'Fund' }));
    return result;
  }, [ledger.data, market.data]);

  return { portfolio, ledger: ledger.data, isLoading: ledger.isLoading, error: ledger.error, refetch: ledger.refetch };
}

/**
 * Money that crossed between the investor and the AMCs, for the free-cash
 * figure: purchases paid in, redemptions/dividends/refunds paid out.
 * Switches and reinvestments are internal and excluded; reversed entries
 * cancel out.
 */
export async function fetchMfCashFlows(userId) {
  const rows = await fetchAll(() => supabase.from('mf_ledger_entries')
    .select('id, reverses_entry_id, cash_direction, gross_amount::text, net_amount::text')
    .eq('user_id', userId).in('cash_direction', ['investor_pays', 'investor_receives']));
  const reversed = new Set(rows.filter((r) => r.reverses_entry_id).map((r) => r.reverses_entry_id));
  let bought = new Decimal(0);
  let sold = new Decimal(0);
  for (const r of rows) {
    if (r.reverses_entry_id || reversed.has(r.id)) continue;
    if (r.cash_direction === 'investor_pays') bought = bought.plus(r.gross_amount ?? r.net_amount ?? 0);
    else sold = sold.plus(r.net_amount ?? r.gross_amount ?? 0);
  }
  return { bought: Number(bought.toString()), sold: Number(sold.toString()) };
}

/**
 * Legacy shape for screens still written against `mutual_fund_transactions`.
 * `externalOnly` keeps just money between the investor and the AMC (for the
 * free-cash calculation), dropping switches and reinvestments.
 */
export function toLegacyRows(ledger, { externalOnly = false } = {}) {
  if (!ledger) return [];
  const funds = Object.fromEntries(ledger.funds.map((f) => [f.id, f]));
  const reversed = new Set(ledger.entries.filter((e) => e.reverses_entry_id).map((e) => e.reverses_entry_id));
  return ledger.entries
    .filter((e) => !e.reverses_entry_id && !reversed.has(e.id) && e.unit_delta !== null && Number(e.unit_delta) !== 0)
    .filter((e) => !externalOnly || ['investor_pays', 'investor_receives'].includes(e.cash_direction))
    .map((e) => {
      const units = new Decimal(e.unit_delta);
      const f = funds[e.fund_id];
      return {
        id: e.id,
        fund_id: f?.mufap_slug ?? e.fund_id,
        fund_name: f?.name ?? 'Fund',
        fund_category: f?.category ?? null,
        nav: e.nav ? Number(e.nav) : null,
        units: Number(units.abs().toString()),
        investment_amount: Number(units.isNegative() ? (e.net_amount ?? e.gross_amount ?? 0) : (e.gross_amount ?? e.net_amount ?? 0)),
        type: units.isNegative() ? 'sell' : 'buy',
        date: e.trade_date,
      };
    });
}
