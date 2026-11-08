/**
 * Price backfill + feed health (20261109110000_price_backfill_and_feed_health.sql) on PGlite:
 * the work list, saving closes and read days, recompute marks, the trade trigger, feed health.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const all = async (sql, p) => (await db.query(sql, p)).rows;

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test')`, [U]) });
});

test('a back-dated trade in a new stock: missing weekdays are listed, a backfill is requested at once', async () => {
  const before = (await one(`select count(*)::int n from net.http_request_queue`).catch(() => ({ n: null }))).n;
  await db.query(`insert into public.stock_transactions (user_id, symbol, company_name, price, quantity, type, date)
                  values ($1, 'ZZZ', 'Test Co', 100, 10, 'buy', '2026-05-15'), ($1, 'ZZZ', 'Test Co', 110, 10, 'sell', '2026-05-20')`, [U]);
  if (before !== null) assert.ok((await one(`select count(*)::int n from net.http_request_queue`)).n > before, 'trigger asked for a backfill');
  const work = await all(`select symbol, day::text d from public.psx_backfill_work(60) where symbol = 'ZZZ' order by d`);
  // 10 days before the first trade to the sale: weekdays 5 May – 20 May.
  assert.equal(work[0].d, '2026-05-05');
  assert.equal(work.at(-1).d, '2026-05-20');
  assert.ok(work.every((w) => ![0, 6].includes(new Date(`${w.d}T00:00:00Z`).getUTCDay())), 'weekdays only');
});

test('saving closes and read days removes them from the work list and marks the user for recompute', async () => {
  await db.query(`delete from snapshot_private.dirty`);
  const r = await one(`select public.psx_backfill_save($1::jsonb, $2::jsonb) r`, [
    JSON.stringify([{ symbol: 'ZZZ', day: '2026-05-15', close: 101.5 }, { symbol: 'ZZZ', day: '2026-05-14', close: 99 }]),
    JSON.stringify([{ day: '2026-05-14', status: 'loaded', symbols: ['ZZZ'] }, { day: '2026-05-15', status: 'loaded', symbols: ['ZZZ'] },
      { day: '2026-05-13', status: 'loaded', symbols: ['ZZZ'] }, { day: '2026-05-12', status: 'no_file', symbols: [] }]),
  ]);
  assert.deepEqual(r.r, { closes: 2, days: 4 });
  const left = (await all(`select day::text d from public.psx_backfill_work(60) where symbol = 'ZZZ'`)).map((x) => x.d);
  for (const d of ['2026-05-12', '2026-05-13', '2026-05-14', '2026-05-15']) assert.ok(!left.includes(d), `${d} no longer missing`);
  assert.equal((await one(`select from_date::text d from snapshot_private.dirty where user_id = $1`, [U])).d, '2026-05-14');
  // Saving the same again changes nothing.
  assert.deepEqual((await one(`select public.psx_backfill_save($1::jsonb, '[]'::jsonb) r`, [JSON.stringify([{ symbol: 'ZZZ', day: '2026-05-15', close: 1 }])])).r, { closes: 0, days: 0 });
  assert.equal((await one(`select close::text c from public.psx_price_history where symbol = 'ZZZ' and price_date = '2026-05-15'`)).c, '101.5');
});

test('only the service role runs the backfill functions; signed-in users can read feed health', async () => {
  await assert.rejects(asUser(db, U, () => db.query(`select * from public.psx_backfill_work(5)`)), /permission denied/);
  await assert.rejects(asUser(db, U, () => db.query(`select public.psx_backfill_save('[]', '[]')`)), /permission denied/);
  await db.query(`insert into market_private.snapshot_requests (request_id, feed, processed_at, data_as_of) values (9001, 'psx', now(), '2026-11-06')`);
  await db.query(`insert into market_private.snapshot_requests (request_id, feed, processed_at, error) values (9002, 'mufap', now(), 'HTTP 503')`);
  const h = await asUser(db, U, () => all(`select feed, latest_data::text d, last_error from public.market_feed_health() order by feed`));
  assert.deepEqual(h.map((x) => [x.feed, x.d, x.last_error]), [['mufap', null, 'HTTP 503'], ['psx', '2026-11-06', null], ['psx_indices', null, null]]);
});
