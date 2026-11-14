/**
 * doc-intake: "upload anything" (docs/mobile/MOBILE_APP_PLAN.md §6.4). Reads a PDF the user uploaded to
 * their own folder of the private `mf-statements` bucket, recognises what it is with the app's existing
 * DETERMINISTIC detectors (no LLM), and returns what was found for the confirmation screen.
 *
 *   PSX trade confirmation (AKD / KTrade) → detectBroker + parseConfirmation   (src/lib/psx/confirmations.js)
 *   Mutual-fund statement (AMC)           → detectAmc + parseStatement preview  (_shared/mf/parsers)
 *   CDC dividend report                   → parseDividendReport                  (src/lib/psx/dividends.js)
 *
 * Nothing is written to the database here. Trades/dividends are saved by the app after the user confirms
 * (same upserts and duplicate rules as the web); a fund statement is handed to the existing `mf-import`
 * pipeline on confirm. PDFs that are not fund statements are deleted from storage once read — the app
 * keeps no copy of documents it does not import. Logs carry stages and counts only, never figures.
 *
 * Plain JS (no Deno APIs) so scripts/psx/doc-intake.test.mjs runs it under Node with synthetic fixtures.
 */
import { BROKERS, ConfirmationError, detectBroker, parseConfirmation } from './vendor/psx/confirmations.js';
import { parseDividendReport } from './vendor/psx/dividends.js';
import { buildPageLines } from './vendor/mf/pdfRows.js';
import { detectAmc, parseStatement, SUPPORTED_AMCS } from './vendor/mf/parsers/index.js';

export const BUCKET = 'mf-statements';
export const MAX_BYTES = 10 * 1024 * 1024;
const AMC_NAMES = { atlas: 'Atlas Asset Management', mcb: 'MCB Funds (Alhamra)', meezan: 'Al Meezan Investments', nbp: 'NBP Funds', ubl: 'UBL Funds' };

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const PATH_RE = /^([0-9a-f-]{36})\/([0-9a-f]{64})\.pdf$/;

/** Positioned lines per page + the plain text stream (what a copy-paste gives), from a pdf.js document. */
export async function readPages(pdf) {
  const pages = [];
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((it) => typeof it.str === 'string');
    pages.push(buildPageLines(items.map((it) => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]) || 0,
    })), p));
    text += `${items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('')}\n`;
    page.cleanup?.();
  }
  return { pages, text };
}

const fundPreview = (parsed) => {
  const names = new Map((parsed.sections ?? []).map((s) => [s.section_id, s.fund_name_printed]));
  const events = (parsed.events ?? []).map((e) => ({
    fund: names.get(e.section_id) ?? null,
    type: e.event_type,
    label: (e.labels_printed ?? [])[0] ?? null,
    date: e.trade_date_text,
    units: e.units_text,
    nav: e.nav_text,
    amount: e.gross_amount_text ?? e.net_amount_text ?? e.amount_text,
  }));
  const funds = [...new Set(events.map((e) => e.fund).filter(Boolean))];
  return { funds, count: events.length, events: events.slice(0, 80) };
};

/**
 * What kind of document is this? Order matters only for safety: broker markers and AMC names are distinctive;
 * the dividend reader runs last because it is the most permissive.
 * @returns {object} { kind: 'trades'|'fund'|'dividends'|'unknown', ... }
 */
export function classify({ pages, text }) {
  const lines = pages.flat();
  if (!lines.length) return { kind: 'unknown', reason: 'no_text', message: 'This PDF has no readable text. If it is a scanned image, upload the original PDF instead.' };

  const broker = detectBroker(lines);
  if (broker) {
    try {
      const parsed = parseConfirmation(lines);
      const trades = parsed.confirmations.reduce((n, c) => n + c.trades.length, 0);
      return {
        kind: 'trades', source: { code: broker, name: BROKERS[broker].name }, trades,
        confirmations: parsed.confirmations,
        checks: parsed.confirmations.flatMap((c) => c.checks),
      };
    } catch (e) {
      if (e instanceof ConfirmationError) return { kind: 'unknown', reason: e.code, source: { code: broker, name: BROKERS[broker].name }, message: e.message };
      throw e;
    }
  }

  const amc = detectAmc(pages);
  if (amc) {
    const source = { code: amc.code, name: AMC_NAMES[amc.code] ?? amc.code };
    try {
      const { parsed } = parseStatement(pages);
      return { kind: 'fund', source, preview: fundPreview(parsed) };
    } catch (e) {
      return { kind: 'unknown', reason: 'fund_layout', source, message: e.message };
    }
  }

  const div = parseDividendReport({ text, lines });
  if (div.rows.length) {
    return {
      kind: 'dividends', source: { code: 'cdc', name: 'CDC dividend report' },
      rows: div.rows, statements: div.statements ?? [], warnings: div.warnings ?? [],
    };
  }

  return {
    kind: 'unknown', reason: 'unrecognised',
    message: `We couldn't tell what this document is. Supported: AKD and KTrade trade confirmations, CDC dividend reports, and statements from ${SUPPORTED_AMCS.join(', ')}.`,
  };
}

/**
 * @param {{ body: any, userId: string, download: (path: string) => Promise<Uint8Array|null>, remove: (path: string) => Promise<void>,
 *           openPdf: (bytes: Uint8Array, password?: string) => Promise<any>, log?: (o: object) => void }} deps
 */
export async function handle({ body, userId, download, remove, openPdf, log = () => {} }) {
  const path = String(body?.storage_path ?? '');
  const m = PATH_RE.exec(path);
  if (!m) throw new HttpError(400, 'bad_path', 'Upload the file again.');
  if (m[1] !== userId) throw new HttpError(403, 'forbidden', 'This file belongs to another account.');

  const t0 = Date.now();
  const bytes = await download(path);
  if (!bytes) throw new HttpError(404, 'missing', 'The uploaded file was not found. Upload it again.');
  if (bytes.length > MAX_BYTES) { await remove(path); throw new HttpError(413, 'too_big', 'This file is larger than 10 MB.'); }

  let pdf;
  try {
    pdf = await openPdf(bytes, body?.password ? String(body.password) : undefined);
  } catch (e) {
    if (e?.name === 'PasswordException') {
      // Keep the file: the user retries with a password (never stored).
      return body?.password
        ? { kind: 'password', wrong: true, message: 'That password did not open the file. Brokers and AMCs often use your CNIC number without dashes.' }
        : { kind: 'password', wrong: false, message: 'This PDF is password-protected. Enter its password to read it.' };
    }
    await remove(path);
    throw new HttpError(422, 'damaged', 'This PDF could not be opened. It may be damaged; download it again.');
  }

  let result;
  try {
    const { pages, text } = await readPages(pdf);
    result = classify({ pages, text });
    result.pages = pdf.numPages;
  } finally {
    pdf.destroy?.();
  }
  if (result.kind !== 'fund') await remove(path).catch(() => {});
  log({ fn: 'doc-intake', kind: result.kind, source: result.source?.code ?? null, pages: result.pages, ms: Date.now() - t0 });
  return { ...result, storage_path: result.kind === 'fund' ? path : null };
}
