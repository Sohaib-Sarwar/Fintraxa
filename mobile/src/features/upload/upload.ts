/**
 * "Upload anything" on the phone (plan §6.4): pick a PDF → check it → hash (SHA-256) → upload privately to
 * `mf-statements/{uid}/{sha}.pdf` → the `doc-intake` Edge Function recognises it (deterministic detectors:
 * AKD/KTrade confirmations, CDC dividend reports, AMC statements) → the user reviews → save:
 *   trades    → stock_transactions upsert on (user_id, broker, source_ref), duplicates skipped  (same as web)
 *   dividends → stock_dividends upsert on (user_id, symbol, payment_date, warrant_no)            (same as web)
 *   fund      → the existing `mf-import` pipeline with the same storage path                      (same as web)
 * Passwords are sent once to read the file and never stored.
 */
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { toTradeRows } from '@/data/engines';
import { sha256Hex } from './sha256';
import { supabase } from '@/lib/supabase';

export const MAX_BYTES = 10 * 1024 * 1024;
export const BUCKET = 'mf-statements';

export type Picked = { uri: string; name: string; size: number };

export type TradeLine = {
  symbol: string; company_name?: string | null; type: 'buy' | 'sell'; quantity: string; price: string; fee: string | null;
  net?: string; source_ref: string; charges?: unknown;
};
export type Confirmation = { broker: string; account_ref: string | null; confirmation_no: string | null; trade_date: string; settlement_date: string | null; trades: TradeLine[]; checks: { label: string; parsed: string; printed: string; ok: boolean | null }[] };
export type DividendLine = {
  symbol: string; company_name: string | null; payment_date: string; issue_date: string | null; account_ref: string | null; warrant_no: string | null;
  filer_status: string | null; filer_status_raw: string | null; shares: string; gross_amount: string; tax_amount: string; jh_tax_amount: string | null;
  zakat_amount: string | null; net_amount: string;
};
export type FundEvent = { fund: string | null; type: string; label: string | null; date: string | null; units: string | null; nav: string | null; amount: string | null };

export type IntakeResult =
  | { kind: 'trades'; source: { code: string; name: string }; trades: number; confirmations: Confirmation[]; checks: Confirmation['checks']; pages: number }
  | { kind: 'dividends'; source: { code: string; name: string }; rows: DividendLine[]; warnings: string[]; statements?: { rows: number; matches: boolean | null }[]; pages: number }
  | { kind: 'fund'; source: { code: string; name: string }; preview: { funds: string[]; count: number; events: FundEvent[] }; storage_path: string; pages: number }
  | { kind: 'password'; wrong: boolean; message: string }
  | { kind: 'unknown'; reason: string; message: string; source?: { code: string; name: string }; pages?: number };

export class UploadError extends Error {}

export async function pickPdf(): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name ?? 'document.pdf', size: a.size ?? 0 };
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** The picked file's bytes: expo-file-system first, then fetch() of the same URI (content:// and file:// both). */
async function readBytes(uri: string): Promise<Uint8Array> {
  try {
    return await new File(uri).bytes();
  } catch (e) {
    if (__DEV__) console.warn('[upload] File.bytes failed, trying fetch', e);
  }
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

/** SHA-256 hex: the native digest when it works, else the plain-JS one (same result). */
async function hashHex(bytes: Uint8Array): Promise<string> {
  try {
    return hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>));
  } catch (e) {
    if (__DEV__) console.warn('[upload] native digest failed, using JS SHA-256', e);
    return sha256Hex(bytes);
  }
}

/** Reads, checks and hashes the file. Each failure says which step failed (owner: "this file couldn't be read"). */
export async function readFile(f: Picked): Promise<{ bytes: Uint8Array; sha: string }> {
  let bytes: Uint8Array;
  try {
    bytes = await readBytes(f.uri);
  } catch (e) {
    if (__DEV__) console.warn('[upload] reading failed', e);
    throw new UploadError('This file couldn’t be opened on the phone. Save it to Downloads or Files first, then pick it from there.');
  }
  if (!bytes.length) throw new UploadError('That file is empty.');
  if (bytes.length > MAX_BYTES) throw new UploadError('This file is larger than 10 MB.');
  let pdf = false;
  for (let i = 0; i < Math.min(1024, bytes.length - 3); i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46) { pdf = true; break; }
  }
  if (!pdf) throw new UploadError('This is not a PDF. Upload the PDF your broker, AMC or CDC sent you.');
  const sha = await hashHex(bytes);
  return { bytes, sha };
}

