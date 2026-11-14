/**
 * doc-intake Edge Function (supabase/functions/doc-intake/handler.js): document recognition and the request
 * flow, with made-up documents in each source's real layout (same fixture style as confirmations.test.mjs and
 * dividends.test.mjs). Also checks the function's vendor copies of the parsers have not drifted.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { classify, handle, HttpError } from '../../supabase/functions/doc-intake/handler.js';

const L = (...cells) => {
  const c = cells.map(([text, x]) => ({ text, x0: x, x1: x + text.length * 5 }));
  return { cells: c, text: c.map((x) => x.text).join(' ') };
};
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

const DIVIDEND_TEXT = `Payment
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
No. of Securities Gross Dividend Tax JH's Tax Zakat Net Dividend
05/08/2026 01/08/2026 ABCD - ALPHA BETA
CHEMICALS
LIMITED
11111-222222 7001 NONFILER 20 40.00 12.00 0.00 0.00 28.00

Total 40.00 12.00 0.00 0.00 28.00
`;

test('a broker trade confirmation is recognised with its broker and trades', () => {
  const r = classify({ pages: [AKD], text: '' });
  assert.equal(r.kind, 'trades');
  assert.deepEqual(r.source, { code: 'akd', name: r.source.name });
  assert.match(r.source.name, /AKD/);
  assert.equal(r.trades, 3);
  assert.equal(r.confirmations[0].settlement_date, '2026-03-03');
});

test('a CDC dividend report is recognised from its text', () => {
  const r = classify({ pages: [[L(['Dividend report', 10])]], text: DIVIDEND_TEXT });
  assert.equal(r.kind, 'dividends');
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0].symbol, r.rows[0].net_amount], ['ABCD', '28.00']);
});

test('a fund manager document is recognised by its AMC even when no transaction table is found', () => {
  const r = classify({ pages: [[L(['Al Meezan Investment Management Limited', 10]), L(['Account statement', 10])]], text: '' });
  assert.equal(r.source?.code, 'meezan');
  assert.ok(['fund', 'unknown'].includes(r.kind));
  if (r.kind === 'unknown') assert.equal(r.reason, 'fund_layout');
});

test('anything else is unknown, with a helpful message; an empty PDF says so', () => {
  const r = classify({ pages: [[L(['Electricity bill', 10]), L(['Units consumed 120', 10])]], text: 'Electricity bill' });
  assert.equal(r.kind, 'unknown');
  assert.match(r.message, /AKD and KTrade/);
  assert.equal(classify({ pages: [[]], text: '' }).reason, 'no_text');
});

// ── request flow ──
const UID = '11111111-2222-3333-4444-555555555555';
const PATH = `${UID}/${'a'.repeat(64)}.pdf`;
const fakePdf = (lines) => ({
  numPages: 1,
  getPage: async () => ({
    getTextContent: async () => ({ items: lines.flatMap((l, i) => l.cells.map((c) => ({ str: c.text, transform: [1, 0, 0, 10, c.x0, 800 - i * 14], width: c.x1 - c.x0, height: 10 }))) }),
    cleanup: () => {},
  }),
  destroy: () => {},
});
function deps(over = {}) {
  const removed = [];
  return {
    removed,
    d: {
      body: { storage_path: PATH }, userId: UID,
      download: async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      remove: async (p) => { removed.push(p); },
      openPdf: async () => fakePdf(AKD),
      ...over,
    },
  };
}

test('another user’s file or a malformed path is refused before anything is read', async () => {
  await assert.rejects(handle(deps({ body: { storage_path: `99999999-2222-3333-4444-555555555555/${'a'.repeat(64)}.pdf` } }).d), (e) => e instanceof HttpError && e.status === 403);
  await assert.rejects(handle(deps({ body: { storage_path: '../etc/passwd' } }).d), (e) => e instanceof HttpError && e.status === 400);
});

test('a trade confirmation is read and then deleted from storage (nothing kept that is not imported)', async () => {
  const { d, removed } = deps();
  const r = await handle(d);
  assert.equal(r.kind, 'trades');
  assert.equal(r.storage_path, null);
  assert.deepEqual(removed, [PATH]);
});

test('password-protected PDFs ask for the password and keep the file for the retry', async () => {
  const locked = async () => { throw Object.assign(new Error('pw'), { name: 'PasswordException' }); };
  const first = deps({ openPdf: locked });
  assert.deepEqual([(await handle(first.d)).kind, first.removed.length], ['password', 0]);
  const wrong = deps({ openPdf: locked, body: { storage_path: PATH, password: 'x' } });
  const r = await handle(wrong.d);
  assert.equal(r.wrong, true);
});

test('a damaged PDF is removed and reported plainly', async () => {
  const { d, removed } = deps({ openPdf: async () => { throw new Error('bad xref'); } });
  await assert.rejects(handle(d), (e) => e instanceof HttpError && e.code === 'damaged');
  assert.deepEqual(removed, [PATH]);
});

test('the function’s vendor copies match the app’s parsers', () => {
  execFileSync(process.execPath, ['scripts/sync-doc-intake.mjs', '--check'], { stdio: 'pipe' });
});
