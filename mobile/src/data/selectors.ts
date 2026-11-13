/**
 * Pure derivations for the screens. Money figures come from the shared engines (../src/lib, the very files
 * the web runs); this file only arranges them — and where it adds arithmetic (day change, since-last-looked)
 * it uses decimal.js. Covered by src/data/__tests__/selectors.test.ts.
 */
import Decimal from 'decimal.js';
import { staleFeeds, summarize } from './engines';
import type { Board, FeedHealthRow, FundPosition, FundsAnalysis, FundsFeed, Ledger, Snapshot, StocksAnalysis, Txn } from './types';

const D = (v: unknown) => new Decimal(String(v ?? 0));
const r2 = (d: Decimal) => Number(d.toFixed(2));

export type Price = { fund_id: string; price: string; date: string; source: string; kind: string };

/** Same inputs as the web's buildInputs (useMfPortfolio.js): statement/captured NAVs + MUFAP's latest. */
export function fundInputs(ledger: Ledger, feed: FundsFeed | undefined) {
  const funds = Object.fromEntries(ledger.funds.map((f) => [f.id, f]));
  const amcs = Object.fromEntries(ledger.amcs.map((a) => [a.id, a]));
  const bySlug = Object.fromEntries((feed?.data ?? []).map((f) => [f.slug, f]));
  const prices: Price[] = ledger.navs.map((n) => ({ fund_id: n.fund_id, price: n.price, date: n.nav_date, source: n.source, kind: n.price_kind }));
  for (const f of ledger.funds) {
    const m = f.mufap_slug ? bySlug[f.mufap_slug] : null;
    const p = m?.repurchase_price || m?.nav;
    if (m && p && m.validity_date) {
      prices.push({ fund_id: f.id, price: String(p), date: String(m.validity_date).slice(0, 10), source: 'mufap', kind: m.repurchase_price ? 'repurchase' : 'nav' });
    }
  }
  return { funds, amcs, prices };
}

/** symbol (upper-cased) → board record (web: marketQueries.stockPriceMap). */
export function stockPriceMap(board: Board | undefined) {
  const map: Record<string, Board['data'][number]> = {};
  for (const s of board?.data ?? []) {
    const k = String(s?.symbol ?? '').toUpperCase();
    if (k) map[k] = s;
  }
  return map;
}

/**
 * Latest NAV move per open fund: units × (latest price − previous price of the same kind).
 * A fund whose two latest prices are of different kinds (statement NAV vs MUFAP repurchase) is skipped,
 * so a change of price basis is never reported as profit.
 */
export function fundDayChanges(positions: FundPosition[], prices: Price[]) {
  const byFund = new Map<string, Price[]>();
  for (const p of prices) {
    const list = byFund.get(p.fund_id) ?? [];
    list.push(p);
    byFund.set(p.fund_id, list);
  }
  const per = new Map<string, { change: number; pct: number | null; date: string; prevDate: string }>();
  let total = new Decimal(0);
  let latest: string | null = null;
  for (const pos of positions) {
    if (!pos.isOpen || !pos.price) continue;
    const list = (byFund.get(pos.fundId) ?? []).filter((p) => p.date <= pos.price!.date);
    // newest observation per date (later entries win, like the engine's priceBook)
    const byDate = new Map<string, Price>();
    for (const p of list.sort((a, b) => a.date.localeCompare(b.date))) byDate.set(p.date, p);
    const dates = [...byDate.keys()].sort();
    if (dates.length < 2) continue;
    const cur = byDate.get(dates[dates.length - 1])!;
    const prev = byDate.get(dates[dates.length - 2])!;
    if (cur.kind !== prev.kind) continue;
    const change = D(cur.price).minus(prev.price).times(pos.units);
    per.set(pos.key, { change: r2(change), pct: D(prev.price).isZero() ? null : Number(D(cur.price).dividedBy(prev.price).minus(1).times(100).toFixed(2)), date: cur.date, prevDate: prev.date });
    total = total.plus(change);
    if (!latest || cur.date > latest) latest = cur.date;
  }
  return { total: r2(total), latestDate: latest, per };
}

