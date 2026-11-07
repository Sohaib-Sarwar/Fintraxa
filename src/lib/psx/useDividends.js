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
  const summary = useMemo(() => {
    if (!q.data) return null;
    const rows = q.data.filter((x) => (symbol === 'all' || x.symbol === symbol) && (sector === 'all' || getStockSector(x.symbol) === sector));
    return summarizeDividends(rows, { start, end });
  }, [q.data, start, end, sector, symbol]);
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
 * Save one or many dividends. A warrant already on file (same stock, payment
 * date and warrant number) is skipped by the database, so re-importing a
 * statement is safe. Resolves to { added, skipped }.
 */
export function useSaveDividends() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (list) => {
      const rows = list.map((f) => ({ ...clean(f), user_id: user.id }));
      const { data, error } = await supabase.from('stock_dividends')
        .upsert(rows, { onConflict: 'user_id,symbol,payment_date,warrant_no', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
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
