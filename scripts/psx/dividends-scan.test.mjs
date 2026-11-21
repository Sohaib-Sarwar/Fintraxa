// Upcoming dividends scan: PSX page parsing, the AI letter checks and the scan flow (supabase/functions/dividends-scan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bookClosure, cashEntries, dmy, monDate, normName, parseAnnouncements, parseCompanyPage, toSyncRows } from '../../supabase/functions/dividends-scan/parse.js';
import { acceptLetter, LETTER_TITLE, NOT_A_DECLARATION } from '../../supabase/functions/dividends-scan/letterReader.js';
import { scan } from '../../supabase/functions/dividends-scan/handler.js';

const FA = readFileSync(new URL('./fixtures/psx_financial_announcements.html', import.meta.url), 'utf8');
const BAFL = readFileSync(new URL('./fixtures/psx_company_BAFL.html', import.meta.url), 'utf8');
const BOARD = [
  { symbol: 'FFC', name: 'Fauji Fertilizer Company Limited' }, { symbol: 'OGDC', name: 'Oil & Gas Development Company Limited' },
  { symbol: 'MEBL', name: 'Meezan Bank Limited' }, { symbol: 'BAFL', name: 'Bank Alfalah Limited' },
  { symbol: 'BAHL', name: 'Bank AL Habib Limited' }, { symbol: 'MARI', name: 'Mari Energies Limited' },
];

test('dates and book closure: PSX formats, impossible dates rejected', () => {
  assert.equal(monDate('Nov 06, 2026'), '2026-11-06');
  assert.equal(dmy('09/11/2026'), '2026-11-09');
  assert.equal(dmy('0/09//2026'), null);
  assert.equal(dmy('31/02/2026'), null);
  assert.deepEqual(bookClosure('09/11/2026 - 11/11/2026'), { from: '2026-11-09', to: '2026-11-11' });
  assert.deepEqual(bookClosure('11/11/2026'), { from: '2026-11-11', to: '2026-11-11' });
  assert.equal(bookClosure('13/10/2026 - 13/10/2026 - 20/10/2026 - 20/10/2026'), null);
  assert.equal(bookClosure('-'), null);
  assert.equal(bookClosure('11/11/2026 - 09/11/2026'), null);
});

test('dividend cell: %, Rs, interim number, final, bonus ignored, no % sign', () => {
  assert.deepEqual(cashEntries('185%(iii) (D)'), [{ percent: 185, rs: null, type: 'interim', interim_no: 3 }]);
  assert.deepEqual(cashEntries('60% (F) (D)'), [{ percent: 60, rs: null, type: 'final', interim_no: null }]);
  assert.deepEqual(cashEntries('Rs. 8.25 (D)'), [{ percent: null, rs: 8.25, type: 'interim', interim_no: null }]);
  assert.deepEqual(cashEntries('80(ii) (D)'), [{ percent: 80, rs: null, type: 'interim', interim_no: 2 }]);
  assert.deepEqual(cashEntries('50% (B) - 30%(i) (D)'), [{ percent: 30, rs: null, type: 'interim', interim_no: 1 }]);
  assert.deepEqual(cashEntries('129.111% (F) (D)'), [{ percent: 129.111, rs: null, type: 'final', interim_no: null }]);
  assert.deepEqual(cashEntries('25% (B)'), []);
  assert.deepEqual(cashEntries('-'), []);
});

test('announcements table (real PSX copy): only cash dividends, dated by their header', () => {
  const rows = parseAnnouncements(FA);
  assert.ok(rows.length >= 8);
  const ffc = rows.find((r) => r.company === 'Fauji Fertilizer Company Limited' && r.bc?.from === '2026-11-09');
  assert.equal(ffc.announced_on, '2026-10-28');
  assert.equal(ffc.cell, '185%(iii) (D)');
  assert.ok(rows.every((r) => /\(D\)/.test(r.cell)));
});