export type TodayFigures = {
  worth: number; funds: number; stocks: number;
  change: number | null; changePct: number | null;
  saved: number; invested: number;
  psxAsOf: string | null; navAsOf: string | null;
};

/** Today's hero and supporting figures (plan §5: net worth · today's change · saved this month · invested). */
export function todayFigures(input: {
  funds: FundsAnalysis | null; stocks: StocksAnalysis | null; fundDay: { total: number; latestDate: string | null } | null;
  txns: Txn[]; month: { start: string; end: string }; today: string; boardAsOf: string | null; tracks: { funds: boolean; stocks: boolean };
}): TodayFigures {
  const fv = input.tracks.funds ? input.funds?.totals.value ?? 0 : 0;
  const sv = input.tracks.stocks ? input.stocks?.totals.value ?? 0 : 0;
  const worth = r2(D(fv).plus(sv));
  const sDay = input.tracks.stocks ? input.stocks?.totals.dayChange ?? null : null;
  const fDay = input.tracks.funds ? input.fundDay?.total ?? null : null;
  const change = sDay === null && fDay === null ? null : r2(D(sDay ?? 0).plus(fDay ?? 0));
  const base = change === null ? null : D(worth).minus(change);
  const changePct = change === null || !base || base.lte(0) ? null : Number(D(change).dividedBy(base).times(100).toFixed(2));
  const month = summarize(input.txns, input.month, input.today);
  const invested = r2(D(input.tracks.funds ? input.funds?.totals.invested ?? 0 : 0).plus(input.tracks.stocks ? input.stocks?.totals.invested ?? 0 : 0));
  return {
    worth, funds: fv, stocks: sv, change, changePct, saved: month.saved, invested,
    psxAsOf: input.boardAsOf ? input.boardAsOf.slice(0, 10) : null,
    navAsOf: input.fundDay?.latestDate ?? null,
  };
}

export type ChartPoint = { date: string; value: number; cost: number };

/** Funds + stocks value per day from server snapshots, with today's live value as the last point. */
export function holdingsPoints(snaps: Snapshot[], live: { date: string; value: number; cost: number } | null, from?: string): ChartPoint[] {
  const pts = snaps
    .filter((s) => !from || s.snap_date >= from)
    .map((s) => ({ date: s.snap_date, value: r2(D(s.funds_value).plus(s.stocks_value)), cost: r2(D(s.funds_cost).plus(s.stocks_cost)) }));
  if (live && live.value > 0) {
    if (pts.length && pts[pts.length - 1].date === live.date) pts[pts.length - 1] = live;
    else if (!pts.length || pts[pts.length - 1].date < live.date) pts.push(live);
  }
  return pts;
}

export type SinceItem = { key: string; text: string; amount: number };

/** "Stocks +Rs 2,140 since Tue 21:40" lines (plan §5). Nothing when under Rs 1 or seen < 30 min ago. */
export function sinceLastLooked(prev: { at: number; stocks: number; funds: number; navDate: string | null } | undefined,
  now: { stocks: number; funds: number; navDate: string | null; at: number }, tracks: { funds: boolean; stocks: boolean }): SinceItem[] {
  if (!prev || now.at - prev.at < 30 * 60_000) return [];
  const out: SinceItem[] = [];
  const s = r2(D(now.stocks).minus(prev.stocks));
  const f = r2(D(now.funds).minus(prev.funds));
  if (tracks.stocks && Math.abs(s) >= 1) out.push({ key: 'stocks', text: 'Stocks', amount: s });
  if (tracks.funds && Math.abs(f) >= 1) out.push({ key: 'funds', text: now.navDate && now.navDate !== prev.navDate ? 'Funds (new NAVs)' : 'Funds', amount: f });
  return out;
}

export type NeedsItem = { key: string; title: string; detail: string; tone: 'warn' | 'info'; href?: string };

