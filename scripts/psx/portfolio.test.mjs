/** PSX portfolio (src/lib/psx/portfolio.js). Figures worked by hand in comments. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeStocks, fiscalYearEnds } from '../../src/lib/psx/portfolio.js';

let n = 0;
const T = (symbol, type, date, quantity, price, fee = 0) => ({ id: `t${++n}`, symbol, type, date, quantity, price, fee, created_at: String(n).padStart(4, '0') });

test('average cost: invested, value at the live price, unrealized and realized; value = invested + unrealized', () => {
  const trades = [
    T('ffc ', 'buy', '2026-01-10', 10, 100, 5),  // cost 1,005 (symbol trimmed and upper-cased)
    T('FFC', 'buy', '2026-02-10', 10, 120, 5),   // cost 1,205 → 20 sh, 2,210, avg 110.50
    T('FFC', 'sell', '2026-03-10', 5, 130, 4),   // proceeds 646, basis 552.50 → realized 93.50
  ];
  const a = analyzeStocks(trades, { live: { FFC: { current: 140, change: 2, change_pct: 1.45 } }, today: '2026-03-31' });
  const p = a.positions[0];
  assert.equal(p.symbol, 'FFC');
  assert.equal(p.shares, 15);
  assert.equal(p.avgCost, 110.5);
  assert.equal(p.invested, 1657.5);       // 2,210 − 552.50
  assert.equal(p.value, 2100);            // 15 × 140
  assert.equal(p.unrealized, 442.5);
  assert.equal(p.realized, 93.5);
  assert.deepEqual([a.totals.value, a.totals.invested, a.totals.unrealized, a.totals.realized, a.totals.dayChange], [2100, 1657.5, 442.5, 93.5, 30]);
});

test('a stock missing from the live board is still in the portfolio value: last close, then last trade price', () => {
  const trades = [T('AAA', 'buy', '2026-03-01', 10, 50), T('BBB', 'buy', '2026-03-02', 4, 25)];
  const a = analyzeStocks(trades, { live: {}, history: { AAA: [{ date: '2026-03-20', close: 55 }] }, today: '2026-03-31' });
  const [aaa, bbb] = ['AAA', 'BBB'].map((s) => a.positions.find((p) => p.symbol === s));
  assert.deepEqual([aaa.value, aaa.priceSource], [550, 'close']);   // 10 × captured close 55
  assert.deepEqual([bbb.value, bbb.priceSource], [100, 'trade']);   // 4 × last trade 25
  assert.equal(a.totals.value, 650);
  assert.equal(a.totals.value, a.totals.invested + a.totals.unrealized);
  assert.equal(a.totals.fallbackPriced, 2);
});

test('selling everything clears invested; the sale counts as realized', () => {
  const a = analyzeStocks([T('HUBC', 'buy', '2026-01-01', 10, 100), T('HUBC', 'sell', '2026-02-01', 10, 110)], { live: { HUBC: { current: 150 } }, today: '2026-02-28' });
  assert.equal(a.positions[0].isOpen, false);
  assert.deepEqual([a.totals.invested, a.totals.value, a.totals.realized, a.totals.held], [0, 0, 100, 0]);
});

test('date range: realized counts sales inside it; holdings and value are as at its end', () => {
  const trades = [T('OGDC', 'buy', '2026-01-05', 10, 100), T('OGDC', 'sell', '2026-06-10', 4, 120), T('OGDC', 'sell', '2026-08-10', 2, 130)];
  const history = { OGDC: [{ date: '2026-06-30', close: 118 }] };
  // FY 2025-26 (to 30 Jun): realized 4 × (120 − 100) = 80; 6 shares at the 30 Jun close 118 = 708.
  const last = analyzeStocks(trades, { live: { OGDC: { current: 140 } }, history, start: '2025-07-01', end: '2026-06-30', today: '2026-11-07' });
  assert.deepEqual([last.totals.realized, last.positions[0].shares, last.totals.value, last.positions[0].priceSource], [80, 6, 708, 'close']);
  // FY 2026-27 to date: realized 2 × (130 − 100) = 60; 4 shares at live 140 = 560.
  const cur = analyzeStocks(trades, { live: { OGDC: { current: 140 } }, history, start: '2026-07-01', end: '2027-06-30', today: '2026-11-07' });
  assert.deepEqual([cur.totals.realized, cur.positions[0].shares, cur.totals.value, cur.end], [60, 4, 560, '2026-11-07']);
  // Opening balance on 30 Jun (6 shares at the 30 Jun close 118), then each month-end to today.
  assert.deepEqual(cur.series.map((s) => s.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual([cur.series[0].opening, cur.series[0].date, cur.series[0].value], [true, '2026-06-30', 708]);
});

test('growth series: captured close where there is one, trade price before capture, live today', () => {
  const trades = [T('LUCK', 'buy', '2026-01-15', 10, 100), T('LUCK', 'buy', '2026-02-20', 10, 110)];
  const history = { LUCK: [{ date: '2026-02-27', close: '118.50' }, { date: '2026-03-02', close: 121 }] };
  const a = analyzeStocks(trades, { live: { LUCK: { current: 125 } }, history, today: '2026-03-12' });
  assert.deepEqual(a.series.map((s) => [s.month, s.invested, s.value, s.priced]), [
    ['2026-01', 1000, 1000, 'trade'],   // no close yet: last trade 100
    ['2026-02', 2100, 2370, 'close'],   // 20 × close 118.50 (27 Feb, last trading day)
    ['2026-03', 2100, 2500, 'live'],    // today: 20 × live 125
  ]);
});

test('fiscal-year view keeps the last month-end of each year; June closes the year', () => {
  const pts = [
    { month: '2026-05', invested: 1, value: 1 }, { month: '2026-06', invested: 2, value: 3 },
    { month: '2026-07', invested: 4, value: 5 }, { month: '2026-11', invested: 6, value: 7, live: true },
  ];
  assert.deepEqual(fiscalYearEnds(pts).map((x) => [x.title, x.value]), [['FY 2025-26', 3], ['FY 2026-27 to date', 7]]);
});

test('broker fees are split out: realized gross vs fees, 15% estimate on unrealized gains, and the monthly realized series', () => {
  const trades = [
    T('MARI', 'buy', '2026-07-01', 10, 100, 10),    // cost 1,010, of which fees 10
    T('MARI', 'sell', '2026-08-15', 4, 130, 6),     // basis 404 (fees 4); gain 520 − 6 − 404 = 110; fees 10; gross 120
  ];
  const a = analyzeStocks(trades, { live: { MARI: { current: 150 } }, start: '2026-07-01', end: '2027-06-30', today: '2026-09-30' });
  assert.deepEqual([a.totals.realizedGross, a.totals.realizedFees, a.totals.realized], [120, 10, 110]);
  // Held 6 @150 = 900, cost 606 → unrealized 294; 15% = 44.10; net 249.90.
  assert.deepEqual([a.totals.unrealized, a.totals.unrealizedTax, a.totals.unrealizedNet], [294, 44.1, 249.9]);
  assert.deepEqual(a.months.map((m) => [m.month, m.gross, m.cgt, m.net]), [['2026-07', 0, 0, 0], ['2026-08', 120, 10, 110], ['2026-09', 0, 0, 0]]);
});

test('active in range: a stock bought before the range and still held is shown and counted; one sold out before it is not', () => {
  const trades = [
    T('HELD', 'buy', '2026-02-01', 10, 100),
    T('GONE', 'buy', '2026-01-05', 10, 100), T('GONE', 'sell', '2026-03-01', 10, 120),
    T('OGDC', 'buy', '2026-08-01', 5, 100),
  ];
  const live = { HELD: { current: 120 }, OGDC: { current: 110 }, GONE: { current: 150 } };
  const a = analyzeStocks(trades, { live, start: '2026-07-01', end: '2027-06-30', today: '2026-11-07' });
  assert.deepEqual(a.positions.map((p) => p.symbol).sort(), ['HELD', 'OGDC']);
  assert.deepEqual([a.totals.invested, a.totals.value, a.totals.realized], [1500, 1750, 0]);
  assert.equal(a.series[0].invested, 1000, 'July: HELD only');
  assert.equal(a.allPositions.length, 3);
});

test('estimated CGT on the portfolio: 15% of the net unrealized gain, nothing on a net loss', () => {
  const trades = [T('AAA', 'buy', '2026-07-01', 10, 100), T('BBB', 'buy', '2026-07-01', 10, 100)];
  const live = (a, b) => ({ AAA: { current: a }, BBB: { current: b } });
  const gain = analyzeStocks(trades, { live: live(120, 90), today: '2026-07-10' });  // +200, −100
  assert.deepEqual([gain.totals.unrealized, gain.totals.unrealizedTax, gain.totals.unrealizedNet], [100, 15, 85]);
  assert.equal(gain.positions.find((p) => p.symbol === 'AAA').unrealizedTax, 30); // per stock: its own gain
  const loss = analyzeStocks(trades, { live: live(101, 90), today: '2026-07-10' }); // +10, −100
  assert.deepEqual([loss.totals.unrealized, loss.totals.unrealizedTax, loss.totals.unrealizedNet], [-90, 0, -90]);
});
