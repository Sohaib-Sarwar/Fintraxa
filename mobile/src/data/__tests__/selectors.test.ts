import { byDay, dayNet, fundDayChanges, holdingsPoints, monthFigures, needsYou, sinceLastLooked, todayFigures, type Price } from '../selectors';
import type { FundPosition, FundsAnalysis, StocksAnalysis, Txn } from '../types';

const pos = (o: Partial<FundPosition>): FundPosition => ({
  key: 'a|f1|', accountId: 'a', fundId: 'f1', fundName: 'Fund One', amcCode: 'ubl', amcName: 'UBL', isOpen: true, units: 1000,
  price: { value: 10.25, date: '2026-11-13', source: 'mufap', stale: false }, value: 10250, invested: 10000, avgCost: 10,
  unrealized: { gross: 250, tax: 37.5, net: 212.5 }, realized: { gross: 0, cgt: 0, charges: 0, net: 0, sales: 0 }, allTime: { gross: 0, cgt: 0, net: 0 },
  entries: [], firstDate: '2026-01-01', flags: [], ...o,
});
const P = (date: string, price: string, kind = 'repurchase', source = 'mufap'): Price => ({ fund_id: 'f1', date, price, kind, source });

describe('fundDayChanges', () => {
  test('units × (latest − previous) of the same price kind, exact', () => {
    const r = fundDayChanges([pos({})], [P('2026-11-11', '10.1'), P('2026-11-12', '10.2'), P('2026-11-13', '10.25')]);
    expect(r.total).toBe(50); // 1000 × 0.05
    expect(r.latestDate).toBe('2026-11-13');
    expect(r.per.get('a|f1|')).toEqual({ change: 50, pct: 0.49, date: '2026-11-13', prevDate: '2026-11-12' });
  });
  test('a change of price basis (statement NAV → MUFAP repurchase) is not reported as profit', () => {
    const r = fundDayChanges([pos({})], [P('2026-11-12', '10.4', 'nav', 'statement'), P('2026-11-13', '10.25')]);
    expect(r.total).toBe(0);
    expect(r.per.size).toBe(0);
  });
  test('forward-dated NAVs beyond the price the engine used are ignored', () => {
    const r = fundDayChanges([pos({})], [P('2026-11-12', '10.2'), P('2026-11-13', '10.25'), P('2026-11-14', '11')]);
    expect(r.total).toBe(50);
  });
  test('closed positions and positions without a price contribute nothing', () => {
    const r = fundDayChanges([pos({ isOpen: false }), pos({ key: 'b', price: null })], [P('2026-11-12', '10.2'), P('2026-11-13', '10.25')]);
    expect(r.total).toBe(0);
  });
});

const funds = (value: number, invested: number): FundsAnalysis => ({
  totals: { value, invested, held: 1, incomplete: false, realized: { gross: 0, cgt: 0, charges: 0, net: 0, sales: 0 }, unrealized: { gross: value - invested, tax: 0, net: 0 } },
  positions: [], allPositions: [],
});
const stocks = (value: number, invested: number, dayChange: number | null): StocksAnalysis => ({
  totals: { value, invested, unrealized: value - invested, unrealizedPct: null, realized: 0, held: 1, dayChange, unpriced: 0, salesCount: 0 },
  positions: [], allPositions: [],
});

describe('todayFigures', () => {
  const txns = [
    { id: '1', type: 'credit', amount: '50000', date: '2026-11-01', categories: { name: 'Salary', icon: null, kind: 'active' } },
    { id: '2', type: 'debit', amount: '12024.5', date: '2026-11-05', categories: { name: 'Mess', icon: null, kind: 'spend' } },
  ] as unknown as Txn[];
  test('net worth = funds + stocks; change = stocks day + latest NAV move; % against the starting value', () => {
    const f = todayFigures({
      funds: funds(100000.1, 90000), stocks: stocks(50000.2, 40000, 1000), fundDay: { total: 500, latestDate: '2026-11-13' },
      txns, month: { start: '2026-11-01', end: '2026-11-30' }, today: '2026-11-14', boardAsOf: '2026-11-13T18:08:00+05:00', tracks: { funds: true, stocks: true },
    });
    expect(f.worth).toBe(150000.3);
    expect(f.change).toBe(1500);
    expect(f.changePct).toBe(1.01); // 1500 / 148500.3
    expect(f.saved).toBe(37975.5);
    expect(f.invested).toBe(130000);
    expect([f.psxAsOf, f.navAsOf]).toEqual(['2026-11-13', '2026-11-13']);
  });
  test('untracked assets are left out of every figure', () => {
    const f = todayFigures({
      funds: funds(100000, 90000), stocks: stocks(50000, 40000, 1000), fundDay: { total: 500, latestDate: null },
      txns: [], month: { start: '2026-11-01', end: '2026-11-30' }, today: '2026-11-14', boardAsOf: null, tracks: { funds: false, stocks: true },
    });
    expect([f.worth, f.change, f.invested]).toEqual([50000, 1000, 40000]);
  });
  test('no day data at all → change is unknown, not zero', () => {
    const f = todayFigures({
      funds: null, stocks: stocks(100, 100, null), fundDay: null, txns: [], month: { start: '2026-11-01', end: '2026-11-30' },
      today: '2026-11-14', boardAsOf: null, tracks: { funds: true, stocks: true },
    });
    expect([f.change, f.changePct]).toEqual([null, null]);
  });
});

