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

// ── Regressions from a real two-page CDC report ────────────────────────────
const PAGE_HEADER = `Dividend / Zakat & Tax Deduction Summary Report
Date and Time Printed :   07/11/2026 11:18:11
Name :   TEST INVESTOR   Page :   2 of 2
Payment Date :   01/01/2026 To 07/11/2026
* As per Issuer Record
${HEADER}`;

test('a row followed by a page header is still its own row (not merged into the next one)', () => {
  const text = `${HEADER}
21/09/2026 18/09/2026 XYZ - THE XYZ
BANK LIMITED
11111-222222 41589 Filer 1 1.60 0.24 0.00 0.00 2.00
${PAGE_HEADER}
25/09/2026 25/09/2026 MNO - MNO ENERGIES
LIMITED
11111-222222 8751392 Filer 1 19.00 2.81 0.00 0.00 16.00
Total 20.60 3.05 0.00 0.00 18.00`;
  const { rows, statements, warnings } = parseDividendStatement(text);
  assert.deepEqual(rows.map((r) => [r.symbol, r.payment_date, r.warrant_no, r.gross_amount, r.net_amount]), [
    ['XYZ', '2026-09-21', '41589', '1.60', '2.00'],
    ['MNO', '2026-09-25', '8751392', '19.00', '16.00'],
  ]);
  assert.equal(rows[0].company_name, 'THE XYZ BANK LIMITED');
  assert.equal(statements[0].matches, true);
  assert.deepEqual(warnings, []);
});

test('text: a damaged row is reported and skipped, never glued to its neighbour', () => {
  const text = `${HEADER}
21/09/2026 18/09/2026 XYZ - THE XYZ BANK LIMITED 11111-222222 41589 Filer 1 1.60 0.24
25/09/2026 25/09/2026 MNO - MNO ENERGIES LIMITED 11111-222222 8751392 Filer 1 19.00 2.81 0.00 0.00 16.00
Total 19.00 2.81 0.00 0.00 16.00`;
  const { rows, warnings } = parseDividendStatement(text);
  assert.deepEqual(rows.map((r) => [r.symbol, r.warrant_no]), [['MNO', '8751392']]);
  assert.match(warnings.join(' '), /row paid 21\/09\/2026 could not be read/);
});

const C = (text, x) => ({ text, x0: x, x1: x + text.length * 4 });
const row = (page, pay, issue, symName, acct, warrant, filer, nums) => ({ page, cells: [C(pay, 24), C(issue, 59), C(symName, 97), C(acct, 174), C(warrant, 256), C(filer, 308), ...nums.map((n, i) => C(n, 396 + i * 60))] });
const frag = (page, text) => ({ page, cells: [C(text, 97)] });
const other = (page, text, x = 20) => ({ page, cells: [C(text, x)] });

test('PDF lines: each row by position, wrapped names below it, page breaks and footers ignored', async () => {
  const { parseDividendLines } = await import('../../src/lib/psx/dividends.js');
  const lines = [
    other(1, 'Dividend / Zakat & Tax Deduction Summary Report', 216),
    row(1, '25/03/2026', '25/03/2026', 'ABC - ALPHA', '11111-222222', '15554828', '30%', ['10', '85.00', '26.00', '0.00', '0.00', '59.00']),
    frag(1, 'FERTILIZER'), frag(1, 'COMPANY'), frag(1, 'LIMITED'),
    row(1, '21/09/2026', '18/09/2026', 'XYZ - THE XYZ', '11111-222222', '41589', 'Filer', ['1', '1.60', '0.24', '0.00', '0.00', '2.00']),
    frag(1, 'BANK LIMITED'),
    other(1, '* As per Issuer Record', 18),
    other(2, 'Dividend / Zakat & Tax Deduction Summary Report', 216),
    other(2, 'Page :'),
    row(2, '25/09/2026', '25/09/2026', 'MNO - MNO', '33333-444444', '8751392', 'Non Filler', ['1', '19.00', '2.81', '0.00', '0.00', '16.00']),
    frag(2, 'ENERGIES'), frag(2, 'LIMITED'),
    { page: 2, cells: [C('Total', 345), C('105.60', 449), C('29.05', 530), C('0.00', 610), C('0.00', 685), C('77.00', 747)] },
    other(2, 'Disclaimer'),
    other(2, 'By accessing the web portal of CDC relating to Centralized Cash Dividend Register'),
  ];
  const { rows, statements, warnings } = parseDividendLines(lines);
  assert.deepEqual(rows.map((r) => [r.symbol, r.company_name, r.account_ref, r.warrant_no, r.filer_status, r.net_amount]), [
    ['ABC', 'ALPHA FERTILIZER COMPANY LIMITED', '11111-222222', '15554828', 'non_filer', '59.00'],
    ['XYZ', 'THE XYZ BANK LIMITED', '11111-222222', '41589', 'filer', '2.00'],
    ['MNO', 'MNO ENERGIES LIMITED', '33333-444444', '8751392', 'non_filer', '16.00'],
  ]);
  assert.deepEqual([statements.length, statements[0].matches], [1, true]);
  assert.deepEqual(warnings, []);
});

