/**
 * Deterministic normalisation of Gemini's per-chunk output into staged
 * events. No AI here: parsing, evidence checks, grouping repair, gross/net
 * resolution and the unit-direction rules are all plain code with exact
 * decimals.
 *
 * Warning severities:
 *   info     — recorded, never blocks anything
 *   warning  — blocks automatic approval; a person can approve
 *   error    — blocks automatic approval; must be fixed (edited) or excluded
 */
import { Decimal, parseFigure, magnitude, parseDate, halfUlp, squash, FigureError } from './numbers.js';

export const PARSER_VERSION = 'mf-normalize-1';

const UNIT_IN = new Set(['purchase', 'switch_in', 'transfer_in', 'dividend_reinvest', 'bonus_units', 'capital_refund_units', 'cgt_refund_reinvest']);
const UNIT_OUT = new Set(['redemption', 'switch_out', 'transfer_out']);
const CASH_ONLY = new Set(['dividend_cash', 'cgt_deduction', 'cgt_reversal', 'cgt_refund_cash', 'zakat_deduction', 'wht_deduction', 'sales_load', 'fee_charge']);

export const unitRule = (t) => (UNIT_IN.has(t) ? 'in' : UNIT_OUT.has(t) ? 'out' : CASH_ONLY.has(t) ? 'none' : 'any');

const CASH_DIRECTION = {
  purchase: 'investor_pays', redemption: 'investor_receives',
  switch_in: 'internal', switch_out: 'internal', transfer_in: 'none', transfer_out: 'none',
  dividend_cash: 'investor_receives', dividend_reinvest: 'internal', bonus_units: 'none',
  capital_refund_units: 'internal', cgt_refund_reinvest: 'internal',
  cgt_refund_cash: 'investor_receives', cgt_reversal: 'investor_receives',
  cgt_deduction: 'none', zakat_deduction: 'none', wht_deduction: 'none', sales_load: 'none',
  fee_charge: 'none', other_adjustment: 'none', unknown: null,
};

// Deductions from an outflow's gross; costs taken from an inflow before units are allotted.
const OUTFLOW_DEDUCTIONS = new Set(['cgt', 'zakat', 'wht', 'back_load', 'charge', 'transaction_cost', 'other_deduction']);
const INFLOW_COSTS = new Set(['front_load', 'load_tax', 'transaction_cost', 'charge']);

const DATE_AT_START = /^\s*(?:\d{1,2}[-/ ](?:[A-Za-z]{3,9}|\d{1,2})[-/ ]\d{2,4}|[A-Za-z]{3}-\d{2}-\d{4})\b/;
const HAS_FIGURE = /\(?-?\s?\d[\d,]*\.\d+\)?|\b\d{1,3}(?:,\d{3})+\b|\s\d+\s*$/;