describe('holdingsPoints', () => {
  const snaps = [
    { snap_date: '2026-11-12', funds_value: 100.1, funds_cost: 90, stocks_value: 50.2, stocks_cost: 40, savings: 0, net_worth: 0 },
    { snap_date: '2026-11-13', funds_value: 101, funds_cost: 90, stocks_value: 51, stocks_cost: 40, savings: 0, net_worth: 0 },
  ];
  test('funds + stocks per day (exact), live value appended as today', () => {
    expect(holdingsPoints(snaps, { date: '2026-11-14', value: 160, cost: 130 })).toEqual([
      { date: '2026-11-12', value: 150.3, cost: 130 }, { date: '2026-11-13', value: 152, cost: 130 }, { date: '2026-11-14', value: 160, cost: 130 },
    ]);
  });
  test('today’s snapshot is replaced by the live value', () => {
    expect(holdingsPoints(snaps, { date: '2026-11-13', value: 153, cost: 130 }).at(-1)).toEqual({ date: '2026-11-13', value: 153, cost: 130 });
  });
});

describe('sinceLastLooked', () => {
  const now = { at: Date.parse('2026-11-14T21:00:00'), stocks: 51140, funds: 100000, navDate: '2026-11-14' };
  const prev = { at: Date.parse('2026-11-11T21:40:00'), stocks: 49000, funds: 100000.4, navDate: '2026-11-13' };
  test('reports changes of at least Rs 1 per tracked asset', () => {
    expect(sinceLastLooked(prev, now, { funds: true, stocks: true })).toEqual([{ key: 'stocks', text: 'Stocks', amount: 2140 }]);
  });
  test('nothing within 30 minutes of the last look, or on the first visit', () => {
    expect(sinceLastLooked({ ...prev, at: now.at - 10 * 60_000 }, now, { funds: true, stocks: true })).toEqual([]);
    expect(sinceLastLooked(undefined, now, { funds: true, stocks: true })).toEqual([]);
  });
});

describe('needsYou', () => {
  test('review items first, at most three, only for tracked feeds', () => {
    const health = [
      { feed: 'psx', latest_data: '2026-11-03', last_success: null, last_error: null, last_error_at: null },
      { feed: 'mufap', latest_data: '2026-11-03', last_success: null, last_error: null, last_error_at: null },
    ];
    const items = needsYou({ pendingReview: 2, health, funds: null, stocks: null, tracks: { funds: false, stocks: true }, now: new Date('2026-11-13T19:00:00+05:00') });
    expect(items.map((i) => i.key)).toEqual(['review', 'stale-psx']);
    expect(items[0].title).toBe('2 statement entries to review');
  });
});

describe('monthFigures', () => {
  const t = (type: string, amount: string, date: string, kind: string, name: string) => ({ id: `${date}${amount}`, type, amount, date, categories: { name, icon: null, kind } }) as unknown as Txn;
  test('spent vs the same days of last month; category shares', () => {
    const rows = [
      t('debit', '3000', '2026-11-03', 'spend', 'Food'), t('debit', '1000', '2026-11-10', 'spend', 'Transport'),
      t('debit', '2000', '2026-10-05', 'spend', 'Food'), t('debit', '9000', '2026-10-25', 'spend', 'Food'), // after the 14th: not compared
      t('credit', '50000', '2026-11-01', 'active', 'Salary'),
    ];
    const m = monthFigures(rows, { start: '2026-11-01', end: '2026-11-30' }, { start: '2026-10-01', end: '2026-10-31' }, '2026-11-14');
    expect([m.spent, m.earned, m.saved, m.vsLast]).toEqual([4000, 50000, 46000, 100]);
    expect(m.categories.map((c) => [c.name, c.share])).toEqual([['Food', 75], ['Transport', 25]]);
  });
});

describe('byDay / dayNet', () => {
  test('groups newest first; day net excludes transfers', () => {
    const rows = [
      { id: '1', type: 'debit', amount: '100', date: '2026-11-13', categories: { kind: 'spend' } },
      { id: '2', type: 'credit', amount: '500.5', date: '2026-11-14', categories: { kind: 'active' } },
      { id: '3', type: 'debit', amount: '200', date: '2026-11-14', categories: { kind: 'transfer' } },
    ] as unknown as Txn[];
    const g = byDay(rows);
    expect(g.map((d) => d.date)).toEqual(['2026-11-14', '2026-11-13']);
    expect(dayNet(g[0].rows)).toBe(500.5);
    expect(dayNet(g[1].rows)).toBe(-100);
  });
});
