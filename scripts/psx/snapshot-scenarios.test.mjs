/**
 * Snapshot scenarios with dummy histories:
 *   - the fast day-by-day builder gives exactly what the full engines give for each day
 *   - FFC held from 1 Jan 2026, partly sold, fully sold, bought back: value vs invested by month
 *   - NBP Islamic Money Market from 1 Jul: a second purchase, a FIFO redemption with CGT
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshots, daysBetween } from '../../src/lib/snapshots/build.js';
import { valueSeries, withCumulativeDividends } from '../../src/lib/snapshots/series.js';
import { analyzeFunds } from '../../src/lib/mf/profit.js';
import { analyzeStocks } from '../../src/lib/psx/portfolio.js';

const T = '2026-11-08';

/* ─── FFC ─── */
const ffcTrades = [
  { id: 'b1', symbol: 'FFC', type: 'buy', quantity: 100, price: 300, fee: 0, date: '2026-01-01', company_name: 'Fauji Fertilizer' },
  { id: 's1', symbol: 'FFC', type: 'sell', quantity: 40, price: 350, fee: 0, date: '2026-03-10' },
  { id: 's2', symbol: 'FFC', type: 'sell', quantity: 60, price: 320, fee: 0, date: '2026-04-01' },
  { id: 'b2', symbol: 'FFC', type: 'buy', quantity: 50, price: 400, fee: 0, date: '2026-06-15' },
];
const ffcCloses = { FFC: [
  { date: '2026-01-31', close: '310' }, { date: '2026-02-27', close: '330' }, { date: '2026-03-31', close: '345' },
  { date: '2026-06-30', close: '410' }, { date: '2026-07-31', close: '420' }, { date: '2026-11-06', close: '450' },
] };

test('FFC: value vs invested each month follows the buys and sells; sold-out months are zero, not a straight line', () => {
  const { holdings } = buildSnapshots({ psx: { trades: ffcTrades, history: ffcCloses }, from: '2026-01-01', to: T, today: T });
  const rows = holdings.filter((h) => h.asset_key === 'FFC');
  const m = valueSeries(rows, { period: 'month', start: '2026-01-01', today: T, fillGaps: true });
  const at = (k) => m.find((p) => p.month === k);
  assert.deepEqual([at('2026-01').value, at('2026-01').invested, at('2026-01').unrealized], [31000, 30000, 1000]); // 100 × 310
  assert.deepEqual([at('2026-02').value, at('2026-02').invested], [33000, 30000]);
  assert.deepEqual([at('2026-03').value, at('2026-03').invested, at('2026-03').realized], [20700, 18000, 2000]); // 60 left; sold 40 at +50
  assert.deepEqual([at('2026-04').value, at('2026-04').invested, at('2026-04').realized], [0, 0, 1200]);           // all sold at +20
  assert.deepEqual([at('2026-05').value, at('2026-05').invested], [0, 0]);                                         // nothing held
  assert.deepEqual([at('2026-06').value, at('2026-06').invested], [20500, 20000]);                                 // 50 bought back, close 410
  assert.deepEqual([at('2026-11').value, at('2026-11').invested, at('2026-11').unrealized], [22500, 20000, 2500]); // latest close 450
  const weeks = valueSeries(rows, { period: 'week', start: '2026-03-01', end: '2026-03-31', today: T });
  assert.ok(weeks.length >= 4 && weeks.every((w) => w.title.startsWith('Week of')));
  const years = valueSeries(rows, { period: 'year', today: T, fillGaps: true });
  assert.deepEqual(years.map((y) => [y.label, y.value, y.realized]), [['FY 25-26', 20500, 3200], ['FY 26-27', 22500, 0]]);
});

/* ─── NBP Islamic Money Market ─── */
const F = 'nbp-imm';
const e = (id, date, type, units, amount, nav, seq) => ({
  id, account_id: 'acc', fund_id: F, unit_class: null, entry_type: type, trade_date: date, price_date: date, seq,
  unit_delta: String(units), gross_amount: String(amount), net_amount: String(amount), nav: String(nav), cash_direction: units > 0 ? 'in' : 'out',
});
const nbp = {
  entries: [
    e('p1', '2026-07-01', 'purchase', 10000, 100000, 10, 1),
    e('p2', '2026-08-01', 'purchase', 5000, 51000, 10.2, 2),
    e('r1', '2026-09-15', 'redemption', -8000, 84000, 10.5, 3),   // FIFO: 8,000 units of the first lot, cost 80,000
  ],
  components: [{ entry_id: 'r1', component_type: 'cgt', amount: '600' }],
  prices: [
    { fund_id: F, date: '2026-07-31', price: '10.10', source: 'mufap', kind: 'repurchase' },
    { fund_id: F, date: '2026-08-31', price: '10.30', source: 'mufap', kind: 'repurchase' },
    { fund_id: F, date: '2026-09-30', price: '10.60', source: 'mufap', kind: 'repurchase' },
    { fund_id: F, date: '2026-10-30', price: '10.70', source: 'mufap', kind: 'repurchase' },
  ],
  funds: { [F]: { id: F, name: 'NBP Islamic Money Market Fund' } },
};

