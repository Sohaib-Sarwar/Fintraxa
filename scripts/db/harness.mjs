/**
 * Local Postgres for migration and RPC tests: PGlite (real Postgres compiled
 * to WASM) plus the minimum of Supabase that the migrations touch — the
 * `auth` and `storage` schemas, the API roles, and JWT claims via
 * `request.jwt.claims`, which is how PostgREST hands them to Postgres.
 *
 * What this cannot reproduce: PostgREST itself, real concurrency (PGlite is a
 * single connection), Storage, and Edge Functions. Those are exercised by
 * `scripts/mf-integration-test.mjs` against the live project as the QA user.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant anon, authenticated, service_role to postgres;

  create schema extensions;
  create or replace function extensions.uuid_generate_v4() returns uuid
    language sql as 'select gen_random_uuid()';
  grant usage on schema extensions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb default '{}',
    raw_app_meta_data jsonb default '{}',
    created_at timestamptz default now(),
    last_sign_in_at timestamptz
  );
  create or replace function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;
  grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (
    id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
    $$;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;

  -- pg_net stand-in: http_get records the request and returns its id; a test
  -- writes the "response" into net._http_response itself.
  create schema net;
  create table net.http_request_queue (id bigserial primary key, url text, created timestamptz default now());
  create table net._http_response (
    id bigint primary key, status_code integer, content_type text, headers jsonb,
    content text, timed_out boolean, error_msg text, created timestamptz default now()
  );
  create or replace function net.http_get(url text, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ insert into net.http_request_queue (url) values (url) returning id $$;

  -- pg_cron stand-in: schedules are rows; nothing runs on its own.
  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
  create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  create or replace function cron.unschedule(job_id bigint) returns boolean language sql as $$
    with d as (delete from cron.job where jobid = job_id returning 1) select exists (select 1 from d) $$;
  create or replace function cron.unschedule(job_name text) returns boolean language sql as $$
    with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d) $$;
  create or replace function net.http_post(url text, body jsonb default null, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language sql as $$ insert into net.http_request_queue (url) values (url) returning id $$;

  -- pgcrypto / Vault stand-ins: random bytes, and secrets kept in a plain table.
  create or replace function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
    select substring(decode(md5(random()::text) || md5(random()::text) || md5(random()::text), 'hex') from 1 for n) $$;
  create schema vault;
  create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text not null, description text);
  create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
    returns uuid language sql as $$ insert into vault.secrets (name, secret, description) values (new_name, new_secret, new_description) returning id $$;
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret, description from vault.secrets;
`;

/** Migrations in apply order. The 2025 file is superseded by the baseline. */
export function migrationFiles() {
  const dir = join(root, 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('2025'))
    .sort()
    .map((f) => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }));
}

export async function createDb({ seed } = {}) {
  const db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  if (seed) await seed(db);
  for (const m of migrationFiles()) {
    const sql = m.sql
      .replace(/create extension if not exists "uuid-ossp"[^;]*;/i, '')
      .replace(/create extension if not exists pg_net[^;]*;/i, '')
      .replace(/create extension if not exists pg_cron[^;]*;/i, '');
    try {
      await db.exec(sql);
    } catch (err) {
      err.message = `${m.name}: ${err.message}`;
      throw err;
    }
  }
  return db;
}

/** Run `fn` as an API role with the given JWT claims, then reset. */
export async function as(db, role, claims, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify(claims ?? {})]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}

export const asUser = (db, uid, fn, extra = {}) =>
  as(db, 'authenticated', { sub: uid, role: 'authenticated', ...extra }, fn);
export const asService = (db, fn) => as(db, 'service_role', { role: 'service_role' }, fn);
