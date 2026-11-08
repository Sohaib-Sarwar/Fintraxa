/**
 * Profiles, avatars and username sign-in support
 * (supabase/migrations/20261108160000_profiles_avatars_username_login.sql) on PGlite.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser, as } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

before(async () => {
  db = await createDb({ seed: (d) => d.query(`insert into auth.users (id, email) values ($1, 'u@test.pk'), ($2, 'v@test.pk')`, [U, V]) });
});

const upsertProfile = (uid, o) => {
  const r = { user_id: uid, ...o };
  const cols = Object.keys(r);
  return db.query(`insert into public.profiles (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
    on conflict (user_id) do update set ${cols.filter((c) => c !== 'user_id').map((c) => `${c} = excluded.${c}`).join(', ') || 'user_id = excluded.user_id'}`, Object.values(r));
};

test('a user saves their profile; filer by default; zakat exemption off', async () => {
  await asUser(db, U, () => upsertProfile(U, { username: 'sohaib', full_name: 'Sohaib', date_of_birth: '1998-05-01' }));
  const p = await one(`select username, filer_status, zakat_exempt from public.profiles where user_id = $1`, [U]);
  assert.deepEqual([p.username, p.filer_status, p.zakat_exempt], ['sohaib', 'filer', false]);
});

test('usernames: lowercase 3–24 characters, unique; availability check', async () => {
  for (const bad of ['Sohaib', 'ab', 'a b', '.dot', 'end.', 'x'.repeat(25)]) {
    await assert.rejects(asUser(db, V, () => upsertProfile(V, { username: bad })), /check constraint/, bad);
  }
  await assert.rejects(asUser(db, V, () => upsertProfile(V, { username: 'sohaib' })), /duplicate key/);
  const free = await asUser(db, V, async () => (await one(`select public.username_available('Sohaib ') ok`)).ok);
  assert.equal(free, false, 'case and spaces do not get around it');
  assert.equal(await asUser(db, U, async () => (await one(`select public.username_available('sohaib') ok`)).ok), true, 'your own name counts as available to you');
  await asUser(db, V, () => upsertProfile(V, { username: 'v.user_2' }));
});

test('each user reads and edits only their own profile; the avatar path must be in their folder', async () => {
  const seen = await asUser(db, V, async () => (await db.query(`select username from public.profiles`)).rows.map((r) => r.username));
  assert.deepEqual(seen, ['v.user_2']);
  const upd = await asUser(db, V, () => db.query(`update public.profiles set full_name = 'x' where user_id = $1`, [U]));
  assert.equal(upd.affectedRows, 0);
  await assert.rejects(asUser(db, U, () => upsertProfile(U, { avatar_path: `${V}/a.webp` })), /avatar_path_check/);
  await asUser(db, U, () => upsertProfile(U, { avatar_path: `${U}/avatar-1.webp` }));
});

test('username sign-in support: service role only; same answer shape for unknown names; locks after five failures', async () => {
  await assert.rejects(asUser(db, U, () => db.query(`select public.username_login_check('sohaib')`)), /permission denied/);
  await assert.rejects(db.exec('set role anon').then(() => db.query(`select public.username_login_check('sohaib')`)).finally(() => db.exec('reset role')), /permission denied/);
  const check = (name) => as(db, 'service_role', {}, async () => (await one(`select public.username_login_check($1) r`, [name])).r);
  const record = (name, ok) => as(db, 'service_role', {}, () => db.query(`select public.username_login_record($1, $2)`, [name, ok]));
  assert.deepEqual(await check('Sohaib'), { locked: false, email: 'u@test.pk' });
  assert.deepEqual(await check('nobody'), { locked: false, email: null });
  for (let i = 0; i < 5; i++) await record('sohaib', false);
  assert.equal((await check('sohaib')).locked, true);
  for (let i = 0; i < 5; i++) await record('nobody', false);
  assert.equal((await check('nobody')).locked, true, 'unknown names lock the same way, so locking reveals nothing');
  await record('sohaib', true);
  assert.equal((await check('sohaib')).locked, false, 'a success clears the failures');
});
