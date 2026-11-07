/**
 * Shared machinery for the per-AMC statement parsers.
 *
 * Every parser emits the same intermediate shape (the "parsed statement"):
 *   statement: { amc_name_printed, period_from_text, period_to_text }
 *   sections:  [{ section_id, fund_name_printed, unit_class_printed, opening_*, closing_*, valuation_* }]
 *   events:    [{ section_id, primary_line_id, line_ids, labels_printed, event_type, …_text, components }]
 *   skipped_lines: [{ line_id, reason }]
 *   amc_reported: optional figures the AMC prints about itself (gains), for cross-checks
 *
 * All figures stay *strings exactly as printed*; normalize.js parses them.
 */

export const DATE_RE = /^(?:\d{1,2}[-/ ][A-Za-z]{3}[-/ ]\d{2,4}|\d{1,2}-\d{1,2}-\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|[A-Za-z]{3}-\d{1,2}-\d{4})$/;
export const NUM_RE = /^\(?\s*[-+]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?\s*\)?-?$/;

export const isDate = (s) => DATE_RE.test(String(s ?? '').trim());
export const isNum = (s) => {
  const t = String(s ?? '').trim();
  return t !== '' && /\d/.test(t) && NUM_RE.test(t);
};
export const isDash = (s) => /^[-–—]$/.test(String(s ?? '').trim());
/** A figure cell: a number, or a dash meaning "nothing reported". */
export const isFigure = (s) => isNum(s) || isDash(s);
export const isZeroText = (s) => isNum(s) && Number(String(s).replace(/[(),\s]/g, '')) === 0;

/**
 * Column anchors from header line(s).
 * @param {{cells: {text: string, x0: number, x1: number}[]}[]} headerLines
 * @param {{key: string, re: RegExp}[]} specs  first matching cell wins
 */
export function anchorsFrom(headerLines, specs) {
  const anchors = [];
  for (const spec of specs) {
    for (const line of headerLines) {
      const cell = line.cells.find((c) => spec.re.test(c.text));
      if (cell) {
        anchors.push({ key: spec.key, x0: cell.x0, x1: cell.x1, xc: (cell.x0 + cell.x1) / 2 });
        break;
      }
    }
  }
  return anchors;
}

/**
 * Put each figure cell of a row under its column. Statements right-align
 * numbers, so distance is the smaller of right-edge and centre offsets.
 * @returns {{ cols: Record<string, string>, unassigned: string[] }}
 */
export function assignCells(cells, anchors, { minX = -Infinity, maxDist = 48, accept = isFigure } = {}) {
  const cols = {};
  const unassigned = [];
  for (const c of cells) {
    if (c.x0 < minX || !accept(c.text)) continue;
    const xc = (c.x0 + c.x1) / 2;
    let best = null;
    for (const a of anchors) {
      const d = Math.min(Math.abs(c.x1 - a.x1), Math.abs(xc - a.xc));
      if (!best || d < best.d) best = { a, d };
    }
    if (!best || best.d > maxDist || cols[best.a.key] !== undefined) unassigned.push(c.text);
    else cols[best.a.key] = c.text;
  }
  return { cols, unassigned };
}

/** Text of the cells left of `maxX` (the label area of a row). */
export const labelText = (cells, maxX) =>
  cells.filter((c) => c.x0 < maxX && !isDate(c.text)).map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();

export function makeEvent(p) {
  return {
    section_id: p.section,
    primary_line_id: p.primary,
    line_ids: [...new Set(p.lineIds ?? [p.primary])],
    labels_printed: p.labels ?? [],
    event_type: p.type,
    trade_date_text: p.date ?? null,
    price_date_text: p.priceDate ?? null,
    units_text: blankToNull(p.units),
    nav_text: blankToNull(p.nav),
    gross_amount_text: blankToNull(p.gross),
    net_amount_text: blankToNull(p.net),
    amount_text: blankToNull(p.amount),
    amount_column_header: p.amountHeader ?? null,
    components: (p.components ?? []).filter((c) => c && c.amount_text !== null && c.amount_text !== undefined && !isDash(c.amount_text)),
    running_balance_units_text: blankToNull(p.balance),
    external_ref_text: p.ref ?? null,
    review_reason: p.reason ?? null,
    confidence: p.confidence ?? 'high',
  };
}

