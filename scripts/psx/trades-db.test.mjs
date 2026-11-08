/**
 * stock_transactions import columns (supabase/migrations/20261108130000_stock_trade_confirmations.sql)
 * on PGlite: a re-uploaded confirmation trade is a no-op, manual trades never
 * collide, imported rows must say where they came from, RLS still applies.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

const insert = (uid, o = {}, extra = '') => {
  const r = { user_id: uid, symbol: 'MCB', type: 'buy', price: 300, quantity: 10, fee: 5.18, date: '2026-01-05', ...o };
  const cols = Object.keys(r);
  return db.query(`insert into public.stock_transactions (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ${extra}`, Object.values(r));
};
const imported = (o = {}) => ({ broker: 'ktrade', account_ref: 'P99999', source: 'confirmation', confirmation_no: '10000001', source_ref: '10000001|buy|MCB|1', settlement_date: '2026-01-06', charges: JSON.stringify({ commission: 4.5, sst: 0.68 }), ...o });

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test'), ($2, 'v@test')`, [U, V]) });
  // Supabase grants table privileges to the API roles by default; PGlite does not, so mirror it.
  // RLS policies (own rows only) still decide which rows each user can touch.
  await db.exec('grant select, insert, update, delete on public.stock_transactions to authenticated');
});

test('an imported trade is stored with its broker, account, confirmation and charges', async () => {
  await asUser(db, U, () => insert(U, imported()));
  const r = await one(`select broker, account_ref, source, charges->>'sst' sst from public.stock_transactions where source_ref = '10000001|buy|MCB|1'`);
  assert.deepEqual([r.broker, r.account_ref, r.source, r.sst], ['ktrade', 'P99999', 'confirmation', '0.68']);
});

test('uploading the same confirmation again inserts nothing', async () => {
  const again = await asUser(db, U, () => insert(U, imported(), 'on conflict (user_id, broker, source_ref) do nothing'));
  assert.equal(again.affectedRows, 0);
  await assert.rejects(asUser(db, U, () => insert(U, imported())), /duplicate key/);
});

test('the same confirmation for another user, or another broker, is separate', async () => {
  await asUser(db, V, () => insert(V, imported()));
  await asUser(db, U, () => insert(U, imported({ broker: 'akd', account_ref: 'COZZ12345' })));
  const n = await one(`select count(*)::int n from public.stock_transactions where source_ref = '10000001|buy|MCB|1'`);
  assert.equal(n.n, 3);
});

test('manual trades default to source manual and never collide with each other', async () => {
  await asUser(db, U, () => insert(U));
  await asUser(db, U, () => insert(U));
  const r = await one(`select count(*)::int n from public.stock_transactions where user_id = $1 and source = 'manual'`, [U]);
  assert.equal(r.n, 2);
});

test('an import must name its broker, confirmation and trade key; settlement cannot precede the trade', async () => {
  await assert.rejects(asUser(db, U, () => insert(U, imported({ broker: null, source_ref: 'x' }))), /check constraint/);
  await assert.rejects(asUser(db, U, () => insert(U, imported({ source_ref: null }))), /check constraint/);
  await assert.rejects(asUser(db, U, () => insert(U, imported({ source_ref: 'y', settlement_date: '2026-01-01' }))), /check constraint/);
  await assert.rejects(asUser(db, U, () => insert(U, imported({ source_ref: 'z', broker: 'other' }))), /check constraint/);
});

test('RLS: another user cannot see or delete my imported trades', async () => {
  const seen = await asUser(db, V, async () => (await one(`select count(*)::int n from public.stock_transactions where user_id = $1`, [U])).n);
  assert.equal(seen, 0);
  const del = await asUser(db, V, () => db.query(`delete from public.stock_transactions where user_id = $1`, [U]));
  assert.equal(del.affectedRows, 0);
});