test('NBP: units, FIFO invested and value at each close; the redemption month shows realized after CGT', () => {
  const { holdings } = buildSnapshots({ mf: nbp, from: '2026-07-01', to: T, today: T });
  const m = valueSeries(holdings, { period: 'month', start: '2026-07-01', today: T, fillGaps: true });
  const at = (k) => m.find((p) => p.month === k);
  assert.deepEqual([at('2026-07').value, at('2026-07').invested], [101000, 100000]);          // 10,000 × 10.10
  assert.deepEqual([at('2026-08').value, at('2026-08').invested], [154500, 151000]);          // 15,000 × 10.30
  assert.deepEqual([at('2026-09').value, at('2026-09').invested, at('2026-09').realized], [74200, 71000, 3400]); // 7,000 left; 4,000 − 600 CGT
  assert.deepEqual([at('2026-10').value, at('2026-10').unrealized], [74900, 3900]);
  const sep = holdings.find((h) => h.snap_date === '2026-09-15');
  assert.deepEqual([sep.units, sep.cost, sep.realized_day, sep.tax_day], [7000, 71000, 3400, 600]);
});

/* ─── Parity with the engines, every day ─── */
test('the fast builder equals the full engines on every day (funds and stocks)', () => {
  const from = '2026-06-25'; const to = '2026-10-05';
  const { days } = buildSnapshots({ mf: nbp, psx: { trades: ffcTrades, history: ffcCloses }, from, to, today: T });
  for (const d of daysBetween(from, to)) {
    const day = days.find((x) => x.snap_date === d);
    const a = analyzeFunds({ entries: nbp.entries, components: nbp.components, prices: nbp.prices, funds: nbp.funds, start: d, end: d, today: T });
    assert.deepEqual([day.funds_value, day.funds_cost, day.funds_unrealized, day.funds_realized_day],
      [a.totals.value, a.totals.invested, a.totals.unrealized.gross, a.totals.realized.net], `funds on ${d}`);
    const s = analyzeStocks(ffcTrades, { live: {}, history: ffcCloses, start: d, end: d, today: T });
    assert.deepEqual([day.stocks_value, day.stocks_cost, day.stocks_unrealized, day.stocks_realized_day],
      [s.totals.value, s.totals.invested, s.totals.unrealized, s.totals.realized], `stocks on ${d}`);
  }
});

test('Home: cumulative dividends from the range start to each close', () => {
  const pts = [{ month: '2026-07', date: '2026-07-31' }, { month: '2026-08', date: '2026-08-31' }, { month: '2026-09', date: '2026-09-30' }];
  const divs = [{ payment_date: '2026-06-20', net_amount: '999' }, { payment_date: '2026-07-10', net_amount: '850.50' }, { payment_date: '2026-09-02', net_amount: '425' }];
  assert.deepEqual(withCumulativeDividends(pts, divs, '2026-07-01').map((p) => p.dividends), [850.5, 850.5, 1275.5]);
});

test('Analytics grouping: a fund held in two accounts counts once per day; a filter picks only its rows', async () => {
  const { sumByDate } = await import('../../src/lib/snapshots/series.js');
  const rows = [
    { snap_date: '2026-11-01', asset_key: 'a1|nbp|', value: 100, cost: 90, realized_day: 0 },
    { snap_date: '2026-11-01', asset_key: 'a2|nbp|', value: 50.1, cost: 45, realized_day: 2.2 },
    { snap_date: '2026-11-01', asset_key: 'a1|ubl|', value: 999, cost: 999, realized_day: 0 },
  ];
  assert.deepEqual(sumByDate(rows, (r) => r.asset_key.split('|')[1] === 'nbp'), [{ snap_date: '2026-11-01', value: 150.1, cost: 135, realized_day: 2.2 }]);
});

test('Home: funds + stocks at each close; dividends cumulative in the range, per fiscal year when yearly; engine months fill before snapshots', async () => {
  const { holdingsSeries } = await import('../../src/lib/snapshots/series.js');
  const early = [{ month: '2026-06', date: '2026-06-30', funds: 1000, stocks: 500 }];
  const snaps = [
    { snap_date: '2026-07-31', funds_value: 1100, stocks_value: 520 },
    { snap_date: '2026-08-31', funds_value: 1200, stocks_value: 510 },
  ];
  const dividends = [{ payment_date: '2026-06-15', net_amount: '40' }, { payment_date: '2026-07-10', net_amount: '60' }, { payment_date: '2026-08-05', net_amount: '25.5' }];
  const m = holdingsSeries({ snaps, early, dividends, period: 'month', start: '2026-07-01', today: T });
  assert.deepEqual(m.map((p) => [p.month, p.funds, p.stocks, p.value, p.dividends]), [['2026-07', 1100, 520, 1620, 60], ['2026-08', 1200, 510, 1710, 85.5]]);
  const y = holdingsSeries({ snaps, early, dividends, period: 'year', start: '2026-07-01', today: T });
  assert.deepEqual(y.map((p) => [p.label, p.value, p.dividends]), [['FY 25-26', 1500, 40], ['FY 26-27', 1710, 85.5]]);
});
