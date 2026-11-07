/**
 * mf-import: process one uploaded statement end to end.
 *
 * Request: POST { storage_path: "<uid>/<sha256>.pdf", file_label?: string }
 *          Authorization: Bearer <user JWT>
 *
 * The PDF never leaves Supabase: it is read from the private bucket,
 * parsed here deterministically, and only redacted evidence lines are
 * stored. Every step is idempotent, so a retry (or a double click) can never
 * stage or approve a transaction twice:
 *   - same file → same import (unique user + sha256)
 *   - concurrent requests → one lease holder, the rest get 409
 *   - staged rows → unique (import, source line)
 *   - ledger rows → unique fingerprint + occurrence, checked under an
 *     advisory lock inside the approval function
 */
import { extractPdfLines } from '../_shared/mf/pdfRows.js';
import { processStatement, PARSER_VERSION } from '../_shared/mf/pipeline.js';
import { UnsupportedStatementError } from '../_shared/mf/parsers/index.js';
import { RedactionError } from '../_shared/mf/redact.js';
import { matchMufapFund, normName } from '../_shared/mf/fundMatch.js';
import { Decimal } from '../_shared/mf/numbers.js';

export const LIMITS = { maxBytes: 10 * 1024 * 1024, maxPages: 40, importsPerHour: 30, leaseSeconds: 120 };
const PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f]{64})\.pdf$/;
const MUFAP_URL = 'https://sohaib-sarwar.github.io/PSX-MUFAP-MicroService/api/mufap/funds.json';

export class HttpError extends Error {
  constructor(status, category, message, { retryable = false, recovery = null } = {}) {
    super(message);
    this.status = status;
    this.category = category;
    this.retryable = retryable;
    this.recovery = recovery;
  }
}

const log = (corr, fields) => console.log(JSON.stringify({ fn: 'mf-import', corr, ...fields }));

