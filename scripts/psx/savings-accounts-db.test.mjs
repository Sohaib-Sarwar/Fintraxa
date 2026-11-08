/**
 * Savings accounts (supabase/migrations/20261108150000_savings_accounts.sql) on PGlite:
 * own rows only, unique names, entries may only point at the owner's accounts,
 * an account with entries cannot be deleted (archive instead).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
let mine; let theirs; let savingsCat;

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test'), ($2, 'v@test')`, [U, V]) });
  await db.exec('grant select, insert, update, delete on public.categories, public.income_expense_transactions to authenticated');
  savingsCat = (await asUser(db, U, () => one(`insert into public.categories (user_id, name, type, icon, kind, default_tax_rate) values ($1, 'Savings profit', 'income', 'Savings', 'passive', 0.2) returning id`, [U]))).id;
});

const addAccount = (uid, name, extra = {}) => {
  const r = { user_id: uid, bank_symbol: 'MEBL', bank_name: 'Meezan Bank', name, profit_rate: 9.5, ...extra };
  const cols = Object.keys(r);
  return db.query(`insert into public.savings_accounts (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning id, tax_rate::text`, Object.values(r));
};

test('a user adds accounts; tax defaults to 20%; names are unique per user, not across users', async () => {
  const a = (await asUser(db, U, () => addAccount(U, 'Meezan savings'))).rows[0];
  mine = a.id;
  assert.equal(a.tax_rate, '0.2000');
  await assert.rejects(asUser(db, U, () => addAccount(U, 'Meezan savings')), /duplicate key/);
  theirs = (await asUser(db, V, () => addAccount(V, 'Meezan savings'))).rows[0].id;
  await assert.rejects(asUser(db, U, () => addAccount(U, 'Bad', { bank_symbol: 'meezan' })), /check constraint/);
  await assert.rejects(asUser(db, U, () => addAccount(U, '   ')), /check constraint/);
  await assert.rejects(asUser(db, U, () => addAccount(U, 'Rate', { profit_rate: 150 })), /check constraint/);
});

test('each user sees only their own accounts', async () => {
  const n = await asUser(db, U, async () => (await one(`select count(*)::int n from public.savings_accounts`)).n);
  assert.equal(n, 1);
});

const credit = (uid, accountId, amount = 213.59) => db.query(
  `insert into public.income_expense_transactions (user_id, type, category_id, date, amount, gross_amount, tax_amount, tax_rate, savings_account_id)
   values ($1, 'credit', $2, '2026-10-01', $3, 266.99, 53.40, 0.2, $4)`, [uid, savingsCat, amount, accountId]);

test('a savings profit entry points at the owner’s own account only', async () => {
  await asUser(db, U, () => credit(U, mine));
  await assert.rejects(asUser(db, U, () => credit(U, theirs)), /does not belong to you/);
  const r = await one(`select count(*)::int n from public.income_expense_transactions where savings_account_id = $1`, [mine]);
  assert.equal(r.n, 1);
});

test('an account with entries cannot be deleted; it can be archived', async () => {
  await assert.rejects(asUser(db, U, () => db.query(`delete from public.savings_accounts where id = $1`, [mine])), /foreign key/);
  await asUser(db, U, () => db.query(`update public.savings_accounts set archived = true where id = $1`, [mine]));
  const a = await one(`select archived from public.savings_accounts where id = $1`, [mine]);
  assert.equal(a.archived, true);
});