test('PDF lines: a row with missing amounts is skipped with a reason; merged date cells are split', async () => {
  const { parseDividendLines } = await import('../../src/lib/psx/dividends.js');
  const merged = { page: 1, cells: [C('25/09/2026 25/09/2026', 24), C('MNO - MNO ENERGIES', 97), C('33333-444444', 174), C('8751392', 256), C('Filer', 308), ...['1', '19.00', '2.81', '0.00', '0.00', '16.00'].map((n, i) => C(n, 396 + i * 60))] };
  const broken = row(1, '21/09/2026', '18/09/2026', 'XYZ - THE XYZ', '11111-222222', '41589', 'Filer', ['1', '1.60']);
  const { rows, warnings } = parseDividendLines([broken, merged]);
  assert.deepEqual(rows.map((r) => r.symbol), ['MNO']);
  assert.match(warnings[0], /row paid 21\/09\/2026 could not be read \(amounts missing\)/);
});

test('report: the reading that reconciles with the printed totals is used', async () => {
  const { parseDividendReport } = await import('../../src/lib/psx/dividends.js');
  const lines = [row(1, '25/09/2026', '25/09/2026', 'MNO - MNO', '33333-444444', '8751392', 'Filer', ['1', '19.00', '2.81', '0.00', '0.00', '16.00']),
    { page: 1, cells: [C('Total', 345), C('19.00', 449), C('2.81', 530), C('0.00', 610), C('0.00', 685), C('16.00', 747)] }];
  const r = parseDividendReport({ text: 'garbage without rows', lines });
  assert.deepEqual([r.rows.length, r.statements[0].matches], [1, true]);
  const r2 = parseDividendReport({ text: B, lines: [] });
  assert.equal(r2.rows.length, 1, 'falls back to the text reading when lines give nothing');
});

test('duplicates: same warrant is saved; same stock, date and amount without that warrant is possible', async () => {
  const { dividendDuplicates } = await import('../../src/lib/psx/dividends.js');
  const rows = parseDividendStatement(A).rows; // ABCD 2026-08-05 w7001, XYZ 2026-08-14 w88, PQ.R 2026-09-02 w9001234
  const existing = [
    { symbol: 'ABCD', payment_date: '2026-08-05', warrant_no: '7001', gross_amount: '40.00', net_amount: '28.00' },
    { symbol: 'XYZ', payment_date: '2026-08-14', warrant_no: null, gross_amount: '7.50', net_amount: '5.25' },
    { symbol: 'PQ.R', payment_date: '2026-09-02', warrant_no: null, gross_amount: '1.00', net_amount: '1.00' },
  ];
  assert.deepEqual(dividendDuplicates(rows, existing), { 'ABCD|2026-08-05|7001': 'saved', 'XYZ|2026-08-14|88': 'possible' });
});
