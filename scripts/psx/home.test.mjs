/** Home combination (src/lib/home/combine.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeries, combineTotals } from '../../src/lib/home/combine.js';

test('month-end series merge: months only one side covers count the other as nothing held; sums are exact', () => {
  const funds = [{ month: '2026-07', invested: 1000.1, value: 1050.2, priced: 'close' }, { month: '2026-08', invested: 1000.1, value: 1060.2, priced: 'close' }];
  const stocks = [{ month: '2026-08', invested: 500.2, value: 520.1, priced: 'close' }, { month: '2026-09', invested: 500.2, value: 530, live: true, priced: 'live' }];
  const m = mergeSeries(funds, stocks);
  assert.deepEqual(m.map((x) => [x.month, x.invested, x.value, x.priced]), [
    ['2026-07', 1000.1, 1050.2, 'close'],
    ['2026-08', 1500.3, 1580.3, 'close'],   // 0.1 + 0.2 stays exact
    ['2026-09', 500.2, 530, 'live'],
  ]);
});

test('totals add both sides; split shares follow value', () => {
  const t = combineTotals(
    { value: 300, invested: 250, held: 2, realized: { net: 40 }, unrealized: { net: 42.5, gross: 50 } },
    { value: 100, invested: 120, held: 3, realized: -5, unrealizedNet: -20, unrealized: -20 },
  );
  assert.deepEqual([t.value, t.invested, t.unrealizedNet, t.unrealizedGross, t.realized, t.held], [400, 370, 22.5, 30, 35, 5]);
  assert.deepEqual([t.split.funds.share, t.split.stocks.share], [0.75, 0.25]);
});
