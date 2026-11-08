/**
 * Benchmark + categories migrations on PGlite (20261109100000_index_benchmark.sql,
 * 20261109101000_delete_category.sql): index closes are readable and not writable by users,
 * the daily-return view, portfolio return columns, and delete-with-move for categories.
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
  await db.exec('grant select, insert, update, delete on public.categories, public.income_expense_transactions to authenticated');
});

test('index closes: users read them, cannot write; the view gives each day\'s return', async () => {
  await db.query(`insert into public.market_index_history (index_code, price_date, close) values
    ('KSE100', '2026-01-02', 100000), ('KSE100', '2026-01-05', 102000), ('KSE100', '2026-01-06', 99960)`);
  const rows = await asUser(db, U, () => all(`select price_date::text d, round(day_return::numeric, 4)::float8 r from public.market_index_daily order by 1`));
  assert.deepEqual(rows, [{ d: '2026-01-02', r: null }, { d: '2026-01-05', r: 0.02 }, { d: '2026-01-06', r: -0.02 }]);
  await assert.rejects(asUser(db, U, () => db.query(`insert into public.market_index_history (index_code, price_date, close) values ('KSE100', '2026-01-07', 1)`)), /permission denied/);
});

test('portfolio snapshots carry the daily return fields', async () => {
  await db.query(`insert into public.portfolio_snapshots (user_id, snap_date, engine_version, stocks_flow_day, stocks_dividend_day, stocks_return_day)
                  values ($1, '2026-01-05', 'test', 1000, 25, 0.0125)`, [U]);
  const r = await asUser(db, U, () => one(`select stocks_flow_day::float8 f, stocks_dividend_day::float8 d, stocks_return_day::float8 r from public.portfolio_snapshots where snap_date = '2026-01-05'`));
  assert.deepEqual(r, { f: 1000, d: 25, r: 0.0125 });
});

test('delete_category: moves the transactions to a category of the same type, then deletes; guards the rest', async () => {
  const cat = async (uid, name, type, kind) => (await one(
    `insert into public.categories (user_id, name, type, kind, icon, is_default) values ($1, $2, $3, $4, 'MoreHoriz', false) returning id`, [uid, name, type, kind])).id;
  const food = await cat(U, 'Food', 'expense', 'spend');
  const groceries = await cat(U, 'Groceries', 'expense', 'spend');
  const salary = await cat(U, 'Salary', 'income', 'active');
  const theirs = await cat(V, 'Other', 'expense', 'spend');
  const crypto = await cat(U, 'Investment - Crypto', 'expense', 'transfer');
  for (const amt of [100, 250]) {
    await db.query(`insert into public.income_expense_transactions (user_id, category_id, type, amount, date) values ($1, $2, 'debit', $3, '2026-01-10')`, [U, food, amt]);
  }
  const call = (id, to) => asUser(db, U, () => one(`select public.delete_category($1, $2) n`, [id, to]));

  await assert.rejects(call(food, null), /still use this category/);           // in use, nowhere to go
  await assert.rejects(call(food, salary), /same type/);                        // income ≠ expense
  await assert.rejects(call(food, theirs), /another of your categories/);       // not mine
  await assert.rejects(call(crypto, null), /used by the app/);                  // system category
  await assert.rejects(asUser(db, V, () => one(`select public.delete_category($1, null)`, [groceries])), /not found/);

  assert.equal((await call(food, groceries)).n, 2);
  assert.equal((await one(`select count(*)::int n from public.categories where id = $1`, [food])).n, 0);
  assert.equal((await one(`select count(*)::int n from public.income_expense_transactions where category_id = $1`, [groceries])).n, 2);
  assert.equal((await call(salary, null)).n, 0);                                // unused: just deleted
});
