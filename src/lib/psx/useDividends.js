/**
 * PSX cash dividends for the signed-in user (public.stock_dividends, own rows
 * via RLS): the query, a range summary, and the writes. Figures come from
 * ./dividends.js.
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { getStockSector } from '../psxSectors';
import { summarizeDividends } from './dividends';
import { todayIso } from '../dateRange';

const COLUMNS = 'id, symbol, company_name, payment_date, issue_date, account_ref, warrant_no, filer_status, filer_status_raw, '
  + 'shares::text, gross_amount::text, tax_amount::text, jh_tax_amount::text, zakat_amount::text, net_amount::text, source, notes, created_at';

export const dividendsQuery = (userId) => ({
  queryKey: ['stock-dividends', userId],
  enabled: !!userId,
  staleTime: 60_000,
  queryFn: async () => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('stock_dividends').select(COLUMNS)
        .eq('user_id', userId).order('payment_date', { ascending: false }).order('created_at', { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      out.push(...(data ?? []));
      if (!data || data.length < 1000) return out;
    }
  },
});

/**
 * range: { start, end } from the global date filter; omit for all time.
 * filter: { sector, symbol } ('all' or missing = no filter), for Analytics.
 */
export function useDividends(range, filter = {}) {
  const user = useAuthStore((s) => s.user);
  const q = useQuery(dividendsQuery(user?.id));
  const start = range?.start; const end = range?.end;
  const sector = filter.sector ?? 'all'; const symbol = filter.symbol ?? 'all';
  const only = filter.symbols ?? null; // optional Set of symbols (e.g. those traded through one broker)
  const summary = useMemo(() => {
    if (!q.data) return null;
    const rows = q.data.filter((x) => (symbol === 'all' || x.symbol === symbol) && (sector === 'all' || getStockSector(x.symbol) === sector)
      && (!only || only.has(x.symbol)));
    return summarizeDividends(rows, { start, end, today: todayIso() });
  }, [q.data, start, end, sector, symbol, only]);
  return { all: q.data ?? [], summary, isLoading: q.isLoading, isError: q.isError };
}

const clean = (f) => ({
  symbol: String(f.symbol).trim().toUpperCase(),
  company_name: f.company_name?.trim() || null,
  payment_date: f.payment_date,
  issue_date: f.issue_date || null,
  account_ref: f.account_ref?.trim() || null,
  warrant_no: f.warrant_no ? String(f.warrant_no).trim() : null,
  filer_status: f.filer_status || 'unknown',
  filer_status_raw: f.filer_status_raw ?? null,
  shares: String(f.shares).replace(/,/g, ''),
  gross_amount: String(f.gross_amount).replace(/,/g, ''),
  tax_amount: String(f.tax_amount || 0).replace(/,/g, ''),
  jh_tax_amount: String(f.jh_tax_amount || 0).replace(/,/g, ''),
  zakat_amount: String(f.zakat_amount || 0).replace(/,/g, ''),
  net_amount: String(f.net_amount).replace(/,/g, ''),
  source: f.source === 'statement' ? 'statement' : 'manual',
  notes: f.notes?.trim() || null,
});

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['stock-dividends'] });
}

/**
 * Save one or many dividends through `dividends_save` (owner, 2026-11-22): a dividend already on file is never
 * added twice — the same warrant, or the same payment recorded another way (a hand-added row and its CDC report
 * row: same stock, within a week, same amount ±2%) — its empty details (warrant, filer status, issue date,
 * account) are filled instead, amounts untouched. Resolves to { added, completed, skipped }.
 */
export function useSaveDividends() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (list) => {
      if (!user?.id) throw new Error('Not signed in');
      const { data, error } = await supabase.rpc('dividends_save', { p_rows: list.map(clean) });
      if (error) throw error;
      return { added: data?.added ?? 0, completed: data?.completed ?? 0, skipped: data?.skipped ?? 0 };
    },
    onSuccess: refresh,
  });
}

export function useEditDividend() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, ...f }) => {
      const { error } = await supabase.from('stock_dividends').update(clean(f)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useDeleteDividend() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('stock_dividends').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}