export function normalizeUnitClass(s) {
  return String(s ?? '').toUpperCase().replace(/['"`]/g, '').replace(/\s+/g, ' ').trim();
}

export function fundKey(name) {
  return String(name ?? '').toLowerCase()
    .replace(/\s*-\s*(class|growth|income|units?)\b.*$/i, '')
    .replace(/[^a-z0-9()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const warn = (code, severity, message, extra) => ({ code, severity, message, ...(extra ?? {}) });

/**
 * @param {object} p
 * @param {{index: number, page: number, main: any[], contextBefore: any[], contextAfter: any[]}[]} p.chunks
 * @param {(object|null)[]} p.results  Gemini data per chunk (null when the chunk failed)
 * @param {{id: string, page: number, n: number, text: string}[]} p.lines redacted lines
 * @param {object} [p.profile] AMC statement profile (mf_amcs.statement_profile)
 */
export function normalizeExtraction({ chunks, results, lines, profile = {} }) {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const order = new Map(lines.map((l, i) => [l.id, i]));
  const issues = [];

  // ── Statement header ──
  const statement = { amcName: null, periodFrom: null, periodTo: null };
  for (const r of results) {
    if (!r) continue;
    statement.amcName ??= r.statement?.amc_name_printed || null;
    statement.periodFrom ??= parseDate(r.statement?.period_from_text) || null;
    statement.periodTo ??= parseDate(r.statement?.period_to_text) || null;
  }

  // ── Sections, merged across chunks by fund + class ──
  const sections = new Map();
  const sectionOfChunk = new Map();   // `${chunk}:${section_id}` → key
  results.forEach((r, ci) => {
    if (!r) return;
    for (const s of r.sections) {
      const unitClass = normalizeUnitClass(s.unit_class_printed);
      const key = `${fundKey(s.fund_name_printed)}|${unitClass}`;
      sectionOfChunk.set(`${ci}:${s.section_id}`, key);
      const cur = sections.get(key) ?? {
        key, fundNamePrinted: s.fund_name_printed.trim(), unitClass,
        opening: null, closing: null, valuation: null, lineIds: new Set(),
      };
      const fig = (t, id) => {
        if (!t || !id || !lineById.has(id)) return null;
        if (!squash(lineById.get(id).text).includes(squash(t))) return null;   // evidence
        try { return parseFigure(t)?.value ?? null; } catch { return null; }
      };
      const open = fig(s.opening_units_text, s.opening_line_id);
      if (open !== null && cur.opening === null) cur.opening = { units: open, lineId: s.opening_line_id };
      const close = fig(s.closing_units_text, s.closing_line_id);
      if (close !== null) cur.closing = { units: close, lineId: s.closing_line_id };
      const price = fig(s.valuation_price_text, s.valuation_line_id);
      if (price !== null && Number(price) > 0) {
        cur.valuation = {
          price, date: parseDate(s.valuation_date_text), lineId: s.valuation_line_id,
          value: fig(s.valuation_value_text, s.valuation_line_id),
        };
      }
      for (const id of [s.opening_line_id, s.closing_line_id, s.valuation_line_id]) if (id) cur.lineIds.add(id);
      sections.set(key, cur);
    }
  });

  // ── Events: keep each once, only from the chunk whose MAIN holds its primary line ──
  const raw = [];
  const seenPrimary = new Set();
  const skipped = new Set();
  results.forEach((r, ci) => {
    if (!r) return;
    const chunk = chunks[ci];
    const mainIds = new Set(chunk.main.map((l) => l.id));
    for (const s of r.skipped_lines ?? []) if (mainIds.has(s.line_id)) skipped.add(s.line_id);
    for (const e of r.events) {
      if (!mainIds.has(e.primary_line_id)) {
        issues.push(warn('EVENT_OUTSIDE_MAIN', 'info', 'An event starting outside its page was ignored; the page that holds it reports it.'));
        continue;
      }
      if (seenPrimary.has(e.primary_line_id)) continue;
      seenPrimary.add(e.primary_line_id);
      raw.push({ e, ci, sectionKey: sectionOfChunk.get(`${ci}:${e.section_id}`) ?? null });
    }
  });
  raw.sort((a, b) => (order.get(a.e.primary_line_id) ?? 0) - (order.get(b.e.primary_line_id) ?? 0));

  let events = raw.map(({ e, sectionKey }) => parseEvent(e, sectionKey, lineById, order));

  // ── Grouping repair: a standalone CGT row belongs to the outflow before it ──
  events = mergeStandaloneTax(events);

  // ── Amounts, directions, required fields ──
  events = events.map((ev, i) => finalizeEvent(ev, i, profile));

  // ── Coverage: dated lines with figures that nobody accounted for ──
  const cited = new Set(events.flatMap((e) => e.line_ids));
  for (const s of sections.values()) for (const id of s.lineIds) cited.add(id);
  const uncited = [];
  for (const c of chunks) {
    if (!results[c.index]) continue;
    for (const l of c.main) {
      if (cited.has(l.id) || skipped.has(l.id)) continue;
      if (DATE_AT_START.test(l.text) && HAS_FIGURE.test(l.text.replace(DATE_AT_START, ''))) uncited.push(l.id);
    }
  }
  for (const id of uncited) {
    const before = events.filter((e) => (order.get(e.source_key) ?? 0) < (order.get(id) ?? 0)).pop();
    const target = before ?? events[0];
    if (target) {
      target.warnings.push(warn('UNCITED_LINE', 'warning',
        `A dated line near this transaction (${id}) was not extracted. Check that no transaction is missing.`, { lineId: id }));
    } else {
      issues.push(warn('UNCITED_LINE', 'warning', `Dated line ${id} was not extracted.`, { lineId: id }));
    }
  }

  // ── Sections that had events but no header come from orphan events ──
  for (const ev of events) {
    if (!ev.section_key) {
      ev.warnings.push(warn('NO_SECTION', 'error', 'Could not tell which fund this transaction belongs to.'));
    } else if (!sections.has(ev.section_key)) {
      const [name, cls] = ev.section_key.split('|');
      sections.set(ev.section_key, { key: ev.section_key, fundNamePrinted: name, unitClass: cls, opening: null, closing: null, valuation: null, lineIds: new Set() });
    }
  }

  return { statement, sections: [...sections.values()].map((s) => ({ ...s, lineIds: [...s.lineIds] })), events, issues, uncited };
}

function parseEvent(e, sectionKey, lineById, order) {
  const warnings = [];
  const ids = [...new Set([e.primary_line_id, ...(e.line_ids ?? [])])].filter((id) => {
    if (lineById.has(id)) return true;
    warnings.push(warn('UNKNOWN_LINE', 'warning', `Cited line ${id} does not exist.`));
    return false;
  }).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const evidence = squash(ids.map((id) => lineById.get(id).text).join(' '));

  let evidenceOk = true;
  const check = (field, text) => {
    if (text === null || text === undefined || text === '') return;
    if (!evidence.includes(squash(text))) {
      evidenceOk = false;
      warnings.push(warn('EVIDENCE_MISMATCH', 'error', `"${field}" does not appear in the cited statement lines.`, { field }));
    }
  };
  const f = (field) => {
    const text = e[field];
    check(field, text);
    try {
      return parseFigure(text);
    } catch (err) {
      if (err instanceof FigureError) {
        evidenceOk = false;
        warnings.push(warn('UNPARSEABLE', 'error', `"${field}" is not a number.`, { field }));
        return null;
      }
      throw err;
    }
  };

  const units = f('units_text');
  const nav = f('nav_text');
  const gross = f('gross_amount_text');
  const net = f('net_amount_text');
  const amount = f('amount_text');
  const running = f('running_balance_units_text');
  check('trade_date_text', e.trade_date_text);
  check('price_date_text', e.price_date_text);

  const components = [];
  for (const c of e.components ?? []) {
    check(`component ${c.component_type}`, c.amount_text);
    let fig = null;
    try { fig = parseFigure(c.amount_text); } catch { fig = null; }
    if (fig === null || fig.value === null) {
      if (fig === null) warnings.push(warn('UNPARSEABLE', 'error', `Component ${c.component_type} amount is not a number.`));
      continue;   // "-" = not reported: no component at all, never a zero
    }
    components.push({ type: c.component_type, amount: magnitude(fig), dp: fig.dp, label: c.label_printed ?? null });
  }

  let externalRef = e.external_ref_text ?? null;
  if (externalRef) {
    externalRef = externalRef.replace(/\[[A-Z]+_\d+\]/g, '').replace(/^[\s-]+|[\s-]+$/g, '');
    if (!externalRef || !evidence.includes(squash(externalRef))) externalRef = null;
  }

  const tradeDate = parseDate(e.trade_date_text);
  if (e.trade_date_text && !tradeDate) warnings.push(warn('BAD_DATE', 'error', 'The transaction date could not be read.'));
  const priceDate = parseDate(e.price_date_text);

  if (e.confidence === 'low') warnings.push(warn('LOW_CONFIDENCE', 'warning', e.review_reason || 'The extractor was not confident about this row.'));
  else if (e.review_reason) warnings.push(warn('EXTRACTOR_NOTE', 'info', e.review_reason));

  return {
    source_key: e.primary_line_id,
    line_ids: ids,
    page: Number(String(e.primary_line_id).match(/^p(\d+)/)?.[1]) || null,
    section_key: sectionKey,
    original_labels: (e.labels_printed ?? []).map((s) => String(s).trim()).filter(Boolean),
    entry_type: e.event_type,
    trade_date: tradeDate,
    price_date: priceDate,
    _units: units, _nav: nav, _gross: gross, _net: net, _amount: amount,
    amount_column_header: e.amount_column_header ?? null,
    running_balance_units: running?.value ?? null,
    components,
    external_ref: externalRef,
    confidence: e.confidence ?? null,
    raw: e,
    warnings,
    evidence_ok: evidenceOk,
  };
}

function mergeStandaloneTax(events) {
  const out = [];
  for (const ev of events) {
    const prev = out[out.length - 1];
    const isTax = ev.entry_type === 'cgt_deduction' && (ev._units?.value == null || Number(ev._units.value) === 0);
    if (isTax && prev && unitRule(prev.entry_type) === 'out' && prev.section_key === ev.section_key
        && prev.trade_date && prev.trade_date === ev.trade_date && !prev.components.some((c) => c.type === 'cgt')) {
      const cgt = ev.components.find((c) => c.type === 'cgt')
        ?? (ev._amount?.value != null ? { type: 'cgt', amount: magnitude(ev._amount), dp: ev._amount.dp, label: ev.original_labels[0] ?? 'CGT' }
          : ev._gross?.value != null ? { type: 'cgt', amount: magnitude(ev._gross), dp: ev._gross.dp, label: ev.original_labels[0] ?? 'CGT' } : null);
      if (cgt) {
        prev.components.push(cgt);
        prev.line_ids = [...new Set([...prev.line_ids, ...ev.line_ids])];
        prev.original_labels = [...prev.original_labels, ...ev.original_labels];
        // MCB prints the net payout on the CGT row.
        if (prev._net == null && ev._net?.value != null) prev._net = ev._net;
        prev.warnings.push(...ev.warnings, warn('GROUPED_TAX', 'info', 'A separate CGT row was attached to this redemption.'));
        prev.evidence_ok = prev.evidence_ok && ev.evidence_ok;
        continue;
      }
    }
    out.push(ev);
  }
  return out;
}

function sumComponents(components, types) {
  return components.filter((c) => types.has(c.type)).reduce((s, c) => s.plus(c.amount), new Decimal(0));
}

function finalizeEvent(ev, seq, profile) {
  const type = ev.entry_type;
  const rule = unitRule(type);
  const w = ev.warnings;
  const units = ev._units?.value != null ? new Decimal(ev._units.value) : null;
  let nav = ev._nav?.value != null ? new Decimal(ev._nav.value).abs() : null;
  if (nav && nav.isZero()) {
    nav = null;   // "0.0000" in a NAV column means "no price", never a price of zero
    w.push(warn('NAV_NOT_REPORTED', 'info', 'The statement printed 0 for the price; stored as not reported.'));
  }

  // Unit direction comes from the event type; the printed sign must agree.
  let unitDelta = null;
  if (units && !units.isZero()) {
    const printedNegative = units.isNegative();
    if (rule === 'in') {
      if (printedNegative) w.push(warn('SIGN_CONFLICT', 'error', 'Units are printed as an outflow but the transaction adds units.'));
      unitDelta = units.abs();
    } else if (rule === 'out') {
      if (!printedNegative && /\(|-/.test(ev._units.raw) === false && profile.unsigned_outflow_units !== true) {
        // Statements here always mark outflow units; an unmarked one is suspicious.
        w.push(warn('SIGN_CONFLICT', 'warning', 'Units are not marked as an outflow on a redemption-type row.'));
      }
      unitDelta = units.abs().negated();
    } else if (rule === 'none') {
      w.push(warn('UNEXPECTED_UNITS', 'error', 'Units are printed on a cash-only transaction.'));
    } else {
      unitDelta = units;
    }
  }

  const comps = ev.components;
  let gross = ev._gross?.value != null ? new Decimal(ev._gross.value).abs() : null;
  let net = ev._net?.value != null ? new Decimal(ev._net.value).abs() : null;
  const amount = ev._amount?.value != null ? new Decimal(ev._amount.value).abs() : null;
  const amountDp = Math.max(ev._gross?.dp ?? 0, ev._net?.dp ?? 0, ev._amount?.dp ?? 0, profile.amount_dp ?? 0);
  const unitsDp = ev._units?.dp ?? profile.units_dp ?? 4;
  const navDp = ev._nav?.dp ?? 4;
  const value = unitDelta && nav ? unitDelta.abs().times(nav) : null;
  const tol = (k = 1) => halfUlp(amountDp).times(k)
    .plus(unitDelta ? unitDelta.abs().times(halfUlp(navDp)) : 0)
    .plus(nav ? nav.times(halfUlp(unitsDp)) : 0)
    .plus('0.01');

  if (rule === 'out') {
    const ded = sumComponents(comps, OUTFLOW_DEDUCTIONS);
    if (gross === null && net === null && amount !== null) {
      // One amount column: decide gross vs net from the arithmetic, then the AMC profile.
      if (value && value.minus(amount).abs().lte(tol())) { gross = amount; }
      else if (value && value.minus(amount.plus(ded)).abs().lte(tol(2))) { net = amount; }
      else if (profile.single_amount_outflow === 'net_of_tax') {
        net = amount;
        w.push(warn('AMOUNT_BASIS_ASSUMED', value ? 'warning' : 'info', 'Amount taken as net of tax, per this AMC\'s statement convention.'));
      } else {
        gross = amount;
        w.push(warn('AMOUNT_BASIS_ASSUMED', value ? 'warning' : 'info', 'Amount taken as gross.'));
      }
    }
    if (gross !== null && net === null) net = gross.minus(ded);
    if (net !== null && gross === null) gross = net.plus(ded);
    if (gross !== null && net !== null && gross.minus(ded).minus(net).abs().gt(halfUlp(amountDp).times(comps.length + 2).plus('0.01'))) {
      w.push(warn('NET_MISMATCH', 'warning', 'Gross minus reported deductions does not equal the net amount.'));
    }
    if (value && gross && value.minus(gross).abs().gt(tol(2))) {
      w.push(warn('ROW_MATH', 'warning', 'Units × price does not match the gross amount.'));
    }
  } else if (rule === 'in') {
    const costs = sumComponents(comps, INFLOW_COSTS);
    if (gross === null) gross = amount ?? (net !== null ? net.plus(costs) : null);
    if (net === null && gross !== null) net = gross.minus(costs);
    // Reinvested refunds/distributions: the amount is the reinvested sum.
    if (type === 'cgt_refund_reinvest' && gross && !comps.some((c) => c.type === 'cgt_refund' || c.type === 'cgt_reversal')) {
      comps.push({ type: 'cgt_refund', amount: gross.toFixed(amountDp), dp: amountDp, label: ev.original_labels.join(' ') });
    }
    if (value && net && value.minus(net).abs().gt(tol(2)) && value.minus(gross).abs().gt(tol(2))) {
      w.push(warn('ROW_MATH', 'warning', 'Units × price does not match the amount invested.'));
    }
  } else {
    gross ??= amount ?? net ?? (comps[0] ? new Decimal(comps[0].amount) : null);
    net ??= gross;
    const implied = { cgt_deduction: 'cgt', cgt_reversal: 'cgt_reversal', cgt_refund_cash: 'cgt_refund', zakat_deduction: 'zakat', wht_deduction: 'wht', sales_load: 'front_load', fee_charge: 'charge' }[type];
    if (implied && gross && !comps.some((c) => c.type === implied)) {
      comps.push({ type: implied, amount: gross.toFixed(amountDp), dp: amountDp, label: ev.original_labels.join(' ') });
    }
  }

  const missing = [];
  if (!ev.trade_date) missing.push('trade_date');
  if ((rule === 'in' || rule === 'out') && unitDelta === null) missing.push('units');
  if (gross === null && net === null) missing.push('amount');
  if ((rule === 'in' || rule === 'out') && nav === null && type !== 'capital_refund_units' && type !== 'bonus_units') {
    w.push(warn('NAV_MISSING', 'info', 'No price printed for this transaction.'));
  }
  if (type === 'unknown') w.push(warn('UNKNOWN_TYPE', 'error', 'Transaction type could not be determined. Classify it before approving.'));
  for (const m of missing) w.push(warn('MISSING_FIELD', 'error', `Required field missing: ${m}.`, { field: m }));

  const toStr = (d, dp) => (d === null ? null : d.toFixed(dp));
  const result = {
    source_key: ev.source_key,
    seq: seq + 1,
    line_ids: ev.line_ids,
    page: ev.page,
    section_key: ev.section_key,
    original_labels: ev.original_labels,
    original_label: ev.original_labels[0] ?? type,
    entry_type: type,
    trade_date: ev.trade_date,
    price_date: ev.price_date,
    nav: nav ? nav.toFixed(navDp) : null,
    unit_delta: unitDelta ? unitDelta.toFixed(unitsDp) : null,
    gross_amount: toStr(gross, amountDp),
    net_amount: toStr(net, amountDp),
    cash_direction: CASH_DIRECTION[type] ?? null,
    external_ref: ev.external_ref,
    running_balance_units: ev.running_balance_units,
    components: comps.map(({ type: t, amount: a, label }) => ({ type: t, amount: a, label })),
    raw_extraction: ev.raw,
    warnings: w,
    missing_fields: missing,
    evidence_ok: ev.evidence_ok,
    confidence: ev.confidence,
    _unitsDp: unitsDp,
  };
  return result;
}

/** Does this event need a person? */
export const blocksAuto = (ev) => !ev.evidence_ok || ev.warnings.some((w) => w.severity !== 'info');
