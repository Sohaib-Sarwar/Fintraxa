/**
 * Atlas Asset Management — one table per fund:
 *   NAV Date | Transaction | Gross Amount | CGT | Zakat | Net Load | Net Amount | Unit Price | No. of Units | Balance Units
 * "-" marks a cell with nothing reported. "Online Sale" is the AMC selling
 * units to the investor, i.e. a purchase.
 */
import {
  anchorsFrom, assignCells, classifyLabel, component, isDate, labelText, makeEvent, makeSection, signOf,
} from './common.js';

const COLS = [
  { key: 'gross', re: /^gross amount$/i },
  { key: 'cgt', re: /^cgt$/i },
  { key: 'zakat', re: /^zakat$/i },
  { key: 'load', re: /^net load$/i },
  { key: 'net', re: /^net amount$/i },
  { key: 'price', re: /^unit price$/i },
  { key: 'units', re: /^no\.? of units$/i },
  { key: 'balance', re: /^balance units$/i },
];

export function parseAtlas(pages) {
  const lines = pages.flat();
  const out = { statement: { amc_name_printed: 'Atlas Asset Management Limited', period_from_text: null, period_to_text: null }, sections: [], events: [], skipped_lines: [] };

  for (const l of lines) {
    const m = l.text.match(/Period From\s+(\S+)\s+to\s+(\S+)/i);
    if (m) { out.statement.period_from_text = m[1]; out.statement.period_to_text = m[2]; break; }
  }

  let anchors = null;
  let labelMaxX = 0;
  let section = null;
  let title = null;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const first = l.cells[0]?.text ?? '';

    // "<Fund> - Growth Units   Dividend Option: …" introduces a fund block.
    const t = first.match(/^(.+?\bFund\b.*?)\s+-\s+(.+)$/i);
    if (t && !/statement|period/i.test(first)) title = { name: t[1].trim(), unitClass: t[2].trim() };

    if (/^NAV Date$/i.test(first) && l.cells.some((c) => /^Transaction$/i.test(c.text))) {
      anchors = anchorsFrom([l], COLS);
      labelMaxX = (anchors.find((a) => a.key === 'gross')?.x0 ?? 300) - 5;
      const prev = lines[i - 1]?.cells[0]?.text;
      const name = title?.name ?? (prev && /fund/i.test(prev) ? prev : 'Atlas fund');
      section = makeSection(`s${out.sections.length + 1}`, name, title?.unitClass ?? null);
      out.sections.push(section);
      continue;
    }
    if (!section || !anchors) continue;

    if (/^Opening Balance/i.test(first)) {
      const { cols } = assignCells(l.cells.slice(1), anchors);
      section.opening_units_text = cols.balance ?? null;
      section.opening_line_id = l.id;
      continue;
    }
    if (/^Closing Balance/i.test(first)) {
      const { cols } = assignCells(l.cells.slice(1), anchors);
      section.closing_units_text = cols.balance ?? null;
      section.closing_line_id = l.id;
      continue;
    }
    // Summary of Investment row: fund, class, units, price, date, value.
    if (/fund/i.test(first) && l.cells.length >= 5 && isDate(l.cells[l.cells.length - 2]?.text)) {
      const c = l.cells.map((x) => x.text);
      const target = out.sections.find((s) => s.fund_name_printed.toLowerCase() === first.toLowerCase()) ?? section;
      target.valuation_price_text = c[c.length - 3];
      target.valuation_date_text = c[c.length - 2];
      target.valuation_value_text = c[c.length - 1];
      target.valuation_line_id = l.id;
      continue;
    }
    if (!isDate(first)) continue;

    const label = labelText(l.cells, labelMaxX);
    const { cols, unassigned } = assignCells(l.cells.filter((c) => c.x0 >= labelMaxX), anchors);
    const type = classifyLabel(label, { unitsSign: signOf(cols.units) });
    const outflow = signOf(cols.units) < 0;
    out.events.push(makeEvent({
      section: section.section_id,
      primary: l.id,
      labels: [label],
      type,
      date: first,
      priceDate: first,
      units: cols.units, nav: cols.price, gross: cols.gross, net: cols.net, balance: cols.balance,
      components: [
        component('cgt', cols.cgt, 'CGT', l.id),
        component('zakat', cols.zakat, 'Zakat', l.id),
        component(outflow ? 'back_load' : 'front_load', cols.load, 'Net Load', l.id),
      ],
      reason: unassigned.length ? `Unplaced figures on the row: ${unassigned.join(', ')}` : null,
      confidence: unassigned.length || type === 'unknown' ? 'low' : 'high',
    }));
  }
  return out;
}
