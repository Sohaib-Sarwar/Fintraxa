/**
 * PSX cash dividends: statement parsing and range summaries. Pure, no React,
 * no network, exact decimals (decimal.js), so it is unit-tested directly
 * (scripts/psx/dividends.test.mjs; real reports in tests/private).
 *
 * Source: the CDC "Dividend / Zakat & Tax Deduction Summary Report":
 *
 *   Payment Date | Dividend Issue Date | Sec. Symbol - Sec. Name | Part. ID - A/c # / Folio #
 *   | Warrant # | Filer Status | No. of Securities | Gross Dividend | Tax | JH's Tax | Zakat | Net Dividend
 *
 * Every row is read on its own and validated on its own:
 *   - PDFs: by position (parseDividendLines). A row is the line that starts
 *     with two dates; each value comes from its own cell; the company name
 *     wraps onto the lines directly below it in the name column. Page
 *     headers, footers and the disclaimer can never become part of a row.
 *   - Pasted text: by pattern (parseDividendStatement). A name may not run
 *     across a date or an account number, so one unreadable row is reported,
 *     never merged into the next.
 * Deterministic on purpose: no LLM.
 */
import Decimal from 'decimal.js';

const ZERO = new Decimal(0);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const r2 = (d) => Number(d.toFixed(2));
const dec = (s) => new Decimal(String(s).replace(/,/g, ''));

/** A statement's net may be rounded to whole rupees; gaps up to this are rounding. */
export const NET_ROUNDING = 1;

/** "Filer" / "NONFILER" / "Non Filler" / "15%" / "30%" → filer | non_filer | unknown. */
export function normFiler(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  if (!s) return 'unknown';
  if (/non-?fil+er/.test(s)) return 'non_filer';
  if (/fil+er/.test(s)) return 'filer';
  const pct = s.match(/^(\d+(?:\.\d+)?)%$/);
  if (pct) {
    const n = Number(pct[1]);
    if (n <= 15) return 'filer';       // 15% (and lower reduced rates) = active taxpayer
    if (n >= 25) return 'non_filer';   // 30% = not on the active taxpayer list
  }
  return 'unknown';
}

