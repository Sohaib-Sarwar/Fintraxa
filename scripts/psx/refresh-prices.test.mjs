// Edge Function refresh-prices (supabase/functions/refresh-prices/handler.js), with a fake
// database and a fake market worker. Fake prices only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refresh, pickFund, pickNewest, MIN_GAP_MS, BATCH } from '../../supabase/functions/refresh-prices/handler.js';

/** Just enough of supabase-js: one table (market_refresh_runs) and two RPCs. */
function fakeAdmin({ targets, lastRun = null }) {
  const runs = []; const saved = []; const filters = [];
  const table = () => {
    const q = { _op: 'select', _patch: null, _id: null };
    Object.assign(q, {
      select: () => q, eq: (c, v) => { if (c === 'id') q._id = v; else filters.push([c, 'eq', v]); return q; },
      is: (c, v) => { filters.push([c, 'is', v]); return q; }, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: lastRun }),
      insert: (row) => { const r = { id: runs.length + 1, requested_at: new Date(0).toISOString(), status: 'running', ...row }; runs.push(r); q._row = r; return q; },
      update: (patch) => { q._patch = patch; return q; },
      single: async () => {
        if (q._patch) { const r = runs.find((x) => x.id === q._id); Object.assign(r, q._patch); return { data: r }; }
        return { data: q._row };
      },
      then: (res) => { if (q._patch) { const r = runs.find((x) => x.id === q._id); Object.assign(r, q._patch); } res({ data: null }); },
    });
    return q;
  };
  const admin = {
    runs, saved, filters, targetArgs: [],
    from: () => table(),
    rpc: async (name, args) => {
      if (name === 'market_refresh_targets') { admin.targetArgs.push(args); return { data: targets }; }
      if (name === 'market_refresh_save') { saved.push(args); return { data: { psx_saved: args.p_psx.length, funds_saved: args.p_funds.length } }; }
      return { error: new Error(`unknown rpc ${name}`) };
    },
  };
  return admin;
}

