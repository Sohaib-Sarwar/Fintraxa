/**
 * Engine parity (plan M0-T2/M1-T1): the phone imports the web's engines unchanged through `@core/*`.
 * These cases are the hand-worked ones from the web's own tests (scripts/psx/portfolio.test.mjs,
 * scripts/psx/nccpl.test.mjs, scripts/psx/finance.test.mjs), run here through the mobile build's module
 * resolution and Babel transform — same inputs, same figures to the paisa, or the milestone is blocked.
 */
import { analyzeStocks, nccplReport, summarize } from '../engines';
import type { Txn } from '../types';

let n = 0;
const T = (symbol: string, type: 'buy' | 'sell', date: string, quantity: number, price: number, fee = 0, settlement_date?: string) =>
  ({ id: `t${++n}`, symbol, type, date, quantity, price, fee, created_at: String(n).padStart(4, '0'), settlement_date });

describe('PSX portfolio engine under the mobile build', () => {
  test('average cost incl. buy fees; realized after sell fees; value = invested + unrealized (hand-worked)', () => {
    const trades = [
      T('ffc ', 'buy', '2026-01-10', 10, 100, 5),
      T('FFC', 'buy', '2026-02-10', 10, 120, 5),
      T('FFC', 'sell', '2026-03-10', 5, 130, 4),
    ];
    const a = analyzeStocks(trades, { live: { FFC: { current: 140, change: 2, change_pct: 1.45 } }, history: {}, start: '0000-01-01', end: '2026-03-31', today: '2026-03-31' });
    const p = a.positions[0];
    expect([p.symbol, p.shares, p.avgCost, p.invested, p.value, p.unrealized, p.realized]).toEqual(['FFC', 15, 110.5, 1657.5, 2100, 442.5, 93.5]);
    expect([a.totals.value, a.totals.invested, a.totals.unrealized, a.totals.realized, a.totals.dayChange]).toEqual([2100, 1657.5, 442.5, 93.5, 30]);
  });

  test('a fiscal-year range counts only sales inside it and values holdings at its end', () => {
    const trades = [T('OGDC', 'buy', '2026-01-05', 10, 100), T('OGDC', 'sell', '2026-06-10', 4, 120), T('OGDC', 'sell', '2026-08-10', 2, 130)];
    const history = { OGDC: [{ date: '2026-06-30', close: 118 }] };
    const last = analyzeStocks(trades, { live: { OGDC: { current: 140 } }, history, start: '2025-07-01', end: '2026-06-30', today: '2026-11-07' });
    expect([last.totals.realized, last.positions[0].shares, last.totals.value]).toEqual([80, 6, 708]);
    const cur = analyzeStocks(trades, { live: { OGDC: { current: 140 } }, history, start: '2026-07-01', end: '2027-06-30', today: '2026-11-07' });
    expect([cur.totals.realized, cur.positions[0].shares, cur.totals.value]).toEqual([60, 4, 560]);
  });
});

describe('NCCPL CGT engine under the mobile build', () => {
  test('Rule 13N deemed costs, 15%, FIFO by settlement', () => {
    // Buy 100 @ 100 (settles 2 Jan), sell 100 @ 120 (settles 3 Mar 2026, tax year 2026).
    // gain = (12,000 − 10,000) − 0.5%·12,000 − 0.5%·10,000 = 2,000 − 60 − 50 = 1,890; CGT 15% = 283.50
    const r = nccplReport([T('ABC', 'buy', '2025-12-31', 100, 100, 0, '2026-01-02'), T('ABC', 'sell', '2026-02-27', 100, 120, 0, '2026-03-03')], { today: '2026-03-31' });
    const y = r.year(2026)!;
    expect([y.net, y.cgt]).toEqual([1890, 283.5]);
    expect(y.months.map((m) => [m.month, m.cgtThisMonth])).toEqual([['2026-03', 283.5]]);
  });
});

describe('Personal finance summary under the mobile build', () => {
  const tx = (type: 'credit' | 'debit', amount: string, date: string, kind: 'active' | 'spend' | 'transfer' | 'passive', name: string = kind) =>
    ({ id: `${type}${amount}${date}`, type, amount, date, categories: { name, icon: null, kind } }) as unknown as Txn;
  test('saved = active income − spending; transfers and passive reported apart; exact decimals', () => {
    const rows = [
      tx('credit', '100000.10', '2026-11-01', 'active', 'Salary'),
      tx('debit', '0.20', '2026-11-02', 'spend', 'Food'),
      tx('debit', '0.10', '2026-11-03', 'spend', 'Food'),
      tx('debit', '25000', '2026-11-04', 'transfer', 'Savings'),
      tx('credit', '1500', '2026-11-05', 'passive', 'Profit'),
      tx('debit', '999', '2026-10-30', 'spend', 'Food'), // outside the range
    ];
    const s = summarize(rows, { start: '2026-11-01', end: '2026-11-30' }, '2026-11-14');
    expect([s.active, s.expenses, s.saved, s.transfers, s.passive]).toEqual([100000.1, 0.3, 99999.8, 25000, 1500]);
    expect(s.categories.expenses).toEqual([{ name: 'Food', icon: null, amount: 0.3, count: 2 }]);
  });
});
