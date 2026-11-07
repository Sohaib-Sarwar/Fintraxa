/** Personal finance summary (src/lib/finance/summary.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../../src/lib/finance/summary.js';

const T = (type, date, amount, name = 'Food') => ({ type, date, amount, categories: { name, icon: 'Restaurant' } });

test('income, expense, net and savings rate inside the range; months add up', () => {
  const txns = [
    T('credit', '2026-06-30', 999, 'Salary'),      // before the range
    T('credit', '2026-07-01', 100000.1, 'Salary'),
    T('debit', '2026-07-05', 20000.2, 'Rent'),
    T('debit', '2026-07-09', 1500, 'Food'),
    T('debit', '2026-08-02', 2500, 'Food'),
    T('credit', '2026-08-01', 100000, 'Salary'),
  ];
  const s = summarize(txns, { start: '2026-07-01', end: '2027-06-30' }, '2026-08-15');
  assert.deepEqual([s.count, s.income, s.expense, s.net], [5, 200000.1, 24000.2, 175999.9]);
  assert.equal(s.savingsRate, 88);
  assert.deepEqual(s.categories.map((c) => [c.name, c.amount, c.count]), [['Rent', 20000.2, 1], ['Food', 4000, 2]]);
  assert.deepEqual(s.months.map((m) => [m.month, m.income, m.expense]), [['2026-07', 100000.1, 21500.2], ['2026-08', 100000, 2500]]);
});

test('no income: savings rate is unknown, not 0%', () => {
  const s = summarize([T('debit', '2026-07-05', 50)], { start: '2026-07-01', end: '2026-07-31' }, '2026-07-31');
  assert.equal(s.savingsRate, null);
  assert.equal(s.net, -50);
});

test('fiscal-year totals: June closes the year', async () => {
  const { byFiscalYear } = await import('../../src/lib/finance/summary.js');
  const y = byFiscalYear([{ month: '2026-06', income: 10, expense: 4 }, { month: '2026-07', income: 0.1, expense: 0.2 }, { month: '2026-08', income: 0.2, expense: 0 }]);
  assert.deepEqual(y.map((r) => [r.title, r.income, r.expense, r.net]), [['FY 2025-26', 10, 4, 6], ['FY 2026-27', 0.3, 0.2, 0.1]]);
});
