/**
 * Me › Market prices (plan M2-T9): the existing `refresh-prices` Edge Function, its NDJSON progress read
 * live with expo/fetch streaming. Same request as the web (src/lib/market/refreshPrices.js).
 */
import type { QueryClient } from '@tanstack/react-query';
import { fetch } from 'expo/fetch';
import { utf8Decode } from './crypto';
import { env } from './env';
import { supabase } from './supabase';

export type RefreshEvent =
  | { type: 'holdings'; psx: string[]; funds: string[] }
  | { type: 'source'; source: string; status?: string; ok?: number; requested?: number; matched?: number }
  | { type: 'saving'; psx: number; funds: number }
  | { type: 'done'; run: { psx_updated?: number; mufap_updated?: number } }
  | { type: 'busy' | 'error'; message: string };

export async function refreshMyPrices(onEvent: (e: RefreshEvent) => void, signal?: AbortSignal): Promise<RefreshEvent | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in again to refresh prices.');
  const res = await fetch(`${env.supabaseUrl}/functions/v1/refresh-prices`, {
    method: 'POST', body: '{}', signal,
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: env.supabaseKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The price refresh is not available right now (${res.status}).`);
  }
  const reader = res.body.getReader();
  let pending: number[] = [];
  let last: RefreshEvent | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Split on newline BYTES, then decode whole lines — a multi-byte character is never cut in half.
    for (const b of value) {
      if (b !== 10) { pending.push(b); continue; }
      const line = utf8Decode(Uint8Array.from(pending)).trim();
      pending = [];
      if (!line) continue;
      try { last = JSON.parse(line) as RefreshEvent; onEvent(last); } catch { /* ignore a malformed line */ }
    }
  }
  return last;
}

export async function afterRefresh(qc: QueryClient) {
  await Promise.all(['psx-closes', 'mf-ledger', 'psx', 'mufap', 'market'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  supabase.functions.invoke('portfolio-snapshot', { body: { mode: 'user' } })
    .then(({ error }) => { if (!error) qc.invalidateQueries({ queryKey: ['snapshots'] }); })
    .catch(() => {});
}

/** Plain-language line for one progress event. */
export function describe(e: RefreshEvent): string | null {
  const n = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;
  switch (e.type) {
    case 'holdings': return `Looking up ${n(e.psx.length, 'stock')} and ${n(e.funds.length, 'fund')}`;
    case 'source':
      if (e.source === 'psx') return `PSX: ${e.ok ?? 0} of ${n(e.requested ?? 0, 'price')} found`;
      if (e.source === 'amc') return e.status === 'ok' ? `Fund managers: ${e.matched ?? 0} of ${n(e.requested ?? 0, 'fund')} found` : 'Fund managers’ sites didn’t answer';
      if (e.source.startsWith('mufap')) return e.status === 'ok' ? `MUFAP: ${n(e.matched ?? 0, 'fund')} found` : e.status === 'blocked' ? 'MUFAP refused; using the fund managers’ prices' : 'MUFAP didn’t answer';
      return null;
    case 'saving': return 'Saving new prices…';
    case 'done': return `Done · ${n(e.run.psx_updated ?? 0, 'stock')}, ${n(e.run.mufap_updated ?? 0, 'fund')} updated`;
    default: return e.message;
  }
}
