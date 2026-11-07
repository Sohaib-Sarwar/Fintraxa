/**
 * PSX cash dividends: statement parsing and range summaries. Pure, no React,
 * no network, exact decimals (decimal.js), so it is unit-tested directly
 * (scripts/psx/dividends.test.mjs).
 *
 * Statement format: the CDC / registrar "dividend statement" table, as text
 * copied out of the PDF:
 *
 *   Payment Date | Dividend Issue Date | Sec. Symbol - Sec. Name | Part. ID - A/c # / Folio #
 *   | Warrant # | Filer Status | No. of Securities | Gross Dividend | Tax | JH's Tax | Zakat | Net Dividend
 *
 * Company names wrap over several lines and the filer status is free text
 * ("Filer", "NONFILER", "Non Filler", "15%", "30%"), so rows are matched on
 * the whole text with whitespace collapsed, anchored on the two dates at the
 * start and the six numbers at the end. Deterministic on purpose: no LLM.
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
  const [d, m, y] = s.split('/').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

const NUM = '(\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)';
const ROW = new RegExp(
  '(\\d{2}/\\d{2}/\\d{4})\\s+(\\d{2}/\\d{2}/\\d{4})\\s+'        // payment date, issue date
  + '([A-Z0-9][A-Z0-9.\\-]{0,15})\\s*-\\s+(.+?)\\s+'              // symbol - name (lazy, wraps)
  + '(\\d{3,8}-\\d{3,12})\\s+'                                    // participant id - account
  + '(\\S+)\\s+'                                                   // warrant #
  + '(.{1,20}?)\\s+'                                               // filer status (free text)
  + `${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`     // securities, gross, tax, JH tax, zakat, net
  + '(?=\\s+\\d{2}/\\d{2}/\\d{4}|\\s+Total\\b|\\s*$)',
  'g',
);
const TOTAL = new RegExp(`\\bTotal\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}\\s+${NUM}`);

/**
 * Text of one or more dividend statements → rows ready to insert, plus checks.
 * @returns {{ rows: object[], statements: object[], warnings: string[] }}
 *   rows: { payment_date, issue_date, symbol, company_name, account_ref, warrant_no,
 *           filer_status, filer_status_raw, shares, gross_amount, tax_amount, jh_tax_amount,
 *           zakat_amount, net_amount, source: 'statement', netGap }  (amounts as strings)
 *   statements: per pasted statement, { rows, totals (printed) | null, matches }
 */
export function parseDividendStatement(text) {
  const warnings = [];
  // \s also matches the no-break spaces PDFs put in copied text.
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  // Several statements pasted together: each table ends with its own "Total" line.
  const chunks = flat.split(/(?<=\bTotal(?:\s+[\d,.]+){5})(?=\s|$)/).map((c) => c.trim()).filter(Boolean);
  const rows = [];
  const statements = [];
  for (const chunk of chunks) {
    const found = [];
    for (const m of chunk.matchAll(ROW)) {
      const [, pay, issue, symbol, name, account, warrant, filerRaw, qty, gross, tax, jh, zakat, net] = m;
      const payment = isoFromDmy(pay);
      const issued = isoFromDmy(issue);
      if (!payment) { warnings.push(`Skipped a ${symbol} row: payment date ${pay} is not a real date`); continue; }
      const g = dec(gross); const tx = dec(tax); const j = dec(jh); const z = dec(zakat); const n = dec(net);
      const gap = n.minus(g.minus(tx).minus(j).minus(z));
      found.push({
        payment_date: payment,
        issue_date: issued && issued <= payment ? issued : null,
        symbol,
        company_name: name.replace(/\s+/g, ' ').trim(),
        account_ref: account,
        warrant_no: warrant,
        filer_status: normFiler(filerRaw),
        filer_status_raw: filerRaw.trim(),
        shares: dec(qty).toString(),
        gross_amount: g.toFixed(2),
        tax_amount: tx.toFixed(2),
        jh_tax_amount: j.toFixed(2),
        zakat_amount: z.toFixed(2),
        net_amount: n.toFixed(2),
        source: 'statement',
        netGap: r2(gap),
      });
    }
    if (!found.length) continue;
    const t = chunk.match(TOTAL);
    const totals = t ? { gross: r2(dec(t[1])), tax: r2(dec(t[2])), jhTax: r2(dec(t[3])), zakat: r2(dec(t[4])), net: r2(dec(t[5])) } : null;
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
  // The same warrant twice in one paste (statement pasted twice) is kept once.
  const seen = new Set();
  const unique = rows.filter((x) => { const k = dividendKey(x); if (seen.has(k)) return false; seen.add(k); return true; });
  if (unique.length < rows.length) warnings.push(`${rows.length - unique.length} repeated row${rows.length - unique.length === 1 ? '' : 's'} ignored`);
  return { rows: unique, statements, warnings };
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
