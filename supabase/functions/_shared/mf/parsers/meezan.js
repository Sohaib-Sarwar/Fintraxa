/**
 * Al Meezan Investment Management:
 *   Date | Transaction Type | Inflows (PKR) | Outflows (PKR) | NAV (PKR) | No. of Units | Unit Balance
 *
 * Conventions (see MUTUAL_FUND_STATEMENT_ANALYSIS.md §3.3):
 *   - blank cells carry an invisible "0" in the text layer;
 *   - outflows are printed NET of CGT; the CGT follows on its own dated row;
 *   - TRANSACTION COST is deducted from the conversion inflow before units;
 *   - CGT REFUND is reinvested as units.
 * Page 1's Balance Summary gives each fund's NAV and the AMC's own gain.
 */
import {
  anchorsFrom, assignCells, classifyLabel, component, isDate, isNum, isZeroText, labelText,
  makeEvent, makeSection, signOf,
} from './common.js';

const COLS = [
  { key: 'inflow', re: /^inflows/i },
  { key: 'outflow', re: /^outflows/i },
  { key: 'nav', re: /^nav/i },
  { key: 'units', re: /^no\.? of units$/i },
  { key: 'balance', re: /^unit balance$/i },
];

const CLASS_CELL = /^(?:GROWTH|INCOME|DIVIDEND|BONUS|CLASS|TYPE|PLAN)\b|^[A-Z]+-[A-Z0-9]$/i;

export function parseMeezan(pages) {
  const lines = pages.flat();
  const out = { statement: { amc_name_printed: 'Al Meezan Investment Management Limited', period_from_text: null, period_to_text: null }, sections: [], events: [], skipped_lines: [], amc_reported: { funds: {} } };

  // Balance Summary (page 1): ABBR | class | units | NAV | value | FYTD | To Date
  let summaryDate = null;
  for (const l of lines) {
    const sd = l.text.match(/Balance\s+Summary as at\s+(\S+)/i);
    if (sd) summaryDate = sd[1];
    const p = l.text.match(/Transaction\s+Details From\s+(\S+)\s+to\s+(\S+)/i);
    if (p && !out.statement.period_from_text) { out.statement.period_from_text = p[1]; out.statement.period_to_text = p[2]; }
    const c = l.cells.map((x) => x.text);
    if (c.length >= 7 && /^[A-Z]{2,8}$/.test(c[0]) && CLASS_CELL.test(c[1]) && c.slice(2).every(isNum)) {
      out.amc_reported.funds[c[0]] = {
        unit_class: c[1], units: c[2], nav: c[3], value: c[4], fytd_gain: c[5], to_date_gain: c[6],
        as_of: summaryDate, line_id: l.id,
      };
    }
  }

  let anchors = null;
  let labelMaxX = 0;
  let section = null;
  let abbr = null;

  for (const l of lines) {
    const first = l.cells[0]?.text ?? '';
    if (/^Date$/i.test(first) && l.cells.some((c) => /^Transaction Type$/i.test(c.text))) {
      anchors = anchorsFrom([l], COLS);
      labelMaxX = (anchors.find((a) => a.key === 'inflow')?.x0 ?? 210) - 5;
      continue;
    }
    if (!anchors) continue;

    // Section header: "<FUND NAME> (ABBR)    GROWTH-B"
    if (!isDate(first) && l.cells.some((c) => CLASS_CELL.test(c.text) && c.x0 > labelMaxX)
        && /\bFUND\b|\(([A-Z]{2,8})\)/i.test(l.text)) {
      const classCell = l.cells.find((c) => CLASS_CELL.test(c.text) && c.x0 > labelMaxX);
      const name = l.cells.filter((c) => c !== classCell).map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
      abbr = name.match(/\(([A-Z]{2,8})\)\s*$/)?.[1] ?? null;
      section = makeSection(`s${out.sections.length + 1}`, name.replace(/\s*\([A-Z]{2,8}\)\s*$/, '').trim(), classCell.text);
      section._abbr = abbr;
      out.sections.push(section);
      continue;
    }
    if (!section) continue;

    if (/^Opening unit balance$/i.test(first)) {
      section.opening_units_text = l.cells[l.cells.length - 1]?.text ?? null;
      section.opening_line_id = l.id;
      continue;
    }
    if (/^Unit balance$/i.test(first)) {
      section.closing_units_text = l.cells[l.cells.length - 1]?.text ?? null;
      section.closing_line_id = l.id;
      continue;
    }
    const val = l.text.match(/Value of investment as on\s+(\S+?)\(PKR\)\s+([\d,.]+)/i);
    if (val) {
      section.valuation_date_text = val[1];
      section.valuation_value_text = val[2];
      section.valuation_line_id = l.id;
      const s = out.amc_reported.funds[section._abbr];
      if (s && s.as_of === val[1]) section.valuation_price_text = s.nav;
      continue;
    }
    if (!isDate(first)) continue;

    const label = labelText(l.cells, labelMaxX);
    const { cols, unassigned } = assignCells(l.cells.filter((c) => c.x0 >= labelMaxX), anchors);
    // Invisible zeros fill blank cells; a zero amount next to a real one is blank.
    const inflow = cols.inflow && !isZeroText(cols.inflow) ? cols.inflow : null;
    const outflow = cols.outflow && !isZeroText(cols.outflow) ? cols.outflow : null;
    const units = cols.units && !isZeroText(cols.units) ? cols.units : null;
    const nav = cols.nav && !isZeroText(cols.nav) ? cols.nav : (cols.nav ? cols.nav : null);
    const amount = inflow ?? outflow ?? (isZeroText(cols.inflow) && isZeroText(cols.outflow) ? '0' : null);
    const header = inflow ? 'Inflows (PKR)' : outflow ? 'Outflows (PKR)' : null;
    const sign = units ? signOf(units) : 0;

    const prev = out.events[out.events.length - 1];
    const sameParent = prev && prev.section_id === section.section_id && prev.trade_date_text === first;

    // CGT row → component of the outflow it follows.
    if (/^CGT$/i.test(label) && !units && sameParent && signOf(prev.units_text) < 0
        && !prev.components.some((c) => c.component_type === 'cgt')) {
      prev.components.push(component('cgt', amount, label, l.id));
      prev.line_ids.push(l.id);
      prev.labels_printed.push(label);
      continue;
    }
    // TRANSACTION COST → cost of the inflow it follows.
    if (/^TRANSACTION COST$/i.test(label) && !units && sameParent && signOf(prev.units_text) > 0) {
      prev.components.push(component('transaction_cost', amount, label, l.id));
      prev.line_ids.push(l.id);
      prev.labels_printed.push(label);
      continue;
    }

    let type = classifyLabel(label, { unitsSign: sign });
    if (/^PURCHASE$/i.test(label) && sign > 0) type = 'purchase';
    out.events.push(makeEvent({
      section: section.section_id,
      primary: l.id,
      labels: [label],
      type,
      date: first,
      units,
      nav: units ? nav : null,
      amount,
      amountHeader: header,
      balance: cols.balance,
      components: type === 'cgt_refund_reinvest' || type === 'cgt_refund_cash'
        ? [component('cgt_refund', amount, label, l.id)] : [],
      reason: unassigned.length ? `Unplaced figures: ${unassigned.join(', ')}` : null,
      confidence: unassigned.length || type === 'unknown' ? 'low' : 'high',
    }));
  }
  for (const s of out.sections) delete s._abbr;
  return out;
}
