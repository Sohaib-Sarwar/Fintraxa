/**
 * Passive income: dividends, mutual-fund realized profit and savings profit
 * (plus any other income category marked passive) as one stream of dated
 * events, and the analysis the Passive Income page and Personal Finance read.
 * Pure and exact (decimal.js); unit-tested in scripts/psx/passive.test.mjs.
 *
 * Sources and when each counts:
 *   dividends     each warrant on its payment date; net as printed by CDC,
 *                 tax = withholding + joint-holder tax + zakat
 *   mutual_funds  realized profit per month (src/lib/mf/profit.js months), posted
 *                 on the month's last day; the open month counts "so far" on today
 *   savings       income entries in a category with a default tax rate (Savings
 *                 profit): gross, tax and net as entered
 *   other         any other income category marked passive
 */
import Decimal from 'decimal.js';

const ZERO = new Decimal(0);
const D = (v) => new Decimal(String(v ?? 0));
const r2 = (d) => Number(d.toFixed(2));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };

export const SOURCES = ['mutual_funds', 'dividends', 'savings', 'other'];
export const SOURCE_LABEL = { mutual_funds: 'Mutual funds', dividends: 'Dividends', savings: 'Savings profit', other: 'Other passive' };
/** Seconds in an average month (365.25 / 12 days). */
const MONTH_SECONDS = 30.4375 * 86400;

/** Pakistan withholding on bank profit: tax rounded to the paisa, net = gross − tax (they always add up). */
export function savingsTax(gross, rate = 0.2) {
  let g;
  try { g = D(String(gross ?? '').replace(/,/g, '').trim() || 'x'); } catch { return null; } // half-typed input
  if (!g.isFinite() || g.lte(0)) return null;
  const tax = g.times(D(rate)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { gross: g.toFixed(2), tax: tax.toFixed(2), net: g.minus(tax).toFixed(2), rate: Number(rate) };
}

/** Is this income category passive, and which source does it feed? */
export function passiveSource(category) {
  if (!category || category.kind !== 'passive') return null;
  return category.default_tax_rate !== null && category.default_tax_rate !== undefined ? 'savings' : 'other';
}

/**
 * All passive income as dated events.
 * @param {object} a
 * @param {object[]} a.mfMonths     all-time realized months from analyzeFunds: { month, gross, cgt, net }
 * @param {object[]} a.dividends    stock_dividends rows
 * @param {object[]} a.transactions income_expense_transactions rows with categories(kind, default_tax_rate, name, icon)
 * @param {string}   a.today        ISO date (local)
 * @returns {object[]} { id, date, month, source, title, sub, symbol?, gross, tax, net, posted }
 */
export function passiveEvents({ mfMonths = [], dividends = [], transactions = [], today }) {
  const out = [];
  const openMonth = today.slice(0, 7);
  for (const m of mfMonths) {
    if (!Number(m.gross) && !Number(m.cgt) && !Number(m.net)) continue;
    if (m.month > openMonth) continue;
    const open = m.month === openMonth;
    out.push({
      id: `mf-${m.month}`, date: open ? today : monthEnd(m.month), month: m.month, source: 'mutual_funds',
      title: 'Mutual funds', sub: open ? 'Realized this month so far; posts at month end' : 'Realized profit, posted at month end',
      gross: D(m.gross), tax: D(m.cgt), net: D(m.net), posted: !open,
    });
  }
  for (const d of dividends) {
    out.push({
      id: `div-${d.id ?? `${d.symbol}-${d.payment_date}-${d.warrant_no}`}`, date: d.payment_date, month: d.payment_date.slice(0, 7), source: 'dividends',
      title: d.symbol, sub: d.company_name ?? 'Dividend', symbol: d.symbol,
      gross: D(d.gross_amount), tax: D(d.tax_amount).plus(D(d.jh_tax_amount)).plus(D(d.zakat_amount)), net: D(d.net_amount), posted: true,
    });
  }
  for (const t of transactions) {
    if (t.type !== 'credit') continue;
    const source = passiveSource(t.categories);
    if (!source) continue;
    const net = D(t.amount);
    const gross = t.gross_amount !== null && t.gross_amount !== undefined ? D(t.gross_amount) : net;
    const acct = t.savings_accounts; // the savings account it was credited to, when recorded
    out.push({
      id: `tx-${t.id}`, date: t.date, month: t.date.slice(0, 7), source,
      title: acct?.name ?? t.categories?.name ?? SOURCE_LABEL[source],
      sub: acct?.bank_name ?? (t.notes || (source === 'savings' ? 'Profit credited' : 'Passive income')),
      symbol: acct?.bank_symbol ?? null, accountId: t.savings_account_id ?? null,
      gross, tax: gross.minus(net), net, posted: true, transactionId: t.id,
    });
  }
  return out.filter((e) => e.date <= today).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
}

const blank = () => Object.fromEntries(SOURCES.map((s) => [s, { gross: ZERO, tax: ZERO, net: ZERO, count: 0 }]));

/**
 * Analysis for a date range (by event date).
 * @returns {{ start, end, totals, bySource, months, avgPerMonth, elapsedMonths, effectiveTaxRate,
 *   mom, runRate3, perSecond, perNight, events, trackingStart }}
 */
export function analyzePassive(events, { start = '0000-01-01', end, today }) {
  const endEff = end && end < today ? end : today;
  const rows = events.filter((e) => e.date >= start && e.date <= endEff);
  const bySrc = blank();
  let gross = ZERO; let tax = ZERO; let net = ZERO;
  for (const e of rows) {
    const s = bySrc[e.source];
    s.gross = s.gross.plus(e.gross); s.tax = s.tax.plus(e.tax); s.net = s.net.plus(e.net); s.count += 1;
    gross = gross.plus(e.gross); tax = tax.plus(e.tax); net = net.plus(e.net);
  }
  const fmt = (s) => ({ gross: r2(s.gross), tax: r2(s.tax), net: r2(s.net), count: s.count });

  // Months: from the later of the range start and the first passive income ever, to the range end.
  const trackingStart = events[0]?.month ?? null;
  const months = [];
  if (trackingStart) {
    const from = start.slice(0, 7) > trackingStart ? start.slice(0, 7) : trackingStart;
    for (let m = from; m <= endEff.slice(0, 7) && months.length < 600; m = nextMonth(m)) {
      const row = { month: m, label: MON[Number(m.slice(5, 7)) - 1], gross: ZERO, tax: ZERO, net: ZERO };
      for (const s of SOURCES) row[s] = ZERO;
      for (const e of rows) {
        if (e.month !== m) continue;
        row[e.source] = row[e.source].plus(e.net);
        row.gross = row.gross.plus(e.gross); row.tax = row.tax.plus(e.tax); row.net = row.net.plus(e.net);
      }
      months.push(Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Decimal ? r2(v) : v])));
    }
    if (months.length > 12) for (const x of months) x.label = `${x.label} ${x.month.slice(2, 4)}`;
  }

  // Averages use elapsed months only: from the range start (or tracking start) to the range end (or today).
  const elapsed = months.length;
  const avg = elapsed ? net.dividedBy(elapsed) : ZERO;

  // Month-on-month: the last complete month inside the range vs the month before it (all data, not just the range).
  const monthNet = (m) => events.filter((e) => e.month === m).reduce((s, e) => s.plus(e.net), ZERO);
  const lastComplete = endEff.slice(0, 7) < today.slice(0, 7) ? endEff.slice(0, 7) : prevMonth(today.slice(0, 7));
  let mom = null;
  if (trackingStart && lastComplete >= trackingStart) {
    const cur = monthNet(lastComplete); const prev = monthNet(prevMonth(lastComplete));
    mom = { month: lastComplete, net: r2(cur), previous: r2(prev), changePct: prev.isZero() ? null : Number(cur.minus(prev).dividedBy(prev.abs()).times(100).toFixed(1)) };
  }
  // Run-rate: the last three complete months.
  let runRate3 = null;
  if (trackingStart && lastComplete >= trackingStart) {
    const ms = [lastComplete, prevMonth(lastComplete), prevMonth(prevMonth(lastComplete))].filter((m) => m >= trackingStart);
    const sum = ms.reduce((s, m) => s.plus(monthNet(m)), ZERO);
    runRate3 = { months: ms.length, perMonth: r2(sum.dividedBy(ms.length)) };
  }

  const perSecond = Number(avg.dividedBy(MONTH_SECONDS).toFixed(8));
  const grossPositive = rows.reduce((s, e) => (e.gross.gt(0) ? s.plus(e.gross) : s), ZERO);
  return {
    start, end: endEff, trackingStart,
    totals: { gross: r2(gross), tax: r2(tax), net: r2(net), count: rows.length },
    bySource: Object.fromEntries(SOURCES.map((s) => [s, fmt(bySrc[s])])),
    months,
    elapsedMonths: elapsed,
    avgPerMonth: r2(avg),
    effectiveTaxRate: grossPositive.gt(0) ? Number(tax.dividedBy(grossPositive).times(100).toFixed(1)) : null,
    mom, runRate3,
    perSecond,
    perNight: Number(avg.dividedBy(MONTH_SECONDS).times(8 * 3600).toFixed(2)),
    events: rows,
  };
}

