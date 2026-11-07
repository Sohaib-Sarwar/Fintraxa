/**
 * NBP Fund Management:
 *   Date | Transactions | Price Date | Units | Price | Amount
 * One event spans several rows; only the first carries a date:
 *   Investment / Front End Load on Investment / Taxes on Front End Load
 *   Gross SwiftPAY|Redemption / Capital Gain Tax / Net SwiftPAY|Redemption
 */
import {
  anchorsFrom, assignCells, classifyLabel, component, isDate, makeEvent, makeSection, signOf,
} from './common.js';

const COLS = [
  { key: 'priceDate', re: /^price date$/i },
  { key: 'units', re: /^units$/i },
  { key: 'price', re: /^price$/i },
  { key: 'amount', re: /^amount$/i },
];

export function parseNbp(pages) {
  const lines = pages.flat();
  const out = { statement: { amc_name_printed: 'NBP Fund Management Limited', period_from_text: null, period_to_text: null }, sections: [], events: [], skipped_lines: [], amc_reported: {} };

  let fundName = null;
  let unitClass = null;
  for (const l of lines) {
    const m = l.text.match(/For the Period\s+(\S+)\s+to\s+(\S+)/i);
    if (m) { out.statement.period_from_text = m[1]; out.statement.period_to_text = m[2]; }
    if (!fundName && /\bFUND\b/i.test(l.text) && l.cells.length === 1 && !/management|statement/i.test(l.text)) fundName = l.cells[0].text;
    const plan = l.text.match(/Investment Plan:\s+(\S+)/i);
    if (plan) unitClass = plan[1];
    const realized = l.cells.map((c) => c.text);
    if (/^Since Inception:?$/i.test(realized[0] ?? '') && realized.length >= 5) {
      out.amc_reported = {
        basis: 'since_inception', unrealized: realized[1], realized_gross: realized[2],
        gross_cash_dividend: realized[3], total_gain: realized[4], line_id: l.id,
      };
    }
  }

  const section = makeSection('s1', fundName ?? 'NBP fund', unitClass);
  out.sections.push(section);

  let anchors = null;
  let labelMaxX = 0;
  let current = null;   // event being assembled

  const flush = () => {
    if (current) out.events.push(makeEvent(current));
    current = null;
  };

  for (const l of lines) {
    const first = l.cells[0]?.text ?? '';
    if (/^Date$/i.test(first) && l.cells.some((c) => /^Transactions?$/i.test(c.text))) {
      anchors = anchorsFrom([l], COLS);
      labelMaxX = (anchors.find((a) => a.key === 'priceDate')?.x0 ?? 230) - 5;
      continue;
    }
    if (!anchors) continue;
    if (/^Note:|^This is a system|^Disclaimers/i.test(l.text.trim())) { flush(); anchors = null; continue; }

    const dated = isDate(first);
    const labelCells = l.cells.filter((c) => c.x0 < labelMaxX && !(dated && c === l.cells[0]));
    const label = labelCells.map((c) => c.text).join(' ').trim();
    if (!label) continue;
    const { cols, unassigned } = assignCells(l.cells.filter((c) => c.x0 >= labelMaxX), anchors,
      { accept: (t) => isDate(t) || /\d/.test(t) || /^-$/.test(t) });

    if (/^Opening Balance$/i.test(label)) {
      flush();
      section.opening_units_text = cols.units ?? null;
      section.opening_line_id = l.id;
      continue;
    }
    if (/^Closing Balance$/i.test(label)) {
      flush();
      section.closing_units_text = cols.units ?? null;
      section.closing_line_id = l.id;
      continue;
    }

    const sub = /^(front end load|taxes on front end load|back end load|capital gains? tax|cgt|zakat|net\s)/i.test(label);
    if (dated || !sub || !current) {
      flush();
      const type = classifyLabel(label.replace(/^gross\s+/i, ''), { unitsSign: signOf(cols.units) });
      const isOut = signOf(cols.units) < 0 || type === 'redemption';
      current = {
        section: section.section_id, primary: l.id, lineIds: [l.id], labels: [label], type,
        date: dated ? first : null, priceDate: cols.priceDate ?? null,
        units: cols.units, nav: cols.price,
        ...(isOut ? { gross: cols.amount } : { gross: cols.amount }),
        components: [],
        reason: unassigned.length ? `Unplaced figures: ${unassigned.join(', ')}` : (dated ? null : 'Row has no date of its own.'),
        confidence: unassigned.length || type === 'unknown' || !dated ? 'low' : 'high',
      };
      continue;
    }

    // Sub-row of the current event.
    current.lineIds.push(l.id);
    current.labels.push(label);
    if (/^front end load/i.test(label)) current.components.push(component('front_load', cols.amount, label, l.id));
    else if (/^taxes on front end load/i.test(label)) current.components.push(component('load_tax', cols.amount, label, l.id));
    else if (/^back end load/i.test(label)) current.components.push(component('back_load', cols.amount, label, l.id));
    else if (/capital gains? tax|^cgt/i.test(label)) current.components.push(component('cgt', cols.amount, label, l.id));
    else if (/^zakat/i.test(label)) current.components.push(component('zakat', cols.amount, label, l.id));
    else if (/^net\s/i.test(label)) current.net = cols.amount;
  }
  flush();
  return out;
}
