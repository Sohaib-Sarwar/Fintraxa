// Portfolio vs KSE-100: daily time-weighted return and the cumulative series. Fake data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshots, dayReturn } from '../../src/lib/snapshots/build.js';
import { benchmarkSeries } from '../../src/lib/snapshots/series.js';

test('dayReturn: buys and sales are not profit; dividends are', () => {
  // First buy: 10 shares at 100 (cash in 1000), close 110 → +10%.
  assert.equal(dayReturn({ value: 1100, prevValue: 0, flow: 1000 }), 0.1);
  // Price unchanged, half sold (proceeds 550 out) → 0%.
  assert.equal(dayReturn({ value: 550, prevValue: 1100, flow: -550 }), 0);
  // A 55 dividend on a 550 holding, price flat → +10%.
  assert.equal(dayReturn({ value: 550, prevValue: 550, dividend: 55 }), 0.1);
  // Nothing held and nothing bought: no return to report.
  assert.equal(dayReturn({ value: 0, prevValue: 0 }), null);
});

const trade = (date, type, quantity, price, fee = 0) => ({ symbol: 'FFC', date, type, quantity, price, fee, created_at: `${date}T10:00:00Z` });
const closes = (pairs) => pairs.map(([date, close]) => ({ date, close }));

test('buildSnapshots: daily returns from closes, a buy, a sale and a dividend; a mid-range run matches a full one', () => {
  const psx = {
    trades: [trade('2026-03-02', 'buy', 10, 100), trade('2026-03-04', 'buy', 10, 120), trade('2026-03-06', 'sell', 5, 132)],
    history: { FFC: closes([['2026-03-02', 110], ['2026-03-03', 121], ['2026-03-04', 120], ['2026-03-05', 132], ['2026-03-06', 132]]) },
  };
  const finance = { transactions: [], dividends: [{ payment_date: '2026-03-06', net_amount: '66.00' }] };
  const full = buildSnapshots({ psx, finance, from: '2026-03-02', to: '2026-03-06', today: '2026-03-06' }).days;
  const by = Object.fromEntries(full.map((d) => [d.snap_date, d]));
  assert.equal(by['2026-03-02'].stocks_flow_day, 1000);
  assert.equal(by['2026-03-02'].stocks_return_day, 0.1);           // 1100 vs 1000 paid
  assert.equal(by['2026-03-03'].stocks_return_day, 0.1);           // 110 → 121
  // 4 Mar: bought 10 more at 120 (1200 in); 20 × 120 = 2400 vs 1210 + 1200 → −0.4149%
  assert.equal(by['2026-03-04'].stocks_return_day, Math.round(((2400 - 1210 - 1200) / (1210 + 1200)) * 1e8) / 1e8);
  assert.equal(by['2026-03-05'].stocks_return_day, 0.1);           // 120 → 132
  // 6 Mar: sold 5 at 132 (660 out), price flat, 66 dividend → 66 / 2640 = +2.5%
  assert.equal(by['2026-03-06'].stocks_flow_day, -660);
  assert.equal(by['2026-03-06'].stocks_dividend_day, 66);
  assert.equal(by['2026-03-06'].stocks_return_day, 0.025);
  // A run that starts on 5 Mar still knows 4 Mar's close.
  const part = buildSnapshots({ psx, finance, from: '2026-03-05', to: '2026-03-06', today: '2026-03-06' });
  assert.deepEqual(part.days.map((d) => d.stocks_return_day), [0.1, 0.025]);
  assert.ok(part.holdings.every((h) => h.snap_date >= '2026-03-05'), 'the extra day before the range is not stored');
});

test('benchmarkSeries: compounds daily returns and measures the index from the last close before 1 January', () => {
  const rows = [
    { snap_date: '2026-01-02', stocks_return_day: null },
    { snap_date: '2026-01-05', stocks_return_day: 0.1 },
    { snap_date: '2026-01-06', stocks_return_day: 0.1 },
    { snap_date: '2026-02-02', stocks_return_day: -0.5 },
  ];
  const index = [
    { price_date: '2025-12-31', close: '100000' },
    { price_date: '2026-01-06', close: '105000' },
    { price_date: '2026-02-02', close: '99000' },
  ];
  const pts = benchmarkSeries(rows, index, { period: 'month', start: '2026-01-01', today: '2026-02-10' });
  assert.deepEqual(pts.map((p) => [p.month, p.portfolio, p.index, p.gap]), [
    ['2026-01', 21, 5, 16],          // 1.1 × 1.1 − 1 = 21% vs 105000 / 100000 − 1
    ['2026-02', -39.5, -1, -38.5],   // 1.21 × 0.5 − 1
  ]);
  const daily = benchmarkSeries(rows, index, { period: 'day', start: '2026-01-01', today: '2026-02-10' });
  assert.equal(daily[0].portfolio, null, 'nothing held yet');
  assert.equal(daily[0].index, 0, 'the index starts at 0% from its last close before 1 January');
});

test('sameWindowIndex: a portfolio that starts in March is compared with the index from March', async () => {
  const { sameWindowIndex } = await import('../../src/lib/snapshots/series.js');
  const rows = [{ snap_date: '2026-03-03', stocks_return_day: 0.01 }, { snap_date: '2026-03-04', stocks_return_day: 0 }];
  const index = [{ price_date: '2025-12-31', close: 100 }, { price_date: '2026-03-02', close: 80 }, { price_date: '2026-03-04', close: 84 }];
  assert.deepEqual(sameWindowIndex(rows, index, { start: '2026-01-01', today: '2026-03-04' }), { since: '2026-03-03', index: 5 });
  assert.equal(sameWindowIndex([{ snap_date: '2026-01-01', stocks_return_day: 0 }], index, { start: '2026-01-01', today: '2026-03-04' }), null);
});

test('benchmarkSeries follows the chosen range: index from the close before its start, nothing after its end', () => {
  const rows = [{ snap_date: '2026-06-30', stocks_return_day: 0.5 }, { snap_date: '2026-07-01', stocks_return_day: 0.1 }, { snap_date: '2026-08-03', stocks_return_day: 0.1 }];
  const index = [{ price_date: '2026-06-30', close: 200 }, { price_date: '2026-07-01', close: 210 }, { price_date: '2026-08-03', close: 220 }];
  const pts = benchmarkSeries(rows, index, { period: 'month', start: '2026-07-01', end: '2026-07-31', today: '2026-11-08' });
  // FY 2026-27 to 31 Jul: June's +50% is outside; the index is measured from the 30 Jun close.
  assert.deepEqual(pts.map((p) => [p.month, p.portfolio, p.index]), [['2026-07', 10, 5]]);
});
