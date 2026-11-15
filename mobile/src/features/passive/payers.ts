/**
 * Who paid in each month (owner, 2026-11-15: "on hold, show who paid — funds too, like savings"): mutual funds (their
 * realized profit after CGT from that month's redemptions, with the AMC logo), stocks (dividends) and banks (savings
 * profit), per month, biggest first. Feeds the hold card of the passive bar charts.
 */
import type { PassiveEvent, PassiveSource } from '@/data/engines';
import type { FundPosition } from '@/data/types';

export type Payer = {
  key: string; label: string; net: number;
  kind: 'stock' | 'bank' | 'fund';
  /** Stock or bank symbol (logo). */
  symbol: string | null;
  /** AMC code and name for a fund (logo). */
  amcCode?: string | null; amcName?: string | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function passivePayers(source: PassiveSource | 'all', events: PassiveEvent[] | null | undefined, funds: FundPosition[] | null | undefined): Record<string, Payer[]> {
  const by = new Map<string, Map<string, Payer>>();
  const add = (month: string, p: Payer) => {
    const m = by.get(month) ?? new Map<string, Payer>();
    const cur = m.get(p.key);
    if (cur) cur.net += p.net; else m.set(p.key, { ...p });
    by.set(month, m);
  };
  for (const e of events ?? []) {
    if (e.source === 'dividends' && (source === 'all' || source === 'dividends')) {
      const sym = e.symbol ?? e.title;
      add(e.month, { key: `s-${sym}`, label: sym, symbol: e.symbol ?? null, kind: 'stock', net: Number(e.net) || 0 });
    } else if (e.source === 'savings' && (source === 'all' || source === 'savings')) {
      add(e.month, { key: `b-${e.title}|${e.symbol ?? ''}`, label: e.title, symbol: e.symbol ?? null, kind: 'bank', net: Number(e.net) || 0 });
    }
  }
  if (source === 'all' || source === 'mutual_funds') {
    for (const x of funds ?? []) {
      for (const s of x.sales ?? []) {
        add(s.date.slice(0, 7), { key: `f-${x.key}`, label: x.fundName ?? 'Fund', symbol: null, kind: 'fund', amcCode: x.amcCode, amcName: x.amcName, net: (Number(s.gain) || 0) - (Number(s.cgt) || 0) });
      }
    }
  }
  const out: Record<string, Payer[]> = {};
  for (const [month, m] of by) out[month] = [...m.values()].map((p) => ({ ...p, net: r2(p.net) })).filter((p) => p.net !== 0).sort((a, b) => b.net - a.net);
  return out;
}
