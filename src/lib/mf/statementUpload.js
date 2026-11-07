/**
 * Upload a statement PDF and have the backend process it.
 *
 * The object key is `<uid>/<sha256>.pdf`: the same file always lands on the
 * same key (so a re-upload is a no-op), and the Edge Function re-hashes the
 * bytes to confirm nothing changed in transit.
 */
import { supabase } from '../supabase';
import { sha256HexBytes } from './hash';

export const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;

export async function sha256Hex(file) {
  return sha256HexBytes(new Uint8Array(await file.arrayBuffer()));
}

export function validateStatementFile(file) {
  if (!file) return 'Choose a PDF statement.';
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'Only PDF statements can be imported.';
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_STATEMENT_BYTES) return 'The file is larger than 10 MB.';
  return null;
}

/**
 * @param {File} file
 * @param {string} userId
 * @param {(stage: 'hashing'|'uploading'|'processing') => void} [onStage]
 */
export async function importStatement(file, userId, onStage = () => {}) {
  const problem = validateStatementFile(file);
  if (problem) throw new Error(problem);

  onStage('hashing');
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...head) !== '%PDF-') throw new Error('That file is not a PDF.');
  const sha = await sha256Hex(file);
  const path = `${userId}/${sha}.pdf`;

  onStage('uploading');
  const { error: upErr } = await supabase.storage.from('mf-statements')
    .upload(path, file, { contentType: 'application/pdf', upsert: false });
  // Already uploaded (same bytes) is fine — the key is the content hash.
  if (upErr && !/exists|duplicate|409/i.test(`${upErr.message} ${upErr.statusCode ?? ''}`)) {
    throw new Error('Upload failed. Check your connection and try again.');
  }

  onStage('processing');
  const label = file.name.replace(/[^\w .()-]/g, '').slice(0, 80);
  const { data, error } = await supabase.functions.invoke('mf-import', { body: { storage_path: path, file_label: label } });
  if (error) {
    let body = null;
    try { body = await error.context?.json?.(); } catch { body = null; }
    const err = new Error(body?.error ?? 'Processing failed. Please try again.');
    err.details = body;
    throw err;
  }
  return data;
}
