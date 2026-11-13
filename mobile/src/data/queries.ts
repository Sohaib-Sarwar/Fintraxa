/**
 * Every server read the app makes. Keys mirror the web app's (src/lib/**) so the two stay recognisable;
 * columns are the same, numerics read as text where the web does so no amount passes through a float
 * before the decimal engines. RLS decides what is visible; reads still pass `.eq('user_id', …)`.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DEFAULT_CATEGORIES } from '@core/defaultCategories.js';
import { useAuth } from '@/lib/auth';
import { addDays, todayIso } from '@/lib/dates';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import type { Board, BoardStock, Category, FundsFeed, Ledger, Txn, Trade, Dividend, Snapshot, Profile, Prefs, Release, IndexRow, FeedHealthRow } from './types';

export const useUid = () => useAuth((s) => s.user?.id);

// `::text` / `::float8` casts in select strings defeat supabase-js's generated row types, so pages are
// typed by the caller (T) instead.
type Pageable = { range: (a: number, b: number) => PromiseLike<{ data: unknown; error: unknown }> };
/** PostgREST caps a response at 1,000 rows: page through everything. */
export async function fetchAll<T>(build: () => Pageable): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

// ── Personal finance ─────────────────────────────────────────────

const TXN_SELECT = '*, categories(name, icon, kind, type), savings_accounts(name, bank_symbol, bank_name)';
export const TXNS_KEY = 'ie-all-transactions';
/** Same list as the web's AFFECTED in useFinance.js, plus the phone's own derived keys. */
export const FINANCE_KEYS = ['ie-all-transactions', 'ie-transactions', 'ie-free-cash', 'mf-free-cash', 'home-ie-txns', 'home-ie-txns-all', 'categories'];