const isoFromDmy = (s) => {
  const m = String(s ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

const NUM_RE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const ACCOUNT_RE = /^\d{3,8}-\d{3,12}$/;
const SYMBOL_NAME_RE = /^([A-Z0-9][A-Z0-9.-]{0,15})\s*-\s*(.*)$/;
const NAME_FRAGMENT_RE = /^[A-Z0-9&.,()'/ -]+$/; // CDC prints company names in capitals

/** One row's printed fields → a validated row, or the reason it cannot be used. */
function buildRow(f) {
  const where = `${f.symbol || 'A row'} paid ${f.pay}`;
  const payment = isoFromDmy(f.pay);
  if (!payment) return { error: `${where}: the payment date is not a real date. Row skipped.` };
  if (!f.symbol) return { error: `A row paid ${f.pay}: no stock symbol could be read. Row skipped.` };
  let q; let g; let tx; let j; let z; let n;
  try { [q, g, tx, j, z, n] = [f.qty, f.gross, f.tax, f.jh, f.zakat, f.net].map(dec); } catch { return { error: `${where}: an amount could not be read. Row skipped.` }; }
  if (!q.gt(0)) return { error: `${where}: the number of securities is zero. Row skipped.` };
  if (tx.plus(j).plus(z).gt(g)) return { error: `${where}: deductions are more than the gross dividend. Row skipped.` };
  const issued = isoFromDmy(f.issue);
  return {
    row: {
      payment_date: payment,
      issue_date: issued && issued <= payment ? issued : null,
      symbol: f.symbol,
      company_name: String(f.name ?? '').replace(/\s+/g, ' ').trim() || null,
      account_ref: f.account ?? null,
      warrant_no: f.warrant ? String(f.warrant).trim() : null,
      filer_status: normFiler(f.filerRaw),
      filer_status_raw: String(f.filerRaw ?? '').trim() || null,
      shares: q.toString(),
      gross_amount: g.toFixed(2),
      tax_amount: tx.toFixed(2),
      jh_tax_amount: j.toFixed(2),
      zakat_amount: z.toFixed(2),
      net_amount: n.toFixed(2),
      source: 'statement',
      netGap: r2(n.minus(g.minus(tx).minus(j).minus(z))),
    },
  };
}

/** Chunks of rows (one per printed "Total") → rows, reconciliation per statement, warnings. */
function assemble(chunks, errors) {
  const warnings = [...errors];
  const rows = [];
  const statements = [];
  for (const { found, totals } of chunks) {
    if (!found.length) continue;
    const sum = (k) => r2(found.reduce((s, x) => s.plus(x[k]), ZERO));
    const parsed = { gross: sum('gross_amount'), tax: sum('tax_amount'), jhTax: sum('jh_tax_amount'), zakat: sum('zakat_amount'), net: sum('net_amount') };
    const matches = totals ? ['gross', 'tax', 'jhTax', 'zakat', 'net'].every((k) => Math.abs(totals[k] - parsed[k]) < 0.005) : null;
    if (totals && !matches) {
      warnings.push(`A statement's printed totals (gross ${totals.gross}, net ${totals.net}) do not match its ${found.length} rows (gross ${parsed.gross}, net ${parsed.net}). Some rows may not have been read; check before saving.`);
    }
    statements.push({ rows: found.length, totals, parsed, matches });
    rows.push(...found);
  }
  for (const x of rows) {
    if (Math.abs(x.netGap) > NET_ROUNDING) warnings.push(`${x.symbol} ${x.payment_date}: net ${x.net_amount} differs from gross − deductions by ${x.netGap}. Saved as printed.`);
  }
  // The same warrant twice (statement pasted or uploaded twice) is kept once.
  const seen = new Set();
  const unique = rows.filter((x) => { const k = dividendKey(x); if (seen.has(k)) return false; seen.add(k); return true; });
  if (unique.length < rows.length) warnings.push(`${rows.length - unique.length} repeated row${rows.length - unique.length === 1 ? '' : 's'} ignored`);
  return { rows: unique, statements, warnings };
}

const totalsFrom = (nums) => {
  const v = nums.slice(-5).map((s) => r2(dec(s)));
  return { gross: v[0], tax: v[1], jhTax: v[2], zakat: v[3], net: v[4] };
};

// ── Pasted text ────────────────────────────────────────────────────────────
const NUM = '((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?)';
// Name text may wrap, but never runs across a date or an account number.
const NAME = '((?:(?!\\d{2}/\\d{2}/\\d{4})(?!\\d{3,8}-\\d{3,12}\\b).)+?)';
const ROW = new RegExp(
  '(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}/\\d{2}/\\d{4})\\s+'                     // payment date, issue date
  + `([A-Z0-9][A-Z0-9.\\-]{0,15})\\s*-\\s*${NAME}\\s+`                      // symbol - name
  + '(\\d{3,8}-\\d{3,12})\\s+'                                                // participant id - account
  + '(\\S+)\\s+'                                                               // warrant #
  + '((?:(?!\\d{2}/\\d{2}/\\d{4}).){1,24}?)\\s+'                              // filer status (free text)
  + `${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}(?=\\s|$)`,     // securities, gross, tax, JH tax, zakat, net
  'g',
);
const ROW_START = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+[A-Z0-9]/g;
const TOTAL = new RegExp(`\\bTotal\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`);

/**
 * Text of one or more dividend statements (copy-paste, or a PDF's text) → rows, checks.
 * @returns {{ rows: object[], statements: object[], warnings: string[] }}
 *   rows: { payment_date, issue_date, symbol, company_name, account_ref, warrant_no,
 *           filer_status, filer_status_raw, shares, gross_amount, tax_amount, jh_tax_amount,
 *           zakat_amount, net_amount, source: 'statement', netGap }  (amounts as strings)
 *   statements: per statement, { rows, totals (printed) | null, parsed, matches }
 */
export function parseDividendStatement(text) {
  const errors = [];
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim(); // \s also covers PDF no-break spaces
  // Several statements pasted together: each table ends with its own "Total" line.
  const parts = flat.split(/(?<=\bTotal(?:\s+[\d,.]+){5})(?=\s|$)/).map((c) => c.trim()).filter(Boolean);
  const chunks = parts.map((chunk) => {
    const found = [];
    const readAt = new Set();
    for (const m of chunk.matchAll(ROW)) {
      const [, pay, issue, symbol, name, account, warrant, filerRaw, qty, gross, tax, jh, zakat, net] = m;
      readAt.add(m.index);
      const r = buildRow({ pay, issue, symbol, name, account, warrant, filerRaw, qty, gross, tax, jh, zakat, net });
      if (r.row) found.push(r.row); else errors.push(r.error);
    }
    // A row that starts (two dates) but was not read is reported, never silently dropped.
    for (const s of chunk.matchAll(ROW_START)) if (!readAt.has(s.index)) errors.push(`A row paid ${s[1]} could not be read and was skipped.`);
    const t = chunk.match(TOTAL);
    return { found, totals: t ? totalsFrom(t.slice(1)) : null };
  });
  return assemble(chunks, errors);
}

// ── PDF lines (positioned cells) ───────────────────────────────────────────
/** A cell holding several space-separated dates ("25/03/2026 25/03/2026") becomes one cell per date. */
const splitDateCells = (cells) => cells.flatMap((c) => {
  const parts = c.text.trim().split(/\s+/);
  return parts.length > 1 && parts.every((p) => DATE_RE.test(p)) ? parts.map((p) => ({ ...c, text: p })) : [{ ...c, text: c.text.trim() }];
});

/**
 * Positioned lines of a CDC dividend report (pdfRows.buildPageLines) → rows, checks.
 * Same result shape as parseDividendStatement.
 */
export function parseDividendLines(lines) {
  const errors = [];
  const chunks = [];
  let cur = { found: [], totals: null };
  let open = null; // the row being read: { f, nameX, page }
  const close = () => {
    if (!open) return;
    const r = buildRow(open.f);
    if (r.row) cur.found.push(r.row); else errors.push(r.error);
    open = null;
  };
  for (const l of lines ?? []) {
    const cells = splitDateCells(l.cells ?? []).filter((c) => c.text);
    const texts = cells.map((c) => c.text);
    if (texts.length >= 2 && DATE_RE.test(texts[0]) && DATE_RE.test(texts[1])) {
      close();
      const acc = texts.findIndex((s, i) => i >= 2 && ACCOUNT_RE.test(s));
      const nums = [];
      let k = texts.length - 1;
      while (k > acc && nums.length < 6 && NUM_RE.test(texts[k])) { nums.unshift(texts[k]); k -= 1; }
      if (acc < 0 || nums.length < 6 || k < acc + 1) {
        errors.push(`A row paid ${texts[0]} could not be read${acc < 0 ? ' (no account number)' : nums.length < 6 ? ' (amounts missing)' : ' (no warrant number)'} and was skipped.`);
        continue;
      }
      const nameText = texts.slice(2, acc).join(' ');
      const sm = nameText.match(SYMBOL_NAME_RE);
      open = {
        f: {
          pay: texts[0], issue: texts[1], symbol: sm?.[1] ?? null, name: sm ? sm[2] : nameText,
          account: texts[acc], warrant: texts[acc + 1], filerRaw: texts.slice(acc + 2, k + 1).join(' '),
          qty: nums[0], gross: nums[1], tax: nums[2], jh: nums[3], zakat: nums[4], net: nums[5],
        },
        nameX: cells[2]?.x0 ?? null,
        page: l.page,
      };
      continue;
    }
    if (/^total$/i.test(texts[0] ?? '')) {
      close();
      const nums = texts.filter((s) => NUM_RE.test(s));
      if (nums.length >= 5) cur.totals = totalsFrom(nums);
      chunks.push(cur);
      cur = { found: [], totals: null };
      continue;
    }
    // The open row's company name continues on the lines right below it, in the name column only.
    const joined = texts.join(' ');
    if (open && open.nameX !== null && l.page === open.page && cells.length
      && cells.every((c) => Math.abs(c.x0 - open.nameX) <= 8) && NAME_FRAGMENT_RE.test(joined)) {
      open.f.name = `${open.f.name} ${joined}`.trim();
      continue;
    }
    close();
  }
  close();
  if (cur.found.length) chunks.push(cur);
  return assemble(chunks, errors);
}

/**
 * A dividend report PDF read both ways; the reading that reconciles with every
 * printed total wins, then the one with fewer problems, then more rows. The
 * positioned reading goes first, so it wins ties.
 */
export function parseDividendReport({ text, lines }) {
  const score = (r) => {
    if (!r.rows.length) return -Infinity;
    const reconciled = r.statements.length > 0 && r.statements.every((s) => s.matches === true);
    return (reconciled ? 1e9 : 0) - r.warnings.length * 1e4 + r.rows.length;
  };
  const candidates = [parseDividendLines(lines), parseDividendStatement(text)];
  return candidates.reduce((best, r) => (score(r) > score(best) ? r : best));
}

/** Identity of a dividend: matches the table's unique key. */
export const dividendKey = (x) => `${x.symbol}|${x.payment_date}|${x.warrant_no ?? ''}`;

const monthKey = (iso) => iso.slice(0, 7);
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };

/**
 * Dividends received inside [start, end] (by payment date).
 * @returns {{ count, gross, tax, zakat, deductions, net, bySymbol: Map, months, rows }}
 *   tax = withholding + joint-holder tax; deductions = tax + zakat.
 *   bySymbol: symbol → { gross, deductions, net, count, last }.
 *   months: { month, label, gross, cgt (all deductions), net }: the earnings-chart shape.
 */
export function summarizeDividends(all, { start = '0000-01-01', end, today = new Date().toISOString().slice(0, 10) } = {}) {
  const endEff = end && end < today ? end : today;
  const rows = all.filter((x) => x.payment_date >= start && x.payment_date <= endEff)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  let gross = ZERO; let tax = ZERO; let zakat = ZERO; let net = ZERO;
  const bySym = new Map();
  for (const x of rows) {
    const g = dec(x.gross_amount); const tx = dec(x.tax_amount ?? 0).plus(dec(x.jh_tax_amount ?? 0)); const z = dec(x.zakat_amount ?? 0); const n = dec(x.net_amount);
    gross = gross.plus(g); tax = tax.plus(tx); zakat = zakat.plus(z); net = net.plus(n);
    const s = bySym.get(x.symbol) ?? { symbol: x.symbol, companyName: x.company_name ?? null, gross: ZERO, deductions: ZERO, net: ZERO, count: 0, last: null };
    s.gross = s.gross.plus(g); s.deductions = s.deductions.plus(tx).plus(z); s.net = s.net.plus(n); s.count += 1;
    if (!s.last || x.payment_date > s.last) s.last = x.payment_date;
    bySym.set(x.symbol, s);
  }
  const bySymbol = new Map([...bySym].map(([k, s]) => [k, { ...s, gross: r2(s.gross), deductions: r2(s.deductions), net: r2(s.net) }]));

  const months = [];
  const first = all.map((x) => x.payment_date).sort()[0];
  if (first && first <= endEff) {
    const from = start > first ? start : first;
    for (let m = monthKey(from); m <= monthKey(endEff) && months.length < 120; m = nextMonth(m)) {
      let g = ZERO; let d = ZERO; let n = ZERO;
      for (const x of rows) {
        if (monthKey(x.payment_date) !== m) continue;
        g = g.plus(dec(x.gross_amount));
        d = d.plus(dec(x.tax_amount ?? 0)).plus(dec(x.jh_tax_amount ?? 0)).plus(dec(x.zakat_amount ?? 0));
        n = n.plus(dec(x.net_amount));
      }
      months.push({ month: m, label: MON[Number(m.slice(5, 7)) - 1], gross: r2(g), cgt: r2(d), net: r2(n) });
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  return { count: rows.length, gross: r2(gross), tax: r2(tax), zakat: r2(zakat), deductions: r2(tax.plus(zakat)), net: r2(net), bySymbol, months, rows };
}

/** Validate a manual entry before the round-trip; returns an error message or null. */
export function validateDividend(f, today = new Date().toISOString().slice(0, 10)) {
  const n = (v) => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(/,/g, '')));
  const symbol = String(f.symbol ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,15}$/.test(symbol)) return 'Enter the stock symbol, e.g. FFC';
  if (!f.payment_date) return 'Enter the payment date';
  if (f.payment_date > today) return 'The payment date cannot be in the future';
  if (f.issue_date && f.issue_date > f.payment_date) return 'The issue date cannot be after the payment date';
  if (!(n(f.shares) > 0)) return 'Shares must be more than zero';
  const g = n(f.gross_amount); const tx = n(f.tax_amount || 0); const z = n(f.zakat_amount || 0); const net = n(f.net_amount);
  if (!(g >= 0) || !Number.isFinite(g)) return 'Enter the gross dividend';
  if (!(tx >= 0) || !(z >= 0)) return 'Tax and zakat cannot be negative';
  if (tx + z > g + 1e-9) return 'Tax and zakat cannot be more than the gross dividend';
  if (!(net >= 0) || !Number.isFinite(net)) return 'Enter the net dividend received';
  return null;
}

/**
 * Parsed rows vs dividends on file → per dividendKey:
 *   'saved'    the same warrant is already saved (cannot be added again)
 *   'possible' same stock and payment date and the same gross or net, saved
 *              without this warrant (usually entered by hand)
 */
export function dividendDuplicates(rows, existing) {
  const keys = new Set(existing.map(dividendKey));
  const byDay = new Map();
  for (const x of existing) {
    const k = `${x.symbol}|${x.payment_date}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(x);
  }
  const same = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
  const out = {};
  for (const r of rows) {
    const key = dividendKey(r);
    if (keys.has(key)) { out[key] = 'saved'; continue; }
    const day = byDay.get(`${r.symbol}|${r.payment_date}`) ?? [];
    if (day.some((x) => (x.warrant_no ?? null) !== (r.warrant_no ?? null) && (same(x.gross_amount, r.gross_amount) || same(x.net_amount, r.net_amount)))) out[key] = 'possible';
  }
  return out;
}
