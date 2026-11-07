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
    const x = byFeed[r.feed];
    await db.query(`insert into net._http_response (id, status_code, content) values ($1, $2, $3)`, [r.request_id, x.status ?? 200, x.body]);
  }
  return (await one(`select market_private.ingest_snapshots() as r`)).r;
}

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test')`, [U]) });
  const amc = await one(`select id from public.mf_amcs where code = 'meezan'`);
  await db.query(`insert into public.mf_funds (amc_id, name, mufap_slug) values ($1, 'Meezan Cash Fund Test', 'meezan-cash-fund-test')`, [amc.id]);
});

test('schedules exist: two daily requests and a regular ingest', async () => {
  const jobs = (await all(`select jobname from cron.job order by jobname`)).map((j) => j.jobname).filter((j) => j.startsWith('market-'));
  assert.deepEqual(jobs, ['market-snapshot-ingest', 'market-snapshot-request-morning', 'market-snapshot-request-night']);
});

test('PSX closes are stored per stock per PSX session day; MUFAP NAVs for known funds only', async () => {
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
  assert.deepEqual(out.map((o) => [o.feed, o.rows]).sort(), [['mufap', 1], ['psx', 2]]);
  const rows = await all(`select symbol, price_date::text d, close::text c from public.psx_price_history order by symbol`);
  assert.deepEqual(rows, [{ symbol: 'FFC', d: '2026-11-06', c: '410.5' }, { symbol: 'OGDC', d: '2026-11-06', c: '312.89' }]);
  const nav = await one(`select price::text p, price_kind k, source, user_id from public.mf_nav_history where source = 'mufap' and source_ref = 'meezan-cash-fund-test'`);
  assert.deepEqual(nav, { p: '54.1', k: 'repurchase', source: 'mufap', user_id: null });
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
