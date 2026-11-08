/**
 * Personal finance schema (supabase/migrations/20261108140000_personal_finance_passive.sql)
 * on PGlite: category kinds, gross/tax on income, and monthly passive postings.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const thisMonth = new Date().toISOString().slice(0, 7);

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test'), ($2, 'v@test')`, [U, V]) });
  // Supabase grants table privileges to the API roles by default; PGlite does not. RLS still applies.
  await db.exec('grant select, insert, update, delete on public.categories, public.income_expense_transactions to authenticated');
});

const cat = (uid, name, type, extra = {}) => {
  const r = { user_id: uid, name, type, icon: 'Category', ...extra };
  const cols = Object.keys(r);
  return db.query(`insert into public.categories (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id, kind`, Object.values(r));
};

test('category kind fills itself: income → active, expense → spend; a mismatched kind is refused', async () => {
  const a = (await asUser(db, U, () => cat(U, 'Salary', 'income'))).rows[0];
  const b = (await asUser(db, U, () => cat(U, 'Food', 'expense'))).rows[0];
  const c = (await asUser(db, U, () => cat(U, 'Savings profit', 'income', { kind: 'passive', default_tax_rate: 0.2 }))).rows[0];
  assert.deepEqual([a.kind, b.kind, c.kind], ['active', 'spend', 'passive']);
  await assert.rejects(asUser(db, U, () => cat(U, 'Odd', 'income', { kind: 'spend' })), /categories_kind_check/);
  await assert.rejects(asUser(db, U, () => cat(U, 'Odd2', 'expense', { kind: 'passive' })), /categories_kind_check/);
  await assert.rejects(asUser(db, U, () => cat(U, 'Odd3', 'income', { default_tax_rate: 1.5 })), /check constraint/);
});

test('savings profit: amount must equal gross − tax; partial tax fields are refused', async () => {
  const c = await one(`select id from public.categories where user_id = $1 and name = 'Savings profit'`, [U]);
  const ins = (o) => {
    const r = { user_id: U, type: 'credit', category_id: c.id, date: '2026-10-01', ...o };
    const cols = Object.keys(r);
    return db.query(`insert into public.income_expense_transactions (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(r));
  };
  // 266.99 gross, 20% = 53.40 tax, 213.59 net (bank rounds to the paisa)
  await asUser(db, U, () => ins({ amount: 213.59, gross_amount: 266.99, tax_amount: 53.40, tax_rate: 0.2 }));
  await assert.rejects(asUser(db, U, () => ins({ amount: 213.60, gross_amount: 266.99, tax_amount: 53.40 })), /tax_check/);
  await assert.rejects(asUser(db, U, () => ins({ amount: 100, gross_amount: 120 })), /tax_check/);
  await assert.rejects(asUser(db, U, () => ins({ amount: 10, gross_amount: 5, tax_amount: -5 })), /tax_check/);
  await asUser(db, U, () => ins({ amount: 5000 })); // an ordinary income without gross/tax is unaffected
});

const sync = (uid, rows, engine = 'test-1') => asUser(db, uid, async () => (await one(`select public.sync_passive_postings('mutual_funds', $1::jsonb, $2) as r`, [JSON.stringify(rows), engine])).r);
const posted = (uid) => db.query(`select to_char(period, 'YYYY-MM') m, gross::text, tax::text, net::text from public.passive_income_postings where user_id = $1 order by period`, [uid]).then((r) => r.rows);

test('postings: closed months inserted, a changed month updated, a vanished month removed', async () => {
  let r = await sync(U, [
    { period: '2026-07-01', gross: 734.23, tax: 175, charges: 0, net: 559.23, sales: 3 },
    { period: '2026-08-01', gross: 5700.11, tax: 1334, charges: 0, net: 4366.11, sales: 4 },
  ]);
  assert.deepEqual(r, { changed: 2, removed: 0 });
  r = await sync(U, [
    { period: '2026-07-01', gross: 734.23, tax: 175, charges: 0, net: 559.23, sales: 3 },  // unchanged: not rewritten
    { period: '2026-08-01', gross: 5800.11, tax: 1334, charges: 0, net: 4466.11, sales: 5 }, // statement corrected
  ]);
  assert.deepEqual(r, { changed: 1, removed: 0 });
  r = await sync(U, [{ period: '2026-08-01', gross: 5800.11, tax: 1334, charges: 0, net: 4466.11, sales: 5 }]);
  assert.deepEqual(r, { changed: 0, removed: 1 });
  assert.deepEqual(await posted(U), [{ m: '2026-08', gross: '5800.11', tax: '1334.00', net: '4466.11' }]);
});

test('postings: the open month, a bad net, or another source is refused; nothing half-written', async () => {
  await assert.rejects(sync(U, [{ period: `${thisMonth}-01`, gross: 1, tax: 0, net: 1 }]), /Only closed months/);
  await assert.rejects(sync(U, [{ period: '2026-06-01', gross: 100, tax: 10, net: 95 }]), /net_check/);
  await assert.rejects(asUser(db, U, () => db.query(`select public.sync_passive_postings('rent', '[]'::jsonb, 'x')`)), /Unknown passive income source/);
  assert.equal((await posted(U)).length, 1, 'the failed calls changed nothing');
});

test('postings: each user sees and replaces only their own; anonymous cannot call it', async () => {
  await sync(V, [{ period: '2026-05-01', gross: 50, tax: 5, net: 45 }]);
  const seen = await asUser(db, V, async () => (await db.query(`select count(*)::int n from public.passive_income_postings`)).rows[0].n);
  assert.equal(seen, 1);
  await sync(V, []); // V clears theirs; U's must survive
  assert.equal((await posted(U)).length, 1);
  await assert.rejects(db.exec('set role anon').then(() => db.query(`select public.sync_passive_postings('mutual_funds', '[]'::jsonb, 'x')`)).finally(() => db.exec('reset role')), /permission denied/);
});
