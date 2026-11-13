/**
 * Mobile app preferences and APK release catalogue
 * (supabase/migrations/20261113120000_mobile_app_preferences_releases.sql) on PGlite.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, as, asUser, asService } from '../db/harness.mjs';

let db;
const U = randomUUID();
const V = randomUUID();
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

before(async () => {
  db = await createDb({
    seed: async (d) => {
      // Same default privileges as a real Supabase project (ALL on new public tables to the API roles),
      // so the test proves the migration's own revokes, not the harness's missing grants.
      await d.exec(`alter default privileges in schema public grant all on tables to anon, authenticated, service_role`);
      await d.query(`insert into auth.users (id, email) values ($1, 'u@test.pk'), ($2, 'v@test.pk')`, [U, V]);
    },
  });
});

test('existing preference rows keep working: tracks everything, auto-lock 5 min by default', async () => {
  await asUser(db, U, () => db.query(`insert into public.user_preferences (user_id, currency) values ($1, 'PKR')`, [U]));
  const p = await one(`select tracks, auto_lock_minutes from public.user_preferences where user_id = $1`, [U]);
  assert.deepEqual(p.tracks, { spending: true, funds: true, stocks: true });
  assert.equal(p.auto_lock_minutes, 5);
});

test('a user updates what they track and their auto-lock; shape and range are enforced', async () => {
  await asUser(db, U, () => db.query(`update public.user_preferences set tracks = '{"spending": true, "funds": false, "stocks": true}', auto_lock_minutes = 0 where user_id = $1`, [U]));
  const p = await one(`select tracks, auto_lock_minutes from public.user_preferences where user_id = $1`, [U]);
  assert.equal(p.tracks.funds, false);
  assert.equal(p.auto_lock_minutes, 0);
  for (const bad of [`'[]'`, `'{"funds": "no"}'`]) {
    await assert.rejects(asUser(db, U, () => db.query(`update public.user_preferences set tracks = ${bad} where user_id = $1`, [U])), /check constraint/, bad);
  }
  await assert.rejects(asUser(db, U, () => db.query(`update public.user_preferences set auto_lock_minutes = 61 where user_id = $1`, [U])), /check constraint/);
});

test('another user cannot read or change my preferences', async () => {
  const seen = await asUser(db, V, () => db.query(`select 1 from public.user_preferences where user_id = $1`, [U]));
  assert.equal(seen.rows.length, 0);
  await asUser(db, V, () => db.query(`update public.user_preferences set auto_lock_minutes = 15 where user_id = $1`, [U]));
  assert.equal((await one(`select auto_lock_minutes from public.user_preferences where user_id = $1`, [U])).auto_lock_minutes, 0);
});

test('releases: owner (service role) writes, signed-in users only read', async () => {
  await asService(db, () => db.query(`insert into public.app_releases (version_code, version_name, apk_url, notes, min_supported_code)
    values (1, '1.0.0', 'https://expo.dev/artifacts/x.apk', 'First release', 1)`));
  const rows = await asUser(db, U, () => db.query(`select version_name, channel from public.app_releases`));
  assert.deepEqual(rows.rows, [{ version_name: '1.0.0', channel: 'production' }]);
  await assert.rejects(asUser(db, U, () => db.query(`insert into public.app_releases (version_code, version_name, apk_url) values (2, '1.0.1', 'https://x/y.apk')`)), /permission denied/);
  await assert.rejects(asUser(db, U, () => db.query(`delete from public.app_releases`)), /permission denied/);
  await assert.rejects(asUser(db, U, () => db.query(`truncate public.app_releases`)), /permission denied/);
  await assert.rejects(as(db, 'anon', {}, () => db.query(`select 1 from public.app_releases`)), /permission denied/);
  await assert.rejects(asService(db, () => db.query(`insert into public.app_releases (version_code, version_name, apk_url) values (3, '1.0.2', 'http://insecure/y.apk')`)), /check constraint/);
});