async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let feedCache = null;
async function mufapFeed(fetchImpl) {
  if (feedCache && Date.now() - feedCache.at < 30 * 60_000) return feedCache.rows;
  try {
    const res = await fetchImpl(MUFAP_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    const rows = j.data ?? j.rows ?? (Array.isArray(j) ? j : []);
    feedCache = { at: Date.now(), rows };
    return rows;
  } catch {
    return feedCache?.rows ?? [];   // valuation degrades to statement prices; import still succeeds
  }
}

/**
 * @param {object} deps
 * @param {Request} deps.req
 * @param {any} deps.admin       service-role Supabase client
 * @param {any} deps.asUser      Supabase client carrying the caller's JWT
 * @param {(bytes: Uint8Array) => Promise<any>} deps.openPdf  pdf.js document from bytes
 * @param {typeof fetch} [deps.fetchImpl]
 */
export async function handle({ req, admin, asUser, openPdf, fetchImpl = fetch }) {
  const corr = crypto.randomUUID();
  const t0 = Date.now();

  const { data: auth, error: authErr } = await asUser.auth.getUser();
  if (authErr || !auth?.user) throw new HttpError(401, 'auth', 'Please sign in again.');
  const user = auth.user;

  let body;
  try { body = await req.json(); } catch { throw new HttpError(400, 'bad_request', 'Malformed request.'); }
  const path = String(body?.storage_path ?? '');
  const m = path.match(PATH_RE);
  if (!m || m[1] !== user.id) throw new HttpError(403, 'forbidden', 'That file does not belong to you.');
  const claimedSha = m[2];
  const fileLabel = String(body?.file_label ?? '').replace(/[^\w .()-]/g, '').slice(0, 80) || null;

  // Same file already imported? Return it instead of doing anything.
  const { data: existing } = await admin.from('mf_statement_imports')
    .select('id, status, summary, lease_until')
    .eq('user_id', user.id).eq('file_sha256', claimedSha).maybeSingle();
  if (existing && !['failed', 'uploaded'].includes(existing.status)) {
    return { status: 200, body: { import_id: existing.id, status: existing.status, summary: existing.summary, duplicate_file: true } };
  }

  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from('mf_statement_imports').select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).gte('created_at', since);
  if ((count ?? 0) >= LIMITS.importsPerHour) {
    throw new HttpError(429, 'rate_limited', 'Too many imports in the last hour. Try again later.', { retryable: true });
  }

  // Download and verify the bytes.
  const { data: blob, error: dlErr } = await admin.storage.from('mf-statements').download(path);
  if (dlErr || !blob) throw new HttpError(404, 'not_found', 'Uploaded file not found. Please upload again.', { retryable: true });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) throw new HttpError(422, 'empty_file', 'The file is empty.');
  if (bytes.byteLength > LIMITS.maxBytes) throw new HttpError(413, 'too_large', 'The file is larger than 10 MB.');
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new HttpError(415, 'not_pdf', 'That file is not a PDF.');
  const sha = await sha256Hex(bytes);
  if (sha !== claimedSha) throw new HttpError(400, 'hash_mismatch', 'The upload was corrupted in transit. Please upload again.', { retryable: true });

  // Create (or reuse a failed) import row and take the processing lease.
  let importId = existing?.id;
  if (!importId) {
    const { data: ins, error: insErr } = await admin.from('mf_statement_imports').insert({
      user_id: user.id, file_sha256: sha, storage_path: path, file_size_bytes: bytes.byteLength,
      file_label: fileLabel, status: 'uploaded', correlation_id: corr,
    }).select('id').single();
    if (insErr) {
      // Lost a race with a concurrent request for the same file.
      const { data: again } = await admin.from('mf_statement_imports').select('id, status, summary')
        .eq('user_id', user.id).eq('file_sha256', sha).maybeSingle();
      if (!again) throw new HttpError(500, 'db', 'Could not record the import.', { retryable: true });
      return { status: 200, body: { import_id: again.id, status: again.status, summary: again.summary, duplicate_file: true } };
    }
    importId = ins.id;
  }
  const now = new Date();
  const { data: leased } = await admin.from('mf_statement_imports')
    .update({ status: 'parsing', stage: 'parsing', lease_until: new Date(now.getTime() + LIMITS.leaseSeconds * 1000).toISOString(),
      started_at: now.toISOString(), error_category: null, error_message: null, retryable: null, recovery_action: null,
      parser_version: PARSER_VERSION, correlation_id: corr })
    .eq('id', importId)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select('id, attempts').maybeSingle();
  if (!leased) throw new HttpError(409, 'in_progress', 'This statement is already being processed.', { retryable: true });
  await admin.from('mf_statement_imports').update({ attempts: (leased.attempts ?? 0) + 1 }).eq('id', importId);

  try {
    const result = await runImport({ admin, asUser, user, importId, bytes, openPdf, fetchImpl, corr });
    log(corr, { stage: 'done', ms: Date.now() - t0, events: result.summary.events, auto: result.summary.auto_approved, status: result.status });
    return { status: 200, body: { import_id: importId, ...result } };
  } catch (err) {
    const e = err instanceof HttpError ? err : classifyFailure(err);
    log(corr, { stage: 'failed', category: e.category, ms: Date.now() - t0 });
    await admin.from('mf_statement_imports').update({
      status: 'failed', lease_until: null, error_category: e.category, error_message: e.message,
      retryable: e.retryable, recovery_action: e.recovery,
    }).eq('id', importId);
    e.importId = importId;
    throw e;
  }
}

function classifyFailure(err) {
  if (err instanceof UnsupportedStatementError) {
    return new HttpError(422, 'unsupported_format', err.message, { recovery: 'Upload a statement from a supported AMC, or add the transactions manually.' });
  }
  if (err instanceof RedactionError) {
    return new HttpError(422, 'redaction_failed', 'Personal details could not be separated from transaction data with confidence, so nothing was saved.', { recovery: 'Contact support with the import ID.' });
  }
  if (/password|encrypt/i.test(String(err?.name) + String(err?.message))) {
    return new HttpError(422, 'encrypted_pdf', 'The PDF is password-protected.', { recovery: 'Download an unprotected copy from your AMC portal and upload that.' });
  }
  if (/Invalid PDF|corrupt|XRef|bad xref|FormatError/i.test(String(err?.message))) {
    return new HttpError(422, 'corrupt_pdf', 'The PDF could not be read; it may be damaged.', { recovery: 'Download the statement again and re-upload.' });
  }
  return new HttpError(500, 'internal', 'Processing failed unexpectedly.', { retryable: true, recovery: 'Retry the import. If it fails again, contact support with the import ID.' });
}

