/**
 * Database tests on PGlite with the real migrations: RLS, append-only
 * ledger, duplicate classification, idempotent approval, reversals, legacy
 * copy, QA purge. Concurrency is covered against the live project by
 * scripts/mf-integration-test.mjs (PGlite is a single connection).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, asUser, asService } from '../db/harness.mjs';

const A = randomUUID();
const B = randomUUID();
const LEGACY_ID = randomUUID();
let db;

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const all = async (sql, params) => (await db.query(sql, params)).rows;

before(async () => {
  db = await createDb({
    seed: async (d) => {
      await d.query(`insert into auth.users (id, email) values ($1, 'a@test'), ($2, 'b@test')`, [A, B]);
    },
  });
  // A legacy row inserted after migration is mirrored by the trigger.
  await db.query(`insert into public.mutual_fund_transactions (id, user_id, fund_id, fund_name, nav, investment_amount, units, type, date)
                  values ($1, $2, 'meezan-islamic-fund', 'Meezan Islamic Fund', 150, 15000, 100, 'buy', '2026-01-10')`, [LEGACY_ID, A]);
});

/** Stage an import for `uid` with the given events (service role, like the Edge Function). */
async function stageImport(uid, sha, events, { fundName = 'Meezan Cash Fund', accountHash = 'f'.repeat(64) } = {}) {
  return asService(db, async () => {
    const amc = await one(`select id from public.mf_amcs where code = 'meezan'`);
    await db.query(`insert into public.mf_accounts (user_id, amc_id, account_ref_hash, account_ref_masked)
                    values ($1, $2, $3, '••111') on conflict do nothing`, [uid, amc.id, accountHash]);
    const acct = await one(`select id from public.mf_accounts where user_id = $1 and amc_id = $2 and account_ref_hash = $3`, [uid, amc.id, accountHash]);
    await db.query(`insert into public.mf_funds (amc_id, name, mufap_slug) values ($1, $2, $3) on conflict do nothing`,
      [amc.id, fundName, fundName.toLowerCase().replace(/[^a-z0-9]+/g, '-')]);
    const fund = await one(`select id from public.mf_funds where amc_id = $1 and name = $2`, [amc.id, fundName]);
    const imp = await one(`insert into public.mf_statement_imports (user_id, file_sha256, storage_path, file_size_bytes, status, amc_id, account_id)
                           values ($1, $2, $3, 1000, 'validating', $4, $5) returning id`, [uid, sha, `${uid}/${sha}.pdf`, amc.id, acct.id]);
    for (const [i, e] of events.entries()) {
      await db.query(`insert into public.mf_staged_transactions
        (import_id, user_id, source_key, seq, line_ids, section_key, fund_id, original_label, entry_type, trade_date, nav,
         unit_delta, gross_amount, net_amount, cash_direction, components, raw_extraction, evidence_ok, review_status, external_ref)
        values ($1,$2,$3,$4,$5,'s',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'{}',true,$16,$17)`,
      [imp.id, uid, `p1-l${i + 1}`, i + 1, [`p1-l${i + 1}`], fund.id, e.label ?? e.type, e.type, e.date, e.nav ?? null,
        e.units ?? null, e.gross ?? null, e.net ?? null, e.dir, JSON.stringify(e.components ?? []), e.status ?? 'pending_review', e.ref ?? null]);
    }
    const classified = await one(`select public.mf_service_classify_import($1) as r`, [imp.id]);
    return { importId: imp.id, fundId: fund.id, accountId: acct.id, classified: classified.r };
  });
}

const staged = (importId) => all(`select id, seq, duplicate_status, review_status, fingerprint, occurrence_index
                                   from public.mf_staged_transactions where import_id = $1 order by seq`, [importId]);
const approve = (uid, importId, ids, key = randomUUID(), mode = 'manual') =>
  asUser(db, uid, async () => (await one(`select public.mf_approve_staged($1, $2, $3, $4) as r`, [importId, ids, key, mode])).r);