export const component = (type, amountText, label, lineId) =>
  (amountText === null || amountText === undefined || amountText === '' || isDash(amountText)
    ? null
    : { component_type: type, amount_text: amountText, label_printed: label, line_id: lineId });

const blankToNull = (s) => (s === undefined || s === null || String(s).trim() === '' ? null : String(s).trim());

export function makeSection(id, fundName, unitClass) {
  return {
    section_id: id,
    fund_name_printed: fundName,
    unit_class_printed: unitClass ?? null,
    opening_units_text: null, opening_line_id: null,
    closing_units_text: null, closing_line_id: null,
    valuation_price_text: null, valuation_date_text: null, valuation_value_text: null, valuation_line_id: null,
  };
}

/**
 * Canonical type from a label and the direction of units. Labels are
 * evidence, units are proof: a label can never turn a unit outflow into a
 * purchase. Returns 'unknown' rather than guessing.
 */
export function classifyLabel(label, { unitsSign = 0, purchaseWords = [] } = {}) {
  const l = String(label).toLowerCase();
  const refund = /cgt[- ]?(refund|reimburse|reversal)|capital gains? tax (refund|reversal|reimburse)|tax refund/.test(l);
  if (refund) {
    if (unitsSign > 0) return 'cgt_refund_reinvest';
    return /revers/.test(l) ? 'cgt_reversal' : 'cgt_refund_cash';
  }
  if (/refund of capital|capital refund/.test(l)) return unitsSign > 0 ? 'capital_refund_units' : 'other_adjustment';
  if (/^cgt\b|capital gains? tax|\bcgt\*?$/.test(l)) return 'cgt_deduction';
  if (/zakat/.test(l)) return 'zakat_deduction';
  if (/withholding|\bwht\b/.test(l)) return 'wht_deduction';
  if (/bonus/.test(l)) return 'bonus_units';
  if (/dividend|income distribution|distribution/.test(l)) {
    if (unitsSign > 0 || /reinvest/.test(l)) return 'dividend_reinvest';
    return 'dividend_cash';
  }
  if (/conver(t|sion)\s*(in|from)|switch\s*(in|from)/.test(l)) return 'switch_in';
  if (/conver(t|sion)\s*(out|to)|switch\s*(out|to)/.test(l)) return 'switch_out';
  if (/transfer\s*(in|from)/.test(l)) return 'transfer_in';
  if (/transfer\s*(out|to)/.test(l)) return 'transfer_out';
  if (/transaction cost|charges?\b|\bfee\b/.test(l)) return 'fee_charge';
  if (/load/.test(l)) return 'sales_load';
  const buy = /purchase|investment|subscription|\bsale\b|issuance|issue of units/.test(l) || purchaseWords.some((w) => l.includes(w));
  const sell = /redemption|redeem|withdrawal|encash|ipayment|swiftpay|repurchase/.test(l);
  if (buy && !sell) return unitsSign < 0 ? 'unknown' : 'purchase';
  if (sell && !buy) return unitsSign > 0 ? 'unknown' : 'redemption';
  return 'unknown';
}

/** Sign of a printed unit figure: brackets or minus are outflows. */
export function signOf(text) {
  if (!isNum(text)) return 0;
  const t = String(text).trim();
  if (isZeroText(t)) return 0;
  return /^\(|^-|-$/.test(t) ? -1 : 1;
}

/** Trailing transaction reference in a wrapped MCB-style description. */
export function refFrom(texts) {
  for (const t of [...texts].reverse()) {
    const m = String(t).trim().match(/(?:^|-)(\d{4,6})$/);
    if (m) return m[1];
  }
  return null;
}

export class UnsupportedStatementError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedStatementError';
  }
}
