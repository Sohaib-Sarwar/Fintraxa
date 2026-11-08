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

test('merged series keeps the opening balance first, labelled, and yearly ignores it', async () => {
  const { mergeSeries } = await import('../../src/lib/home/combine.js');
  const { fiscalYearEnds } = await import('../../src/lib/psx/portfolio.js');
  const funds = [
    { month: '2026-06', date: '2026-06-30', invested: 1000, value: 1100, opening: true, title: 'Opening balance, 30 Jun 2026' },
    { month: '2026-07', date: '2026-07-31', invested: 1000, value: 1150, priced: 'close' },
  ];
  const stocks = [
    { month: '2026-06', date: '2026-06-30', invested: 500, value: 450, opening: true, title: 'Opening balance, 30 Jun 2026' },
    { month: '2026-07', date: '2026-07-31', invested: 500, value: 470, priced: 'trade' },
  ];
  const m = mergeSeries(funds, stocks);
  assert.deepEqual(m.map((x) => [x.month, x.invested, x.value, x.label, !!x.opening]), [['2026-06', 1500, 1550, 'Open', true], ['2026-07', 1500, 1620, 'Jul', false]]);
  assert.equal(m[0].title, 'Opening balance, 30 Jun 2026');
  assert.equal(m[1].priced, 'mixed');
  const y = fiscalYearEnds(m);
  assert.deepEqual(y.map((x) => [x.title, x.value]), [['FY 2026-27', 1620]], 'FY 2026-27 closes on its last month-end, not the opening');
});
