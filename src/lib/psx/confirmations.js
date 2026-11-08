/**
 * Broker trade confirmations → trades. Pure and deterministic (no LLM), exact
 * decimals; unit-tested in scripts/psx/confirmations.test.mjs.
 *
 * Input is the PDF rebuilt into visual lines (supabase/functions/_shared/mf/pdfRows.js
 * buildPageLines): each line has `cells` = [{ text, x0, x1 }] left to right.
 *
 * Brokers:
 *   AKD Securities  account like "COZZ12345"; one confirmation per day with a
 *                   P U R C H A S E and/or S A L E section, every charge in its
 *                   own column, memo "yymmdd/ACCOUNT".
 *   KTrade          client code like "P12345"; one PURCHASE or SALE CONFIRMATION
 *                   block per number, brokerage per row, SST / CVT per block.
 *
 * Fee per trade = |quantity × rate − the broker's net amount|, so a stored trade
 * reproduces the confirmation to the paisa even though the printed charge
 * columns are individually rounded. The breakdown is kept for the receipt.
 */
import Decimal from 'decimal.js';

const ZERO = new Decimal(0);
const NUM_RE = /^\(?-?[\d,]+(\.\d+)?\)?$/;
const isNum = (s) => NUM_RE.test(String(s).trim());
const dec = (s) => new Decimal(String(s).replace(/[,()]/g, '').trim() || '0');
const money = (d) => d.toFixed(2);
const compact = (line) => line.cells.map((c) => c.text).join('').replace(/\s+/g, '').toUpperCase();
const words = (line) => line.cells.map((c) => c.text).join(' ');
const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,15}$/;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const ROUNDING = new Decimal('0.05'); // printed charges are individually rounded

export const BROKERS = {
  akd: { code: 'akd', name: 'AKD Securities', logo: '/broker-logos/akd.webp' },
  ktrade: { code: 'ktrade', name: 'KTrade Securities', logo: '/broker-logos/ktrade.webp' },
};

export class ConfirmationError extends Error {
  constructor(message, code = 'unreadable') { super(message); this.name = 'ConfirmationError'; this.code = code; }
}

const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};
/** "September 07, 2026" | "07 Sep 2026" | "13/10/2026" → ISO date or null. */
export function parseDate(s) {
  const t = String(s ?? '').trim();
  let m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], Number(m[2]));
  m = t.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s-]+(\d{4})$/);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(Number(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], Number(m[1]));
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

/** Which broker issued this document, from its text. */
export function detectBroker(lines) {
  const text = lines.map(words).join('\n').toUpperCase();
  if (/AKD\s+SECURITIES/.test(text) || /\bCO[A-Z]{2}\d{4,}\b/.test(text)) return 'akd';
  if (/KTRADE\s+SECURITIES/.test(text) || /CLIENT\s+CODE\s*:?\s*P\d{3,}/.test(text)) return 'ktrade';
  return null;
}

