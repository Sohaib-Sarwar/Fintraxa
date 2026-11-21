/**
 * Fallback for upcoming dividends: when PSX's announcements table can't be fetched, read the held company's own recent
 * PSX letters (results / board meeting / book closure) through Gemini's URL-context tool. Like the MCB price reader
 * (refresh-prices/amcReader.js) the model only copies what the letter prints, and a dividend is kept only when:
 *   - two independent reads agree on the amount and the book-closure start;
 *   - when the letter gives both Rs per share and %, they agree with the face value (Rs = % × FV / 100);
 *   - book closure starts within 60 days back / 60 days ahead.
 * Plain JS, shared with the Node tests.
 */

export const docUrl = (doc) => `https://dps.psx.com.pk/download/document/${doc}.pdf`;

/** Titles worth reading (results, board decisions, book closure); never transmissions, clippings or credit notices. */
export const LETTER_TITLE = /financial result|dividend|book closure|entitlement|board meeting/i;
export const NOT_A_DECLARATION = /transmission|newspaper|clipping|credit of|dispatch|publication of notice|placement of/i;

export function letterPrompt(url, symbol, company) {
  return [
    `Open ${url}. It is an announcement filed by ${company ?? symbol} (PSX symbol ${symbol}) with the Pakistan Stock Exchange.`,
    'Copy only what the letter itself prints. Do not use any other source, do not calculate or estimate.',
    'Does it declare (or recommend, for a final dividend) a CASH dividend? If so give: the amount in rupees per share as printed',
    '(null if only a percentage is printed), the percentage as printed (null if not printed), whether it is interim or final,',
    'which interim (1, 2, 3; null if not stated), the book closure start and end dates, and the AGM date if any.',
    'Answer with JSON only, exactly: {"page_read": true|false, "cash_dividend": true|false, "rs_per_share": <number|null>,',
    '"percent": <number|null>, "type": "interim"|"final"|null, "interim_no": <number|null>,',
    '"book_closure_from": "YYYY-MM-DD"|null, "book_closure_to": "YYYY-MM-DD"|null, "agm_date": "YYYY-MM-DD"|null}',
  ].join('\n');
}

export function parseJson(t) {
  const s = String(t ?? ''); const i = s.indexOf('{'); const j = s.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(s.slice(i, j + 1)); } catch { return null; }
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Two reads → one checked dividend row (dividends_upcoming_sync shape), { none: true } when both say no dividend, or null. */
export function acceptLetter(a, b, { symbol, company, faceValue, today, doc }) {
  if (!a || !b || a.page_read === false || b.page_read === false) return null;
  if (a.cash_dividend === false && b.cash_dividend === false) return { none: true };
  if (a.cash_dividend !== true || b.cash_dividend !== true) return null;
  const same = (k) => (num(a[k]) === num(b[k]) || a[k] === b[k]);
  if (!same('rs_per_share') || !same('percent') || a.book_closure_from !== b.book_closure_from || a.type !== b.type) return null;
  const rs = num(a.rs_per_share); const pct = num(a.percent); const fv = num(faceValue);
  if (rs !== null && pct !== null && fv) { if (Math.abs(rs - (pct * fv) / 100) > 0.01) return null; }
  const dps = rs ?? (pct !== null && fv ? Math.round(pct * fv) / 100 : null);
  if (!(dps > 0) || !ISO.test(String(a.book_closure_from ?? ''))) return null;
  const days = (Date.parse(a.book_closure_from) - Date.parse(today)) / 86_400_000;
  if (days < -60 || days > 60) return null;
  const to = ISO.test(String(a.book_closure_to ?? '')) && a.book_closure_to >= a.book_closure_from ? a.book_closure_to : a.book_closure_from;
  return {
    symbol, company_name: company ?? null, announced_on: null, period: null,
    dividend_type: a.type === 'final' ? 'final' : 'interim', interim_no: num(a.interim_no) >= 1 && num(a.interim_no) <= 4 ? num(a.interim_no) : null,
    percent: pct, dps, face_value: fv, book_closure_from: a.book_closure_from, book_closure_to: to,
    agm_date: ISO.test(String(a.agm_date ?? '')) ? a.agm_date : null, source: 'psx_letter_ai', source_url: docUrl(doc),
    raw: `letter ${doc}: ${rs !== null ? `Rs ${rs}` : ''}${pct !== null ? ` ${pct}%` : ''} ${a.type ?? ''}`.trim(),
  };
}

/** Read one letter twice in parallel and check it. → { row } | { none } | { failed } */
export async function readLetter({ doc, symbol, company, faceValue, today, generate }) {
  try {
    const prompt = letterPrompt(docUrl(doc), symbol, company);
    const [ra, rb] = await Promise.all([generate(prompt), generate(prompt)]);
    const got = acceptLetter(parseJson(ra), parseJson(rb), { symbol, company, faceValue, today, doc });
    if (!got) return { failed: 'The two reads disagreed or the letter could not be read.' };
    return got.none ? { none: true } : { row: got };
  } catch (error) {
    return { failed: String(error?.message ?? error).slice(0, 200) };
  }
}
