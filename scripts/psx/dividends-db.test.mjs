/**
 * public.stock_dividends (supabase/migrations/20261108120000_stock_dividends.sql)
 * on PGlite: RLS keeps each user to their own rows, constraints reject bad
 * amounts, a re-imported warrant is a no-op, deletes are logged.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

const row = (o = {}) => ({ symbol: 'FFC', payment_date: '2026-10-01', warrant_no: 'W1', shares: 10, gross_amount: 100, tax_amount: 15, net_amount: 85, ...o });
const insert = (o, extra = '') => {
  const r = row(o);
  const cols = Object.keys(r);
  return db.query(`insert into public.stock_dividends (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ${extra}`, Object.values(r));
};

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test'), ($2, 'v@test')`, [U, V]) });
});

test('a user adds a dividend; user_id defaults to the signed-in user', async () => {
  await asUser(db, U, () => insert({}));
  const r = await one(`select user_id, filer_status, source from public.stock_dividends where warrant_no = 'W1'`);
  assert.deepEqual([r.user_id, r.filer_status, r.source], [U, 'unknown', 'manual']);
});

test('another user can neither see nor change it, nor insert rows for someone else', async () => {
  const seen = await asUser(db, V, async () => (await one(`select count(*)::int n from public.stock_dividends`)).n);
  assert.equal(seen, 0);
  const upd = await asUser(db, V, () => db.query(`update public.stock_dividends set net_amount = 1`));
  assert.equal(upd.affectedRows, 0);
  const del = await asUser(db, V, () => db.query(`delete from public.stock_dividends`));
  assert.equal(del.affectedRows, 0);
  await assert.rejects(asUser(db, V, () => insert({ user_id: U, warrant_no: 'X' })), /row-level security/);
});

test('anonymous visitors have no access at all', async () => {
  await assert.rejects(asUser(db, null, () => db.exec('set role anon').then(() => db.query(`select * from public.stock_dividends`))), /permission denied/);
});

test('re-importing the same warrant is a no-op; a manual row without a warrant never collides', async () => {
  const again = await asUser(db, U, () => insert({}, 'on conflict (user_id, symbol, payment_date, warrant_no) do nothing'));
  assert.equal(again.affectedRows, 0);
  await asUser(db, U, () => insert({ warrant_no: null }));
  await asUser(db, U, () => insert({ warrant_no: null }));
  const n = await asUser(db, U, async () => (await one(`select count(*)::int n from public.stock_dividends`)).n);
  assert.equal(n, 3);
});

test('constraints: bad symbol, zero shares, deductions above gross, issue after payment, unknown status', async () => {
  const bad = [
    { symbol: 'ffc', warrant_no: 'a' },
    { shares: 0, warrant_no: 'b' },
    { tax_amount: 150, warrant_no: 'c' },
    { issue_date: '2026-10-05', warrant_no: 'd' },
    { filer_status: 'maybe', warrant_no: 'e' },
    { net_amount: -1, warrant_no: 'f' },
  ];
  for (const o of bad) await assert.rejects(asUser(db, U, () => insert(o)), /check constraint/, JSON.stringify(o));
});

test('a net that differs from gross − tax (statement rounding) is stored as printed', async () => {
  await asUser(db, U, () => insert({ warrant_no: 'R', gross_amount: 1.6, tax_amount: 0.24, net_amount: 2 }));
  const r = await one(`select net_amount::text n from public.stock_dividends where warrant_no = 'R'`);
  assert.equal(r.n, '2.00');
});

test('edits bump updated_at; deletes land in deletion_log', async () => {
  const before = await one(`select id, updated_at from public.stock_dividends where warrant_no = 'W1'`);
  await new Promise((r) => setTimeout(r, 5));
  await asUser(db, U, () => db.query(`update public.stock_dividends set notes = 'checked' where id = $1`, [before.id]));
  const after = await one(`select updated_at from public.stock_dividends where id = $1`, [before.id]);
  assert.ok(after.updated_at > before.updated_at);
  await asUser(db, U, () => db.query(`delete from public.stock_dividends where id = $1`, [before.id]));
  const log = await one(`select table_name, record_data->>'symbol' s from public.deletion_log where record_id = $1`, [before.id]);
  assert.deepEqual([log.table_name, log.s], ['stock_dividends', 'FFC']);
});
