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

/* ─── Net worth with savings ─── */
const tx = (date, type, amount, name, kind) => ({ date, type, amount, categories: { name, kind } });

test('savings: income + cash passive - spending - money moved into investments; own-account moves change nothing', async () => {
  const { cashFlows, savingsAt } = await import('../../src/lib/home/combine.js');
  const flows = cashFlows({
    transactions: [
      tx('2026-07-01', 'credit', '100000.10', 'Salary', 'active'),
      tx('2026-07-05', 'debit', '20000.05', 'Rent', 'spend'),
      tx('2026-07-10', 'debit', '30000', 'Investment - Mutual Funds', 'transfer'),  // now inside fund value
      tx('2026-07-11', 'debit', '5000', 'Savings', 'transfer'),                     // own accounts: no change
      tx('2026-07-31', 'credit', '800.20', 'Savings profit', 'passive'),           // bank profit, net
    ],
    dividends: [{ payment_date: '2026-07-20', net_amount: '1000.00' }],
  });
  assert.equal(savingsAt(flows, '2026-07-09'), 80000.05);
  assert.equal(savingsAt(flows, '2026-07-31'), 51800.25); // 100000.10 - 20000.05 - 30000 + 1000 + 800.20
  assert.equal(savingsAt(flows, '2026-06-30'), 0);
});

test('savings do not carry over: every month starts fresh', async () => {
  const { cashFlows, netWorthSeries } = await import('../../src/lib/home/combine.js');
  const flows = cashFlows({ transactions: [
    tx('2026-07-03', 'credit', 50000, 'Salary', 'active'), tx('2026-07-20', 'debit', 10000, 'Food', 'spend'),
    tx('2026-08-03', 'credit', 50000, 'Salary', 'active'), tx('2026-08-20', 'debit', 70000, 'Car', 'spend'),
    tx('2026-09-03', 'credit', 50000, 'Salary', 'active'),
  ] });
  const s = netWorthSeries({ flows, start: '2026-07-01', end: '2026-09-30', today: '2026-09-15' });
  assert.deepEqual(s.map((p) => [p.month, p.date, p.savings, p.live]), [
    ['2026-07', '2026-07-31', 40000, false],
    ['2026-08', '2026-08-31', -20000, false],  // July's 40,000 is not carried in: 50,000 - 70,000
    ['2026-09', '2026-09-15', 50000, true],    // the open month runs to today, from zero
  ]);
});

test('net worth series: funds + stocks + savings per month, with the opening balance first', async () => {
  const { cashFlows, netWorthSeries, netWorth } = await import('../../src/lib/home/combine.js');
  const flows = cashFlows({ transactions: [tx('2026-05-02', 'credit', '1000.10', 'Salary', 'active'), tx('2026-07-02', 'credit', '0.20', 'Salary', 'active')] });
  const funds = [
    { month: '2026-06', date: '2026-06-30', value: 500, opening: true, title: 'Opening balance, 30 Jun 2026' },
    { month: '2026-07', date: '2026-07-31', value: 550 },
  ];
  const stocks = [{ month: '2026-07', date: '2026-07-31', value: 200.1 }];
  const s = netWorthSeries({ funds, stocks, flows, start: '2026-07-01', end: '2026-07-31', today: '2026-08-10' });
  assert.deepEqual(s.map((p) => [p.label, p.funds, p.stocks, p.savings, p.value]), [
    ['Open', 500, 0, 0, 500],                // June kept nothing; May's 1000.10 is not carried
    ['Jul', 550, 200.1, 0.2, 750.3],         // July alone
  ]);
  assert.equal(netWorth({ funds: 550, stocks: 200.1, savings: 1000.3 }).value, 1750.4);
  assert.equal(netWorth({ funds: 100, stocks: 0, savings: -50 }).share.savings, 0); // a shortfall has no share
});

test('net worth series: savings before the range add no opening point, and a new month starts at zero', async () => {
  const { cashFlows, netWorthSeries, savingsAt } = await import('../../src/lib/home/combine.js');
  const flows = cashFlows({ transactions: [tx('2026-06-15', 'credit', 900, 'Salary', 'active'), tx('2026-07-10', 'debit', 100, 'Food', 'spend')] });
  const s = netWorthSeries({ flows, start: '2026-07-01', end: '2026-07-31', today: '2026-08-01' });
  assert.deepEqual(s.map((p) => [p.label, p.date, p.savings]), [['Jul', '2026-07-31', -100]]);
  assert.equal(savingsAt(flows, '2026-06-30'), 900);
  assert.equal(savingsAt(flows, '2026-07-01'), 0);
});
