/**
 * PSX dividends (src/lib/psx/dividends.js): statement parsing, filer status,
 * range summaries and manual-entry validation. The statement below is made up
 * but keeps the real CDC layout: wrapped company names, free-text filer status,
 * a net rounded to whole rupees, two statements pasted one after the other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDividendStatement, summarizeDividends, normFiler, validateDividend, dividendKey } from '../../src/lib/psx/dividends.js';

const HEADER = `Payment
Date
Dividend
Issue
Date
Sec. Symbol -
Sec. Name
Part. ID - A/c # /
Folio #
Warrant # Filer
Status*
No. of Securities Gross Dividend Tax JH's Tax Zakat Net Dividend`;

const A = `${HEADER}
05/08/2026 01/08/2026 ABCD - ALPHA BETA
CHEMICALS
LIMITED
11111-222222 7001 NONFILER 20 40.00 12.00 0.00 0.00 28.00
14/08/2026 14/08/2026 XYZ - THE XYZ
BANK LIMITED
11111-222222 88 Non Filler 3 7.50 2.25 0.00 0.00 5.00
02/09/2026 30/08/2026 PQ.R - PQR
POWER
COMPANY
LIMITED
33333-444444 9001234 15% 1,200 1,800.00 270.00 0.00 0.00 1,530.00

Total 1,847.50 284.25 0.00 0.00 1,563.00
 `;

const B = `${HEADER}
10/03/2026 10/03/2026 ABCD - ALPHA BETA
CHEMICALS
LIMITED
11111-222222 6001 30% 20 60.00 18.00 0.00 0.00 42.00

Total 60.00 18.00 0.00 0.00 42.0
`;

test('statement: every row read, wrapped names joined, dates to ISO, amounts exact, totals reconciled', () => {
  const { rows, statements, warnings } = parseDividendStatement(A);
  assert.equal(rows.length, 3);
  const [a, x, p] = rows;
  assert.deepEqual(
    [a.payment_date, a.issue_date, a.symbol, a.company_name, a.account_ref, a.warrant_no, a.filer_status, a.shares, a.gross_amount, a.tax_amount, a.net_amount, a.source],
    ['2026-08-05', '2026-08-01', 'ABCD', 'ALPHA BETA CHEMICALS LIMITED', '11111-222222', '7001', 'non_filer', '20', '40.00', '12.00', '28.00', 'statement'],
  );
  assert.deepEqual([x.symbol, x.company_name, x.filer_status_raw, x.filer_status], ['XYZ', 'THE XYZ BANK LIMITED', 'Non Filler', 'non_filer']);
  assert.deepEqual([p.symbol, p.company_name, p.shares, p.gross_amount, p.net_amount, p.filer_status], ['PQ.R', 'PQR POWER COMPANY LIMITED', '1200', '1800.00', '1530.00', 'filer']);
  assert.equal(x.netGap, -0.25, '7.50 − 2.25 = 5.25, statement paid 5.00');
  assert.equal(statements[0].matches, true);
  assert.deepEqual(warnings, [], 'a gap within one rupee is statement rounding, not a warning');
});

test('two statements pasted together: both read, each against its own totals', () => {
  const { rows, statements } = parseDividendStatement(`${A}\n${B}`);
  assert.equal(rows.length, 4);
  assert.deepEqual(statements.map((s) => [s.rows, s.matches]), [[3, true], [1, true]]);
  assert.equal(rows[3].payment_date, '2026-03-10');
});

test('the same statement pasted twice keeps each warrant once', () => {
  const { rows, warnings } = parseDividendStatement(`${B}\n${B}`);
  assert.equal(rows.length, 1);
  assert.match(warnings.join(' '), /1 repeated row ignored/);
});

test('a missing row shows up as a totals mismatch; a big net gap is flagged', () => {
  const dropped = A.replace(/14\/08\/2026 14\/08\/2026 XYZ[\s\S]*?5\.00\n/, '');
  const r = parseDividendStatement(dropped);
  assert.equal(r.rows.length, 2);
  assert.equal(r.statements[0].matches, false);
  assert.match(r.warnings[0], /do not match/);
  const odd = parseDividendStatement(B.replace('0.00 42.00', '0.00 50.00').replace('42.0\n', '50.0\n'));
  assert.match(odd.warnings.join(' '), /differs from gross − deductions by 8/);
});

test('nothing recognisable → no rows, no crash', () => {
  assert.deepEqual(parseDividendStatement('hello').rows, []);
  assert.deepEqual(parseDividendStatement('').rows, []);
  assert.deepEqual(parseDividendStatement(null).rows, []);
});

test('filer status: every spelling seen on statements', () => {
  const cases = { Filer: 'filer', FILER: 'filer', NONFILER: 'non_filer', 'Non Filer': 'non_filer', 'Non Filler': 'non_filer', NonFiler: 'non_filer', '15%': 'filer', '30%': 'non_filer', '': 'unknown', 'N/A': 'unknown' };
  for (const [raw, want] of Object.entries(cases)) assert.equal(normFiler(raw), want, raw);
});

test('summary: by payment date inside the range, exact sums, per stock, month by month', () => {
  const rows = [...parseDividendStatement(A).rows, ...parseDividendStatement(B).rows];
  const fy = summarizeDividends(rows, { start: '2026-07-01', end: '2027-06-30', today: '2026-11-08' });
  assert.deepEqual([fy.count, fy.gross, fy.tax, fy.net], [3, 1847.5, 284.25, 1563]);
  assert.deepEqual(fy.bySymbol.get('ABCD'), { symbol: 'ABCD', companyName: 'ALPHA BETA CHEMICALS LIMITED', gross: 40, deductions: 12, net: 28, count: 1, last: '2026-08-05' });
  assert.deepEqual(fy.months.map((m) => [m.month, m.net]), [['2026-07', 0], ['2026-08', 33], ['2026-09', 1530], ['2026-10', 0], ['2026-11', 0]]);
  assert.equal(fy.months[1].cgt, 14.25, 'deductions in August: 12 + 2.25');
  const all = summarizeDividends(rows, { today: '2026-11-08' });
  assert.deepEqual([all.count, all.net, all.bySymbol.get('ABCD').net, all.bySymbol.get('ABCD').count], [4, 1605, 70, 2]);
});

test('manual entry validation', () => {
  const ok = { symbol: 'ffc', payment_date: '2026-10-01', shares: '10', gross_amount: '100', tax_amount: '15', zakat_amount: '', net_amount: '85' };
  assert.equal(validateDividend(ok, '2026-11-08'), null);
  assert.match(validateDividend({ ...ok, symbol: '' }, '2026-11-08'), /symbol/);
  assert.match(validateDividend({ ...ok, payment_date: '2026-12-01' }, '2026-11-08'), /future/);
  assert.match(validateDividend({ ...ok, shares: '0' }, '2026-11-08'), /Shares/);
  assert.match(validateDividend({ ...ok, tax_amount: '150' }, '2026-11-08'), /more than the gross/);
  assert.match(validateDividend({ ...ok, issue_date: '2026-10-05' }, '2026-11-08'), /issue date/);
});

test('key matches the table unique constraint', () => {
  assert.equal(dividendKey({ symbol: 'FFC', payment_date: '2026-01-01', warrant_no: '12' }), 'FFC|2026-01-01|12');
  assert.equal(dividendKey({ symbol: 'FFC', payment_date: '2026-01-01', warrant_no: null }), 'FFC|2026-01-01|');
});