export function useTransactions() {
  const uid = useUid();
  return useQuery({
    queryKey: [TXNS_KEY, uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: () => fetchAll<Txn>(() => supabase.from('income_expense_transactions').select(TXN_SELECT)
      .eq('user_id', uid!).order('date', { ascending: false }).order('created_at', { ascending: false })),
  });
}

export function useCategories() {
  const uid = useUid();
  return useQuery({
    queryKey: ['categories', uid],
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', uid!).order('name');
      if (error) throw error;
      const rows = (data ?? []) as Category[];
      // Seed missing defaults exactly like the web (same list, same unique constraint).
      const have = new Set(rows.map((c) => c.name.toLowerCase()));
      const missing = (DEFAULT_CATEGORIES as Omit<Category, 'id' | 'user_id'>[]).filter((c) => !have.has(c.name.toLowerCase()));
      if (!missing.length) return rows;
      const { data: seeded, error: seedErr } = await supabase.from('categories')
        .upsert(missing.map((c) => ({ ...c, user_id: uid, is_default: true })), { onConflict: 'user_id,name', ignoreDuplicates: true }).select();
      if (seedErr) throw seedErr;
      return [...rows, ...((seeded ?? []) as Category[])].sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

// ── Mutual funds ─────────────────────────────────────────────────

const ENTRY_COLS = [
  'id', 'account_id', 'fund_id', 'unit_class', 'entry_type', 'original_label', 'trade_date', 'price_date', 'seq',
  'created_at', 'reverses_entry_id', 'origin', 'cash_direction', 'external_ref', 'source_import_id',
  'nav::text', 'unit_delta::text', 'gross_amount::text', 'net_amount::text',
].join(',');

export function useLedger() {
  const uid = useUid();
  return useQuery({
    queryKey: ['mf-ledger', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<Ledger> => {
      const [entries, components, funds, amcs, accounts] = await Promise.all([
        fetchAll<{ fund_id: string } & Record<string, unknown>>(() => supabase.from('mf_ledger_entries').select(ENTRY_COLS).eq('user_id', uid!).order('trade_date').order('seq')),
        fetchAll(() => supabase.from('mf_ledger_components').select('entry_id, component_type, amount::text').eq('user_id', uid!)),
        fetchAll(() => supabase.from('mf_funds').select('id, name, amc_id, mufap_slug, category')),
        fetchAll(() => supabase.from('mf_amcs').select('id, code, name')),
        fetchAll(() => supabase.from('mf_accounts').select('id, amc_id, account_ref_masked, label').eq('user_id', uid!)),
      ]);
      const fundIds = [...new Set(entries.map((e) => e.fund_id))];
      const navs = fundIds.length
        ? await fetchAll(() => supabase.from('mf_nav_history').select('id, fund_id, nav_date, price::text, price_kind, source')
          .in('fund_id', fundIds).order('nav_date').order('id'))
        : [];
      return { entries, components, funds, amcs, accounts, navs } as unknown as Ledger;
    },
  });
}

/** Staged statement rows still waiting for the user's decision ("Needs you"). */
export function usePendingReview() {
  const uid = useUid();
  return useQuery({
    queryKey: ['mf-pending-review', uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('mf_staged_transactions').select('id', { count: 'exact', head: true })
        .eq('user_id', uid!).in('review_status', ['pending_review', 'requires_attention']);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ── PSX ──────────────────────────────────────────────────────────

export function useTrades() {
  const uid = useUid();
  return useQuery({
    queryKey: ['stock-transactions', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_transactions').select('*').eq('user_id', uid!).order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Trade[];
    },
  });
}

export type Closes = Record<string, { date: string; close: string; change: string | null; change_pct: string | null }[]>;
export function useCloses(symbols: string[]) {
  return useQuery({
    queryKey: ['psx-closes', symbols],
    enabled: symbols.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const out: Closes = {};
      const rows = await fetchAll<{ symbol: string; price_date: string; close: string; change: string | null; change_pct: string | null }>(() => supabase
        .from('psx_price_history').select('symbol, price_date, close::text, change::text, change_pct::text')
        .in('symbol', symbols).order('price_date').order('symbol'));
      for (const r of rows) (out[r.symbol] ??= []).push({ date: r.price_date, close: r.close, change: r.change, change_pct: r.change_pct });
      return out;
    },
  });
}

const DIV_COLS = 'id, symbol, company_name, payment_date, shares::text, gross_amount::text, tax_amount::text, zakat_amount::text, net_amount::text, source, created_at';
export function useDividends() {
  const uid = useUid();
  return useQuery({
    queryKey: ['stock-dividends', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: () => fetchAll<Dividend>(() => supabase.from('stock_dividends').select(DIV_COLS).eq('user_id', uid!)
      .order('payment_date', { ascending: false }).order('created_at', { ascending: false })),
  });
}

// ── Snapshots ────────────────────────────────────────────────────

const NUM = (cols: string[]) => cols.map((c) => `${c}::float8`).join(', ');
const SNAP_COLS = `snap_date, ${NUM(['funds_value', 'funds_cost', 'stocks_value', 'stocks_cost', 'savings', 'net_worth'])}`;
let catchUpAsked = false;

/** Daily portfolio rows; if today's is missing the server is asked once per launch to catch up. */
export function useSnapshots() {
  const uid = useUid();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['snapshots', 'portfolio', uid],
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAll<Snapshot>(() => supabase.from('portfolio_snapshots').select(SNAP_COLS).eq('user_id', uid!).order('snap_date')),
  });
  const last = q.data?.at(-1)?.snap_date;
  useEffect(() => {
    if (!uid || !q.isSuccess || catchUpAsked || (last && last >= todayIso())) return;
    catchUpAsked = true;
    supabase.functions.invoke('portfolio-snapshot', { body: { mode: 'user' } })
      .then(({ error }) => { if (!error) qc.invalidateQueries({ queryKey: ['snapshots'] }); })
      .catch(() => {});
  }, [uid, q.isSuccess, last, qc]);
  return q;
}

// ── Market data (static JSON service; slimmed so the persisted cache stays small) ─────────────

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15_000);
  signal?.addEventListener('abort', () => ctl.abort());
  try {
    const res = await fetch(`${env.marketApi}/${path}`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Market data ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

const MARKET_STALE = 15 * 60_000;

export function useBoard() {
  return useQuery({
    queryKey: ['psx', 'stocks'],
    staleTime: MARKET_STALE,
    queryFn: async ({ signal }): Promise<Board> => {
      const j = await getJson<{ data: BoardStock[]; freshness?: { data_as_of?: string } }>('psx/stocks.json', signal);
      return {
        asOf: j.freshness?.data_as_of ?? null,
        data: (j.data ?? []).map((s) => ({
          symbol: s.symbol, name: s.name, sector: s.sector, current: s.current, change: s.change, change_pct: s.change_pct, ldcp: s.ldcp,
        })),
      };
    },
  });
}

export function useFundsFeed() {
  return useQuery({
    queryKey: ['mufap', 'funds'],
    staleTime: MARKET_STALE,
    queryFn: async ({ signal }): Promise<FundsFeed> => {
      const j = await getJson<{ data: FundsFeed['data']; freshness?: { data_as_of?: string } }>('mufap/funds.json', signal);
      return {
        asOf: j.freshness?.data_as_of ?? null,
        data: (j.data ?? []).map((f) => ({
          slug: f.slug, fund_name: f.fund_name, category: f.category, amc: f.amc, nav: f.nav, repurchase_price: f.repurchase_price, validity_date: f.validity_date,
        })),
      };
    },
  });
}

export function useIndices() {
  return useQuery({
    queryKey: ['psx', 'indices'],
    staleTime: MARKET_STALE,
    queryFn: async ({ signal }) => {
      const j = await getJson<{ data: IndexRow[]; freshness?: { data_as_of?: string } }>('psx/indices.json', signal);
      return { asOf: j.freshness?.data_as_of ?? null, data: (j.data ?? []).map(({ index_name, current, change, change_pct }) => ({ index_name, current, change, change_pct })) };
    },
  });
}

export function useFeedHealth() {
  return useQuery({
    queryKey: ['market', 'health'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('market_feed_health');
      if (error) throw error;
      return (data ?? []) as FeedHealthRow[];
    },
  });
}

// ── Account ──────────────────────────────────────────────────────

export function useProfile() {
  const uid = useUid();
  return useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('username, full_name, filer_status').eq('user_id', uid!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Profile | null;
    },
  });
}

export function usePrefs() {
  const uid = useUid();
  return useQuery({
    queryKey: ['user-preferences', uid],
    enabled: !!uid,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_preferences').select('tracks, auto_lock_minutes').eq('user_id', uid!).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Prefs | null;
    },
  });
}

/** Newest release of the production channel (drives the update banner / forced update). */
export function useLatestRelease(enabled: boolean) {
  return useQuery({
    queryKey: ['app-release'],
    enabled,
    staleTime: 6 * 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('app_releases').select('version_code, version_name, apk_url, notes, min_supported_code')
        .eq('channel', 'production').order('version_code', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Release | null;
    },
  });
}

/** One holding's daily rows (last ~400 days): 'mf' + position key, or 'psx' + symbol. */
export function useHoldingSnapshots(assetType: 'mf' | 'psx', assetKey: string | undefined) {
  const uid = useUid();
  const since = addDays(todayIso(), -400);
  return useQuery({
    queryKey: ['snapshots', 'holding', uid, assetType, assetKey],
    enabled: !!uid && !!assetKey,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAll<{ snap_date: string; units: number; cost: number; value: number }>(() => supabase.from('holding_snapshots')
      .select(`snap_date, ${NUM(['units', 'cost', 'value'])}`)
      .eq('user_id', uid!).eq('asset_type', assetType).eq('asset_key', assetKey!).gte('snap_date', since).order('snap_date')),
  });
}
