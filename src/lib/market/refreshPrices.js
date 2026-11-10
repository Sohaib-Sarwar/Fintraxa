/**
 * Refresh the signed-in user's holding prices now (Settings > Market prices).
 *
 * Calls the Edge Function `refresh-prices`, which fetches the held stocks and funds from PSX and
 * MUFAP through the market-data worker and stores them where every page reads prices. The
 * function streams one JSON event per line; `onEvent` gets each as it arrives:
 *   start → holdings → source (psx, mufap_tab1, mufap_tab3, as each lands) → saving → done
 *   or: busy (one already running / just ran) · error
 * Afterwards the cached price queries are invalidated, so open pages re-read them.
 */
import { supabase } from '../supabase';
import { MF_LEDGER_KEY } from '../mf/useMfPortfolio';
import { requestSnapshot } from '../snapshots/useSnapshots';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-prices`;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function refreshMyPrices(onEvent, { signal } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to refresh prices.');
  const res = await fetch(FN_URL, {
    method: 'POST', signal, body: '{}',
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `The price refresh is not available right now (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = ''; let last = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try { last = JSON.parse(line); onEvent?.(last); } catch { /* a partial line; the next read completes it */ }
    }
  }
  return last;
}

/** Re-read everything a refreshed price feeds: holdings, closes, the boards, and the snapshots. */
export async function afterRefresh(queryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['psx-closes'] }),
    queryClient.invalidateQueries({ queryKey: [MF_LEDGER_KEY] }),
    queryClient.invalidateQueries({ queryKey: ['psx'] }),
    queryClient.invalidateQueries({ queryKey: ['mufap'] }),
    queryClient.invalidateQueries({ queryKey: ['market'] }),
    queryClient.invalidateQueries({ queryKey: ['market-refresh-runs'] }),
  ]);
  // Today's stored snapshot is recomputed with the new prices, best effort.
  requestSnapshot({ force: true }).then((r) => { if (r) queryClient.invalidateQueries({ queryKey: ['snapshots'] }); });
}

export const marketRefreshRunsQuery = (userId) => ({
  queryKey: ['market-refresh-runs', userId],
  enabled: !!userId,
  staleTime: 30_000,
  queryFn: async () => {
    const { data, error } = await supabase.from('market_refresh_runs')
      .select('id, requested_at, finished_at, status, psx_requested, psx_updated, mufap_requested, mufap_updated, duration_ms, details')
      .eq('user_id', userId).order('requested_at', { ascending: false }).limit(8);
    if (error) throw error;
    return data ?? [];
  },
});
