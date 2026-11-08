/**
 * Daily snapshots for the signed-in user (portfolio_snapshots, holding_snapshots),
 * written by the portfolio-snapshot Edge Function (nightly, and after changes).
 *
 * If today's snapshot is missing when the screen opens, the function is asked
 * once per session to catch up for this user; the queries refresh when it is done.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { todayIso } from '../dateRange';

async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const NUM = (cols) => cols.map((c) => `${c}::float8`).join(', ');
const PORTFOLIO_COLS = `snap_date, ${NUM(['funds_value', 'funds_cost', 'funds_unrealized', 'stocks_value', 'stocks_cost', 'stocks_unrealized', 'savings', 'net_worth', 'funds_realized_day', 'stocks_realized_day', 'realized_day', 'tax_day'])}`;

let catchUpAsked = false;
/** Ask the function to bring this user's snapshots up to today (once per session). */
export async function requestSnapshot({ force = false } = {}) {
  if (catchUpAsked && !force) return null;
  catchUpAsked = true;
  const { data, error } = await supabase.functions.invoke('portfolio-snapshot', { body: { mode: 'user' } });
  if (error) { console.warn('[snapshots] catch-up not available:', error.message); return null; }
  return data;
}

export function usePortfolioSnapshots() {
  const uid = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['snapshots', 'portfolio', uid],
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAll(() => supabase.from('portfolio_snapshots').select(PORTFOLIO_COLS).eq('user_id', uid).order('snap_date')),
  });
  const last = q.data?.at(-1)?.snap_date;
  useEffect(() => {
    if (!uid || !q.isSuccess || (last && last >= todayIso())) return;
    requestSnapshot().then((r) => { if (r) qc.invalidateQueries({ queryKey: ['snapshots'] }); });
  }, [uid, q.isSuccess, last, qc]);
  return { rows: q.data ?? [], isLoading: q.isLoading, isError: q.isError };
}

/** One holding's daily rows (last ~400 days): asset 'mf' with the position key, or 'psx' with the symbol. */
export function useHoldingSnapshots(assetType, assetKey) {
  const uid = useAuthStore((s) => s.user?.id);
  // 400 days back from today (todayIso is the app's date source, so the key stays stable within a day).
  const since = new Date(Date.parse(`${todayIso()}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  const q = useQuery({
    queryKey: ['snapshots', 'holding', uid, assetType, assetKey],
    enabled: !!uid && !!assetKey,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAll(() => supabase.from('holding_snapshots')
      .select(`snap_date, ${NUM(['units', 'cost', 'value', 'unrealized', 'realized_day', 'tax_day'])}`)
      .eq('user_id', uid).eq('asset_type', assetType).eq('asset_key', assetKey).gte('snap_date', since).order('snap_date')),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading };
}

/** Every daily row of one asset type ('mf' or 'psx'), for charts that group or filter holdings. */
export function useAssetSnapshots(assetType) {
  const uid = useAuthStore((s) => s.user?.id);
  const q = useQuery({
    queryKey: ['snapshots', 'asset', uid, assetType],
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: () => fetchAll(() => supabase.from('holding_snapshots')
      .select(`snap_date, asset_key, name, ${NUM(['units', 'value', 'cost', 'unrealized', 'realized_day'])}`)
      .eq('user_id', uid).eq('asset_type', assetType).order('snap_date')),
  });
  return { rows: q.data ?? [], isLoading: q.isLoading };
}
