/** The Funds / Stocks hold card runs the web's own series code (src/lib/snapshots/series.js) — same numbers as the web. */
import { assetRows, valueSeries } from '../engines';

const snap = (snap_date: string, v: number, c: number, rz: number) => ({
  snap_date, funds_value: v, funds_cost: c, funds_realized_day: rz, stocks_value: 0, stocks_cost: 0, stocks_realized_day: 0,
});

test('month closes: value / invested / unrealized at the last day, realized summed in the month, gaps filled', () => {
  const rows = assetRows([snap('2026-08-10', 90, 80, 5), snap('2026-08-31', 100, 85, 2.5), snap('2026-10-31', 120, 100, 1)], 'funds', {});
  const pts = valueSeries(rows, { period: 'month', start: '2026-07-01', end: '2027-06-30', today: '2026-11-14', fillGaps: true });
  expect(pts.map((p) => [p.month, p.value, p.invested, p.unrealized, p.realized])).toEqual([
    ['2026-08', 100, 85, 15, 7.5],
    ['2026-09', 0, 0, 0, 0],
    ['2026-10', 120, 100, 20, 1],
  ]);
});