const targets = {
  psx: ['MEBL', 'FFC'],
  funds: [
    { id: 'f1', name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', slug: 'al-ameen-islamic-cash-fund' },
    { id: 'f2', name: 'HBL Income Fund', category: 'Income', slug: 'hbl-income-fund' },
  ],
};

const UBL = 'UBL Fund Managers Limited';
const worker = ({ mufapBlocked = false, amc = [] } = {}) => async (body) => {
  if (body.source === 'amc') {
    return { status: amc.length ? 'ok' : 'unavailable', managers: [{ amc: UBL, id: 'ubl', status: 'ok', url: 'https://ubl.example/prices' }], unsupported: [], funds: amc };
  }
  if (body.source === 'psx') {
    return { quotes: [
      { symbol: 'MEBL', status: 'ok', price: 570.78, change: 20.53, change_pct: 3.73, as_of: '2026-11-10', as_of_text: 'Tue, Nov 10, 2026 3:49 PM' },
      { symbol: 'FFC', status: 'ok', price: 562.62, change: -3.12, change_pct: -0.55, as_of: '2026-11-10' },
    ] };
  }
  if (mufapBlocked) return { status: 'blocked', error: 'MUFAP refused the request (Cloudflare challenge).', ray: 'r1', funds: [] };
  if (body.tab === 1) {
    return { status: 'ok', funds: [
      { name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', nav: 105.1014, validity_date: '2026-11-10' },
      { name: 'HBL Income Fund', category: 'Income', nav: 117.4659, validity_date: '2026-11-05' },
    ] };
  }
  return { status: 'ok', funds: [
    { name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', nav: 105.1014, validity_date: '2026-11-10', repurchase_price: 105.1014 },
    { name: 'HBL Income Fund', category: 'Income', nav: 117.4684, validity_date: '2026-11-06', repurchase_price: 117.4684 },
  ] };
};

test('the newer of MUFAP\'s two tables wins; its repurchase price only counts for the same day', () => {
  // HBL Income Fund, 8 Nov 2026: tab=1 117.4659 @ 5 Nov, tab=3 117.4684 @ 6 Nov.
  assert.deepEqual(pickFund({ nav: 117.4659, validity_date: '2026-11-05' }, { nav: 117.4684, validity_date: '2026-11-06', repurchase_price: 117.4684 }),
    { nav_date: '2026-11-06', price: 117.4684, kind: 'repurchase', nav: 117.4684, source: 'mufap' });
  // tab=1 ahead: its NAV, and tab=3's older repurchase price is not used.
  assert.deepEqual(pickFund({ nav: 250.4, validity_date: '2026-11-09' }, { nav: 248.16, validity_date: '2026-11-04', repurchase_price: 250.44 }),
    { nav_date: '2026-11-09', price: 250.4, kind: 'nav', nav: 250.4, source: 'mufap' });
  assert.equal(pickFund(null, null), null);
});

test('a refresh fetches only the holdings, saves them, and reports each step', async () => {
  const admin = fakeAdmin({ targets });
  const events = [];
  const run = await refresh({ userId: 'u1', admin, quotes: worker(), emit: (e) => events.push(e) });
  assert.deepEqual(events.map((e) => e.type).filter((t) => t !== 'source'), ['start', 'holdings', 'saving', 'done']);
  assert.deepEqual(events.filter((e) => e.type === 'source').map((e) => e.source).sort(), ['mufap_tab1', 'mufap_tab3', 'psx']);
  const [saved] = admin.saved;
  assert.deepEqual(saved.p_psx.map((r) => [r.symbol, r.day, r.close]), [['MEBL', '2026-11-10', 570.78], ['FFC', '2026-11-10', 562.62]]);
  assert.deepEqual(saved.p_funds.map((r) => [r.fund_id, r.nav_date, r.price, r.kind]), [['f1', '2026-11-10', 105.1014, 'repurchase'], ['f2', '2026-11-06', 117.4684, 'repurchase']]);
  assert.equal(run.status, 'ok');
  assert.deepEqual([run.psx_requested, run.psx_updated, run.mufap_requested, run.mufap_updated], [2, 2, 2, 2]);
  assert.deepEqual(run.details.steps.map((s) => s.name).sort(), ['holdings', 'mufap_tab1', 'mufap_tab3', 'psx', 'save']);
});

test('MUFAP refusing is a partial run that says so; PSX is still saved', async () => {
  const admin = fakeAdmin({ targets });
  const run = await refresh({ userId: 'u1', admin, quotes: worker({ mufapBlocked: true }), emit: () => {} });
  assert.equal(run.status, 'partial');
  assert.equal(run.psx_updated, 2);
  assert.equal(run.mufap_updated, 0);
  assert.deepEqual([run.details.mufap.status, run.details.mufap.ray], ['blocked', 'r1']);
});

test('one refresh at a time per user', async () => {
  const recent = { id: 9, status: 'ok', requested_at: new Date(Date.now() - MIN_GAP_MS / 2).toISOString() };
  await assert.rejects(refresh({ userId: 'u1', admin: fakeAdmin({ targets, lastRun: recent }), quotes: worker(), emit: () => {} }), (e) => e.status === 429);
  const running = { id: 9, status: 'running', requested_at: new Date(Date.now() - 30_000).toISOString() };
  await assert.rejects(refresh({ userId: 'u1', admin: fakeAdmin({ targets, lastRun: running }), quotes: worker(), emit: () => {} }), /already running/);
});

test('nothing held: nothing fetched, an empty run', async () => {
  let called = 0;
  const run = await refresh({ userId: 'u1', admin: fakeAdmin({ targets: { psx: [], funds: [] } }), quotes: async () => { called += 1; return {}; }, emit: () => {} });
  assert.equal(called, 0);
  assert.equal(run.status, 'ok');
});

test('a refreshed PSX price replaces the board only when it is newer', async () => {
  const { preferNewerPrices } = await import('../../src/lib/psx/livePrices.js');
  const live = { MEBL: { symbol: 'MEBL', current: 550.25, change: -4.77 }, FFC: { symbol: 'FFC', current: 562.62 } };
  const history = {
    MEBL: [{ date: '2026-11-06', close: '550.25' }, { date: '2026-11-10', close: '570.78', change: '20.53', change_pct: '3.73' }], // refreshed today
    FFC: [{ date: '2026-11-06', close: '562.62' }],                                                                             // same day as the board
  };
  const out = preferNewerPrices(live, history, '2026-11-06');
  assert.deepEqual([out.MEBL.current, out.MEBL.change_pct, out.MEBL.as_of, out.MEBL.refreshed], [570.78, 3.73, '2026-11-10', true]);
  assert.equal(out.FFC.current, 562.62, 'same date: the board wins');
  assert.equal(out.FFC.refreshed, undefined);
});

test('a fund is looked up by its MUFAP link, not by the name Fintraxa stores', async () => {
  // Stored with a statement's spelling; its slug points at MUFAP's row.
  const admin = fakeAdmin({ targets: { psx: [], funds: [{ id: 'f9', name: 'AL-AMEEN ISLAMIC CASH FUND (Class B)', category: null, slug: 'al-ameen-islamic-cash-fund' }] } });
  const asked = [];
  const quotes = async (body) => { asked.push(body); return worker()(body); };
  const index = new Map([['al-ameen-islamic-cash-fund', { fund_name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market' }]]);
  const run = await refresh({ userId: 'u1', admin, quotes, emit: () => {}, mufapIndex: async () => index });
  assert.deepEqual(asked[0].funds, [{ name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market' }]);
  assert.deepEqual(admin.saved[0].p_funds.map((r) => [r.fund_id, r.price]), [['f9', 105.1014]]);
  assert.equal(run.mufap_updated, 1);
});

// Al-Ameen Islamic Cash Fund, 10 Nov 2026: MUFAP's last row 105.0610 @ 7 Nov (refused since),
// UBL's own page 105.1289 @ 11 Nov.
const ublCash = { name: 'Al-Ameen Islamic Cash Fund', amc: UBL, validity_date: '2026-11-11', price: 105.1289, kind: 'repurchase', nav: 105.1289, source_url: 'https://ubl.example/prices' };
const ameen = { id: 'f1', name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', slug: 'al-ameen-islamic-cash-fund' };
const ameenIndex = new Map([['al-ameen-islamic-cash-fund', { fund_name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', amc: UBL }]]);

test('the newest of MUFAP and the fund manager wins; MUFAP wins a tie', () => {
  const mufap = { nav_date: '2026-11-07', price: 105.061, kind: 'repurchase', nav: 105.061, source: 'mufap' };
  assert.equal(pickNewest(mufap, ublCash).source, 'amc');
  assert.equal(pickNewest(mufap, ublCash).price, 105.1289);
  assert.equal(pickNewest({ ...mufap, nav_date: '2026-11-11' }, ublCash).source, 'mufap', 'same day: MUFAP');
  assert.equal(pickNewest(null, ublCash).nav_date, '2026-11-11', 'MUFAP silent: the manager');
  assert.equal(pickNewest(mufap, null), mufap);
  assert.equal(pickNewest(null, null), null);
});

test("MUFAP refusing no longer costs the fund its price: the manager's page is used", async () => {
  const admin = fakeAdmin({ targets: { psx: ['MEBL'], funds: [ameen] } });
  const asked = [];
  const quotes = async (body) => { asked.push(body); return worker({ mufapBlocked: true, amc: [ublCash] })(body); };
  const run = await refresh({ userId: 'u1', admin, quotes, mufapIndex: async () => ameenIndex });
  assert.deepEqual(asked.find((b) => b.source === 'amc').funds, [{ name: 'Al Ameen Islamic Cash Fund', amc: UBL }], "asked by MUFAP's name and manager");
  assert.deepEqual(admin.saved[0].p_funds, [{ fund_id: 'f1', nav_date: '2026-11-11', price: 105.1289, kind: 'repurchase', source: 'amc', slug: 'https://ubl.example/prices' }]);
  assert.equal(run.mufap_updated, 1);
  assert.equal(run.details.mufap.status, 'blocked', "MUFAP's refusal is still reported");
  assert.equal(run.details.amc.status, 'ok');
});

test('a fund whose manager is unknown is not sent to the manager source', async () => {
  const admin = fakeAdmin({ targets: { psx: [], funds: [ameen] } });
  const asked = [];
  await refresh({ userId: 'u1', admin, quotes: async (b) => { asked.push(b.source); return worker()(b); }, mufapIndex: async () => new Map() });
  assert.ok(!asked.includes('amc'));
});

test("the scheduled run covers everyone's holdings, in batches the worker accepts", async () => {
  const symbols = Array.from({ length: BATCH + 5 }, (_, i) => `S${i}`);
  const admin = fakeAdmin({ targets: { psx: symbols, funds: [] } });
  const batches = [];
  const quotes = async (body) => {
    batches.push(body.symbols.length);
    return { quotes: body.symbols.map((s) => ({ symbol: s, status: 'ok', price: 10, as_of: '2026-11-10' })) };
  };
  const run = await refresh({ userId: null, admin, quotes });
  assert.deepEqual(admin.targetArgs, [{ p_user: null }], "null = every user's holdings");
  assert.deepEqual(admin.filters, [['user_id', 'is', null]], 'its own one-at-a-time check');
  assert.equal(admin.runs[0].kind, 'scheduled');
  assert.deepEqual(batches.sort((a, b) => b - a), [BATCH, 5]);
  assert.equal(run.psx_updated, BATCH + 5);
});

// ── 2026-11-22: managers behind a bot challenge (MCB) via Gemini URL context; the published MUFAP file ──
import { acceptReads, parseReader, readManagersViaAi, readerPrompt } from '../../supabase/functions/refresh-prices/amcReader.js';
import { newerOf, publishedPick } from '../../supabase/functions/refresh-prices/handler.js';

test('the AI page reader keeps only a NAV two reads agree on, recent and plausible', () => {
  const names = ['MCB Cash Management Optimizer', 'Alhamra Cash Management Optimizer', 'MCB Pakistan Stock Market Fund'];
  const read = (rows) => ({ page_read: true, funds: rows.map(([fund, nav, date]) => ({ fund, nav, date })) });
  const a = read([[names[0], 106.9315, '2026-11-23'], [names[1], 104.8537, '2026-11-23'], [names[2], 160, '2026-11-20']]);
  const b = read([[names[0], 106.9315, '2026-11-23'], [names[1], 104.85, '2026-11-23'], [names[2], 160, '2026-11-20']]);
  const last = new Map([['mcbpakistanstockmarketfund', { price: 100, category: 'Equity' }]]);
  const ok = acceptReads(a, b, names, { today: '2026-11-22', last });
  assert.deepEqual(ok.map((r) => [r.name, r.price, r.validity_date]), [[names[0], 106.9315, '2026-11-23']], 'disagreeing reads and a 60% jump are dropped');
  assert.deepEqual(acceptReads(a, a, [names[0]], { today: '2026-12-20' }), [], 'a NAV dated weeks ago is not taken');
  assert.deepEqual(acceptReads({ ...a, page_read: false }, a, names, { today: '2026-11-22' }), [], 'nothing when the page was not read');
  assert.deepEqual(parseReader('```json\n{"page_read":true,"funds":[]}\n```'), { page_read: true, funds: [] });
  assert.equal(parseReader('no json here'), null);
  assert.match(readerPrompt('https://x.test/prices', ['A Fund']), /Do not use any other website/);
});

test('readManagersViaAi reads only the managers behind a challenge, twice each', async () => {
  let calls = 0;
  const generate = async () => { calls += 1; return '{"page_read":true,"funds":[{"fund":"MCB Cash Management Optimizer","nav":106.9315,"date":"2026-11-23"}]}'; };
  const r = await readManagersViaAi([
    { name: 'MCB Cash Management Optimizer', amc: 'MCB Investment Management Limited' },
    { name: 'UBL Stock Advantage Fund', amc: 'UBL Fund Managers Limited' },
  ], { generate, today: '2026-11-22' });
  assert.equal(calls, 2);
  assert.deepEqual(r.funds.map((f) => [f.name, f.price, f.amc]), [['MCB Cash Management Optimizer', 106.9315, 'MCB Investment Management Limited']]);
  assert.deepEqual((await readManagersViaAi([{ name: 'X', amc: 'MCB Investment Management Limited' }], {})).funds, [], 'no key, no reading');
});

test('the published MUFAP file is a dated fallback; the newest price wins', () => {
  const pub = publishedPick({ nav: 106.841, repurchase_price: 106.841, validity_date: '2026-11-20' });
  assert.deepEqual(pub, { nav_date: '2026-11-20', price: 106.841, kind: 'repurchase', nav: 106.841, source: 'mufap' });
  assert.equal(publishedPick({ nav: 0, validity_date: '2026-11-20' }), null);
  assert.equal(newerOf(null, pub), pub);
  const live = { nav_date: '2026-11-21', price: 107 };
  assert.equal(newerOf(live, pub), live);
  assert.equal(pickNewest(newerOf(null, pub), { validity_date: '2026-11-23', price: 106.9315, kind: 'nav' }).source, 'amc');
});

test('price stamp: the day a price is for, when it was fetched (PKT) and where from', async () => {
  const { stockStamp, fundStamp, stampTime, fetchedShort } = await import('../../src/lib/market/priceStamp.js');
  assert.equal(stampTime('2026-11-20T15:01:10Z'), '20 Nov 2026, 8:01 pm PKT');
  assert.equal(stampTime('2026-11-21T19:30:00Z'), '22 Nov 2026, 12:30 am PKT');
  assert.equal(stampTime(null), null);
  assert.equal(fetchedShort('2026-11-22T05:00:00Z', Date.parse('2026-11-22T09:00:00Z')), 'fetched today 10:00 am');
  const s = stockStamp({ symbol: 'OGDC', price: 312.55, priceSource: 'live', priceRefreshed: true, priceDate: '2026-11-20', priceFetchedAt: '2026-11-20T15:01:10Z' });
  assert.deepEqual(s.rows, [['Price for', '20 Nov 2026'], ['Fetched', '20 Nov 2026, 8:01 pm PKT'], ['Source', 'PSX company page (price refresh)']]);
  assert.equal(stockStamp({ symbol: 'X', price: 10, priceSource: 'trade' }).rows[1][1], 'Not fetched: taken from your trade');
  const f = fundStamp({ value: 101.2345, date: '2026-11-21', source: 'amc', kind: 'repurchase', fetchedAt: null }, 'Fund');
  assert.deepEqual(f.rows[0], ['Repurchase price for', '21 Nov 2026']);
  assert.equal(f.rows[1][1], 'Time not recorded');
  assert.equal(stockStamp({ price: null }), null);
});

test('refresh summary: updated vs not updated, each with its reason', async () => {
  const { refreshSummary } = await import('../../src/lib/market/refreshSummary.js');
  const run = { finished_at: '2026-11-22T06:12:00Z', duration_ms: 9300, details: {
    psx: [{ symbol: 'AAA', status: 'ok', price: 10, as_of: '2026-11-20', as_of_text: 'PSX screener, 2026-11-20' }, { symbol: 'BBB', status: 'unavailable' }],
    funds: [{ name: 'F1', amc: 'M1', source: 'amc', price: 100, nav_date: '2026-11-21', kind: 'nav' }, { name: 'F2', amc: 'M2', status: 'not_found' }],
    amc: { managers: [{ amc: 'M1', status: 'ok', via: 'gemini_url_context' }, { amc: 'M2', status: 'unavailable' }], unsupported: [] } } };
  const s = refreshSummary(run);
  assert.equal(s.tone, 'partial');
  assert.equal(s.headline, 'Partly updated: 1 of 2 stocks and 1 of 2 funds.');
  assert.equal(s.updated[0].source, 'PSX screener (all stocks page)');
  assert.equal(s.updated[1].source, 'M1 website (read via Google)');
  assert.match(s.notUpdated[0].reason, /did not answer in time/);
  assert.match(s.notUpdated[1].reason, /M2’s website did not answer/);
  const all = refreshSummary({ details: { psx: [{ symbol: 'AAA', status: 'ok', price: 1, as_of: '2026-11-20' }], funds: [] } });
  assert.equal(all.tone, 'ok');
  assert.equal(all.headline, 'Prices updated: all 1 stock.');
});
