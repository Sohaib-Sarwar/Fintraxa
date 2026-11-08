/** Spending insights (src/lib/finance/spending.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSpending } from '../../src/lib/finance/spending.js';

const tx = (date, type, amount, name, kind) => ({ id: `${date}-${name}-${amount}`, date, type, amount, categories: { name, kind, icon: null } });
const rows = [
  tx('2026-05-10', 'debit', '1000', 'Food', 'spend'),           // previous period
  tx('2026-06-05', 'debit', '3000', 'Rent', 'spend'),           // previous period
  tx('2026-07-01', 'credit', '100000', 'Salary', 'active'),
  tx('2026-07-05', 'debit', '30000', 'Rent', 'spend'),
  tx('2026-07-09', 'debit', '1500.10', 'Food', 'spend'),
  tx('2026-07-20', 'debit', '20000', 'Investment - Stocks', 'transfer'), // not spending
  tx('2026-07-31', 'credit', '800', 'Savings profit', 'passive'),       // not active income
  tx('2026-08-01', 'credit', '100000', 'Salary', 'active'),
  tx('2026-08-04', 'debit', '30000', 'Rent', 'spend'),
  tx('2026-08-07', 'debit', '2499.90', 'Food', 'spend'),
  tx('2026-09-02', 'debit', '500', 'Food', 'spend'),
];

test('totals, share of income and categories leave out transfers and passive income', () => {
  const s = analyzeSpending(rows, { start: '2026-07-01', end: '2026-08-31' }, '2026-09-10');
  assert.equal(s.total, 64000);              // 30000 + 1500.10 + 30000 + 2499.90, exact
  assert.equal(s.active, 200000);
  assert.equal(s.shareOfIncome, 32);
  assert.equal(s.count, 4);
  assert.deepEqual(s.categories.map((c) => [c.name, c.amount, c.share, c.count]), [['Rent', 60000, 93.8, 2], ['Food', 4000, 6.3, 2]]);
});

test('previous period is the same number of days just before; changes are per category', () => {
  const s = analyzeSpending(rows, { start: '2026-07-01', end: '2026-08-31' }, '2026-09-10');
  assert.equal(s.days, 62);
  assert.deepEqual([s.previous.start, s.previous.end, s.previous.total], ['2026-04-30', '2026-06-30', 4000]);
  assert.equal(s.previous.change, 1500);
  assert.deepEqual(s.categories.map((c) => [c.name, c.prev, c.change]), [['Rent', 3000, 1900], ['Food', 1000, 300]]);
});

test('average a month counts complete months only; this month is compared with the same days last month', () => {
  const s = analyzeSpending(rows, { start: '2026-07-01', end: '2026-09-30' }, '2026-09-10');
  assert.equal(s.completeMonths, 2);         // July and August; September is still open
  assert.equal(s.avgMonthly, 32000);
  assert.deepEqual([s.mtd.spent, s.mtd.before, s.mtd.change], [500, 32499.9, -98.5]); // 1-10 Sep vs 1-10 Aug
  assert.deepEqual(s.months.map((m) => [m.month, m.spent, m.income, m.live]), [
    ['2026-07', 31500.1, 100000, false], ['2026-08', 32499.9, 100000, false], ['2026-09', 500, 0, true],
  ]);
});

test('largest expenses, biggest first; an empty range has no average or change', () => {
  const s = analyzeSpending(rows, { start: '2026-07-01', end: '2026-08-31' }, '2026-09-10', { largest: 2 });
  assert.deepEqual(s.largest.map((t) => [t.date, t.amount]), [['2026-08-04', '30000'], ['2026-07-05', '30000']]);
  const none = analyzeSpending(rows, { start: '2026-10-01', end: '2026-10-31' }, '2026-10-15');
  assert.equal(none.total, 0);
  assert.equal(none.avgMonthly, null);
  assert.equal(none.shareOfIncome, null);
});

test('one category: every figure is that category, with its share of all spending', () => {
  const s = analyzeSpending(rows, { start: '2026-07-01', end: '2026-08-31' }, '2026-09-10', { category: 'Food' });
  assert.deepEqual([s.total, s.allTotal, s.shareOfSpending, s.count], [4000, 64000, 6.3, 2]);
  assert.deepEqual([s.previous.total, s.previous.change], [1000, 300]);
  assert.deepEqual(s.months.map((m) => [m.month, m.spent]), [['2026-07', 1500.1], ['2026-08', 2499.9]]);
  assert.equal(s.shareOfIncome, 2);
});