const SAME_DAY = [
  { type: 'purchase', date: '2026-02-20', nav: '54.5348', units: '91.6846', gross: '5000', net: '5000', dir: 'investor_pays' },
  // Two conversions out on one date for the same amount but different units:
  // genuinely different transactions that a date+amount dedupe would merge.
  { type: 'switch_out', date: '2026-02-26', nav: '54.6151', units: '-50.0000', gross: '2731', net: '2730', dir: 'internal', components: [{ type: 'cgt', amount: '1' }] },
  { type: 'switch_out', date: '2026-02-26', nav: '54.6151', units: '-49.9634', gross: '2729', net: '2730', dir: 'internal', components: [{ type: 'cgt', amount: '1' }] },
];

test('migrations seed AMCs with cost-method evidence', async () => {
  const r = await all(`select code, cost_method_evidence from public.mf_amcs where code in ('nbp','meezan','ubl','mcb','atlas') order by code`);
  assert.deepEqual(Object.fromEntries(r.map((x) => [x.code, x.cost_method_evidence])), {
    atlas: 'industry_default', mcb: 'industry_default', meezan: 'statement_consistent', nbp: 'statement_stated', ubl: 'statement_consistent',
  });
});

test('legacy rows are copied (not moved) and the mirror trigger keeps copying', async () => {
  const legacy = await one(`select count(*)::int n from public.mutual_fund_transactions where id = $1`, [LEGACY_ID]);
  assert.equal(legacy.n, 1, 'legacy row still present');
  const e = await one(`select entry_type, unit_delta::text, gross_amount::text, origin from public.mf_ledger_entries where legacy_txn_id = $1`, [LEGACY_ID]);
  assert.deepEqual(e, { entry_type: 'purchase', unit_delta: '100', gross_amount: '15000', origin: 'legacy_migration' });
});

test('same date, same amount, different units → both kept as new; occurrence indexes distinct', async () => {
  const { importId } = await stageImport(A, 'a'.repeat(64), SAME_DAY);
  const rows = await staged(importId);
  assert.deepEqual(rows.map((r) => r.duplicate_status), ['new', 'new', 'new']);
  assert.notEqual(rows[1].fingerprint, rows[2].fingerprint);
  const res = await approve(A, importId, rows.map((r) => r.id));
  assert.equal(res.approved, 3);
  assert.equal(res.status, 'approved');
});

test('re-importing the same events (overlapping statement) → exact duplicates, nothing written twice', async () => {
  const { importId, classified } = await stageImport(A, 'b'.repeat(64), SAME_DAY);
  assert.equal(classified.exact_duplicate, 3);
  const rows = await staged(importId);
  assert.ok(rows.every((r) => r.review_status === 'duplicate'));
  const before = await one(`select count(*)::int n from public.mf_ledger_entries where user_id = $1 and origin = 'statement'`, [A]);
  const res = await approve(A, importId, rows.map((r) => r.id));
  assert.equal(res.approved, 0);
  const after = await one(`select count(*)::int n from public.mf_ledger_entries where user_id = $1 and origin = 'statement'`, [A]);
  assert.equal(after.n, before.n);
  assert.equal(res.status, 'completed_with_warnings');
});

test('two identical-looking legitimate transactions in one statement → both kept (occurrence 1 and 2)', async () => {
  const twin = { type: 'purchase', date: '2026-03-02', nav: '55', units: '10', gross: '550', net: '550', dir: 'investor_pays' };
  const { importId } = await stageImport(A, 'c'.repeat(64), [twin, twin]);
  const rows = await staged(importId);
  assert.equal(rows[0].fingerprint, rows[1].fingerprint);
  assert.deepEqual(rows.map((r) => r.occurrence_index), [1, 2]);
  assert.deepEqual(rows.map((r) => r.duplicate_status), ['same_date_different', 'same_date_different'].map(() => 'new'));
  assert.equal((await approve(A, importId, rows.map((r) => r.id))).approved, 2);
  // A later statement repeating both → both duplicates, none dropped wrongly.
  const again = await stageImport(A, 'd'.repeat(64), [twin, twin]);
  assert.equal(again.classified.exact_duplicate, 2);
});

test('same date, different amount → same_date_different, kept', async () => {
  const { importId } = await stageImport(A, 'e'.repeat(64), [
    { type: 'purchase', date: '2026-03-02', nav: '55', units: '20', gross: '1100', net: '1100', dir: 'investor_pays' }]);
  assert.equal((await staged(importId))[0].duplicate_status, 'same_date_different');
});