export async function uploadFile(uid: string, sha: string, bytes: Uint8Array): Promise<string> {
  const path = `${uid}/${sha}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer as ArrayBuffer : bytes.slice().buffer as ArrayBuffer, { contentType: 'application/pdf', upsert: false });
  // Same bytes already uploaded (the key is the content hash) is fine.
  if (error && !/exists|duplicate|409/i.test(`${error.message} ${(error as { statusCode?: string }).statusCode ?? ''}`)) {
    throw new UploadError('Upload failed. Check your connection and try again.');
  }
  return path;
}

async function fnError(error: unknown, fallback: string): Promise<never> {
  const ctx = (error as { context?: Response })?.context;
  let msg = fallback;
  try {
    if (ctx?.status === 404) msg = 'Document recognition isn’t switched on yet on the server. Fund statements can still be uploaded on the web app.';
    else msg = ((await ctx?.json()) as { error?: string })?.error ?? fallback;
  } catch { /* keep fallback */ }
  throw new UploadError(msg);
}

export async function recognise(storagePath: string, password?: string): Promise<IntakeResult> {
  const { data, error } = await supabase.functions.invoke('doc-intake', { body: { storage_path: storagePath, password } });
  if (error) return fnError(error, 'Reading the document failed. Please try again.');
  return data as IntakeResult;
}

export async function saveTrades(uid: string, picks: { c: Confirmation; trades: TradeLine[] }[]) {
  const rows = picks.flatMap(({ c, trades }) => toTradeRows(c, trades)).map((r) => ({ ...r, user_id: uid }));
  if (!rows.length) return { added: 0, skipped: 0 };
  const { data, error } = await supabase.from('stock_transactions').upsert(rows, { onConflict: 'user_id,broker,source_ref', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
}

/** Same cleaning as the web's useSaveDividends. */
const cleanDividend = (f: DividendLine, uid: string) => ({
  user_id: uid,
  symbol: String(f.symbol).trim().toUpperCase(),
  company_name: f.company_name?.trim() || null,
  payment_date: f.payment_date,
  issue_date: f.issue_date || null,
  account_ref: f.account_ref?.trim() || null,
  warrant_no: f.warrant_no ? String(f.warrant_no).trim() : null,
  filer_status: f.filer_status || 'unknown',
  filer_status_raw: f.filer_status_raw ?? null,
  shares: String(f.shares).replace(/,/g, ''),
  gross_amount: String(f.gross_amount).replace(/,/g, ''),
  tax_amount: String(f.tax_amount || 0).replace(/,/g, ''),
  jh_tax_amount: String(f.jh_tax_amount || 0).replace(/,/g, ''),
  zakat_amount: String(f.zakat_amount || 0).replace(/,/g, ''),
  net_amount: String(f.net_amount).replace(/,/g, ''),
  source: 'statement',
  notes: null,
});

export async function saveDividends(uid: string, rows: DividendLine[]) {
  if (!rows.length) return { added: 0, skipped: 0 };
  const { data, error } = await supabase.from('stock_dividends')
    .upsert(rows.map((r) => cleanDividend(r, uid)), { onConflict: 'user_id,symbol,payment_date,warrant_no', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
}

export type FundImport = { import_id: string; status: string; summary?: { events?: number; auto_approved?: number; needs_review?: number; duplicates?: number; sections?: number; period?: { start?: string; end?: string } | null }; duplicate_file?: boolean };

export async function importFund(storagePath: string, label: string): Promise<FundImport> {
  const { data, error } = await supabase.functions.invoke('mf-import', { body: { storage_path: storagePath, file_label: label.replace(/[^\w .()-]/g, '').slice(0, 80) } });
  if (error) return fnError(error, 'Importing the statement failed. Please try again.');
  return data as FundImport;
}

/** The user backed out of a fund statement: remove the uploaded copy (owner-only delete policy). */
export async function discard(storagePath: string) {
  await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
}

/** One row the statement pipeline staged (same columns the web's ImportDialog reads). */
export type StagedRow = {
  id: string; seq: number; trade_date: string | null; fund_name_printed: string | null; entry_type: string; unit_delta: string | null;
  gross_amount: string | null; net_amount: string | null; review_status: string; components: { type?: string; amount?: string | number }[] | null;
};
/** Rows still waiting for a decision after auto-approval (web: OPEN). */
export const OPEN_STAGED = ['pending_review', 'requires_attention'];

export async function fetchStaged(importId: string): Promise<StagedRow[]> {
  const { data, error } = await supabase.from('mf_staged_transactions')
    .select('id, seq, trade_date, fund_name_printed, entry_type, unit_delta::text, gross_amount::text, net_amount::text, review_status, components')
    .eq('import_id', importId).order('seq').limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as StagedRow[];
}

/** Approve the open rows (web: mf_approve_staged, manual mode, one idempotency key per press). */
export async function approveStaged(importId: string, ids: string[]): Promise<{ approved: number }> {
  const { data, error } = await supabase.rpc('mf_approve_staged', {
    p_import_id: importId, p_staged_ids: ids, p_idempotency_key: Crypto.randomUUID(), p_mode: 'manual',
  });
  if (error) throw error;
  return (data ?? { approved: 0 }) as { approved: number };
}

/** The statement this exact file (same SHA-256) was imported as, if any — so a repeat upload is caught up front. */
export async function findImport(uid: string, sha: string): Promise<{ id: string; created_at: string } | null> {
  const { data, error } = await supabase.from('mf_statement_imports').select('id, created_at').eq('user_id', uid).eq('file_sha256', sha).maybeSingle();
  if (error) return null;
  return (data ?? null) as { id: string; created_at: string } | null;
}
