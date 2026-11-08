/**
 * Broker trade confirmations (src/lib/psx/confirmations.js). Fixtures are
 * made-up documents in each broker's real layout, as rebuilt lines of
 * positioned cells (what pdfRows.buildPageLines produces).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfirmation, detectBroker, parseDate, toTradeRows, duplicateStatus, ConfirmationError } from '../../src/lib/psx/confirmations.js';

const L = (...cells) => ({ cells: cells.map(([text, x]) => ({ text, x0: x, x1: x + text.length * 5 })) });
const HEAD_AKD = L(['Scrip', 4], ['Market', 52], ['House A/c.', 85], ['Quantity', 130], ['Rate', 197], ['Comm. Amount', 222], ['CVT / WHT', 296], ['Secp Laga', 357], ['PSX Laga', 418], ['Sales Tax', 475], ['NCCPL', 538], ['Advance Tax', 570], ['CDC Charges', 626], ['Amount', 725]);
const akdRow = (sym, ...n) => L([sym, 2], ['Ready', 59], ...n.map((v, i) => [v, 150 + i * 55]));

const AKD = [
  L(['AKD SECURITIES LIMITED', 312]),
  L(['Date', 9], ['March', 48], ['02, 2026', 80], ['TRADE CONFIRMATION', 327]),
  L(['To', 9], ['TEST INVESTOR - COZZ12345', 48]),
  L(['Memo #', 9]),
  L(['260302/COZZ12345', 9]),
  HEAD_AKD,
  L(['P U R C H A S E', 13]),
  akdRow('OGDC', '10', '200.0000', '3.00', '0.00', '0.00', '0.00', '0.45', '0.00', '0.00', '0.06', '2,003.51'),
  akdRow('OGDC', '5', '201.0000', '1.51', '0.00', '0.00', '0.00', '0.23', '0.00', '0.00', '0.03', '1,006.77'),
  L(['Total :', 27], ['15', 155], ['3,010.28', 735]),
  L(['S A L E', 13]),
  akdRow('PPL', '20', '150.5000', '4.52', '0.00', '0.00', '0.00', '0.68', '0.00', '0.00', '0.10', '3,004.70'),
  L(['Total :', 27], ['20', 155], ['3,004.70', 735]),
  L(['Client Total :', 5], ['5.58', 735]),
  L(['Buy Amount :', 157], ['3,010.28', 251], ['Sell Amount :', 316], ['3,004.70', 397], ['Net Amount :', 482], ['5.58', 576]),
  L(['Settlement Date :', 3], ['T+1 : 03 Mar 2026 , ODL : 03 Mar 2026', 74]),
];

const KTRADE = [
  L(['KTRADE SECURITIES LIMITED', 174]),
  L(['PURCHASE CONFIRMATION', 137], ['10000001', 347]),
  L(['Attention Of:', 9], ['Trade Date:', 431], ['05/01/2026', 477]),
  L(['Client Name:', 9], ['TEST INVESTOR', 90], ['Settlement Date:', 413], ['06/01/2026', 477]),
  L(['Client Code:', 9], ['P99999', 90]),
  L(['Security Name', 5], ['Quantity', 145], ['Market', 205], ['Gross Amount', 245], ['(+)', 342], ['Net Rate', 374], ['Brk Amount', 416], ['Amount', 512]),
  L(['Rate', 213], ['Comm.', 325], ['Payable', 512]),
  L(['MCB - MCB BANK LIMITED', 5], ['10', 170], ['300.0000', 199], ['3,000.00', 274], ['0.4500', 328], ['300.4500', 374], ['4.50', 444], ['3,004.50', 517]),
  L(['UBL - UNITED BANK LIMITED', 5], ['20', 170], ['150.0000', 199], ['3,000.00', 274], ['0.2250', 328], ['150.2250', 374], ['4.50', 444], ['3,004.50', 517]),
  L(['TOTAL', 50], ['30', 174], ['6,000.00', 274], ['9.00', 444], ['6,009.00', 517]),
  L(['SST', 431], ['1.35', 525]),
  L(['CVT', 428], ['0.01', 525]),
  L(['G R A N D', 369], ['T O T A L', 412], ['6,010.36', 517]),
];

test('dates in every format the brokers print', () => {
  assert.equal(parseDate('September 07, 2026'), '2026-09-07');
  assert.equal(parseDate('June 09, 2026'), '2026-06-09');
  assert.equal(parseDate('08 Sep 2026'), '2026-09-08');
  assert.equal(parseDate('13/10/2026'), '2026-10-13');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('soon'), null);
});

test('broker detection: AKD by name or COxx account, KTrade by name or P-code', () => {
  assert.equal(detectBroker(AKD), 'akd');
  assert.equal(detectBroker([L(['To', 9], ['X - COAB1234', 48])]), 'akd');
  assert.equal(detectBroker(KTRADE), 'ktrade');
  assert.equal(detectBroker([L(['Client Code:', 9], ['P12345', 90])]), 'ktrade');
  assert.equal(detectBroker([L(['Some other broker', 9])]), null);
});

test('AKD: both sections, account, memo, dates, fee from the net amount, totals reconciled', () => {
  const { broker, confirmations: [c] } = parseConfirmation(AKD);
  assert.equal(broker, 'akd');
  assert.deepEqual([c.account_ref, c.confirmation_no, c.trade_date, c.settlement_date], ['COZZ12345', '260302/COZZ12345', '2026-03-02', '2026-03-03']);
  assert.equal(c.trades.length, 3);
  const [b1, b2, s] = c.trades;
  // buy: 10 × 200 = 2,000; net 2,003.51 → fee 3.51 (= 3.00 + 0.45 + 0.06)
  assert.deepEqual([b1.type, b1.symbol, b1.quantity, b1.price, b1.gross, b1.fee, b1.net], ['buy', 'OGDC', '10', '200', '2000.00', '3.51', '2003.51']);
  // same symbol twice in one confirmation keeps two keys
  assert.deepEqual([b1.source_ref, b2.source_ref], ['260302/COZZ12345|buy|OGDC|1', '260302/COZZ12345|buy|OGDC|2']);
  // sell: 20 × 150.5 = 3,010; net 3,004.70 → fee 5.30
  assert.deepEqual([s.type, s.symbol, s.fee, s.net], ['sell', 'PPL', '5.30', '3004.70']);
  assert.deepEqual(s.charges, { commission: 4.52, cvt_wht: 0, secp_levy: 0, psx_levy: 0, sales_tax: 0.68, nccpl: 0, advance_tax: 0, cdc: 0.1 });
  assert.deepEqual(c.checks.map((x) => [x.label, x.parsed, x.printed, x.ok]), [['Purchases', '3010.28', '3010.28', true], ['Sales', '3004.70', '3004.70', true]]);
});

test('AKD: a row that does not add up to the printed total is caught', () => {
  const broken = AKD.map((l) => (l.cells[0].text === 'PPL' ? akdRow('PPL', '20', '150.5000', '4.52', '0.00', '0.00', '0.00', '0.68', '0.00', '0.00', '0.10', '3,104.70') : l));
  const { confirmations: [c] } = parseConfirmation(broken);
  assert.equal(c.checks.find((x) => x.label === 'Sales').ok, false);
});

test('KTrade: block charges shared by brokerage, last row takes the remainder, grand total reconciled', () => {
  const { broker, confirmations: [c] } = parseConfirmation(KTRADE);
  assert.equal(broker, 'ktrade');
  assert.deepEqual([c.account_ref, c.confirmation_no, c.trade_date, c.settlement_date], ['P99999', '10000001', '2026-01-05', '2026-01-06']);
  const [mcb, ubl] = c.trades;
  // SST 1.35 + CVT 0.01 = 1.36 split by equal brokerage: 0.68 / 0.68
  assert.deepEqual([mcb.symbol, mcb.company_name, mcb.fee, mcb.net], ['MCB', 'MCB BANK LIMITED', '5.18', '3005.18']);
  assert.deepEqual([ubl.symbol, ubl.fee, ubl.net], ['UBL', '5.18', '3005.18']);
  assert.deepEqual(c.checks[0], { label: 'Purchases', parsed: '6010.36', printed: '6010.36', ok: true });
});

test('KTrade: a sale confirmation and a purchase in one file become two confirmations', () => {
  // Sale: amount = gross − brokerage = 3,000 − 4.50 = 2,995.50; grand total = 2,995.50 − 1.36 = 2,994.14.
  const sale = KTRADE.map((l) => (l.cells[0].text === 'PURCHASE CONFIRMATION' ? L(['SALE CONFIRMATION', 137], ['10000002', 347]) : l))
    .filter((l) => !/^UBL/.test(l.cells[0].text))
    .map((l) => (/^MCB/.test(l.cells[0].text) ? L(['MCB - MCB BANK LIMITED', 5], ['10', 170], ['300.0000', 199], ['3,000.00', 274], ['0.4500', 328], ['299.5500', 374], ['4.50', 444], ['2,995.50', 517]) : l))
    .map((l) => (l.cells[0].text === 'G R A N D' ? L(['G R A N D', 369], ['T O T A L', 412], ['2,994.14', 517]) : l));
  const { confirmations } = parseConfirmation([...KTRADE, ...sale.slice(1)]);
  assert.deepEqual(confirmations.map((c) => [c.confirmation_no, c.trades.map((t) => `${t.type} ${t.symbol}`).join(',')]), [['10000001', 'buy MCB,buy UBL'], ['10000002', 'sell MCB']]);
  const s = confirmations[1].trades[0];
  assert.deepEqual([s.fee, s.net, s.warnings.length, confirmations[1].checks[0].ok], ['5.86', '2994.14', 0, true]);
});

test('unreadable or foreign documents fail with a message for the user', () => {
  assert.throws(() => parseConfirmation([]), (e) => e instanceof ConfirmationError && e.code === 'no_text');
  assert.throws(() => parseConfirmation([L(['Bank statement', 9])]), (e) => e.code === 'unknown_broker');
  assert.throws(() => parseConfirmation([L(['AKD SECURITIES LIMITED', 312]), L(['Date', 9], ['March 02, 2026', 48]), L(['To', 9], ['X - COZZ12345', 48])]), (e) => e.code === 'empty');
});

test('rows to insert carry broker, account, confirmation and a per-trade key', () => {
  const { confirmations: [c] } = parseConfirmation(KTRADE);
  const [row] = toTradeRows(c, c.trades);
  assert.deepEqual(
    [row.symbol, row.type, row.price, row.quantity, row.fee, row.date, row.broker, row.account_ref, row.source, row.confirmation_no, row.source_ref, row.settlement_date],
    ['MCB', 'buy', '300', '10', '5.18', '2026-01-05', 'ktrade', 'P99999', 'confirmation', '10000001', '10000001|buy|MCB|1', '2026-01-06'],
  );
});

test('duplicates: an imported trade already on file, or a matching manual entry', () => {
  const { confirmations } = parseConfirmation(KTRADE);
  const existing = [
    { broker: 'ktrade', source_ref: '10000001|buy|MCB|1' },
    { source_ref: null, date: '2026-01-05', type: 'buy', symbol: 'ubl ', quantity: '20', price: '150' },
  ];
  assert.deepEqual(duplicateStatus(confirmations, existing), { '10000001|buy|MCB|1': 'recorded', '10000001|buy|UBL|1': 'similar' });
  assert.deepEqual(duplicateStatus(confirmations, []), {});
});

test('oversold: a sale larger than recorded holdings on that date is flagged', async () => {
  const { oversoldRefs } = await import('../../src/lib/psx/confirmations.js');
  const { confirmations } = parseConfirmation(AKD); // buys 15 OGDC, sells 20 PPL on 2026-03-02
  const all = () => true;
  assert.deepEqual([...oversoldRefs(confirmations, all, [])], ['260302/COZZ12345|sell|PPL|1']);
  const held = [{ date: '2026-02-01', symbol: 'ppl', type: 'buy', quantity: '20' }];
  assert.deepEqual([...oversoldRefs(confirmations, all, held)], []);
  const later = [{ date: '2026-03-05', symbol: 'PPL', type: 'buy', quantity: '20' }];
  assert.deepEqual([...oversoldRefs(confirmations, all, later)], ['260302/COZZ12345|sell|PPL|1'], 'a buy after the sale does not cover it');
});
