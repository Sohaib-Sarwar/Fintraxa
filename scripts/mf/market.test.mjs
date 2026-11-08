/**
 * Daily close capture (migration 20261107140000): the request → ingest job
 * on PGlite, with pg_net/pg_cron replaced by stand-ins (scripts/db/harness.mjs).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const all = async (sql, p) => (await db.query(sql, p)).rows;
const feed = (asOf, rows) => JSON.stringify({ freshness: { data_as_of: asOf }, data: rows });

/** Answer every pending request with the given body per feed, then run the ingest. */
async function respond(byFeed) {
  const reqs = await all(`select request_id, feed from market_private.snapshot_requests where processed_at is null`);
  for (const r of reqs) {
    // Feeds a test does not mention answer with an empty document.
    const x = byFeed[r.feed] ?? { body: feed('2026-11-06T18:42:00+05:00', []) };
    await db.query(`insert into net._http_response (id, status_code, content) values ($1, $2, $3)`, [r.request_id, x.status ?? 200, x.body]);
  }
  return (await one(`select market_private.ingest_snapshots() as r`)).r;
}

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test')`, [U]) });
  const amc = await one(`select id from public.mf_amcs where code = 'meezan'`);
  const fund = await one(`insert into public.mf_funds (amc_id, name, mufap_slug) values ($1, 'Meezan Cash Fund Test', 'meezan-cash-fund-test') returning id`, [amc.id]);
  // Prices are captured only for what someone holds (20261108170000): U holds OGDC, FFC and the test fund.
  await db.query(`insert into public.stock_transactions (user_id, symbol, company_name, price, quantity, type, date) values
    ($1, 'OGDC', 'OGDC', 300, 10, 'buy', '2026-10-01'), ($1, 'FFC', 'FFC', 400, 5, 'buy', '2026-10-01'), ($1, 'DEAD', 'Gone', 5, 1, 'buy', '2026-10-01')`, [U]);
  const acc = await one(`insert into public.mf_accounts (user_id, amc_id, account_ref_hash, account_ref_masked) values ($1, $2, 'manual', 'manual') returning id`, [U, amc.id]);
  await db.query(`insert into public.mf_ledger_entries (user_id, account_id, fund_id, entry_type, trade_date, unit_delta, gross_amount, net_amount, nav, cash_direction, origin)
    values ($1, $2, $3, 'purchase', '2026-10-01', 100, 5400, 5400, 54, 'investor_pays', 'manual')`, [U, acc.id, fund.id]);
});

test('schedules exist: two daily requests and a regular ingest', async () => {
  const jobs = (await all(`select jobname from cron.job order by jobname`)).map((j) => j.jobname).filter((j) => j.startsWith('market-'));
  assert.deepEqual(jobs, ['market-snapshot-ingest', 'market-snapshot-request-morning', 'market-snapshot-request-night']);
});

test('PSX closes are stored per held stock per PSX session day; MUFAP NAVs for held funds only', async () => {
  await db.query(`select market_private.request_snapshots()`);
  const out = await respond({
    // 18:42 PKT on 6 Nov is the 6 Nov session.
    psx: { body: feed('2026-11-06T18:42:00+05:00', [
      { symbol: 'ogdc', current: 312.89, change: -3.35, change_pct: -1.06 },
      { symbol: 'FFC', current: '410.5', change: 2, change_pct: 0.49 },
      { symbol: 'DEAD', current: 0 },
      { symbol: '', current: 10 },
    ]) },
    mufap: { body: feed('2026-11-06', [
      { slug: 'meezan-cash-fund-test', nav: 54.2, repurchase_price: 54.1, validity_date: '2026-11-06' },
      { slug: 'not-tracked', nav: 10 },
    ]) },
  });
  assert.deepEqual(out.map((o) => [o.feed, o.rows]).sort(), [['mufap', 1], ['psx', 2], ['psx_indices', 0]]);
  const rows = await all(`select symbol, price_date::text d, close::text c from public.psx_price_history order by symbol`);
  assert.deepEqual(rows, [{ symbol: 'FFC', d: '2026-11-06', c: '410.5' }, { symbol: 'OGDC', d: '2026-11-06', c: '312.89' }]);
  const nav = await one(`select price::text p, price_kind k, source, user_id from public.mf_nav_history where source = 'mufap' and source_ref = 'meezan-cash-fund-test'`);
  assert.deepEqual(nav, { p: '54.1', k: 'repurchase', source: 'mufap', user_id: null });
});

test('index closes (KSE100 and a few others) are captured per session day; other indices are ignored', async () => {
  await db.query(`select market_private.request_snapshots()`);
  await respond({
    psx: { body: feed('2026-11-06T18:42:00+05:00', []) },
    mufap: { body: feed('2026-11-06', []) },
    psx_indices: { body: feed('2026-11-06T18:42:00+05:00', [
      { index_name: 'KSE100', current: 173886.68 }, { index_name: 'KSE100PR', current: 51443.57 }, { index_name: 'BKTI', current: 1 },
    ]) },
  });
  const rows = await all(`select index_code, price_date::text d, close::text c from public.market_index_history order by 1`);
  assert.deepEqual(rows, [{ index_code: 'KSE100', d: '2026-11-06', c: '173886.68' }, { index_code: 'KSE100PR', d: '2026-11-06', c: '51443.57' }]);
});

test('re-capturing the same session is a no-op; a corrected close overwrites', async () => {
  await db.query(`select market_private.request_snapshots()`);
  await respond({
    psx: { body: feed('2026-11-06T18:42:00+05:00', [{ symbol: 'OGDC', current: 313 }]) },
    mufap: { body: feed('2026-11-06', [{ slug: 'meezan-cash-fund-test', nav: 54.2, repurchase_price: 54.1, validity_date: '2026-11-06' }]) },
  });
  assert.equal((await one(`select count(*)::int n from public.psx_price_history where symbol = 'OGDC'`)).n, 1);
  assert.equal((await one(`select close::text c from public.psx_price_history where symbol = 'OGDC'`)).c, '313');
  assert.equal((await one(`select count(*)::int n from public.mf_nav_history where source_ref = 'meezan-cash-fund-test'`)).n, 1);
});

test('a failed or garbled response is recorded, never half-written', async () => {
  await db.query(`select market_private.request_snapshots()`);
  await respond({ psx: { status: 503, body: 'unavailable' }, mufap: { body: '{not json' } });
  const errs = (await all(`select feed, error from market_private.snapshot_requests where error is not null order by feed`)).map((r) => [r.feed, r.error]);
  assert.deepEqual(errs, [['mufap', 'response is not JSON'], ['psx', 'HTTP 503']]);
  assert.equal((await one(`select count(*)::int n from public.psx_price_history`)).n, 2);
});

test('signed-in users can read closes but not write them or run the job', async () => {
  const n = await asUser(db, U, async () => (await one(`select count(*)::int n from public.psx_price_history`)).n);
  assert.equal(n, 2);
  await assert.rejects(asUser(db, U, () => db.query(`insert into public.psx_price_history (symbol, price_date, close) values ('X', '2026-01-01', 1)`)), /permission denied/);
  await assert.rejects(asUser(db, U, () => db.query(`select market_private.request_snapshots()`)), /permission denied/);
});
