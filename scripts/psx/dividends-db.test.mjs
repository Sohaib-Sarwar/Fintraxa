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

// dividends_save (20261122120000 + 20261126120000): a CDC report completes dividends typed by hand, never adds twice.
const saveFull = (uid, rows) => asUser(db, uid, async () => (await one(`select public.dividends_save($1::jsonb) r`, [JSON.stringify(rows)])).r);
const save = async (uid, rows) => { const { results, ...counts } = await saveFull(uid, rows); assert.equal(results.length, rows.length); return counts; };
const cdcRow = (o) => ({ symbol: 'MEBX', payment_date: '2026-11-14', issue_date: '2026-11-10', warrant_no: '4756345', account_ref: '10000-200000',
  company_name: 'MEBX BANK LIMITED', filer_status: 'filer', filer_status_raw: 'Filler', shares: '2', gross_amount: '16.00', tax_amount: '2.00',
  jh_tax_amount: '0.00', zakat_amount: '0.00', net_amount: '14.00', source: 'statement', ...o });

test('CDC report completes a hand-added dividend (same day, and a day apart); a re-upload changes nothing', async () => {
  const W = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, 'w@test')`, [W]);
  // Typed by hand without the CDC details; one on the CDC day, one dated the day the money arrived.
  const hand = await save(W, [
    { symbol: 'MEBX', payment_date: '2026-11-14', shares: '2', gross_amount: '16.00', tax_amount: '2.00', net_amount: '14.00', filer_status: 'filer' },
    { symbol: 'SAZX', payment_date: '2026-11-18', shares: '1', gross_amount: '5.00', tax_amount: '1.00', net_amount: '4.00', filer_status: 'filer', dps: '5' },
  ]);
  assert.deepEqual(hand, { added: 2, completed: 0, skipped: 0 });

  const report = [cdcRow({}), cdcRow({ symbol: 'SAZX', payment_date: '2026-11-19', issue_date: '2026-11-18', warrant_no: '26029354', company_name: 'SAZX LIMITED',
    filer_status_raw: 'Filer', shares: '1', gross_amount: '5.00', tax_amount: '1.00', net_amount: '4.00' }), cdcRow({ symbol: 'NEWX', warrant_no: '1', gross_amount: '9.00', tax_amount: '1.35', net_amount: '7.65' })];
  assert.deepEqual(await save(W, report), { added: 1, completed: 2, skipped: 0 });

  const rows = await asUser(db, W, async () => (await db.query(`select symbol, payment_date::text pay, issue_date::text issue, warrant_no, account_ref, company_name,
    filer_status_raw, dps::text, net_amount::text net, source from public.stock_dividends order by symbol`)).rows);
  const m = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  assert.equal(rows.length, 3, 'nothing added twice');
  assert.deepEqual([m.MEBX.warrant_no, m.MEBX.issue, m.MEBX.account_ref, m.MEBX.company_name, m.MEBX.filer_status_raw, m.MEBX.dps, m.MEBX.net, m.MEBX.source],
    ['4756345', '2026-11-10', '10000-200000', 'MEBX BANK LIMITED', 'Filler', '8.0000', '14.00', 'manual']);
  // The owner's own date stays; the issue date (18th) is not after it (18th), so it is filled.
  assert.deepEqual([m.SAZX.pay, m.SAZX.warrant_no, m.SAZX.issue, m.SAZX.dps], ['2026-11-18', '26029354', '2026-11-18', '5.0000']);

  // The same report again: every row is already on file with all its details.
  assert.deepEqual(await save(W, report), { added: 0, completed: 0, skipped: 3 });
});

test('results name the dividend and the outcome of every row; a hand entry made after the report is not a second dividend', async () => {
  const X = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, 'x@test')`, [X]);
  const first = await saveFull(X, [cdcRow({ symbol: 'HUBX', payment_date: '2026-11-21', warrant_no: '61094295', shares: '1', gross_amount: '5.00', tax_amount: '1.00', net_amount: '4.00' })]);
  assert.equal(first.results[0].action, 'added');
  // The owner then types the same payment by hand (a day later, the day it reached the bank).
  const hand = await saveFull(X, [{ symbol: 'HUBX', payment_date: '2026-11-22', shares: '1', gross_amount: '5.00', tax_amount: '1.00', net_amount: '4.00', dps: '5', dividend_type: 'interim', source: 'manual' }]);
  assert.deepEqual([hand.added, hand.completed, hand.results[0].action, hand.results[0].id], [0, 1, 'completed', first.results[0].id]);
  const n = await asUser(db, X, async () => (await one(`select count(*)::int n, max(dividend_type) t, max(dps)::text dps from public.stock_dividends`)));
  assert.deepEqual([n.n, n.t, n.dps], [1, 'interim', '5.0000']);
  // The same report row again → skipped, still pointing at that dividend.
  const again = await saveFull(X, [cdcRow({ symbol: 'HUBX', payment_date: '2026-11-21', warrant_no: '61094295', shares: '1', gross_amount: '5.00', tax_amount: '1.00', net_amount: '4.00' })]);
  assert.deepEqual(again.results, [{ id: first.results[0].id, action: 'skipped' }]);
});