test('same values on a different date → new', async () => {
  const { importId } = await stageImport(A, 'f'.repeat(64), [
    { type: 'purchase', date: '2026-03-03', nav: '55', units: '10', gross: '550', net: '550', dir: 'investor_pays' }]);
  assert.equal((await staged(importId))[0].duplicate_status, 'new');
});

test('within rounding of an existing entry (different description format) → probable duplicate, needs review', async () => {
  const { importId } = await stageImport(A, '1'.repeat(64), [
    { type: 'purchase', date: '2026-02-20', nav: '54.5348', units: '91.6846', gross: '5000.40', net: '5000.40', dir: 'investor_pays', label: 'Investment' }]);
  const r = (await staged(importId))[0];
  assert.equal(r.duplicate_status, 'probable_duplicate');
  const res = await approve(A, importId, [r.id], randomUUID(), 'auto');
  assert.equal(res.approved, 0, 'auto approval never takes a probable duplicate');
});

test('approval is idempotent: replaying the key returns the first result', async () => {
  const { importId } = await stageImport(A, '2'.repeat(64), [
    { type: 'purchase', date: '2026-04-01', nav: '56', units: '5', gross: '280', net: '280', dir: 'investor_pays' }]);
  const ids = (await staged(importId)).map((r) => r.id);
  const key = randomUUID();
  const first = await approve(A, importId, ids, key);
  const second = await approve(A, importId, ids, key);
  assert.equal(first.approved, 1);
  assert.equal(second.replayed, true);
  assert.equal(second.approved, 1);
  const n = await one(`select count(*)::int n from public.mf_ledger_entries where source_import_id = $1`, [importId]);
  assert.equal(n.n, 1);
});

test('unknown types cannot be approved; batch rolls back entirely', async () => {
  const { importId } = await stageImport(A, '3'.repeat(64), [
    { type: 'purchase', date: '2026-05-01', nav: '57', units: '1', gross: '57', net: '57', dir: 'investor_pays' },
    { type: 'unknown', date: '2026-05-01', dir: null, status: 'requires_attention' }]);
  const ids = (await staged(importId)).map((r) => r.id);
  await assert.rejects(approve(A, importId, ids), /Classify/);
  const n = await one(`select count(*)::int n from public.mf_ledger_entries where source_import_id = $1`, [importId]);
  assert.equal(n.n, 0, 'nothing from the failed batch was written');
});

test('RLS: another user sees none of A\'s data and cannot approve A\'s import', async () => {
  const seen = await asUser(db, B, () => one(`select (select count(*) from public.mf_ledger_entries)::int l,
    (select count(*) from public.mf_staged_transactions)::int s, (select count(*) from public.mf_statement_imports)::int i`));
  assert.deepEqual(seen, { l: 0, s: 0, i: 0 });
  const imp = await one(`select id from public.mf_statement_imports where user_id = $1 limit 1`, [A]);
  await assert.rejects(approve(B, imp.id, [randomUUID()]), /Import not found/);
});

test('clients cannot write the ledger directly, and history is append-only', async () => {
  await assert.rejects(asUser(db, A, () => db.query(`insert into public.mf_ledger_entries (user_id, account_id, fund_id, entry_type, trade_date, cash_direction, origin)
    select user_id, account_id, fund_id, 'purchase', '2026-01-01', 'investor_pays', 'manual' from public.mf_ledger_entries limit 1`)), /permission denied/);
  await assert.rejects(asUser(db, A, () => db.query(`update public.mf_ledger_entries set gross_amount = 1`)), /permission denied/);
  await assert.rejects(asService(db, () => db.query(`delete from public.mf_ledger_entries`)), /append-only/);
});

