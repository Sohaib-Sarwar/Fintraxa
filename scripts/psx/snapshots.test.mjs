/** Daily snapshots (src/lib/snapshots/build.js): hand-worked values and window profit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshots, windowProfit, daysBetween, firstActivity } from '../../src/lib/snapshots/build.js';

const F = 'fund-1';
const entry = (id, date, type, units, amount, nav, seq) => ({
  id, account_id: 'acc-1', fund_id: F, unit_class: null, entry_type: type, trade_date: date, price_date: date, seq,
  unit_delta: String(units), gross_amount: String(amount), net_amount: String(amount), nav: String(nav), cash_direction: units > 0 ? 'in' : 'out',
});
const mf = {
  entries: [
    entry('e1', '2026-11-01', 'purchase', 1000, 10000, 10, 1),          // 1,000 units at 10.00
    entry('e2', '2026-11-04', 'redemption', -400, 4400, 11, 2),         // 400 units at 11.00 → +400 realized
  ],
  components: [],
  prices: [
    { fund_id: F, price: '10.50', date: '2026-11-02', source: 'mufap', kind: 'nav' },
    { fund_id: F, price: '11.00', date: '2026-11-04', source: 'mufap', kind: 'nav' },
    { fund_id: F, price: '11.20', date: '2026-11-05', source: 'mufap', kind: 'nav' },
  ],
  funds: { [F]: { id: F, name: 'Test Cash Fund' } },
};
const psx = {
  trades: [{ id: 't1', symbol: 'MARI', type: 'buy', quantity: 10, price: 500, date: '2026-11-03', fee: 0 }],
  history: { MARI: [{ date: '2026-11-03', close: '500' }, { date: '2026-11-05', close: '520.5' }] },
};
const finance = { transactions: [{ date: '2026-11-01', type: 'credit', amount: '50000', categories: { name: 'Salary', kind: 'active' } }], dividends: [] };

test('days are inclusive; the first activity starts the history', () => {
  assert.deepEqual(daysBetween('2026-11-01', '2026-11-03'), ['2026-11-01', '2026-11-02', '2026-11-03']);
  assert.equal(firstActivity({ mf, psx, finance }), '2026-11-01');
});

test('each day: units, FIFO cost, the latest price on or before the day, value, unrealized and the day\'s realized', () => {
  const { days, holdings } = buildSnapshots({ mf, psx, finance, from: '2026-11-01', to: '2026-11-05', today: '2026-11-05' });
  const fund = (d) => holdings.find((h) => h.asset_type === 'mf' && h.snap_date === d);
  assert.deepEqual([fund('2026-11-02').units, fund('2026-11-02').price, fund('2026-11-02').value, fund('2026-11-02').unrealized], [1000, 10.5, 10500, 500]);
  assert.deepEqual([fund('2026-11-03').price, fund('2026-11-03').price_date], [10.5, '2026-11-02']); // no NAV that day: carried
  const sold = fund('2026-11-04');
  assert.deepEqual([sold.units, sold.cost, sold.value, sold.unrealized, sold.realized_day], [600, 6000, 6600, 600, 400]);
  assert.deepEqual([fund('2026-11-05').value, fund('2026-11-05').unrealized, fund('2026-11-05').realized_day], [6720, 720, 0]);

  const mari = holdings.find((h) => h.asset_type === 'psx' && h.snap_date === '2026-11-05');
  assert.deepEqual([mari.units, mari.cost, mari.value, mari.unrealized], [10, 5000, 5205, 205]);

  const last = days.at(-1);
  assert.equal(last.funds_value, 6720);
  assert.equal(last.stocks_value, 5205);
  assert.equal(last.savings, 50000);
  assert.equal(last.net_worth, 61925);
  assert.equal(days.find((d) => d.snap_date === '2026-11-04').realized_day, 400);
});

test('window profit = unrealized change + realized inside the window; buying more is not profit', () => {
  const { holdings } = buildSnapshots({ mf, psx, finance, from: '2026-11-01', to: '2026-11-05', today: '2026-11-05' });
  const rows = holdings.filter((h) => h.asset_type === 'mf');
  const day = windowProfit(rows, 1, '2026-11-05');         // 4 → 5 Nov: NAV 11.00 → 11.20 on 600 units
  assert.deepEqual([day.profit, day.unrealizedChange, day.realized, day.complete], [120, 120, 0, true]);
  const week = windowProfit(rows, 7, '2026-11-05');        // since before the purchase
  assert.deepEqual([week.profit, week.realized, week.complete], [1120, 400, false]); // 720 unrealized + 400 realized
  const three = windowProfit(rows, 3, '2026-11-05');       // from 2 Nov close (unrealized 500)
  assert.deepEqual([three.profit, three.from], [620, '2026-11-02']);  // 720 − 500 + 400
  assert.equal(windowProfit([], 7, '2026-11-05'), null);
});

test('chart series: realized is summed over the period, unrealized is read at its last day', async () => {
  const { profitSeries } = await import('../../src/lib/snapshots/series.js');
  const row = (d, fr, fu) => ({ snap_date: d, funds_realized_day: fr, funds_unrealized: fu, stocks_realized_day: 0, stocks_unrealized: 0 });
  const rows = [row('2026-06-29', 10, 100), row('2026-06-30', 5, 120), row('2026-07-01', 0, 130), row('2026-07-15', 40.1, 90), row('2026-07-31', 0.2, 95)];
  const T = '2026-08-05';
  const month = profitSeries(rows, { asset: 'funds', measure: 'realized', period: 'month', today: T });
  assert.deepEqual(month.map((p) => [p.month, p.amount]), [['2026-06', 15], ['2026-07', 40.3]]);
  const monthU = profitSeries(rows, { asset: 'funds', measure: 'unrealized', period: 'month', today: T });
  assert.deepEqual(monthU.map((p) => p.amount), [120, 95]);
  const year = profitSeries(rows, { asset: 'funds', measure: 'realized', period: 'year', start: '2026-07-01', today: T });
  assert.deepEqual(year.map((p) => [p.label, p.amount]), [['FY 25-26', 15], ['FY 26-27', 40.3]]); // fiscal years ignore the range
  const day = profitSeries(rows, { asset: 'funds', measure: 'unrealized', period: 'day', start: '2026-07-01', today: T });
  assert.deepEqual(day.map((p) => [p.tick, p.amount]), [['1 Jul', 130], ['15 Jul', 90], ['31 Jul', 95]]);
});

test('unrealized: months valued only at the purchase price are left out, never shown as a false gain or loss', async () => {
  const { engineFallback, profitSeries } = await import('../../src/lib/snapshots/series.js');
  // PSX month-ends before closes were captured are priced at the trade price: value − cost = −fees.
  const series = [
    { month: '2026-09', value: 109_000_000, invested: 109_153_025.71, priced: 'trade' },
    { month: '2026-10', value: 109_000_000, invested: 109_153_025.71, priced: 'trade' },
    { month: '2026-11', value: 118_400_000, invested: 109_153_025.71, priced: 'live' },
  ];
  const fb = engineFallback([{ month: '2026-09', net: 0 }], series);
  assert.deepEqual(fb.map((m) => [m.month, m.unrealized]), [['2026-09', null], ['2026-10', null], ['2026-11', 9_246_974.29]]);
  const rows = fb.map((m) => ({ snap_date: `${m.month}-28`, stocks_realized_day: m.realized, stocks_unrealized: m.unrealized }));
  const pts = profitSeries(rows, { asset: 'stocks', measure: 'unrealized', period: 'month', today: '2026-11-28' });
  assert.deepEqual(pts.map((p) => [p.month, p.amount, p.live]), [['2026-11', 9_246_974.29, true]]); // only the real, current figure
  const realized = profitSeries(rows, { asset: 'stocks', measure: 'realized', period: 'month', today: '2026-11-28' });
  assert.equal(realized.length, 3); // realized does not need a market price
});
