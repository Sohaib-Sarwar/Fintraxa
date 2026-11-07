/**
 * Live integration test against the production project, as the QA user
 * (QA_EMAIL / QA_PASSWORD in .env.local; the account must have
 * app_metadata.qa = true). Starts by purging the QA user's own MF data.
 *
 * Covers what PGlite cannot: the deployed Edge Function, Storage, real
 * concurrency, RLS through PostgREST.
 *
 *   MF_STATEMENTS_DIR=… npm run test:integration
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Decimal from 'decimal.js';
import { loadEnv, requireEnv } from './lib/env.mjs';
import { computePortfolio } from '../src/lib/mf/engine.js';

const env = loadEnv();
requireEnv(env, 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'QA_EMAIL', 'QA_PASSWORD');
const here = dirname(fileURLToPath(import.meta.url));
const DIR = env.MF_STATEMENTS_DIR ?? join(here, '..', '..', 'Mutual Fund Real Transactions Statements');
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

let pass = 0, fail = 0;
const results = [];
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    pass++; results.push(`✔ ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    fail++; results.push(`✖ ${name}: ${e.message}`);
  }
  console.log(results[results.length - 1]);
}
const assert = (c, msg) => { if (!c) throw new Error(msg); };

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: env.QA_EMAIL, password: env.QA_PASSWORD });
if (authErr) { console.error('QA sign-in failed:', authErr.message); process.exit(1); }
const uid = auth.user.id;

async function upload(file) {
  const bytes = readFileSync(join(DIR, file));
  const sha = createHash('sha256').update(bytes).digest('hex');
  const path = `${uid}/${sha}.pdf`;
  const { error } = await sb.storage.from('mf-statements').upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`upload: ${error.message}`);
  return path;
}
async function invoke(path) {
  const { data, error } = await sb.functions.invoke('mf-import', { body: { storage_path: path, file_label: 'qa.pdf' } });
  if (error) {
    let body = null; try { body = await error.context?.json?.(); } catch { /* ignore */ }
    const e = new Error(body?.error ?? error.message); e.status = error.context?.status; e.body = body; throw e;
  }
  return data;
}
const ledgerCount = async () => (await sb.from('mf_ledger_entries').select('id', { count: 'exact', head: true }).eq('user_id', uid)).count;

const files = ['Meezan Funds/Meezan.pdf', 'Meezan Funds/meezan 2.pdf', 'NBP Funds/NBP statment.pdf', 'MCB FUNDS/MCB FUnds Statement.pdf', 'UBL Funds/UBL Funds_statement.pdf', 'Atlas Funds/Atlas Funds.pdf']
  .filter((f) => existsSync(join(DIR, f)));
if (!files.length) { console.error(`No statements found in ${DIR}`); process.exit(2); }

await check('QA purge clears the QA user\'s own data (and only works for QA)', async () => {
  const { error } = await sb.rpc('mf_qa_purge_my_data');
  assert(!error, error?.message);
  assert((await ledgerCount()) === 0, 'ledger not empty after purge');
});

const first = files[0];
let firstResult;
await check(`import ${first}: processed, every row added automatically`, async () => {
  firstResult = await invoke(await upload(first));
  const s = firstResult.summary;
  assert(s.events > 0, 'no events');
  assert(s.auto_approved === s.events, `auto ${s.auto_approved} of ${s.events}; held ${JSON.stringify(s.held_sections)}`);
  assert(['approved', 'completed_with_warnings'].includes(firstResult.status), firstResult.status);
  assert((await ledgerCount()) === s.events, 'ledger count matches events');
});

await check('same PDF again → same import, nothing re-added', async () => {
  const before = await ledgerCount();
  const r = await invoke(await upload(first));
  assert(r.duplicate_file === true && r.import_id === firstResult.import_id, 'expected duplicate_file');
  assert((await ledgerCount()) === before, 'ledger grew');
});

await check('approving already-approved rows twice in parallel adds nothing', async () => {
  const { data: rows } = await sb.from('mf_staged_transactions').select('id').eq('import_id', firstResult.import_id);
  const before = await ledgerCount();
  const ids = rows.map((r) => r.id);
  const calls = await Promise.all([1, 2].map(() => sb.rpc('mf_approve_staged', { p_import_id: firstResult.import_id, p_staged_ids: ids, p_idempotency_key: randomUUID(), p_mode: 'manual' })));
  for (const c of calls) assert(!c.error, c.error?.message);
  assert((await ledgerCount()) === before, 'ledger grew under concurrent approval');
});

