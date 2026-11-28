/**
 * Home-screen widget figures (owner, 2026-11-28: "show how much I earn passively, like the web's passive income
 * counter"). Pure — no React, no storage, no native calls — so the app, the widget's background task and the tests
 * all run the same code. Covered by src/features/widget/__tests__/earnings.test.ts.
 *
 * The rate is the web's own (src/features/income-expense/PassiveIncome.jsx, "Since you logged in"):
 *   average passive income a month, after tax  =  analyzePassive(events in the period).avgPerMonth
 *   per second                                 =  that average ÷ seconds in an average month (30.4375 days)
 * computed by the very same engine (src/lib/finance/passive.js), so the widget and the web never disagree. Like the
 * web, a negative average (fund losses larger than the income) counts as nothing earned.
 *
 * Figures at the rate: Today (since 00:00), Overnight (the sleep hours), Yesterday (a full day). Not at the rate:
 * This month = what was actually received this month after tax (owner, 2026-11-28: it must equal the Passive tab's
 * month figure), and Monthly average (the rate itself, per month).
 */
import Decimal from 'decimal.js';
import { analyzePassive, type PassiveEvent, type PassiveSource } from '@/data/engines';

export const WIDGET_SOURCES: PassiveSource[] = ['mutual_funds', 'dividends', 'savings', 'other'];
export const SOURCE_NAMES: Record<PassiveSource, string> = {
  mutual_funds: 'Mutual funds', dividends: 'Dividends', savings: 'Savings profit', other: 'Other passive',
};

/** One passive payment, as the widget stores it (strings keep the exact decimals). */
export type StoredEvent = { d: string; s: PassiveSource; g: string; t: string; n: string };

/** What the app saves for the widget: enough to work offline for days. */
export type WidgetData = {
  v: 1;
  uid: string;
  builtAt: number;
  events: StoredEvent[];
};

/** Which period the average is taken over. 'fy' is the web's default range (this tax year, 1 Jul – 30 Jun). */
export type RateBasis = 'fy' | '12m' | 'all';
export const BASIS_NAMES: Record<RateBasis, string> = { fy: 'This tax year', '12m': 'Last 12 months', all: 'All time' };

export type SmallFigure = 'month' | 'yesterday' | 'overnight' | 'average';
export const FIGURE_NAMES: Record<SmallFigure, string> = {
  month: 'This month', yesterday: 'Yesterday', overnight: 'Overnight', average: 'Monthly avg',
};
/** Longer names for the settings screen. */
export const FIGURE_HELP: Record<SmallFigure, string> = {
  overnight: 'While you slept, at your rate',
  yesterday: 'A full day at your rate',
  month: 'Received since the 1st, after tax (as in Passive)',
  average: 'Your average a month, after tax',
};

/** Sleep hours for "Overnight": from `from` (previous evening) to `to` (morning), whole hours 0–23. */
export type Sleep = { from: number; to: number };
export const SLEEP_PRESETS: Sleep[] = [{ from: 22, to: 6 }, { from: 23, to: 7 }, { from: 0, to: 8 }, { from: 1, to: 9 }];

const SECOND = 1000;
const DAY_S = 86_400;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date of a moment, 'YYYY-MM-DD' (the phone's own time zone, like the rest of the app). */
export const isoDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const at = (ms: number, dayOffset: number, hour: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, 0, 0, 0).getTime();
};
const startOfDay = (ms: number) => at(ms, 0, 0);

/** First day of the averaging period for `today` ('YYYY-MM-DD'). */
export function basisStart(basis: RateBasis, today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (basis === 'fy') return `${m >= 7 ? y : y - 1}-07-01`;
  if (basis === '12m') { const back = new Date(y, m - 1 - 11, 1); return `${back.getFullYear()}-${pad(back.getMonth() + 1)}-01`; }
  return '2000-01-01';
}

