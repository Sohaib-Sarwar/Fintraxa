/**
 * Upcoming dividends: deterministic parsing of PSX's own pages (plain JS, shared with scripts/psx/dividends-scan.test.mjs).
 *
 * 1) https://www.psx.com.pk/psx/announcement/financial-announcements — one table of every listed company's results for
 *    ~6 months, grouped under <h4> announcement dates. Columns: Company | Time | Period | Dividend/Bonus/Right | PBT |
 *    PAT | EPS | AGM/EOGM | Closure of share transfer books. The dividend cell reads e.g. "185%(iii) (D)",
 *    "60% (F) (D)", "Rs. 8.25 (D)", "80(ii) (D)", "50% (B) - 30%(i) (D)"; (D) = cash, (B) bonus, (R) right;
 *    (i)/(ii)/(iii) = 1st/2nd/3rd interim, (F) = final. Book closure "09/11/2026 - 11/11/2026" (dd/mm/yyyy).
 * 2) https://dps.psx.com.pk/company/SYM — face value (Rs per share = % × face value / 100; BAFL is Rs 5, CLOV Rs 1)
 *    and the company's announcement list (date, title, /download/document/<id>.pdf) for the AI fallback.
 */

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const text = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** 'Nov 06, 2026' → '2026-11-06'. */
export function monDate(s) {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4})$/.exec(String(s ?? '').trim());
  if (!m || !MON[m[1].toLowerCase()]) return null;
  return `${m[3]}-${pad(MON[m[1].toLowerCase()])}-${pad(m[2])}`;
}

/** '09/11/2026' → '2026-11-09' (a real calendar date, else null). */
export function dmy(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/** 'dd/mm/yyyy - dd/mm/yyyy' → { from, to } (a single date → from = to); anything else → null. */
export function bookClosure(s) {
  const parts = String(s ?? '').split(/\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return null;
  const from = dmy(parts[0]); const to = parts[1] ? dmy(parts[1]) : from;
  if (!from || !to || to < from) return null;
  return { from, to };
}

/**
 * The cash entries of a dividend cell. → [{ percent | null, rs | null, type: 'interim'|'final', interim_no | null }]
 * Bonus (B) and right (R) parts are ignored; an entry without a number is ignored.
 */
export function cashEntries(cell) {
  const out = [];
  for (const part of String(cell ?? '').split(/\s+-\s+/)) {
    if (!/\(D\)/i.test(part)) continue;
    const rs = /Rs\.?\s*([\d,]+(?:\.\d+)?)/i.exec(part);
    const pct = rs ? null : /([\d,]+(?:\.\d+)?)\s*%?\s*\(/.exec(part);
    const value = Number(String((rs ?? pct)?.[1] ?? '').replace(/,/g, ''));
    if (!(value > 0)) continue;
    const roman = /\((i{1,3}|iv)\)/i.exec(part)?.[1]?.toLowerCase();
    const final = /\(F\)/i.test(part);
    out.push({
      percent: rs ? null : value,
      rs: rs ? value : null,
      type: final ? 'final' : 'interim',
      interim_no: final ? null : roman ? { i: 1, ii: 2, iii: 3, iv: 4 }[roman] : null,
    });
  }
  return out;
}

/** The financial-announcements table → rows with a cash dividend: { announced_on, company, period, cell, agm, bc, raw }. */
export function parseAnnouncements(html) {
  const s = String(html ?? '');
  const rows = [];
  let date = null;
  const re = /<h4>\s*([^<]+?)\s*<\/h4>|<tr>\s*((?:<td[^>]*>[\s\S]*?<\/td>\s*){9})<\/tr>/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[1]) { date = monDate(m[1]); continue; }
    const td = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => text(x[1]));
    if (!/\(D\)/i.test(td[3] ?? '')) continue;
    rows.push({ announced_on: date, company: td[0], period: td[2], cell: td[3], agm: dmy(td[7]), bc: bookClosure(td[8]), raw: `${td[0]} | ${td[2]} | ${td[3]} | ${td[8]}`.slice(0, 500) });
  }
  return rows;
}

/** Company names compared loosely: 'Oil & Gas Development Company Limited' ≈ 'Oil and Gas Development Co. Ltd'. */
export function normName(s) {
  return String(s ?? '').toLowerCase().replace(/&/g, ' and ').replace(/\b(limited|ltd|company|co|the)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

/** dps.psx.com.pk/company/SYM → { faceValue, xd, announcements: [{ date, title, doc }] }. */
export function parseCompanyPage(html) {
  const s = String(html ?? '');
  const fv = /Face Value<\/div>\s*<div class="stats_value">\s*([\d,.]+)/i.exec(s);
  const announcements = [];
  for (const m of s.matchAll(/<tr>\s*<td>([A-Za-z]{3} \d{1,2}, \d{4})<\/td>\s*<td>([\s\S]*?)<\/td>\s*<td>[\s\S]*?\/download\/document\/(\d+)\.pdf[\s\S]*?<\/td>\s*<\/tr>/g)) {
    announcements.push({ date: monDate(m[1]), title: text(m[2]), doc: m[3] });
  }
  return { faceValue: fv ? Number(fv[1].replace(/,/g, '')) : null, xd: /tag--xd/.test(s), announcements };
}

const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Parsed table rows + held symbols → the rows to store (dividends_upcoming_sync shape).
 *  board: [{ symbol, name }] (the published PSX board, for company name → symbol)
 *  faceValues: Map<symbol, number> (from the company pages; a % entry without one is left out and reported)
 * Only book closures from 60 days ago onwards (paid within ~10 working days, so recent ones can still be approved).
 */
export function toSyncRows(rows, { symbols, board, faceValues = new Map(), today }) {
  const held = new Set(symbols.map((x) => String(x).toUpperCase()));
  const byName = new Map();
  for (const b of board ?? []) if (held.has(String(b.symbol).toUpperCase())) byName.set(normName(b.name), String(b.symbol).toUpperCase());
  const out = []; const missingFace = new Set(); const seen = new Set();
  const since = addDays(today, -60);
  for (const r of rows) {
    const symbol = byName.get(normName(r.company));
    if (!symbol || !r.bc || r.bc.from < since) continue;
    for (const e of cashEntries(r.cell)) {
      const fv = faceValues.get(symbol) ?? null;
      const dps = e.rs ?? (fv ? Math.round(e.percent * fv) / 100 : null);
      if (!dps) { missingFace.add(symbol); continue; }
      const key = `${symbol}|${r.bc.from}|${dps}`;
      if (seen.has(key)) continue; // consolidated / unconsolidated duplicates
      seen.add(key);
      out.push({
        symbol, company_name: r.company, announced_on: r.announced_on, period: r.period, dividend_type: e.type,
        interim_no: e.interim_no, percent: e.percent, dps, face_value: fv, book_closure_from: r.bc.from,
        book_closure_to: r.bc.to, agm_date: r.agm, source: 'psx_announcements',
        source_url: 'https://www.psx.com.pk/psx/announcement/financial-announcements', raw: r.raw,
      });
    }
  }
  return { rows: out, missingFace: [...missingFace] };
}