for (const f of files.slice(1)) {
  await check(`import ${f}: processed and reconciled`, async () => {
    const before = await ledgerCount();
    const r = await invoke(await upload(f));
    const s = r.summary;
    assert(s.events > 0, 'no events');
    const recon = (await sb.from('mf_statement_imports').select('reconciliation').eq('id', r.import_id).single()).data.reconciliation;
    const material = recon.sections.filter((x) => x.status === 'material');
    assert(!material.length, `material: ${material.map((m) => m.section_key)}`);
    assert((await ledgerCount()) === before + s.auto_approved, 'ledger grew by exactly the auto-approved count');
    if (s.needs_review) console.log(`   note: ${s.needs_review} held for review (${JSON.stringify(s.held_sections)}) continuity=${JSON.stringify(s.continuity)}`);
  });
}

await check('concurrent uploads of one new file create exactly one import and no duplicate ledger rows', async () => {
  await sb.rpc('mf_qa_purge_my_data');
  const path = await upload(files[0]);
  const settled = await Promise.allSettled([1, 2, 3].map(() => invoke(path)));
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  assert(ok.length >= 1, `all failed: ${settled.map((s) => s.reason?.message).join('; ')}`);
  const ids = new Set(ok.map((r) => r.import_id));
  assert(ids.size === 1, `imports: ${ids.size}`);
  const rejected = settled.filter((s) => s.status === 'rejected').map((s) => s.reason?.status);
  assert(rejected.every((st) => st === 409), `unexpected failures: ${rejected}`);
  const { count } = await sb.from('mf_statement_imports').select('id', { count: 'exact', head: true }).eq('user_id', uid);
  assert(count === 1, `import rows ${count}`);
  const events = ok.find((r) => r.summary?.events)?.summary.events;
  assert((await ledgerCount()) === events, `ledger ${await ledgerCount()} vs events ${events}`);
});

await check('RLS: only the QA user\'s rows are visible', async () => {
  const { data } = await sb.from('mf_ledger_entries').select('user_id').limit(1000);
  assert(data.every((r) => r.user_id === uid), 'saw another user\'s rows');
  const { error } = await sb.from('mf_ledger_entries').insert({ user_id: uid, account_id: randomUUID(), fund_id: randomUUID(), entry_type: 'purchase', trade_date: '2026-01-01', cash_direction: 'investor_pays', origin: 'manual' });
  assert(error, 'direct ledger insert should be refused');
});

await check('profit from the live ledger matches the AMC\'s own "To Date" figure (Meezan)', async () => {
  await sb.rpc('mf_qa_purge_my_data');
  const mz = files.filter((f) => /meezan/i.test(f));
  for (const f of mz) await invoke(await upload(f));
  const cols = 'id, account_id, fund_id, unit_class, entry_type, trade_date, seq, created_at, reverses_entry_id, nav::text, unit_delta::text, gross_amount::text, net_amount::text';
  const { data: entries } = await sb.from('mf_ledger_entries').select(cols).eq('user_id', uid);
  const { data: comps } = await sb.from('mf_ledger_components').select('entry_id, component_type, amount::text').eq('user_id', uid);
  const { data: imps } = await sb.from('mf_statement_imports').select('summary, period_end').eq('user_id', uid).order('period_end', { ascending: false });
  const reported = imps[0].summary.amc_reported.funds;
  const total = Object.values(reported).reduce((s, x) => s.plus(x.to_date_gain.replace(/,/g, '')), new Decimal(0));
  const p = computePortfolio({ entries, components: comps, prices: [], asOf: imps[0].period_end });
  const diff = p.totals.netProfit.minus(total).abs();
  assert(diff.lte(entries.length * 0.5), `engine ${p.totals.netProfit.toFixed(2)} vs AMC ${total.toFixed(0)}`);
  console.log(`   engine net profit ${p.totals.netProfit.toFixed(2)} vs AMC-reported ${total.toFixed(0)} (statements round to the rupee)`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
