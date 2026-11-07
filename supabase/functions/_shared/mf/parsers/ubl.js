/**
 * UBL Fund Managers — one section per fund, each page headed
 * "For <FUND NAME> - Class 'X'":
 *   Date & Type of Transaction | Gross Amount | Load | Charges | CGTax/Tax | Net Amount | Unit Price (NAV) | Price Applicable Date | Number of Units | Balance Units
 *
 * The date is printed on its own line ABOVE the row(s) it applies to; a
 * label can wrap onto a second line ("Additional Purchase" / "(CGT-Refund)").
 * Units are printed to 2 dp; amounts are rounded to the rupee.
 */
import {
  anchorsFrom, assignCells, classifyLabel, component, isDate, isFigure, isNum, makeEvent, makeSection, signOf,
} from './common.js';

const COLS = [
  { key: 'gross', re: /^amount$/i },          // second header row; first "Amount" is Gross
  { key: 'load', re: /^load$/i },
  { key: 'charges', re: /^charges$/i },
  { key: 'cgt', re: /^tax$/i },
  { key: 'nav', re: /^\(nav\)$/i },
  { key: 'priceDate', re: /^applicable$/i },
  { key: 'units', re: /^number of$/i },
  { key: 'balance', re: /^balance$/i },
];

export function parseUbl(pages) {
  const out = { statement: { amc_name_printed: 'UBL Fund Managers Limited', period_from_text: null, period_to_text: null }, sections: [], events: [], skipped_lines: [] };
  const lines = pages.flat();
  for (const l of lines) {
    const m = l.text.match(/Statement Period:\s*(.+?\d{4})\s+To\s+(.+?\d{4})/i);
    if (m) { out.statement.period_from_text = m[1].trim(); out.statement.period_to_text = m[2].trim(); break; }
  }

  let section = null;
  // A date can be printed at the foot of one page for rows at the head of
  // the next, so it persists across pages within a fund section.
  let date = null;
  let dateLine = null;
  for (const pageLines of pages) {
    let anchors = null;
    let labelMaxX = 0;

    for (let i = 0; i < pageLines.length; i++) {
      const l = pageLines[i];
      const first = l.cells[0]?.text ?? '';

      const head = first.match(/^For\s+(.+?)\s+-\s+(Class\s+'?[A-Z0-9]+'?)\s*$/i);
      if (head) {
        const [, name, cls] = head;
        const found = out.sections.find((s) => s.fund_name_printed === name && s.unit_class_printed === cls);
        if (found !== section) { date = null; dateLine = null; }
        section = found ?? makeSection(`s${out.sections.length + 1}`, name, cls);
        if (!out.sections.includes(section)) out.sections.push(section);
        continue;
      }
      if (/^Date &Type of$|^Date & Type of$/i.test(first)) {
        // Net Amount: the "Amount" cell after "Tax". Anchor it separately.
        anchors = anchorsFrom([l], COLS);
        const amounts = l.cells.filter((c) => /^amount$/i.test(c.text));
        if (amounts[1]) anchors.push({ key: 'net', x0: amounts[1].x0, x1: amounts[1].x1, xc: (amounts[1].x0 + amounts[1].x1) / 2 });
        labelMaxX = (anchors.find((a) => a.key === 'gross')?.x0 ?? 170) - 5;
        continue;
      }
      if (!anchors || !section) continue;

      const opening = l.text.match(/^\s*Opening Units \(As on (.+?)\):\s*([\d,.]+)?/i);
      if (opening) {
        if (!section.opening_line_id) {
          section.opening_units_text = opening[2] ?? null;
          section.opening_line_id = l.id;
        }
        continue;
      }
      const closing = l.text.match(/^\s*Closing Units\s*\(As on (.+?)\):\s*([\d,.]+)/i);
      if (closing) {
        section.closing_units_text = closing[2];
        section.closing_line_id = l.id;
        continue;
      }
      const value = l.text.match(/value of your investment in \S+ is Rs\.?\s*([\d,.]+)\s*\(valued @ (.+?) price i\.e\.\s*([\d,.]+)\)/i);
      if (value) {
        section.valuation_value_text = value[1];
        section.valuation_date_text = value[2];
        section.valuation_price_text = value[3];
        section.valuation_line_id = l.id;
        continue;
      }
      if (/^IMPORTANT:|^Note:/i.test(l.text.trim())) { anchors = null; continue; }

      if (l.cells.length === 1 && isDate(first)) { date = first; dateLine = l.id; continue; }

      const labelCells = l.cells.filter((c) => c.x0 < labelMaxX);
      const label = labelCells.map((c) => c.text).join(' ').trim();
      const figures = l.cells.filter((c) => c.x0 >= labelMaxX);

      if (!figures.length) {
        // Wrapped label, e.g. "(CGT-Refund)" under "Additional Purchase".
        const prev = out.events[out.events.length - 1];
        if (prev && label && prev.section_id === section.section_id && /^\(.*\)$|^[a-z]/i.test(label) && label.length < 40) {
          prev.labels_printed.push(label);
          prev.line_ids.push(l.id);
          const full = prev.labels_printed.join(' ');
          const reclassified = classifyLabel(full, { unitsSign: signOf(prev.units_text) });
          if (reclassified !== prev.event_type && reclassified !== 'unknown') {
            prev.event_type = reclassified;
            if (reclassified === 'cgt_refund_reinvest') {
              prev.components.push(component('cgt_refund', prev.gross_amount_text ?? prev.net_amount_text, full, l.id));
            }
          }
        }
        continue;
      }
      if (!label) continue;

      const { cols, unassigned } = assignCells(figures, anchors, { accept: (t) => isFigure(t) || isDate(t) });
      // Header continuation rows ("Transaction  (Rs.)  (Rs.) - (%)") carry no figures.
      if (!Object.entries(cols).some(([k, v]) => k !== 'priceDate' && isNum(v))) continue;
      const sign = signOf(cols.units);
      const type = classifyLabel(label, { unitsSign: sign });
      out.events.push(makeEvent({
        section: section.section_id,
        primary: l.id,
        lineIds: dateLine ? [dateLine, l.id] : [l.id],
        labels: [label],
        type,
        date,
        priceDate: cols.priceDate,
        units: cols.units, nav: cols.nav, gross: cols.gross, net: cols.net, balance: cols.balance,
        components: [
          component('cgt', cols.cgt, 'CGTax / Tax', l.id),
          component(sign < 0 ? 'back_load' : 'front_load', cols.load, 'Load', l.id),
          component('charge', cols.charges, 'Charges', l.id),
        ],
        reason: !date ? 'No transaction date found above this row.' : unassigned.length ? `Unplaced figures: ${unassigned.join(', ')}` : null,
        confidence: !date || unassigned.length || type === 'unknown' ? 'low' : 'high',
      }));
    }
  }
  return out;
}