/** Months → fiscal years (1 Jul – 30 Jun), every numeric column summed exactly. */
export function passiveByFiscalYear(months) {
  const years = new Map();
  for (const m of months) {
    const [y, mo] = m.month.split('-').map(Number);
    const fy = mo >= 7 ? y : y - 1;
    if (!years.has(fy)) years.set(fy, {});
    const acc = years.get(fy);
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number') acc[k] = (acc[k] ?? ZERO).plus(D(v));
  }
  return [...years.entries()].sort((a, b) => a[0] - b[0]).map(([fy, v]) => {
    const short = `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`;
    return { month: `${fy}-07`, label: short, tick: short, title: `FY ${fy}-${String(fy + 1).slice(2)}`, ...Object.fromEntries(Object.entries(v).map(([k, d]) => [k, r2(d)])) };
  });
}

/** Closed months of mutual-fund realized profit, shaped for sync_passive_postings(). */
export function mfPostingRows(mfMonths, today) {
  const open = today.slice(0, 7);
  return mfMonths
    .filter((m) => m.month < open && (Number(m.gross) || Number(m.cgt) || Number(m.net)))
    .map((m) => {
      const g = D(m.gross); const tx = D(m.cgt); const n = D(m.net);
      const ch = g.minus(tx).minus(n); // charges are whatever separates net from gross − CGT
      return { period: `${m.month}-01`, gross: r2(g), tax: r2(tx), charges: r2(ch.lt(0) ? ZERO : ch), net: r2(ch.lt(0) ? g.minus(tx) : n), sales: m.sales ?? 0 };
    });
}
