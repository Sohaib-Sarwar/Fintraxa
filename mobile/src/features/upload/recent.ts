/**
 * Recent uploads (owner, 2026-11-14: the history icon on Upload). Read from what the uploads left behind, so web and
 * phone uploads both show:
 *   trades    → imported `stock_transactions` (have a `source_ref`), one upload = one broker + insert time
 *   dividends → `stock_dividends` with `source = 'statement'`, one upload = one insert time
 *   fund      → `mf_statement_imports` (one row per statement, with its status)
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useDividends, useTrades, useUid } from '@/data/queries';
import type { Dividend, Trade } from '@/data/types';
import { supabase } from '@/lib/supabase';

export type UploadKind = 'trades' | 'dividends' | 'fund';
export type RecentUpload = {
  id: string; kind: UploadKind; at: string; title: string; code: string | null; count: number;
  from: string | null; to: string | null; status?: string; statusTone?: 'pos' | 'warn' | 'neg' | 'muted';
  trades?: Trade[]; dividends?: Dividend[];
  /** Fund statements: the import's id, to list the ledger entries it added (`source_import_id`). */
  importId?: string;
};

const BROKER_NAME: Record<string, string> = { akd: 'AKD Securities', ktrade: 'KTrade' };
const FUND_STATUS: Record<string, [string, RecentUpload['statusTone']]> = {
  uploaded: ['Processing', 'muted'], parsing: ['Processing', 'muted'], redacting: ['Processing', 'muted'], extracting: ['Processing', 'muted'],
  validating: ['Processing', 'muted'], awaiting_approval: ['Needs review', 'warn'], partially_approved: ['Partly added', 'warn'],
  approved: ['Added', 'pos'], completed_with_warnings: ['Added', 'pos'], rejected: ['Rejected', 'muted'], failed: ['Failed', 'neg'],
};

type FundImportRow = {
  id: string; status: string; file_label: string | null; period_start: string | null; period_end: string | null; created_at: string;
  summary: { events?: number; auto_approved?: number } | null; mf_amcs: { code: string; name: string } | null;
};

/** One insert = one upload: rows saved together share their `created_at` (to the second). */
const batchKey = (at: string | undefined) => (at ?? '').slice(0, 19);
const span = (dates: string[]) => { const s = [...dates].sort(); return { from: s[0] ?? null, to: s[s.length - 1] ?? null }; };

export function groupTradeUploads(trades: Trade[]): RecentUpload[] {
  const map = new Map<string, Trade[]>();
  for (const t of trades) {
    if (!t.source_ref || !t.created_at) continue;
    const k = `${t.broker ?? ''}|${batchKey(t.created_at)}`;
    map.set(k, [...(map.get(k) ?? []), t]);
  }
  return [...map.entries()].map(([k, rows]) => ({
    id: `t:${k}`, kind: 'trades' as const, at: rows[0].created_at!, title: BROKER_NAME[rows[0].broker ?? ''] ?? (rows[0].broker ?? 'Broker').toUpperCase(),
    code: rows[0].broker ?? null, count: rows.length, ...span(rows.map((r) => r.date)), trades: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
  }));
}

export function groupDividendUploads(dividends: Dividend[]): RecentUpload[] {
  const map = new Map<string, Dividend[]>();
  for (const d of dividends) {
    if (d.source !== 'statement' || !d.created_at) continue;
    const k = batchKey(d.created_at);
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  return [...map.entries()].map(([k, rows]) => ({
    id: `d:${k}`, kind: 'dividends' as const, at: rows[0].created_at, title: 'CDC dividends', code: 'cdc', count: rows.length,
    ...span(rows.map((r) => r.payment_date)), dividends: [...rows].sort((a, b) => b.payment_date.localeCompare(a.payment_date)),
  }));
}

export function useRecentUploads() {
  const uid = useUid();
  const trades = useTrades();
  const dividends = useDividends();
  const funds = useQuery({
    queryKey: ['mf-imports', uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('mf_statement_imports')
        .select('id, status, file_label, period_start, period_end, summary, created_at, mf_amcs(code, name)')
        .eq('user_id', uid!).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as FundImportRow[];
    },
  });

  const items = useMemo(() => {
    const fund: RecentUpload[] = (funds.data ?? []).map((f) => {
      const [status, statusTone] = FUND_STATUS[f.status] ?? [f.status, 'muted'];
      return {
        id: `f:${f.id}`, kind: 'fund', at: f.created_at, title: f.mf_amcs?.name ?? f.file_label ?? 'Fund statement', code: f.mf_amcs?.code ?? null,
        count: f.summary?.auto_approved ?? f.summary?.events ?? 0, from: f.period_start, to: f.period_end, status, statusTone, importId: f.id,
      };
    });
    return [...groupTradeUploads(trades.data ?? []), ...groupDividendUploads(dividends.data ?? []), ...fund]
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [trades.data, dividends.data, funds.data]);

  return {
    items,
    isLoading: trades.isLoading || dividends.isLoading || funds.isLoading,
    refetch: () => Promise.all([trades.refetch(), dividends.refetch(), funds.refetch()]),
  };
}