/** Stored events → the engine's events (exact decimals back), only the chosen sources. */
export function toEvents(events: StoredEvent[], sources: PassiveSource[]): PassiveEvent[] {
  const keep = new Set(sources);
  return events
    .filter((e) => keep.has(e.s))
    .map((e, i) => ({
      id: `w${i}`, date: e.d, month: e.d.slice(0, 7), source: e.s, title: '', sub: '',
      gross: new Decimal(e.g), tax: new Decimal(e.t), net: new Decimal(e.n), posted: true,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
}

/** Engine events (from passiveEvents) → what the widget stores. Fund profit of the open month is kept as dated. */
export function fromEvents(events: { date: string; source: PassiveSource; gross: unknown; tax: unknown; net: unknown }[]): StoredEvent[] {
  return events.map((e) => ({ d: e.date, s: e.source, g: String(e.gross ?? 0), t: String(e.tax ?? 0), n: String(e.net ?? 0) }));
}

/**
 * The window "Overnight" covers at `now`: the last sleep that has started — whole if it is over, so far if it is
 * still going (opened at 2 am, it shows midnight to now, not a night that hasn't happened).
 */
export function sleepWindow(now: number, sleep: Sleep): { start: number; end: number } {
  const crosses = sleep.from > sleep.to; // e.g. 23 → 7 starts the evening before
  for (const back of [1, 0, -1]) {
    const end = at(now, back, sleep.to);
    const start = at(now, back - (crosses ? 1 : 0), sleep.from);
    if (start <= now) return { start, end: Math.min(end, now) };
  }
  return { start: now, end: now };
}

export type WidgetFigures = {
  /** Rupees a second (≥ 0). */
  perSecond: number;
  avgPerMonth: number;
  today: number;
  overnight: number;
  yesterday: number;
  /** Passive income actually received this month after tax — the Passive tab's "This month" (not the rate). */
  month: number;
  average: number;
  /** Months the average is taken over (the web's elapsed months). */
  months: number;
  hasIncome: boolean;
};

/** Everything the widget can show at `now`, for the chosen sources and averaging period. */
export function widgetFigures(data: Pick<WidgetData, 'events'>, opts: { sources: PassiveSource[]; basis: RateBasis; sleep: Sleep; now: number }): WidgetFigures {
  const { now } = opts;
  const today = isoDay(now);
  const events = toEvents(data.events, opts.sources);
  const a = analyzePassive(events, { start: basisStart(opts.basis, today), end: today, today });
  const monthStart = `${today.slice(0, 7)}-01`;
  const received = analyzePassive(events, { start: monthStart, end: today, today }).totals.net;
  // The web's counter: max(0, perSecond) × seconds.
  const perSecond = Math.max(0, a.perSecond);
  const earn = (ms: number) => perSecond * Math.max(0, ms) / SECOND;
  const night = sleepWindow(now, opts.sleep);
  return {
    perSecond,
    avgPerMonth: a.avgPerMonth,
    today: earn(now - startOfDay(now)),
    overnight: earn(night.end - night.start),
    yesterday: perSecond * DAY_S,
    month: received,
    average: Math.max(0, a.avgPerMonth),
    months: a.elapsedMonths,
    hasIncome: events.length > 0,
  };
}

/** Decimals for a live figure: 4 under Rs 10 (it visibly moves, like the web), else 2; none from Rs 100,000. */
export const liveDecimals = (n: number) => (Math.abs(n) < 10 ? 4 : Math.abs(n) < 100_000 ? 2 : 0);

/** "Rs 1,234.56" with the given decimals; K/M/B from Rs 10 million (the in-app cards' overflow rule). */
export function rupees(n: number, decimals: number): string {
  const d = new Decimal(Number.isFinite(n) ? n : 0);
  if (d.abs().gte(10_000_000)) {
    const units: [string, number][] = [['B', 1e9], ['M', 1e6]];
    const [u, v] = units.find(([, k]) => d.abs().gte(k))!;
    const x = d.dividedBy(v);
    return `Rs ${x.abs().gte(100) ? x.toFixed(0) : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}${u}`;
  }
  const fixed = d.abs().toFixed(decimals, Decimal.ROUND_DOWN); // a counter never shows money not yet earned
  const [int, frac] = fixed.split('.');
  const body = `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac ? `.${frac}` : ''}`;
  return `${d.isNegative() && !new Decimal(fixed).isZero() ? '-' : ''}Rs ${body}`;
}

/** Small figures: whole rupees from Rs 1,000, else 2 decimals; compact from Rs 1 million. */
export function rupeesShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1_000_000) {
    const v = a >= 1e9 ? [n / 1e9, 'B'] as const : [n / 1e6, 'M'] as const;
    return `Rs ${Math.abs(v[0]) >= 100 ? v[0].toFixed(0) : v[0].toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}${v[1]}`;
  }
  return rupees(n, a >= 1000 ? 0 : 2);
}

export const sleepLabel = (s: Sleep) => `${hour12(s.from)} – ${hour12(s.to)}`;
export function hour12(h: number) {
  const x = ((h % 24) + 24) % 24;
  return `${x % 12 === 0 ? 12 : x % 12} ${x < 12 ? 'am' : 'pm'}`;
}