/** Same symbol + side appearing twice in one confirmation gets #1, #2… so each trade keeps its own key. */
function withRefs(c) {
  const seen = new Map();
  for (const t of c.trades) {
    const k = `${t.type}|${t.symbol}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    t.source_ref = `${c.confirmation_no}|${t.type}|${t.symbol}|${n}`;
  }
  return c;
}

function trade({ type, symbol, company, qty, rate, net, charges }) {
  const q = dec(qty); const p = dec(rate); const n = dec(net).abs();
  const gross = q.times(p);
  const fee = type === 'buy' ? n.minus(gross) : gross.minus(n);
  const chargeSum = Object.values(charges).reduce((s, v) => s.plus(v), ZERO);
  const warnings = [];
  if (fee.lt(0)) warnings.push(`${symbol}: the broker's net amount implies negative charges`);
  else if (fee.minus(chargeSum).abs().gt(ROUNDING)) warnings.push(`${symbol}: charges add up to ${money(chargeSum)} but the net amount implies ${money(fee)}`);
  return {
    type, symbol, company_name: company ?? null,
    quantity: q.toString(), price: p.toString(),
    gross: money(gross), fee: money(fee.lt(0) ? chargeSum : fee), net: money(n),
    charges: Object.fromEntries(Object.entries(charges).map(([k, v]) => [k, Number(v.toFixed(2))])),
    warnings,
  };
}

// ── AKD ────────────────────────────────────────────────────────────────────
const AKD_CHARGES = ['commission', 'cvt_wht', 'secp_levy', 'psx_levy', 'sales_tax', 'nccpl', 'advance_tax', 'cdc'];

function parseAkd(lines) {
  const all = lines.map(words);
  const memoCell = lines.flatMap((l) => l.cells).map((c) => c.text).find((s) => /^\d{6}\/[A-Z0-9]+$/.test(s));
  const toLine = lines.find((l) => /^to$/i.test(l.cells[0]?.text ?? ''));
  const account = toLine ? (words(toLine).match(/-\s*([A-Z]{2,}\d{3,})\s*$/)?.[1] ?? null) : null;
  const dateLine = lines.find((l) => /^date$/i.test(l.cells[0]?.text ?? ''));
  const dateText = dateLine ? dateLine.cells.slice(1).map((c) => c.text).filter((s) => !/CONFIRMATION/i.test(s)).join(' ') : '';
  let tradeDate = parseDate(dateText);
  if (!tradeDate && memoCell) { const [y, m, d] = [memoCell.slice(0, 2), memoCell.slice(2, 4), memoCell.slice(4, 6)].map(Number); tradeDate = iso(2000 + y, m, d); }
  const settle = all.join(' ').match(/T\+\d\s*:\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/);
  const accountRef = account ?? memoCell?.split('/')[1] ?? null;
  if (!tradeDate) throw new ConfirmationError('Could not find the trade date on this AKD confirmation.');
  if (!accountRef) throw new ConfirmationError('Could not find the AKD account number on this confirmation.');

  const trades = []; const sectionTotals = { buy: ZERO, sell: ZERO }; const printedSection = { buy: null, sell: null };
  let side = null; let summary = { buy: null, sell: null };
  for (const l of lines) {
    const k = compact(l);
    if (k === 'PURCHASE') { side = 'buy'; continue; }
    if (k === 'SALE' || k === 'SELL') { side = 'sell'; continue; }
    const first = l.cells[0]?.text ?? '';
    if (/^total\s*:?$/i.test(first) && side) {
      const nums = l.cells.filter((c) => isNum(c.text));
      if (nums.length) printedSection[side] = dec(nums.at(-1).text).abs();
      continue;
    }
    if (/^buy amount/i.test(first) || k.startsWith('BUYAMOUNT')) {
      const cells = l.cells.map((c) => c.text);
      const after = (label) => { const i = cells.findIndex((s) => s.toLowerCase().startsWith(label)); return i >= 0 && isNum(cells[i + 1] ?? '') ? dec(cells[i + 1]).abs() : null; };
      summary = { buy: after('buy amount'), sell: after('sell amount') };
      continue;
    }
    if (!side || !SYMBOL_RE.test(first) || /^(TOTAL|CLIENT)$/i.test(first)) continue;
    const nums = l.cells.slice(1).filter((c) => isNum(c.text)).map((c) => c.text);
    if (nums.length < 11) continue;
    const [qty, rate, ...rest] = nums.slice(-11);
    const amount = rest.at(-1);
    const charges = Object.fromEntries(AKD_CHARGES.map((name, i) => [name, dec(rest[i])]));
    const t = trade({ type: side, symbol: first, qty, rate, net: amount, charges });
    trades.push(t);
    sectionTotals[side] = sectionTotals[side].plus(t.net);
  }
  if (!trades.length) throw new ConfirmationError('No trades were found on this AKD confirmation.', 'empty');

  const checks = [];
  for (const s of ['buy', 'sell']) {
    const printed = printedSection[s] ?? summary[s];
    if (sectionTotals[s].gt(0) || printed?.gt(0)) checks.push({ label: s === 'buy' ? 'Purchases' : 'Sales', parsed: money(sectionTotals[s]), printed: printed ? money(printed) : null, ok: printed ? printed.minus(sectionTotals[s]).abs().lte('0.01') : null });
  }
  return [withRefs({
    broker: 'akd', account_ref: accountRef, confirmation_no: memoCell ?? `${tradeDate.replace(/-/g, '').slice(2)}/${accountRef}`,
    trade_date: tradeDate, settlement_date: settle ? parseDate(settle[1]) : null, trades, checks,
  })];
}

// ── KTrade ─────────────────────────────────────────────────────────────────
function parseKtrade(lines) {
  const field = (label) => {
    for (const l of lines) {
      const i = l.cells.findIndex((c) => c.text.replace(/\s+/g, ' ').toLowerCase().startsWith(label));
      if (i >= 0 && l.cells[i + 1]) return l.cells[i + 1].text.trim();
    }
    return null;
  };
  const clientCode = field('client code');
  const tradeDate = parseDate(field('trade date'));
  const settlement = parseDate(field('settlement date'));
  if (!clientCode) throw new ConfirmationError('Could not find the KTrade client code on this confirmation.');
  if (!tradeDate) throw new ConfirmationError('Could not find the trade date on this KTrade confirmation.');

  const blocks = []; let cur = null; let inRows = false;
  const close = () => { if (cur?.rows.length) blocks.push(cur); cur = null; inRows = false; };
  for (const l of lines) {
    const k = compact(l);
    const title = k.match(/(PURCHASE|SALE|SELL)CONFIRMATION/);
    if (title) {
      close();
      cur = { side: title[1] === 'PURCHASE' ? 'buy' : 'sell', no: l.cells.map((c) => c.text).find((s) => /^\d{4,}$/.test(s)) ?? null, rows: [], extras: {}, printedTotal: null, grand: null };
      continue;
    }
    if (!cur) continue;
    if (/^security name/i.test(l.cells[0]?.text ?? '')) { inRows = true; continue; }
    if (k.startsWith('GRANDTOTAL')) {
      const nums = l.cells.filter((c) => isNum(c.text));
      if (nums.length) cur.grand = dec(nums.at(-1).text).abs();
      close();
      continue;
    }
    if (/^total$/i.test(l.cells[0]?.text ?? '')) {
      inRows = false;
      cur.afterTotal = true;
      const nums = l.cells.filter((c) => isNum(c.text));
      if (nums.length) cur.printedTotal = dec(nums.at(-1).text).abs();
      continue;
    }
    if (inRows) {
      const m = (l.cells[0]?.text ?? '').match(/^([A-Z][A-Z0-9.-]{0,15})\s*-\s*(.+)$/);
      const nums = l.cells.slice(1).filter((c) => isNum(c.text)).map((c) => c.text);
      if (m && nums.length >= 7) {
        const [qty, rate, , , , brk, amount] = nums.slice(-7);
        cur.rows.push({ symbol: m[1], company: m[2].trim(), qty, rate, brk: dec(brk), amount: dec(amount).abs() });
      }
      continue;
    }
    // Between TOTAL and GRAND TOTAL only: per-block charges such as SST and CVT.
    if (!cur.afterTotal) continue;
    const label = l.cells.find((c) => /^[A-Z][A-Z ./]{1,12}$/.test(c.text.trim()) && !isNum(c.text));
    const value = l.cells.filter((c) => isNum(c.text)).at(-1);
    if (label && value && l.cells.length <= 3) cur.extras[label.text.trim().toLowerCase().replace(/[^a-z]+/g, '_')] = dec(value.text);
  }
  close();
  if (!blocks.length) throw new ConfirmationError('No trades were found on this KTrade confirmation.', 'empty');

  return blocks.map((b) => {
    if (!b.no) throw new ConfirmationError('Could not find the confirmation number on this KTrade confirmation.');
    // Block charges (SST, CVT…) are shared out by each row's brokerage; the last row takes the rounding remainder.
    const extraTotal = Object.values(b.extras).reduce((s, v) => s.plus(v), ZERO);
    const brkTotal = b.rows.reduce((s, r) => s.plus(r.brk), ZERO);
    let left = extraTotal;
    const trades = b.rows.map((r, i) => {
      const share = i === b.rows.length - 1 ? left : (brkTotal.gt(0) ? extraTotal.times(r.brk).dividedBy(brkTotal) : extraTotal.dividedBy(b.rows.length)).toDecimalPlaces(2);
      left = left.minus(share);
      const net = b.side === 'buy' ? r.amount.plus(share) : r.amount.minus(share);
      const charges = { commission: r.brk };
      for (const [name, v] of Object.entries(b.extras)) charges[name] = extraTotal.gt(0) ? v.times(share).dividedBy(extraTotal) : ZERO;
      return trade({ type: b.side, symbol: r.symbol, company: r.company, qty: r.qty, rate: r.rate, net: money(net), charges });
    });
    const parsed = trades.reduce((s, t) => s.plus(t.net), ZERO);
    return withRefs({
      broker: 'ktrade', account_ref: clientCode, confirmation_no: b.no, trade_date: tradeDate, settlement_date: settlement,
      trades,
      checks: [{ label: b.side === 'buy' ? 'Purchases' : 'Sales', parsed: money(parsed), printed: b.grand ? money(b.grand) : null, ok: b.grand ? b.grand.minus(parsed).abs().lte('0.01') : null }],
    });
  });
}

/**
 * Lines of one PDF → confirmations.
 * @returns {{ broker: 'akd'|'ktrade', confirmations: Array<{ broker, account_ref, confirmation_no, trade_date,
 *   settlement_date, trades: object[], checks: Array<{ label, parsed, printed, ok }> }> }}
 * @throws {ConfirmationError} with a message fit to show the user
 */
export function parseConfirmation(lines) {
  if (!lines?.length) throw new ConfirmationError('This PDF has no readable text. If it is a scanned image, download the original from your broker.', 'no_text');
  const broker = detectBroker(lines);
  if (!broker) throw new ConfirmationError('This does not look like an AKD or KTrade trade confirmation.', 'unknown_broker');
  const confirmations = broker === 'akd' ? parseAkd(lines) : parseKtrade(lines);
  for (const c of confirmations) for (const t of c.trades) if (t.fee && Number(t.fee) < 0) t.fee = '0.00';
  return { broker, confirmations };
}

/** Rows to insert for a confirmation's selected trades. */
export function toTradeRows(c, trades) {
  return trades.map((t) => ({
    symbol: t.symbol, company_name: t.company_name, type: t.type,
    price: t.price, quantity: t.quantity, fee: t.fee, date: c.trade_date,
    broker: c.broker, account_ref: c.account_ref, source: 'confirmation', confirmation_no: c.confirmation_no,
    source_ref: t.source_ref, settlement_date: c.settlement_date && c.settlement_date >= c.trade_date ? c.settlement_date : null,
    charges: t.charges,
  }));
}

/**
 * Compare parsed trades with what is already on file.
 * Returns per source_ref: 'recorded' (same confirmation trade already imported) or
 * 'similar' (a manual trade with the same date, side, symbol, quantity and price), else absent.
 */
export function duplicateStatus(confirmations, existing) {
  const refs = new Set(existing.filter((x) => x.source_ref).map((x) => `${x.broker}|${x.source_ref}`));
  const manual = new Set(existing.filter((x) => !x.source_ref).map((x) => [x.date, x.type, String(x.symbol).trim().toUpperCase(), Number(x.quantity), Number(x.price)].join('|')));
  const out = {};
  for (const c of confirmations) {
    for (const t of c.trades) {
      if (refs.has(`${c.broker}|${t.source_ref}`)) out[t.source_ref] = 'recorded';
      else if (manual.has([c.trade_date, t.type, t.symbol, Number(t.quantity), Number(t.price)].join('|'))) out[t.source_ref] = 'similar';
    }
  }
  return out;
}

/**
 * Imported sales that sell more shares than the user's recorded holdings on
 * that date (existing trades plus the imported buys selected alongside them;
 * on one day, buys count before sells). Returns a Set of source_refs.
 */
export function oversoldRefs(confirmations, isSelected, existing) {
  const sym = (s) => String(s ?? '').trim().toUpperCase();
  const events = existing.map((x) => ({ date: x.date, symbol: sym(x.symbol), type: x.type, q: Number(x.quantity), ref: null }));
  for (const c of confirmations) {
    for (const t of c.trades) if (isSelected(t.source_ref)) events.push({ date: c.trade_date, symbol: t.symbol, type: t.type, q: Number(t.quantity), ref: t.source_ref });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'buy' ? -1 : 1));
  const held = new Map();
  const out = new Set();
  for (const e of events) {
    const h = held.get(e.symbol) ?? 0;
    if (e.type === 'buy') { held.set(e.symbol, h + e.q); continue; }
    if (e.ref && e.q > h + 1e-9) out.add(e.ref);
    held.set(e.symbol, Math.max(0, h - e.q));
  }
  return out;
}
