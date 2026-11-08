/** Personal finance summary (src/lib/finance/summary.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, byFiscalYear } from '../../src/lib/finance/summary.js';

const KIND = { Salary: 'active', Rent: 'spend', Food: 'spend' };
const T = (type, date, amount, name = 'Food') => ({ type, date, amount, categories: { name, icon: 'Restaurant', kind: KIND[name] } });

test('active income, expenses, saved and savings rate inside the range; months add up', () => {
  const txns = [
    T('credit', '2026-06-30', 999, 'Salary'),      // before the range
    T('credit', '2026-07-01', 100000.1, 'Salary'),
    T('debit', '2026-07-05', 20000.2, 'Rent'),
    T('debit', '2026-07-09', 1500, 'Food'),
    T('debit', '2026-08-02', 2500, 'Food'),
    T('credit', '2026-08-01', 100000, 'Salary'),
  ];
  const s = summarize(txns, { start: '2026-07-01', end: '2027-06-30' }, '2026-08-15');
  assert.deepEqual([s.count, s.active, s.expenses, s.saved], [5, 200000.1, 24000.2, 175999.9]);
  assert.equal(s.savingsRate, 88);
  assert.deepEqual(s.categories.expenses.map((c) => [c.name, c.amount, c.count]), [['Rent', 20000.2, 1], ['Food', 4000, 2]]);
  assert.deepEqual(s.categories.active.map((c) => [c.name, c.amount]), [['Salary', 200000.1]]);
  assert.deepEqual(s.months.map((m) => [m.month, m.active, m.expenses, m.saved]), [['2026-07', 100000.1, 21500.2, 78499.9], ['2026-08', 100000, 2500, 97500]]);
});

test('no active income: savings rate is unknown, not 0%', () => {
  const s = summarize([T('debit', '2026-07-05', 50)], { start: '2026-07-01', end: '2026-07-31' }, '2026-07-31');
  assert.equal(s.savingsRate, null);
  assert.equal(s.saved, -50);
});

test('fiscal-year totals: June closes the year; every column is summed', () => {
  const y = byFiscalYear([
    { month: '2026-06', active: 10, passive: 1, expenses: 4, saved: 6 },
    { month: '2026-07', active: 0.1, passive: 0, expenses: 0.2, saved: -0.1 },
    { month: '2026-08', active: 0.2, passive: 0.5, expenses: 0, saved: 0.2 },
  ]);
  assert.deepEqual(y.map((r) => [r.title, r.active, r.passive, r.expenses, r.saved]), [['FY 2025-26', 10, 1, 4, 6], ['FY 2026-27', 0.3, 0.5, 0.2, 0.1]]);
});