test('company page: face value, announcements with document ids', () => {
  const p = parseCompanyPage(BAFL);
  assert.equal(p.faceValue, 5);
  assert.ok(p.announcements.length >= 4);
  assert.ok(p.announcements.every((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.date) && /^\d+$/.test(a.doc)));
});

test('to sync rows: held stocks only, Rs per share from face value (BAFL Rs 5), last 60 days, no duplicates', () => {
  const rows = parseAnnouncements(FA);
  const faceValues = new Map([['FFC', 10], ['OGDC', 10], ['MEBL', 10], ['BAFL', 5]]);
  const { rows: out, missingFace } = toSyncRows(rows, { symbols: ['FFC', 'OGDC', 'MEBL', 'BAFL', 'BAHL'], board: BOARD, faceValues, today: '2026-11-22' });
  const by = (s, bc) => out.find((r) => r.symbol === s && r.book_closure_from === bc);
  assert.equal(by('FFC', '2026-11-09').dps, 18.5);
  assert.equal(by('FFC', '2026-11-09').interim_no, 3);
  assert.equal(by('OGDC', '2026-11-11').dps, 5);
  assert.equal(by('BAFL', '2026-11-06').dps, 1.5);   // 30% of Rs 5, not of Rs 10
  assert.equal(by('MEBL', '2026-11-04').dps, 8);
  assert.ok(!out.some((r) => r.symbol === 'MARI'));    // not held
  assert.ok(out.every((r) => r.book_closure_from >= '2026-09-23'));
  assert.equal(new Set(out.map((r) => `${r.symbol}|${r.book_closure_from}|${r.dps}`)).size, out.length);
  assert.deepEqual(missingFace, ['BAHL']);             // a % with no face value is skipped, never guessed as Rs 10
  assert.equal(normName('Oil & Gas Development Company Limited'), normName('Oil and Gas Development Co. Ltd'));
});

test('AI letter: both reads must agree, Rs and % must match the face value, dates in range', () => {
  const read = { page_read: true, cash_dividend: true, rs_per_share: 18.5, percent: 185, type: 'interim', interim_no: 3, book_closure_from: '2026-11-09', book_closure_to: '2026-11-11', agm_date: null };
  const ctx = { symbol: 'FFC', company: 'Fauji Fertilizer', faceValue: 10, today: '2026-11-01', doc: '287242' };
  const ok = acceptLetter(read, { ...read }, ctx);
  assert.equal(ok.dps, 18.5);
  assert.equal(ok.source, 'psx_letter_ai');
  assert.equal(ok.source_url, 'https://dps.psx.com.pk/download/document/287242.pdf');
  assert.equal(acceptLetter(read, { ...read, rs_per_share: 1.85 }, ctx), null);              // disagreement
  assert.equal(acceptLetter(read, { ...read, book_closure_from: '2026-11-10' }, ctx), null);
  assert.equal(acceptLetter({ ...read, rs_per_share: 1.85 }, { ...read, rs_per_share: 1.85 }, ctx), null); // % × FV ≠ Rs
  assert.equal(acceptLetter({ ...read, book_closure_from: '2027-06-01' }, { ...read, book_closure_from: '2027-06-01' }, ctx), null);
  assert.deepEqual(acceptLetter({ page_read: true, cash_dividend: false }, { page_read: true, cash_dividend: false }, ctx), { none: true });
  assert.equal(acceptLetter({ page_read: false }, read, ctx), null);
  // % only: Rs from the face value
  const pct = { ...read, rs_per_share: null };
  assert.equal(acceptLetter(pct, { ...pct }, { ...ctx, faceValue: 5 }).dps, 9.25);
  assert.equal(acceptLetter(pct, { ...pct }, { ...ctx, faceValue: null }), null);
  assert.ok(LETTER_TITLE.test('Financial Results for the Quarter Ended 30 Sep 2026'));
  assert.ok(NOT_A_DECLARATION.test('Transmission of Quarterly Report for the Period Ended 30 Sep 2026'));
});