/** The single "Needs you" strip (plan §3.6): at most 3 items, most important first. */
export function needsYou(input: {
  pendingReview: number; health: FeedHealthRow[] | undefined; funds: FundsAnalysis | null; stocks: StocksAnalysis | null; now?: Date;
  tracks: { funds: boolean; stocks: boolean };
}): NeedsItem[] {
  const items: NeedsItem[] = [];
  if (input.pendingReview > 0) {
    items.push({ key: 'review', title: `${input.pendingReview} statement ${input.pendingReview === 1 ? 'entry' : 'entries'} to review`, detail: 'Open Imports on the web app to approve or exclude them.', tone: 'info' });
  }
  const stale = staleFeeds(input.health ?? [], input.now ?? new Date())
    .filter((f) => (f.feed === 'psx' && input.tracks.stocks) || (f.feed === 'mufap' && input.tracks.funds));
  for (const f of stale) {
    items.push({ key: `stale-${f.feed}`, title: `${f.feed === 'psx' ? 'PSX prices' : 'Fund NAVs'} are ${f.behind} working day${f.behind === 1 ? '' : 's'} behind`, detail: 'Figures use the last published prices. Refresh in Me › Market prices.', tone: 'warn' });
  }
  const unpriced = [
    ...(input.tracks.funds ? input.funds?.positions.filter((p) => p.isOpen && p.flags.includes('no_price')).map((p) => p.fundName ?? 'A fund') ?? [] : []),
    ...(input.tracks.stocks ? input.stocks?.positions.filter((p) => p.isOpen && p.value === null).map((p) => p.symbol) ?? [] : []),
  ];
  if (unpriced.length) items.push({ key: 'unpriced', title: `No price for ${unpriced.slice(0, 2).join(', ')}${unpriced.length > 2 ? ` +${unpriced.length - 2}` : ''}`, detail: 'Valued at cost until a price is published.', tone: 'warn' });
  return items.slice(0, 3);
}

export type MonthFigures = {
  spent: number; earned: number; saved: number; passive: number; transfers: number; count: number;
  vsLast: number | null; categories: { name: string; icon: string | null; amount: number; count: number; share: number }[];
};

/** Money tab hero + supporting figures for one calendar month (summary engine, active income only). */
export function monthFigures(txns: Txn[], month: { start: string; end: string }, prevMonth: { start: string; end: string }, today: string): MonthFigures {
  const s = summarize(txns, month, today);
  // Compare with the same days of last month, so the 13th isn't measured against a whole month.
  const day = Math.min(Number((month.end < today ? month.end : today).slice(8, 10)), Number(prevMonth.end.slice(8, 10)));
  const prevEnd = `${prevMonth.start.slice(0, 8)}${String(day).padStart(2, '0')}`;
  const p = summarize(txns, { start: prevMonth.start, end: month.end < today ? prevMonth.end : prevEnd }, today);
  const vsLast = p.expenses > 0 ? Number(D(s.expenses).minus(p.expenses).dividedBy(p.expenses).times(100).toFixed(1)) : null;
  const total = D(s.expenses);
  return {
    spent: s.expenses, earned: s.active, saved: s.saved, passive: s.passive, transfers: s.transfers, count: s.count, vsLast,
    categories: s.categories.expenses.map((c) => ({ ...c, share: total.isZero() ? 0 : Number(D(c.amount).dividedBy(total).times(100).toFixed(1)) })),
  };
}

/** Transactions grouped by day for section lists, newest first. */
export function byDay<T extends { date: string }>(rows: T[]): { date: string; rows: T[] }[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const list = map.get(r.date) ?? [];
    list.push(r);
    map.set(r.date, list);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, list]) => ({ date, rows: list }));
}

/** Net amount of a day's rows: credits minus spending (transfers excluded, like the summary engine). */
export function dayNet(rows: Txn[]): number {
  let n = new Decimal(0);
  for (const t of rows) {
    if (t.type === 'credit') n = n.plus(t.amount);
    else if ((t.categories?.kind ?? 'spend') !== 'transfer') n = n.minus(t.amount);
  }
  return r2(n);
}
