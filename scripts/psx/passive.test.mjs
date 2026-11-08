/** Passive income (src/lib/finance/passive.js) and personal finance kinds (summary.js). Figures made up, worked by hand. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savingsTax, passiveSource, passiveEvents, analyzePassive, passiveByFiscalYear, mfPostingRows } from '../../src/lib/finance/passive.js';
import { summarize, kindOf } from '../../src/lib/finance/summary.js';

const SAV = { name: 'Savings profit', kind: 'passive', default_tax_rate: 0.2, icon: 'Savings' };
const SALARY = { name: 'Salary', kind: 'active', icon: 'Work' };
const FOOD = { name: 'Food', kind: 'spend', icon: 'Restaurant' };
const INVEST = { name: 'Investment - Stocks', kind: 'transfer', icon: 'ShowChart' };
let n = 0;
const tx = (type, date, amount, categories, extra = {}) => ({ id: `t${++n}`, type, date, amount: String(amount), categories, ...extra });
const div = (symbol, date, gross, tax, net) => ({ id: `d${++n}`, symbol, payment_date: date, gross_amount: String(gross), tax_amount: String(tax), jh_tax_amount: '0', zakat_amount: '0', net_amount: String(net) });

test('savings profit: 20% (or 40% non-filer) withheld, rounded to the paisa; gross = tax + net always', () => {
  assert.deepEqual(savingsTax(266.99), { gross: '266.99', tax: '53.40', net: '213.59', rate: 0.2 });
  assert.deepEqual(savingsTax(73.11), { gross: '73.11', tax: '14.62', net: '58.49', rate: 0.2 });
  assert.deepEqual(savingsTax(380.01, 0.4), { gross: '380.01', tax: '152.00', net: '228.01', rate: 0.4 });
  assert.deepEqual(savingsTax('21.77', 0.4), { gross: '21.77', tax: '8.71', net: '13.06', rate: 0.4 });
  assert.equal(savingsTax(0), null);
  assert.equal(savingsTax('abc'), null);
});

test('which categories are passive, and their source', () => {
  assert.equal(passiveSource(SAV), 'savings');
  assert.equal(passiveSource({ kind: 'passive', default_tax_rate: null }), 'other');
  assert.equal(passiveSource(SALARY), null);
  assert.equal(passiveSource(undefined), null);
});

const TODAY = '2026-11-08';
const EVENTS = () => passiveEvents({
  mfMonths: [
    { month: '2026-07', gross: 1000, cgt: 150, net: 850 },
    { month: '2026-08', gross: 0, cgt: 0, net: 0 },        // nothing realized: no event
    { month: '2026-09', gross: -200, cgt: -50, net: -150 }, // a loss with a CGT refund
    { month: '2026-11', gross: 300, cgt: 45, net: 255 },    // open month: counts so far, on today
  ],
  dividends: [div('ABC', '2026-08-21', 18, 5, 13), div('XYZ', '2026-10-10', 100, 15, 85)],
  transactions: [
    tx('credit', '2026-10-01', '213.59', SAV, { gross_amount: '266.99', tax_amount: '53.40' }),
    tx('credit', '2026-10-01', '90000', SALARY),
    tx('debit', '2026-10-02', '500', FOOD),
    tx('credit', '2026-12-01', '10', SAV), // future: excluded
  ],
  today: TODAY,
});

test('events: funds posted on the month end (open month on today), dividends by payment date, savings by entry', () => {
  const e = EVENTS();
  assert.deepEqual(e.map((x) => [x.date, x.source, x.title, x.net.toString(), x.posted]), [
    ['2026-07-31', 'mutual_funds', 'Mutual funds', '850', true],
    ['2026-08-21', 'dividends', 'ABC', '13', true],
    ['2026-09-30', 'mutual_funds', 'Mutual funds', '-150', true],
    ['2026-10-01', 'savings', 'Savings profit', '213.59', true],
    ['2026-10-10', 'dividends', 'XYZ', '85', true],
    ['2026-11-08', 'mutual_funds', 'Mutual funds', '255', false],
  ]);
  assert.equal(e.find((x) => x.source === 'savings').tax.toString(), '53.4');
});

test('analysis: totals by source, elapsed-month average, MoM, 3-month run rate, effective tax, rates', () => {
  const a = analyzePassive(EVENTS(), { start: '2026-07-01', end: '2027-06-30', today: TODAY });
  // net: 850 + 13 − 150 + 213.59 + 85 + 255 = 1,266.59 over Jul–Nov (5 elapsed months)
  assert.deepEqual(a.totals, { gross: 1484.99, tax: 218.4, net: 1266.59, count: 6 });
  assert.deepEqual(a.bySource.mutual_funds, { gross: 1100, tax: 145, net: 955, count: 3 });
  assert.deepEqual(a.bySource.savings, { gross: 266.99, tax: 53.4, net: 213.59, count: 1 });
  assert.equal(a.elapsedMonths, 5);
  assert.equal(a.avgPerMonth, 253.32);
  assert.deepEqual(a.months.map((m) => [m.month, m.net, m.dividends]), [['2026-07', 850, 0], ['2026-08', 13, 13], ['2026-09', -150, 0], ['2026-10', 298.59, 85], ['2026-11', 255, 0]]);
  // last complete month = Oct (298.59) vs Sep (−150): change measured against |−150|
  assert.deepEqual(a.mom, { month: '2026-10', net: 298.59, previous: -150, changePct: 299.1 });
  assert.deepEqual(a.runRate3, { months: 3, perMonth: 53.86 });
  // tax 218.40 on positive gross 1,684.99 (the −200 loss is not taxable income)
  assert.equal(a.effectiveTaxRate, 13);
  assert.equal(a.perNight, Number(((1266.59 / 5) / (30.4375 * 86400) * 8 * 3600).toFixed(2)));
});

test('fiscal years sum every source; postings cover closed months only', () => {
  const a = analyzePassive(EVENTS(), { start: '2000-01-01', end: TODAY, today: TODAY });
  const y = passiveByFiscalYear(a.months);
  assert.deepEqual(y.map((r) => [r.title, r.net, r.mutual_funds, r.dividends, r.savings]), [['FY 2026-27', 1266.59, 955, 98, 213.59]]);
  const rows = mfPostingRows([{ month: '2026-07', gross: 1000, cgt: 150, net: 840 }, { month: '2026-08', gross: 0, cgt: 0, net: 0 }, { month: '2026-11', gross: 1, cgt: 0, net: 1 }], TODAY);
  assert.deepEqual(rows, [{ period: '2026-07-01', gross: 1000, tax: 150, charges: 10, net: 840, sales: 0 }]);
});

test('personal finance: saved = active − expenses; transfers are not expenses; passive reported apart', () => {
  const txns = [
    tx('credit', '2026-10-01', '90000', SALARY),
    tx('credit', '2026-10-01', '213.59', SAV, { gross_amount: '266.99', tax_amount: '53.40' }),
    tx('debit', '2026-10-02', '20000', FOOD),
    tx('debit', '2026-10-03', '30000', INVEST),
  ];
  const passive = analyzePassive(EVENTS(), { start: '2026-10-01', end: '2026-10-31', today: TODAY });
  const s = summarize(txns, { start: '2026-10-01', end: '2026-10-31' }, TODAY, { passive });
  assert.deepEqual([s.active, s.expenses, s.transfers, s.saved, s.passive, s.savingsRate], [90000, 20000, 30000, 70000, 298.59, 77.8]);
  assert.deepEqual(s.months.map((m) => [m.month, m.active, m.passive, m.expenses]), [['2026-10', 90000, 298.59, 20000]]);
  assert.deepEqual(s.categories.passive.map((c) => [c.name, c.amount]), [['Dividends', 85], ['Savings profit', 213.59]]);
  assert.deepEqual(s.categories.expenses.map((c) => c.name), ['Food']);
});

test('kind falls back by name for categories read before kinds existed', () => {
  assert.equal(kindOf({ type: 'debit', categories: { name: 'Investment - Mutual Funds' } }), 'transfer');
  assert.equal(kindOf({ type: 'debit', categories: { name: 'Savings' } }), 'transfer');
  assert.equal(kindOf({ type: 'debit', categories: { name: 'Rent' } }), 'spend');
  assert.equal(kindOf({ type: 'credit', categories: { name: 'Salary' } }), 'active');
});
