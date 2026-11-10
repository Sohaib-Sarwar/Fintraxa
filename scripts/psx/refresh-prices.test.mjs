// Edge Function refresh-prices (supabase/functions/refresh-prices/handler.js), with a fake
// database and a fake market worker. Fake prices only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refresh, pickFund, MIN_GAP_MS } from '../../supabase/functions/refresh-prices/handler.js';

/** Just enough of supabase-js: one table (market_refresh_runs) and two RPCs. */
function fakeAdmin({ targets, lastRun = null }) {
  const runs = []; const saved = [];
  const table = () => {
    const q = { _op: 'select', _patch: null, _id: null };
    Object.assign(q, {
      select: () => q, eq: (c, v) => { if (c === 'id') q._id = v; return q; }, order: () => q, limit: () => q,
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
  return {
    runs, saved,
    from: () => table(),
    rpc: async (name, args) => {
      if (name === 'market_refresh_targets') return { data: targets };
      if (name === 'market_refresh_save') { saved.push(args); return { data: { psx_saved: args.p_psx.length, funds_saved: args.p_funds.length } }; }
      return { error: new Error(`unknown rpc ${name}`) };
    },
  };
}

const targets = {
  psx: ['MEBL', 'FFC'],
  funds: [
    { id: 'f1', name: 'Al Ameen Islamic Cash Fund', category: 'Shariah Compliant Money Market', slug: 'al-ameen-islamic-cash-fund' },
    { id: 'f2', name: 'HBL Income Fund', category: 'Income', slug: 'hbl-income-fund' },
  ],
};

const worker = ({ mufapBlocked = false } = {}) => async (body) => {
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
    { nav_date: '2026-11-06', price: 117.4684, kind: 'repurchase', nav: 117.4684 });
  // tab=1 ahead: its NAV, and tab=3's older repurchase price is not used.
  assert.deepEqual(pickFund({ nav: 250.4, validity_date: '2026-11-09' }, { nav: 248.16, validity_date: '2026-11-04', repurchase_price: 250.44 }),
    { nav_date: '2026-11-09', price: 250.4, kind: 'nav', nav: 250.4 });
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