/** A stand-in for the service-role client: records RPC calls. */
function fakeAdmin({ symbols, unread = [] }) {
  const calls = [];
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'dividend_scan_symbols') return { data: symbols, error: null };
      if (name === 'dividends_upcoming_sync') return { data: { announcements: args.p_rows.length, pending: 1, matched: 0, removed: 0, reset: 0 }, error: null };
      if (name === 'dividend_docs_unread') return { data: args.p_docs.filter((d) => unread.includes(d)), error: null };
      return { data: null, error: null };
    },
    from: () => ({ select: () => ({ in: () => ({ not: async () => ({ data: [], error: null }) }) }) }),
  };
}

test('scan: PSX table first; held stocks only; the user scope is passed through', async () => {
  const admin = fakeAdmin({ symbols: ['FFC', 'BAFL'] });
  const fetchText = async (url) => {
    if (url.includes('financial-announcements')) return FA;
    if (url.endsWith('/BAFL')) return BAFL;
    if (url.endsWith('/FFC')) return '<div class="stats_label">Face Value</div><div class="stats_value">10.00</div>';
    throw new Error('unexpected ' + url);
  };
  const r = await scan({ userId: 'u1', admin, fetchText, board: async () => BOARD, generate: null, today: '2026-11-22' });
  assert.equal(r.source, 'psx');
  assert.deepEqual(r.found.map((f) => `${f.symbol} ${f.dps} ${f.book_closure_from}`).sort(), ['BAFL 1.5 2026-11-06', 'FFC 18.5 2026-11-09']);
  const sync = admin.calls.find((c) => c.name === 'dividends_upcoming_sync');
  assert.equal(sync.args.p_user, 'u1');
});

test('scan: table down → each held company\'s new letters read by AI once; failures retried next run', async () => {
  const admin = fakeAdmin({ symbols: ['BAFL'], unread: ['287100'] });
  const page = '<div class="stats_label">Face Value</div><div class="stats_value">5.00</div><table>'
    + '<tr><td>Nov 15, 2026</td><td>Financial Results for the Quarter Ended 30 Sep 2026</td><td><a href="/download/document/287100.pdf">PDF</a></td></tr>'
    + '<tr><td>Nov 14, 2026</td><td>Transmission of Quarterly Report</td><td><a href="/download/document/287099.pdf">PDF</a></td></tr>'
    + '<tr><td>Nov 13, 2026</td><td>Board Meeting</td><td><a href="/download/document/287098.pdf">PDF</a></td></tr></table>';
  const fetchText = async (url) => { if (url.includes('financial-announcements')) throw new Error('timeout'); return page; };
  const answer = JSON.stringify({ page_read: true, cash_dividend: true, rs_per_share: 1.5, percent: 30, type: 'interim', interim_no: 3, book_closure_from: '2026-11-26', book_closure_to: '2026-11-27', agm_date: null });
  let asked = 0;
  const r = await scan({ userId: null, admin, fetchText, board: async () => BOARD, generate: async () => { asked += 1; return answer; }, today: '2026-11-22' });
  assert.equal(r.source, 'letters');
  assert.equal(asked, 2);                                  // one unread declaration letter, read twice; transmission skipped; 287098 already read
  assert.deepEqual(r.found, [{ symbol: 'BAFL', dps: 1.5, type: 'interim', book_closure_from: '2026-11-26' }]);
  const mark = admin.calls.find((c) => c.name === 'dividend_docs_mark');
  assert.deepEqual(mark.args.p_rows, [{ doc: '287100', symbol: 'BAFL', has_dividend: true }]);
  assert.match(r.notes.join(' '), /announcements table unavailable/);
});

test('scan: nothing held → still syncs (clears stale pending rows), no PSX calls', async () => {
  const admin = fakeAdmin({ symbols: [] });
  const r = await scan({ userId: 'u1', admin, fetchText: async () => { throw new Error('no fetch expected'); }, board: async () => [], today: '2026-11-22' });
  assert.equal(r.symbols, 0);
  assert.ok(admin.calls.some((c) => c.name === 'dividends_upcoming_sync'));
});