async function runImport({ admin, asUser, user, importId, bytes, openPdf, fetchImpl }) {
  const stage = (s, extra = {}) => admin.from('mf_statement_imports').update({ status: s, stage: s, ...extra }).eq('id', importId);

  // ── Text ──
  const pdf = await openPdf(bytes);
  if (pdf.numPages > LIMITS.maxPages) throw new HttpError(422, 'too_many_pages', `The statement has more than ${LIMITS.maxPages} pages.`);
  const pages = await extractPdfLines(pdf);
  if (pages.flat().length < 5) {
    throw new HttpError(422, 'scanned_pdf', 'This PDF has no readable text (it looks scanned).', { recovery: 'Download the digital statement from your AMC portal instead of scanning a printout.' });
  }

  // ── Parse, redact, normalise, reconcile ──
  await stage('redacting', { page_count: pdf.numPages });
  const meta = user.user_metadata ?? {};
  const r = processStatement(pages, { extraNames: [meta.full_name, meta.name].filter(Boolean) });
  await stage('validating');

  // ── AMC, account ──
  const { data: amc } = await admin.from('mf_amcs').select('id, code, statement_profile').eq('code', r.amcCode).single();
  const refNorm = String(r.accountRef ?? 'unknown').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const refHash = await sha256Hex(new TextEncoder().encode(`${user.id}:${r.amcCode}:${refNorm}`));
  const masked = r.accountRef ? `••${refNorm.slice(-3)}` : 'Unknown';
  await admin.from('mf_accounts').upsert(
    { user_id: user.id, amc_id: amc.id, account_ref_hash: refHash, account_ref_masked: masked },
    { onConflict: 'user_id,amc_id,account_ref_hash', ignoreDuplicates: true });
  const { data: account } = await admin.from('mf_accounts').select('id')
    .eq('user_id', user.id).eq('amc_id', amc.id).eq('account_ref_hash', refHash).single();

  // ── Funds ──
  const feed = await mufapFeed(fetchImpl);
  const fundBySection = new Map();
  const classBySection = new Map();
  const sectionInfo = [];
  for (const s of r.sections) {
    const alias = normName(s.fundNamePrinted);
    let fundId = null;
    let mapped = null;
    const { data: al } = await admin.from('mf_fund_aliases').select('fund_id').eq('amc_id', amc.id).eq('alias_norm', alias).maybeSingle();
    if (al) fundId = al.fund_id;
    const match = matchMufapFund(s.fundNamePrinted, r.amcCode, feed);
    if (!fundId) {
      if (match) {
        const { data: f } = await admin.from('mf_funds').select('id').eq('mufap_slug', match.slug).maybeSingle();
        fundId = f?.id ?? null;
        if (!fundId) {
          const { data: byName } = await admin.from('mf_funds').select('id').eq('amc_id', amc.id).ilike('name', match.fund_name).maybeSingle();
          fundId = byName?.id ?? null;
          if (fundId) await admin.from('mf_funds').update({ mufap_slug: match.slug }).eq('id', fundId).is('mufap_slug', null);
        }
        if (!fundId) {
          const { data: nf } = await admin.from('mf_funds')
            .insert({ amc_id: amc.id, name: match.fund_name, mufap_slug: match.slug, category: match.category })
            .select('id').single();
          fundId = nf.id;
        }
      } else {
        const name = s.fundNamePrinted.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a, b) => a + b.toLowerCase());
        const { data: f } = await admin.from('mf_funds').select('id').eq('amc_id', amc.id).ilike('name', name).maybeSingle();
        fundId = f?.id ?? (await admin.from('mf_funds').insert({ amc_id: amc.id, name }).select('id').single()).data.id;
      }
      await admin.from('mf_fund_aliases').upsert({ amc_id: amc.id, alias_norm: alias, fund_id: fundId, source: match ? 'mufap' : 'system' },
        { onConflict: 'amc_id,alias_norm', ignoreDuplicates: true });
    }
    mapped = match;
    fundBySection.set(s.key, fundId);
    // A layout that prints no unit class must not split one holding in two:
    // adopt the class the ledger already uses for this fund in this account.
    let unitClass = s.unitClass;
    if (!unitClass) {
      const { data: classes } = await admin.from('mf_ledger_entries').select('unit_class')
        .eq('user_id', user.id).eq('account_id', account.id).eq('fund_id', fundId).limit(500);
      const distinct = [...new Set((classes ?? []).map((c) => c.unit_class))];
      if (distinct.length === 1) unitClass = distinct[0];
    }
    s.unitClass = unitClass;
    classBySection.set(s.key, unitClass);
    sectionInfo.push({ section: s, fundId, mapped });
  }

  // ── Continuity with the ledger, and opening balances with no history ──
  const extraEvents = [];
  const continuity = [];
  const periodStart = r.statement.periodFrom;
  for (const { section: s, fundId } of sectionInfo) {
    const { data: prior } = await admin.from('mf_ledger_entries').select('unit_delta, trade_date')
      .eq('user_id', user.id).eq('account_id', account.id).eq('fund_id', fundId).eq('unit_class', s.unitClass);
    const before = (prior ?? []).filter((e) => !periodStart || e.trade_date < periodStart);
    const ledgerUnits = before.reduce((acc, e) => acc.plus(e.unit_delta ?? 0), new Decimal(0));   // reversals carry negated units
    const opening = s.opening ? new Decimal(s.opening.units) : new Decimal(0);
    const tol = new Decimal('0.01');
    if (!before.length && opening.gt(tol) && s.opening) {
      extraEvents.push({
        source_key: `opening:${s.key}`, seq: 0, line_ids: [s.opening.lineId], page: Number(s.opening.lineId.match(/^p(\d+)/)?.[1]) || null,
        section_key: s.key, original_labels: ['Opening balance (statement)'], original_label: 'Opening balance (statement)',
        entry_type: 'other_adjustment', trade_date: periodStart, price_date: null, nav: null,
        unit_delta: s.opening.units, gross_amount: null, net_amount: null, cash_direction: 'none', external_ref: null,
        running_balance_units: s.opening.units, components: [], raw_extraction: { synthetic: 'opening_balance' },
        warnings: [{ code: 'OPENING_COST_UNKNOWN', severity: 'warning',
          message: 'The statement opens with units bought before its period. Their cost is unknown, so profit for this fund is incomplete until the earlier statement is imported.' }],
        missing_fields: [], evidence_ok: true, confidence: 'high', review_status: 'requires_attention',
      });
      continuity.push({ section_key: s.key, status: 'no_history', opening: opening.toFixed(4) });
    } else if (before.length) {
      const ok = ledgerUnits.minus(opening).abs().lte(tol);
      continuity.push({ section_key: s.key, status: ok ? 'continuous' : 'gap', ledger_units: ledgerUnits.toFixed(4), statement_opening: opening.toFixed(4) });
    } else {
      continuity.push({ section_key: s.key, status: 'first_import' });
    }
  }

  // ── Stage ──
  await admin.from('mf_import_lines').upsert(
    r.lines.map((l) => ({ import_id: importId, user_id: user.id, line_id: l.id, page: l.page, n: l.n, text: l.text })),
    { onConflict: 'import_id,line_id', ignoreDuplicates: true });

  const gapSections = new Set(continuity.filter((c) => c.status === 'gap').map((c) => c.section_key));
  const rows = [...extraEvents, ...r.events].map((e) => {
    const warnings = [...e.warnings];
    if (gapSections.has(e.section_key)) {
      warnings.push({ code: 'LEDGER_GAP', severity: 'warning', message: 'Units in your ledger before this statement do not match its opening balance. An earlier statement may be missing.' });
    }
    return {
      import_id: importId, user_id: user.id, source_key: e.source_key, seq: e.seq, line_ids: e.line_ids, page: e.page,
      section_key: e.section_key, fund_name_printed: r.sections.find((s) => s.key === e.section_key)?.fundNamePrinted ?? null,
      unit_class: classBySection.get(e.section_key) ?? (e.section_key ?? '').split('|')[1] ?? '', fund_id: fundBySection.get(e.section_key) ?? null,
      original_labels: e.original_labels, original_label: e.original_label, entry_type: e.entry_type,
      trade_date: e.trade_date, price_date: e.price_date, nav: e.nav, unit_delta: e.unit_delta,
      gross_amount: e.gross_amount, net_amount: e.net_amount, cash_direction: e.cash_direction,
      external_ref: e.external_ref, running_balance_units: e.running_balance_units, components: e.components,
      raw_extraction: e.raw_extraction, warnings, missing_fields: e.missing_fields, evidence_ok: e.evidence_ok,
      confidence: e.confidence,
      review_status: warnings.some((w) => w.severity !== 'info') ? 'requires_attention' : e.review_status,
    };
  });
  if (rows.length) {
    const { error } = await admin.from('mf_staged_transactions').upsert(rows, { onConflict: 'import_id,source_key', ignoreDuplicates: true });
    if (error) throw Object.assign(new Error('staging failed'), { cause: error });
  }
  await admin.from('mf_statement_imports').update({
    amc_id: amc.id, account_id: account.id, period_start: r.statement.periodFrom, period_end: r.statement.periodTo,
  }).eq('id', importId);

  // ── Duplicates ──
  const { data: dup, error: dupErr } = await admin.rpc('mf_service_classify_import', { p_import_id: importId });
  if (dupErr) throw Object.assign(new Error('classification failed'), { cause: dupErr });

  // ── Price observations (statement valuations + the market feed) ──
  const navRows = [];
  for (const { section: s, fundId, mapped } of sectionInfo) {
    if (s.valuation?.price && s.valuation.date) {
      navRows.push({ fund_id: fundId, user_id: user.id, nav_date: s.valuation.date, price: s.valuation.price, price_kind: 'repurchase', source: 'statement', source_ref: importId, verified: true });
    }
    const p = mapped?.repurchase_price || mapped?.nav;
    if (p && mapped?.validity_date) {
      navRows.push({ fund_id: fundId, user_id: null, nav_date: mapped.validity_date, price: String(p), price_kind: mapped.repurchase_price ? 'repurchase' : 'nav', source: 'mufap', source_ref: mapped.slug, verified: false });
    }
  }
  for (const n of navRows) await admin.from('mf_nav_history').insert(n).then(() => null, () => null);   // unique index makes repeats no-ops

  // ── Automatic approval of clean fund sections ──
  const { data: staged } = await admin.from('mf_staged_transactions')
    .select('id, section_key, review_status, evidence_ok, duplicate_status')
    .eq('import_id', importId);
  const material = new Set(r.reconciliation.filter((x) => x.status === 'material').map((x) => x.section_key));
  const bySection = new Map();
  for (const s of staged ?? []) {
    if (!bySection.has(s.section_key)) bySection.set(s.section_key, []);
    bySection.get(s.section_key).push(s);
  }
  const approvable = [];
  const held = [];
  for (const [key, list] of bySection) {
    const open = list.filter((s) => s.review_status !== 'duplicate');
    const clean = !material.has(key) && !gapSections.has(key) && open.every((s) =>
      s.review_status === 'pending_review' && s.evidence_ok && ['new', 'same_date_different'].includes(s.duplicate_status));
    if (clean) approvable.push(...open.map((s) => s.id));
    else held.push(key);
  }
  let approval = null;
  if (approvable.length) {
    const { data, error } = await asUser.rpc('mf_approve_staged', {
      p_import_id: importId, p_staged_ids: approvable, p_idempotency_key: crypto.randomUUID(), p_mode: 'auto',
    });
    if (error) throw Object.assign(new Error('auto approval failed'), { cause: error });
    approval = data;
  }
  const { data: status } = await admin.rpc('mf_service_refresh_import', { p_import_id: importId });

  const summary = {
    amc: r.amcCode,
    period: r.statement,
    sections: r.sections.length,
    events: rows.length,
    auto_approved: approval?.approved ?? 0,
    needs_review: (staged ?? []).filter((s) => ['pending_review', 'requires_attention'].includes(s.review_status)).length - (approval?.approved ?? 0),
    duplicates: dup?.exact_duplicate ?? 0,
    held_sections: held,
    continuity,
    unmapped_funds: sectionInfo.filter((x) => !x.mapped).map((x) => x.section.fundNamePrinted),
    amc_reported: r.amcReported,
    stats: r.stats,
  };
  await admin.from('mf_statement_imports').update({
    lease_until: null, reconciliation: { sections: r.reconciliation, continuity }, summary, completed_at: new Date().toISOString(),
  }).eq('id', importId);
  return { status: status ?? 'awaiting_approval', summary };
}