test('reversal appends a mirror entry and cannot be repeated', async () => {
  const e = await one(`select id from public.mf_ledger_entries where user_id = $1 and origin = 'statement' order by trade_date limit 1`, [A]);
  const rid = await asUser(db, A, async () => (await one(`select public.mf_reverse_entry($1, 'wrong fund') as r`, [e.id])).r);
  const pair = await all(`select id, reverses_entry_id, unit_delta::numeric u from public.mf_ledger_entries where id in ($1, $2)`, [e.id, rid]);
  assert.equal(pair.length, 2);
  assert.equal(Number(pair.find((p) => p.id === e.id).u), -Number(pair.find((p) => p.id === rid).u));
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_reverse_entry($1, 'again')`, [e.id])), /already reversed/);
});

test('manual entry validates input and is idempotent', async () => {
  const fund = { fund_name: 'UBL Stock Advantage Fund', amc: 'UBL Fund Managers Limited', slug: 'ubl-stock-advantage-fund' };
  const key = randomUUID();
  const id1 = await asUser(db, A, async () => (await one(`select public.mf_record_manual_entry($1, 'purchase', '2026-06-01', 10000, 250, 40, $2) as r`, [fund, key])).r);
  const id2 = await asUser(db, A, async () => (await one(`select public.mf_record_manual_entry($1, 'purchase', '2026-06-01', 10000, 250, 40, $2) as r`, [fund, key])).r);
  assert.equal(id1, id2);
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_record_manual_entry($1, 'purchase', '2099-01-01', 1, 1, 1, null)`, [fund])), /future/);
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_record_manual_entry($1, 'purchase', '2026-01-01', 0, 1, 1, null)`, [fund])), /greater than zero/);
  const amc = await one(`select a.code from public.mf_ledger_entries e join public.mf_funds f on f.id = e.fund_id join public.mf_amcs a on a.id = f.amc_id where e.id = $1`, [id1]);
  assert.equal(amc.code, 'ubl', 'AMC resolved by word-bounded pattern');
});

test('edits keep the AI value and the human value separately', async () => {
  const { importId } = await stageImport(A, '4'.repeat(64), [
    { type: 'purchase', date: '2026-07-01', nav: '58', units: '2', gross: '116', net: '116', dir: 'investor_pays' }]);
  const id = (await staged(importId))[0].id;
  const r = await asUser(db, A, async () => (await one(`select public.mf_edit_staged($1, $2) as r`, [id, { gross_amount: '117' }])).r);
  assert.equal(String(r.gross_amount), '117');
  assert.equal(String(r.ai_values.gross_amount), '116');
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_edit_staged($1, $2)`, [id, { user_id: B }])), /cannot be edited/);
});

test('QA purge works only for QA accounts', async () => {
  await assert.rejects(asUser(db, B, () => db.query(`select public.mf_qa_purge_my_data()`)), /Only QA/);
  const r = await asUser(db, B, async () => (await one(`select public.mf_qa_purge_my_data() as r`)).r, { app_metadata: { qa: true } });
  assert.ok(r);
});

