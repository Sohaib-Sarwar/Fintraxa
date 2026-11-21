/**
 * Upcoming dividends scan (owner, 2026-11-22: "every day see the upcoming dividends of the stocks in my portfolio, not
 * any other noise; if I hold them on the ex-date it comes as upcoming and I approve it with the amount and date").
 *
 *   held symbols (dividend_scan_symbols: held now or traded in 120 days)
 *     → PSX financial-announcements table (deterministic, parse.js) — the primary source
 *     → face values from each candidate's PSX company page (Rs per share = % × FV / 100)
 *     → when that table can't be fetched: the held companies' own recent letters, read by Gemini (letterReader.js),
 *       each letter once (dividend_docs_unread / dividend_docs_mark)
 *     → dividends_upcoming_sync: store announcements of held companies only, rebuild each holder's pending rows
 *       from their trades up to the last cum-dividend day, link ones already recorded.
 * Plain JS, shared with the Node tests (scripts/psx/dividends-scan.test.mjs).
 */
import { parseAnnouncements, parseCompanyPage, toSyncRows } from './parse.js';
import { LETTER_TITLE, NOT_A_DECLARATION, readLetter } from './letterReader.js';

export const FA_URL = 'https://www.psx.com.pk/psx/announcement/financial-announcements';
export const companyUrl = (s) => `https://dps.psx.com.pk/company/${encodeURIComponent(s)}`;
const MAX_LETTERS = 8; // per run: bounds the AI calls (two reads each)

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * deps: { userId (null = everyone), admin (service-role client), fetchText(url, ms) → Promise<string>,
 *         board() → Promise<[{ symbol, name }]>, generate(prompt) → Promise<string> | null, today 'YYYY-MM-DD' }
 * → { symbols, source: 'psx'|'letters'|'none', found: [{ symbol, dps, type, book_closure_from }], sync, notes: [] }
 */
export async function scan({ userId = null, admin, fetchText, board, generate = null, today }) {
  const notes = [];
  const { data: syms, error: sErr } = await admin.rpc('dividend_scan_symbols', { p_user: userId });
  if (sErr) throw sErr;
  const symbols = (syms ?? []).map((s) => String(s).toUpperCase());
  if (!symbols.length) {
    const { data: sync } = await admin.rpc('dividends_upcoming_sync', { p_rows: [], p_user: userId });
    return { symbols: 0, source: 'none', found: [], sync, notes };
  }

  // The table and the held companies' pages, fetched together (the table can take over a minute).
  const pagesP = pool(symbols, 5, async (s) => {
    try { return [s, parseCompanyPage(await fetchText(companyUrl(s), 30_000))]; } catch { return [s, null]; }
  });
  let table = null;
  try { table = parseAnnouncements(await fetchText(FA_URL, 100_000)); } catch (e) { notes.push(`PSX announcements table unavailable: ${String(e?.message ?? e).slice(0, 120)}`); }
  if (table && !table.length) { notes.push('PSX announcements table came back empty.'); table = null; }
  const pages = new Map((await pagesP).filter(([, p]) => p));
  const faceValues = new Map([...pages].filter(([, p]) => p.faceValue > 0).map(([s, p]) => [s, p.faceValue]));

  // Face value missing (page didn't load): the last one stored for that stock.
  const { data: knownFv } = await admin.from('psx_dividend_announcements').select('symbol, face_value').in('symbol', symbols).not('face_value', 'is', null);
  for (const r of knownFv ?? []) if (!faceValues.has(r.symbol)) faceValues.set(r.symbol, Number(r.face_value));

  let rows = []; let source = 'none';
  if (table) {
    const names = await board().catch(() => []);
    const built = toSyncRows(table, { symbols, board: names, faceValues, today });
    rows = built.rows; source = 'psx';
    if (built.missingFace.length) notes.push(`Face value unknown, skipped for now: ${built.missingFace.join(', ')}`);
  } else if (generate) {
    // Fallback: each held company's recent declaration letters, read once each.
    const since = addDays(today, -21);
    const letters = [];
    for (const [symbol, p] of pages) {
      for (const a of p.announcements) {
        if (a.date && a.date >= since && LETTER_TITLE.test(a.title) && !NOT_A_DECLARATION.test(a.title)) letters.push({ symbol, doc: a.doc, title: a.title });
      }
    }
    const { data: unread } = letters.length ? await admin.rpc('dividend_docs_unread', { p_docs: letters.map((l) => l.doc) }) : { data: [] };
    const todo = letters.filter((l) => (unread ?? []).includes(l.doc)).slice(0, MAX_LETTERS);
    const names = new Map((await board().catch(() => [])).map((b) => [String(b.symbol).toUpperCase(), b.name]));
    const read = await pool(todo, 3, async (l) => ({ l, r: await readLetter({ doc: l.doc, symbol: l.symbol, company: names.get(l.symbol), faceValue: faceValues.get(l.symbol), today, generate }) }));
    const mark = [];
    for (const { l, r } of read) {
      if (r.row) { rows.push(r.row); mark.push({ doc: l.doc, symbol: l.symbol, has_dividend: true }); }
      else if (r.none) mark.push({ doc: l.doc, symbol: l.symbol, has_dividend: false });
      else notes.push(`${l.symbol} letter ${l.doc}: ${r.failed}`); // not marked: tried again next run
    }
    if (mark.length) await admin.rpc('dividend_docs_mark', { p_rows: mark });
    source = 'letters';
    if (letters.length > todo.length + (letters.length - (unread ?? []).length)) notes.push('More letters waiting; the rest are read on the next run.');
  } else {
    notes.push('No fallback reader configured (GEMINI_API_KEY).');
  }

  const { data: sync, error: yErr } = await admin.rpc('dividends_upcoming_sync', { p_rows: rows, p_user: userId });
  if (yErr) throw yErr;
  return {
    symbols: symbols.length, source,
    found: rows.map((r) => ({ symbol: r.symbol, dps: r.dps, type: r.dividend_type, book_closure_from: r.book_closure_from })),
    sync, notes,
  };
}
