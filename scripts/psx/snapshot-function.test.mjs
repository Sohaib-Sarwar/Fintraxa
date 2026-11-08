/** portfolio-snapshot Edge Function logic, against a fake database client. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { snapshotUser, run, todayPkt } from '../../supabase/functions/portfolio-snapshot/handler.js';

const U = '11111111-1111-1111-1111-111111111111';
const TABLES = {
  mf_ledger_entries: [{ id: 'e1', account_id: 'a1', fund_id: 'f1', unit_class: null, entry_type: 'purchase', trade_date: '2026-11-01', price_date: '2026-11-01', seq: 1, unit_delta: '100', gross_amount: '1000', net_amount: '1000', nav: '10', cash_direction: 'in' }],
  mf_ledger_components: [],
  mf_funds: [{ id: 'f1', name: 'Test Fund', amc_id: 'amc', mufap_slug: 'test-fund' }],
  mf_amcs: [{ id: 'amc', code: 'x', name: 'X' }],
  stock_transactions: [],
  income_expense_transactions: [],
  stock_dividends: [],
  mf_nav_history: [{ fund_id: 'f1', nav_date: '2026-11-02', price: '11', price_kind: 'nav', source: 'mufap' }],
  psx_price_history: [],
};

/** A tiny stand-in for supabase-js that records what was asked of it. */
function fakeDb() {
  const log = [];
  const writes = { insert: [], upsert: [], delete: [] };
  const builder = (table) => {
    const q = { table, filters: [] };
    const api = {
      select: () => api, order: () => api,
      eq: (c, v) => { q.filters.push(['eq', c, v]); return api; },
      in: (c, v) => { q.filters.push(['in', c, v]); return api; },
      or: (v) => { q.filters.push(['or', v]); return api; },
      gte: (c, v) => { q.filters.push(['gte', c, v]); return Promise.resolve({ error: null }); },
      range: () => { log.push(q); return Promise.resolve({ data: TABLES[table] ?? [], error: null }); },
      delete: () => { writes.delete.push(q); return api; },
      insert: (rows) => { writes.insert.push({ table, rows }); return Promise.resolve({ error: null }); },
      upsert: (rows, o) => { writes.upsert.push({ table, rows, o }); return Promise.resolve({ error: null }); },
    };
    return api;
  };
  const rpcs = [];
  return {
    log, writes, rpcs,
    from: builder,
    rpc: (name, args) => { rpcs.push([name, args]); return Promise.resolve(name === 'snapshot_work' ? { data: [{ user_id: U, from_date: '2026-11-01', started_at: 'T0' }], error: null } : { data: null, error: null }); },
  };
}

test('one user: reads only that user\'s rows (and public NAVs), replaces the recomputed days', async () => {
  const db = fakeDb();
  const r = await snapshotUser(db, U, '2026-11-01', '2026-11-03');
  assert.deepEqual([r.from, r.to, r.days], ['2026-11-01', '2026-11-03', 3]);
  for (const t of ['mf_ledger_entries', 'stock_transactions', 'income_expense_transactions', 'stock_dividends', 'mf_ledger_components']) {
    assert.ok(db.log.find((q) => q.table === t).filters.some(([k, c, v]) => k === 'eq' && c === 'user_id' && v === U), `${t} filtered by user`);
  }
  const navQ = db.log.find((q) => q.table === 'mf_nav_history');
  assert.ok(navQ.filters.some(([k, v]) => k === 'or' && v === `user_id.is.null,user_id.eq.${U}`), 'never another user\'s statement NAVs');
  assert.deepEqual(db.writes.delete[0].filters, [['eq', 'user_id', U], ['gte', 'snap_date', '2026-11-01']]);
  const hold = db.writes.insert.find((w) => w.table === 'holding_snapshots').rows;
  assert.deepEqual(hold.map((h) => [h.snap_date, h.user_id, h.value, h.unrealized]), [
    ['2026-11-01', U, 1000, 0], ['2026-11-02', U, 1100, 100], ['2026-11-03', U, 1100, 100],
  ]);
  const days = db.writes.upsert.find((w) => w.table === 'portfolio_snapshots');
  assert.equal(days.o.onConflict, 'user_id,snap_date');
  assert.deepEqual(days.rows.map((d) => [d.snap_date, d.funds_value, d.net_worth]), [['2026-11-01', 1000, 1000], ['2026-11-02', 1100, 1100], ['2026-11-03', 1100, 1100]]);
});

test('run: asks the database who needs work, and marks each user done only after it succeeds', async () => {
  const db = fakeDb();
  const results = await run(db);
  assert.equal(results.length, 1);
  assert.deepEqual(db.rpcs.map(([n]) => n), ['snapshot_work', 'snapshot_done']);
  assert.deepEqual(db.rpcs[1][1], { p_user: U, p_started: 'T0' });
});

test('today is the Pakistan date', () => {
  assert.equal(todayPkt(Date.parse('2026-11-08T19:30:00Z')), '2026-11-09'); // 00:30 PKT
  assert.equal(todayPkt(Date.parse('2026-11-08T18:30:00Z')), '2026-11-08'); // 23:30 PKT
});

test('the function\'s engine copies are identical to the app\'s engines', () => {
  execFileSync(process.execPath, ['scripts/sync-snapshot-engine.mjs', '--check'], { stdio: 'pipe' });
});