test('service-only functions refuse normal users', async () => {
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_service_classify_import($1)`, [randomUUID()])), /permission denied|Service role only/);
});

test('delete_import removes the statement and everything derived from it, only for its owner', async () => {
  const { importId } = await stageImport(A, '7'.repeat(64), [
    { type: 'purchase', date: '2026-08-01', nav: '60', units: '10', gross: '600', net: '600', dir: 'investor_pays' },
    { type: 'redemption', date: '2026-08-05', nav: '61', units: '-4', gross: '244', net: '243', dir: 'investor_receives', components: [{ type: 'cgt', amount: '1' }] },
  ], { fundName: 'Meezan Delete Test Fund' });
  const ids = (await staged(importId)).map((s) => s.id);
  await approve(A, importId, ids);
  const entries = await all(`select id from public.mf_ledger_entries where source_import_id = $1`, [importId]);
  assert.equal(entries.length, 2);
  await asUser(db, A, () => db.query(`select public.mf_reverse_entry($1, 'test')`, [entries[0].id]));
  await assert.rejects(asUser(db, B, () => db.query(`select public.mf_delete_import($1)`, [importId])), /not found/);
  const r = await asUser(db, A, async () => (await one(`select public.mf_delete_import($1) as r`, [importId])).r);
  assert.equal(r.entries_deleted, 3, 'two entries plus the reversal');
  assert.match(r.storage_path, /\.pdf$/);
  assert.equal((await all(`select 1 from public.mf_statement_imports where id = $1`, [importId])).length, 0);
  assert.equal((await all(`select 1 from public.mf_staged_transactions where import_id = $1`, [importId])).length, 0);
  assert.equal((await all(`select 1 from public.mf_ledger_entries where source_import_id = $1 or reverses_entry_id = any($2)`, [importId, entries.map((e) => e.id)])).length, 0);
  assert.equal((await all(`select 1 from public.mf_ledger_components where entry_id = any($1)`, [entries.map((e) => e.id)])).length, 0);
  const audit = await one(`select action from public.mf_audit_log where entity_id = $1 and action = 'delete_import'`, [importId]);
  assert.equal(audit.action, 'delete_import');
});

test('delete_entry removes one transaction (and its reversal); the statement row is marked excluded', async () => {
  const { importId } = await stageImport(A, '8'.repeat(64), [
    { type: 'purchase', date: '2026-08-10', nav: '60', units: '5', gross: '300', net: '300', dir: 'investor_pays' },
    { type: 'purchase', date: '2026-08-11', nav: '60', units: '6', gross: '360', net: '360', dir: 'investor_pays' },
  ], { fundName: 'Meezan Entry Delete Fund' });
  const ids = (await staged(importId)).map((s) => s.id);
  await approve(A, importId, ids);
  const [first, second] = await all(`select id from public.mf_ledger_entries where source_import_id = $1 order by trade_date`, [importId]);
  await assert.rejects(asUser(db, B, () => db.query(`select public.mf_delete_entry($1)`, [first.id])), /not found/);
  const r = await asUser(db, A, async () => (await one(`select public.mf_delete_entry($1) as r`, [first.id])).r);
  assert.equal(r.deleted, 1);
  const left = await all(`select id from public.mf_ledger_entries where source_import_id = $1`, [importId]);
  assert.deepEqual(left.map((x) => x.id), [second.id]);
  const st = await one(`select review_status, ledger_entry_id from public.mf_staged_transactions where import_id = $1 and seq = 1`, [importId]);
  assert.equal(st.review_status, 'excluded');
  assert.equal(st.ledger_entry_id, null);
  // Manual and migrated rows go too; the legacy source row is removed with the migrated entry.
  const legacy = await one(`select id from public.mf_ledger_entries where legacy_txn_id = $1`, [LEGACY_ID]);
  await asUser(db, A, () => db.query(`select public.mf_delete_entry($1)`, [legacy.id]));
  assert.equal((await all(`select 1 from public.mutual_fund_transactions where id = $1`, [LEGACY_ID])).length, 0);
});

test('edit_entry changes figures in place, keeps direction, validates, and is audited', async () => {
  const { importId } = await stageImport(A, '9'.repeat(64), [
    { type: 'redemption', date: '2026-08-20', nav: '62', units: '-3', gross: '186', net: '185', dir: 'investor_receives', components: [{ type: 'cgt', amount: '1' }] },
  ], { fundName: 'Meezan Edit Fund' });
  await approve(A, importId, (await staged(importId)).map((s) => s.id));
  const e = await one(`select id from public.mf_ledger_entries where source_import_id = $1`, [importId]);
  await asUser(db, A, () => db.query(`select public.mf_edit_entry($1, $2)`, [e.id, { units: '3.5', gross_amount: '217', net_amount: '215', cgt: '2', trade_date: '2026-08-21' }]));
  const row = await one(`select trade_date::text d, unit_delta::text u, gross_amount::text g, net_amount::text n from public.mf_ledger_entries where id = $1`, [e.id]);
  assert.deepEqual(row, { d: '2026-08-21', u: '-3.5', g: '217', n: '215' }, 'units stay an outflow');
  const cgt = await all(`select amount::text a from public.mf_ledger_components where entry_id = $1 and component_type = 'cgt'`, [e.id]);
  assert.deepEqual(cgt.map((c) => c.a), ['2']);
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_edit_entry($1, $2)`, [e.id, { fund_id: randomUUID() }])), /cannot be edited/);
  await assert.rejects(asUser(db, A, () => db.query(`select public.mf_edit_entry($1, $2)`, [e.id, { trade_date: '2099-01-01' }])), /future/);
  await assert.rejects(asUser(db, B, () => db.query(`select public.mf_edit_entry($1, $2)`, [e.id, { nav: '1' }])), /not found/);
  const audit = await one(`select details from public.mf_audit_log where entity_id = $1 and action = 'edit_entry'`, [e.id]);
  assert.equal(String(audit.details.before.gross_amount), '186');
});
