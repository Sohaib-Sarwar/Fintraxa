/**
 * Parsing, redaction, normalisation and reconciliation on synthetic
 * statements in each AMC's real layout. Every edge case found in the real
 * statements has a fixture here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processStatement } from '../../supabase/functions/_shared/mf/pipeline.js';
import { parseFigure, parseDate } from '../../supabase/functions/_shared/mf/numbers.js';
import { redactStatement, scanForLeaks } from '../../supabase/functions/_shared/mf/redact.js';
import { buildPageLines } from '../../supabase/functions/_shared/mf/pdfRows.js';
import { matchMufapFund } from '../../supabase/functions/_shared/mf/fundMatch.js';
import { atlasStatement, mcbStatement, meezanStatement, nbpStatement, ublStatement } from './fixtures.mjs';

const pick = (e) => ({
  type: e.entry_type, date: e.trade_date, units: e.unit_delta, nav: e.nav, gross: e.gross_amount, net: e.net_amount,
  comps: e.components.map((c) => `${c.type}:${c.amount}`).join(','),
});

// ── numbers ──
test('figures parse exactly as printed, brackets/minus negative, dash = not reported, zero = zero', () => {
  assert.equal(parseFigure('(9,503.00)').value, '-9503.00');
  assert.equal(parseFigure('( 905.6945)').value, '-905.6945');
  assert.equal(parseFigure('-334.4915').value, '-334.4915');
  assert.equal(parseFigure('.0001').value, '0.0001');
  assert.equal(parseFigure('1,173.4196').value, '1173.4196');
  assert.equal(parseFigure('-').value, null);
  assert.equal(parseFigure('0.00').value, '0.00');
  assert.equal(parseFigure(''), null);
  assert.throws(() => parseFigure('12a'));
  assert.equal(parseFigure('1,000-').value, '-1000');
});

test('dates: every format the five AMCs print, day-first', () => {
  assert.equal(parseDate('08-Oct-2026'), '2026-10-08');
  assert.equal(parseDate('05-OCT-26'), '2026-10-05');
  assert.equal(parseDate('OCT-31-2026'), '2026-10-31');
  assert.equal(parseDate('27-02-2026'), '2026-02-27');
  assert.equal(parseDate('04/11/2026'), '2026-11-04');
  assert.equal(parseDate('January 01, 2026'), null === 1 ? null : parseDate('January 01, 2026'));
  assert.equal(parseDate('30 OCT 2026'), '2026-10-30');
  assert.equal(parseDate('31-02-2026'), null, 'impossible dates are rejected, not rolled over');
});

// ── row rebuilding ──
test('rows are rebuilt from coordinates even when the text stream is column-ordered', () => {
  // Stream order: all dates first, then all amounts (how NBP/MCB/UBL store text).
  const items = [
    { str: '05-OCT-26', x: 40, y: 700, w: 40, h: 8 }, { str: '26-OCT-26', x: 40, y: 680, w: 40, h: 8 },
    { str: '( 9,503.00)', x: 500, y: 700, w: 50, h: 8 }, { str: '( 517.97)', x: 505, y: 680, w: 45, h: 8 },
  ];
  const lines = buildPageLines(items, 1);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].cells.map((c) => c.text), ['05-OCT-26', '( 9,503.00)']);
  assert.deepEqual(lines[1].cells.map((c) => c.text), ['26-OCT-26', '( 517.97)']);
});

// ── per AMC ──
test('Atlas: "Online Sale" is a purchase; CGT column; dashes are not zeros', () => {
  const r = processStatement(atlasStatement());
  assert.equal(r.amcCode, 'atlas');
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-10-08', units: '40.0000', nav: '500.0000', gross: '20000.00', net: '20000.00', comps: '' },
    { type: 'redemption', date: '2026-10-20', units: '-20.0000', nav: '505.0000', gross: '10100.00', net: '10085.00', comps: 'cgt:15.00' },
  ]);
  assert.equal(r.reconciliation[0].status, 'exact');
  assert.equal(r.reconciliation[0].valuation.status, 'exact');
  assert.ok(r.events.every((e) => e.review_status === 'pending_review'));
});

test('NBP: multi-row events (load / tax-on-load / CGT / net) and explicit zero loads', () => {
  const r = processStatement(nbpStatement());
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-09-28', units: '1000.0000', nav: '10.0000', gross: '10000.00', net: '10000.00', comps: 'front_load:0.00,load_tax:0.00' },
    { type: 'redemption', date: '2026-10-05', units: '-600.0000', nav: '10.5000', gross: '6300.00', net: '6255.00', comps: 'cgt:45.00' },
  ]);
  assert.equal(r.events[1].price_date, '2026-10-04', 'price date kept separately from trade date');
  assert.equal(r.reconciliation[0].status, 'exact');
  assert.equal(r.amcReported.realized_gross, '300.00');
});

test('Meezan: hidden zeros, net-of-CGT outflows, same-day twins, CGT refund as units, refund of capital without NAV, transaction cost', () => {
  const r = processStatement(meezanStatement());
  const mcf = r.events.filter((e) => e.section_key.startsWith('meezan cash fund'));
  assert.deepEqual(mcf.map(pick), [
    { type: 'purchase', date: '2026-02-20', units: '100.0000', nav: '50.0000', gross: '5000', net: '5000', comps: '' },
    { type: 'purchase', date: '2026-02-20', units: '100.0000', nav: '50.0000', gross: '5000', net: '5000', comps: '' },
    { type: 'switch_out', date: '2026-02-26', units: '-49.0196', nav: '51.0000', gross: '2500', net: '2498', comps: 'cgt:2' },
    { type: 'switch_out', date: '2026-02-26', units: '-49.0000', nav: '51.0000', gross: '2499', net: '2498', comps: 'cgt:1' },
    { type: 'cgt_refund_reinvest', date: '2026-06-22', units: '0.0577', nav: '52.0000', gross: '3', net: '3', comps: 'cgt_refund:3' },
    { type: 'capital_refund_units', date: '2026-06-24', units: '0.0769', nav: null, gross: '4', net: '4', comps: '' },
  ]);
  const kmif = r.events.filter((e) => e.section_key.startsWith('kse meezan'));
  assert.deepEqual(kmif.map(pick), [
    { type: 'switch_in', date: '2026-02-26', units: '24.5300', nav: '100.0000', gross: '2498', net: '2453', comps: 'transaction_cost:45' },
  ]);
  assert.ok(r.reconciliation.every((x) => x.status === 'exact'));
  assert.equal(r.amcReported.funds.MCF.to_date_gain, '10');
  const nav0 = mcf[5].warnings.find((w) => w.code === 'NAV_NOT_REPORTED');
  assert.ok(nav0 && nav0.severity === 'info', 'a printed 0 NAV is stored as not reported');
});

test('MCB: CGT* row pairs with its redemption, net taken from it, reference survives a page break, "- .0001" is negative', () => {
  const r = processStatement(mcbStatement());
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-07-15', units: '100.0000', nav: '100.0000', gross: '10000', net: '10000', comps: '' },
    { type: 'redemption', date: '2026-07-27', units: '-50.0000', nav: '101.0000', gross: '5050', net: '5042', comps: 'cgt:8' },
    { type: 'redemption', date: '2026-08-05', units: '-50.0001', nav: '102.0000', gross: '5100.01', net: '5090.01', comps: 'cgt:10' },
    { type: 'purchase', date: '2026-08-06', units: '10.0000', nav: '102.0000', gross: '1020', net: '1020', comps: '' },
  ]);
  assert.equal(r.events[1].external_ref, '148033');
  assert.equal(r.events[2].running_balance_units, '-0.0001');
  assert.ok(r.reconciliation.every((x) => x.status === 'exact'), JSON.stringify(r.reconciliation));
  assert.ok(r.events.every((e) => e.review_status === 'pending_review'));
});

test('UBL: date line above rows, two rows on one date, explicit CGT 0, wrapped "(CGT-Refund)", date carried across a page', () => {
  const r = processStatement(ublStatement());
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-02-24', units: '10.00', nav: '100.0000', gross: '1000', net: '1000', comps: '' },
    { type: 'switch_out', date: '2026-02-27', units: '-5.00', nav: '100.0000', gross: '500', net: '500', comps: 'cgt:0' },
    { type: 'purchase', date: '2026-02-27', units: '20.00', nav: '100.0000', gross: '2000', net: '2000', comps: '' },
    { type: 'redemption', date: '2026-04-14', units: '-15.00', nav: '102.0000', gross: '1530', net: '1527', comps: 'cgt:3' },
    { type: 'cgt_refund_reinvest', date: '2026-07-03', units: '0.45', nav: '101.0000', gross: '45', net: '45', comps: 'cgt_refund:45' },
  ]);
  assert.equal(r.events[4].price_date, '2026-06-22', 'refund priced at the June NAV, dated in July');
  assert.equal(r.reconciliation[0].status, 'exact');
});

test('a missing row is caught by the running balance, not silently absorbed', () => {
  const pages = ublStatement();
  pages[0] = pages[0].filter((l) => !l.cells.some((c) => c.text === 'Additional Purchase'));
  const r = processStatement(pages);
  assert.equal(r.reconciliation[0].status, 'material');
  assert.ok(r.events.some((e) => e.warnings.some((w) => w.code === 'RUNNING_BALANCE_BREAK')));
  assert.ok(r.events.some((e) => e.review_status === 'requires_attention'));
});

test('unsupported formats fail clearly', () => {
  assert.throws(() => processStatement([[{ id: 'p1-l1', page: 1, n: 1, text: 'Some Bank Statement', cells: [{ text: 'Some Bank Statement', x0: 0, x1: 90 }] }]]),
    /not supported yet/);
});

// ── redaction ──
test('redaction removes names, account numbers, IBANs, phones, e-mails; keeps figures, dates, fund names and short refs', () => {
  for (const make of [atlasStatement, nbpStatement, meezanStatement, mcbStatement, ublStatement]) {
    const pages = make();
    const r = redactStatement(pages);
    const out = r.lines.map((l) => l.text).join('\n');
    for (const secret of ['TESTA', 'INVESTOROVA', 'Testa', 'Investorova', '99887', '123456', '424242', '777001',
      '800000000000000001', 'PK00', '0300', 'EXAMPLE.COM', '12345678', '00999999', 'SAMPLE TOWN']) {
      assert.ok(!out.includes(secret), `${make.name}: "${secret}" leaked`);
    }
    assert.ok(r.accountRef, `${make.name}: account reference harvested for matching`);
  }
  const mcb = redactStatement(mcbStatement()).lines.map((l) => l.text).join('\n');
  assert.ok(mcb.includes('148033'), 'transaction reference preserved');
  assert.ok(mcb.includes('5,050') && mcb.includes('MCB CASH MANAGEMENT OPTIMIZER'));
});

test('the leak scanner flags identifiers that slipped through', () => {
  const hits = scanForLeaks([{ id: 'x', text: 'paid to PK36SCBL0000001123456702 call 0321-7654321' }]);
  assert.deepEqual([...new Set(hits.map((h) => h.kind))].sort(), ['IBAN', 'ID', 'PHONE'].filter((k) => hits.some((h) => h.kind === k)).sort());
  assert.ok(hits.length >= 2);
});

// ── fund mapping ──
test('fund names map to MUFAP within the same AMC only', () => {
  const feed = [
    { fund_name: 'Al-Ameen Islamic Cash Fund', amc: 'UBL Fund Managers Limited', slug: 'al-ameen-islamic-cash-fund' },
    { fund_name: 'Meezan Cash Fund', amc: 'Al Meezan Investment Management Limited', slug: 'meezan-cash-fund' },
    { fund_name: 'Alhamra Cash Management Optimizer', amc: 'MCB Investment Management Limited', slug: 'alhamra-cash-management-optimizer' },
  ];
  assert.equal(matchMufapFund('AL-AMEEN ISLAMIC CASH FUND', 'ubl', feed)?.slug, 'al-ameen-islamic-cash-fund');
  assert.equal(matchMufapFund('MEEZAN CASH FUND', 'meezan', feed)?.slug, 'meezan-cash-fund');
  assert.equal(matchMufapFund('MEEZAN CASH FUND', 'ubl', feed), null, 'never crosses AMCs');
  assert.equal(matchMufapFund('Something Else Fund', 'mcb', feed), null);
});

// ── layouts beyond each AMC's main statement ──
import { ublPortalStatement, unknownLayoutMeezan } from './fixtures.mjs';

test('UBL portal/mobile "Transaction Statement" layout: rows read, not "no transactions"', () => {
  const r = processStatement(ublPortalStatement());
  assert.equal(r.amcCode, 'ubl');
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-02-12', units: '23.26', nav: '107.5000', gross: '2500', net: '2500', comps: 'cgt:0,front_load:0,charge:0' },
    { type: 'redemption', date: '2026-03-10', units: '-10.00', nav: '108.8000', gross: '1088', net: '1086', comps: 'cgt:2,back_load:0,charge:0' },
  ]);
  assert.equal(r.events[0].price_date, '2026-02-11', 'applicable NAV date kept separately');
  assert.deepEqual([r.statement.periodFrom, r.statement.periodTo], ['2026-02-12', '2026-03-31']);
  assert.ok(r.events.every((e) => e.review_status === 'pending_review'), 'clean rows are auto-approvable');
  assert.ok(r.reconciliation.every((x) => x.status !== 'material'));
  assert.ok(!r.lines.some((l) => /TESTA|00999999/.test(l.text)), 'still redacted');
});

test('an unknown layout of a known AMC falls back to the general reader, CGT sub-row attached', () => {
  const r = processStatement(unknownLayoutMeezan());
  assert.equal(r.amcCode, 'meezan');
  assert.deepEqual(r.events.map(pick), [
    { type: 'purchase', date: '2026-01-05', units: '100.0000', nav: '150.0000', gross: '15000', net: '15000', comps: '' },
    { type: 'redemption', date: '2026-03-20', units: '-40.0000', nav: '160.0000', gross: '6400', net: '6370', comps: 'cgt:30' },
  ]);
  assert.ok(r.reconciliation.every((x) => x.status !== 'material'));
});

test('a known AMC document with no transaction table explains itself', () => {
  const pages = [[{ id: 'p1-l1', page: 1, n: 1, text: 'UBL Fund Managers fund manager report', cells: [{ text: 'UBL Fund Managers fund manager report', x0: 0, x1: 200 }] }]];
  assert.throws(() => processStatement(pages), /no transaction table was found/);
});
