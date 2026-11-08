/**
 * Daily snapshots (supabase/migrations/20261108170000_daily_snapshots.sql) on PGlite:
 * own rows only, change markers, the work list, held-only price capture.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const all = async (sql, p) => (await db.query(sql, p)).rows;

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test'), ($2, 'v@test')`, [U, V]) });
  await db.exec('grant select, insert, update, delete on public.stock_transactions to authenticated');
});

test('each user reads only their own snapshots and cannot write any', async () => {
  for (const [uid, value] of [[U, 100], [V, 999]]) {
    await db.query(`insert into public.portfolio_snapshots (user_id, snap_date, funds_value, engine_version) values ($1, '2026-11-06', $2, 'test')`, [uid, value]);
    await db.query(`insert into public.holding_snapshots (user_id, snap_date, asset_type, asset_key, value) values ($1, '2026-11-06', 'psx', 'FFC', $2)`, [uid, value]);
  }
  const mine = await asUser(db, U, () => all(`select funds_value::float8 v from public.portfolio_snapshots`));
  assert.deepEqual(mine.map((r) => r.v), [100]);
  assert.equal((await asUser(db, U, () => one(`select count(*)::int n from public.holding_snapshots`))).n, 1);
  await assert.rejects(asUser(db, U, () => db.query(`insert into public.portfolio_snapshots (user_id, snap_date, engine_version) values ($1, '2026-11-07', 'x')`, [U])), /permission denied/);
});

test('a back-dated trade marks the user for recompute from its date; the work list starts there', async () => {
  const add = (date, type, qty) => asUser(db, U, () => db.query(
    `insert into public.stock_transactions (user_id, symbol, company_name, price, quantity, type, date) values ($1, 'FFC', 'Fauji', 300, $2, $3, $4)`, [U, qty, type, date]));
  await add('2026-10-01', 'buy', 100);
  assert.equal((await one(`select from_date::text d from snapshot_private.dirty where user_id = $1`, [U])).d, '2026-10-01');
  await add('2026-03-15', 'buy', 10);                // earlier date: the marker moves back
  await add('2026-10-20', 'sell', 20);               // later date: the marker stays at the earliest
  assert.equal((await one(`select from_date::text d from snapshot_private.dirty where user_id = $1`, [U])).d, '2026-03-15');
  const w = await one(`select from_date::text d from public.snapshot_work($1)`, [U]);
  assert.equal(w.d, '2026-03-15');
  await db.query(`select public.snapshot_done($1, now())`, [U]);
  assert.equal((await one(`select count(*)::int n from snapshot_private.dirty where user_id = $1`, [U])).n, 0);
  // With no pending change, the next run starts 3 days before the last snapshot (late prices).
  assert.equal((await one(`select from_date::text d from public.snapshot_work($1)`, [U])).d, '2026-11-03');
});

test('the service functions are not callable by signed-in users', async () => {
  await assert.rejects(asUser(db, U, () => db.query(`select * from public.snapshot_work(null)`)), /permission denied/);
  await assert.rejects(asUser(db, U, () => db.query(`select public.snapshot_verify_cron_secret('x')`)), /permission denied/);
});

test('price capture keeps only stocks someone holds', async () => {
  // U holds 90 FFC (bought 110, sold 20). Nobody holds OGDC.
  const held = await all(`select symbol from market_private.held_symbols()`);
  assert.deepEqual(held.map((r) => r.symbol), ['FFC']);
  const id = (await one(`insert into market_private.snapshot_requests (request_id, feed) values (777, 'psx') returning request_id`)).request_id;
  const board = { freshness: { data_as_of: '2026-11-06T16:00:00+05:00' }, data: [{ symbol: 'FFC', current: '450.5' }, { symbol: 'OGDC', current: '210' }] };
  await db.query(`insert into net._http_response (id, status_code, content) values ($1, 200, $2)`, [id, JSON.stringify(board)]);
  await db.query(`select market_private.ingest_snapshots()`);
  const rows = await all(`select symbol, close::float8 c from public.psx_price_history order by symbol`);
  assert.deepEqual(rows, [{ symbol: 'FFC', c: 450.5 }]);
});

test('the nightly schedule is set: midnight, after prices, morning', async () => {
  const jobs = (await all(`select jobname, schedule from cron.job where jobname like 'portfolio-snapshot-%' order by jobname`));
  assert.deepEqual(jobs.map((j) => [j.jobname, j.schedule]), [
    ['portfolio-snapshot-after-prices', '45 21 * * *'], ['portfolio-snapshot-midnight', '5 19 * * *'], ['portfolio-snapshot-morning', '45 3 * * *'],
  ]);
});
