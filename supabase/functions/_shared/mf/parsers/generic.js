/**
 * Generic column-table parser — the fallback for any statement layout an
 * AMC-specific parser does not recognise (portal / mobile-app downloads,
 * date-range "transaction statements", new report designs).
 *
 * It works from column MEANING, not position:
 *   1. find a header row (a date column plus several known column words),
 *      merging header cells that wrap onto following lines ("Gross" / "Amount");
 *   2. map each header label to a field (gross, net, CGT/tax, load, charges,
 *      zakat, units, unit price/NAV, balance, trade date, price date);
 *   3. read every dated row, placing each value under its column by x;
 *   4. pick up fund sections ("…FUND…", "Fund Name : …"), opening balances
 *      and valuation lines.
 *
 * Output is the same parsed-statement shape as the specific parsers, so it
 * goes through identical evidence, reconciliation and duplicate checks — a
 * generic read is never trusted more than a specific one.
 */
import {
  assignCells, classifyLabel, component, isDate, isFigure, isNum, makeEvent, makeSection, signOf,
} from './common.js';

// Order matters: the first rule that matches a label wins.
const FIELD_RULES = [
  ['priceDate', /(nav|price|applicable|value)\s*date|applicable/i],
  ['tradeDate', /(ledger|transaction|trade|posting|txn|deal)\s*date|^date$|^date\b/i],
  ['label', /transaction\s*type|^transactions?$|nature|description|particulars|^type$|narration/i],
  ['balance', /balance/i],
  ['cgt', /cgt|capital\s*gain|^tax$|\btax\b/i],
  ['zakat', /zakat/i],
  ['wht', /wht|withholding/i],
  ['load', /load/i],
  ['charges', /charges?|fee/i],
  ['gross', /gross/i],
  ['net', /\bnet\b/i],
  ['inflow', /inflow/i],
  ['outflow', /outflow/i],
  ['nav', /unit\s*price|\bprice\b|\bnav\b|\brate\b|offer|repurchase/i],
  ['units', /units?\b/i],
  ['amount', /amount/i],
];

const fieldOf = (label) => FIELD_RULES.find(([, re]) => re.test(label))?.[0] ?? null;
const hasDigit = (s) => /\d/.test(s);
const overlaps = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > -2;

/** Header row → column anchors keyed by field. */
function readHeader(lines, i) {
  const head = lines[i];
  const cols = head.cells.map((c) => ({ text: c.text, x0: c.x0, x1: c.x1 }));
  // Merge up to two continuation lines that carry no figures.
  for (let k = 1; k <= 2 && lines[i + k]; k++) {
    const next = lines[i + k];
    if (next.cells.some((c) => hasDigit(c.text) && isFigure(c.text)) || next.cells.some((c) => isDate(c.text))) break;
    if (next.cells.length > cols.length + 2) break;
    for (const c of next.cells) {
      const col = cols.find((x) => overlaps(x, c));
      if (col) { col.text = `${col.text} ${c.text}`; col.x0 = Math.min(col.x0, c.x0); col.x1 = Math.max(col.x1, c.x1); }
      else cols.push({ text: c.text, x0: c.x0, x1: c.x1 });
    }
  }
  const anchors = [];
  const used = new Set();
  for (const c of cols.sort((a, b) => a.x0 - b.x0)) {
    const label = c.text.replace(/\s+/g, ' ').trim();
    let key = fieldOf(label);
    if (!key) continue;
    if (used.has(key)) {
      if (key === 'tradeDate') key = 'priceDate';
      else continue;
      if (used.has(key)) continue;
    }
    used.add(key);
    anchors.push({ key, label, x0: c.x0, x1: c.x1, xc: (c.x0 + c.x1) / 2 });
  }
  return anchors;
}

function isHeaderRow(line) {
  const fields = new Set(line.cells.map((c) => fieldOf(c.text)).filter(Boolean));
  const dateCol = line.cells.some((c) => /date/i.test(c.text));
  const figures = line.cells.filter((c) => isNum(c.text)).length;
  return dateCol && fields.size >= 3 && figures === 0;
}

const FUND_LINE = /\b(fund|plan|scheme|optimizer|portfolio)\b/i;

export function parseGeneric(pages, { amcName = null } = {}) {
  const lines = pages.flat();
  const out = { statement: { amc_name_printed: amcName, period_from_text: null, period_to_text: null }, sections: [], events: [], skipped_lines: [], parser: 'generic' };

  for (const l of lines) {
    const m = l.text.match(/(?:statement\s+period|for\s+the\s+period|period)\s*(?:from)?\s*:?\s*(.+?)\s+to\s+(.+?)\s*$/i)
      ?? l.text.match(/\bfrom\s+(\d{1,2}[-/ ][A-Za-z]{3}[-/ ]\d{2,4}|\S+ \d{1,2}, \d{4})\s+to\s+(\S+(?: \d{1,2}, \d{4})?)/i);
    if (m) { out.statement.period_from_text = m[1].trim(); out.statement.period_to_text = m[2].trim(); break; }
  }

  let anchors = null;
  let labelMaxX = 0;
  let firstFigureX = 0;
  let section = null;
  let current = null;

  const ensureSection = (name) => {
    const clean = String(name).replace(/^fund\s*name\s*:\s*/i, '').trim();
    const found = out.sections.find((s) => s.fund_name_printed.toLowerCase() === clean.toLowerCase());
    if (found) return found;
    const s = makeSection(`s${out.sections.length + 1}`, clean, null);
    out.sections.push(s);
    return s;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (isHeaderRow(l)) {
      const a = readHeader(lines, i);
      if (a.some((x) => x.key === 'units' || x.key === 'gross' || x.key === 'net' || x.key === 'amount' || x.key === 'inflow')) {
        anchors = a;
        const figureCols = a.filter((x) => !['tradeDate', 'priceDate', 'label'].includes(x.key));
        firstFigureX = Math.min(...figureCols.map((x) => x.x0)) - 25;
        const labelCol = a.find((x) => x.key === 'label');
        labelMaxX = labelCol ? Math.max(labelCol.x1 + 25, firstFigureX) : firstFigureX;
        // Skip the header continuation lines.
        while (lines[i + 1] && !lines[i + 1].cells.some((c) => isDate(c.text) || isNum(c.text)) && lines[i + 1].cells.length <= anchors.length + 2
          && !FUND_LINE.test(lines[i + 1].text)) i++;
        continue;
      }
    }
    if (!anchors) continue;
    if (/^(IMPORTANT|Note\s*:|Disclaimer|This is (a|an) (computer|system|auto))/i.test(l.text.trim())) { anchors = null; current = null; continue; }

    const first = l.cells[0]?.text ?? '';
    const dateCells = l.cells.filter((c) => isDate(c.text));

    // "Fund Name : X   NAV : p   Investment Value (Rs.) : v" — valuation line.
    const val = l.text.match(/fund\s*name\s*:\s*(.+?)\s{2,}.*?\bnav\s*:\s*([\d,.]+).*?value[^:]*:\s*([\d,.]+)/i);
    if (val) {
      const s = ensureSection(val[1]);
      s.valuation_price_text = val[2];
      s.valuation_value_text = val[3];
      s.valuation_date_text = out.statement.period_to_text;
      s.valuation_line_id = l.id;
      current = null;
      continue;
    }
    // Fund section header (no date, names a fund); may carry "Opening x".
    if (!dateCells.length && FUND_LINE.test(first) && !hasDigit(first)) {
      section = ensureSection(first);
      const open = l.text.match(/opening\s*(?:balance|units)?\s*:?\s*([\d,.()-]+)\s*$/i);
      if (open && !section.opening_line_id) { section.opening_units_text = open[1]; section.opening_line_id = l.id; }
      current = null;
      continue;
    }
    if (/^\s*(opening|closing)\b/i.test(l.text) && section) {
      const units = l.cells.filter((c) => isNum(c.text)).pop()?.text ?? null;
      if (/^\s*opening/i.test(l.text)) { if (!section.opening_line_id) { section.opening_units_text = units; section.opening_line_id = l.id; } }
      else { section.closing_units_text = units; section.closing_line_id = l.id; }
      current = null;
      continue;
    }
    if (/total\s+investment\s+value/i.test(l.text)) { current = null; continue; }

    const tradeCol = anchors.find((a) => a.key === 'tradeDate');
    const tradeCell = dateCells.find((c) => !tradeCol || Math.abs((c.x0 + c.x1) / 2 - tradeCol.xc) < 60) ?? (isDate(first) ? l.cells[0] : null);

    if (tradeCell) {
      if (!section) section = ensureSection(amcName ? `${amcName} fund` : 'Fund');
      const label = l.cells.filter((c) => !isDate(c.text) && !isFigure(c.text) && c.x0 < labelMaxX).map((c) => c.text).join(' ').trim();
      const { cols, unassigned } = assignCells(l.cells.filter((c) => c !== tradeCell), anchors, { accept: (t) => isFigure(t) || isDate(t), maxDist: 60 });
      const units = cols.units;
      const sign = signOf(units);
      const type = classifyLabel(label, { unitsSign: sign });
      const outflow = sign < 0 || type === 'redemption' || type === 'switch_out';
      const inflowAmt = cols.inflow && !/^0+(\.0+)?$/.test(cols.inflow) ? cols.inflow : null;
      const outflowAmt = cols.outflow && !/^0+(\.0+)?$/.test(cols.outflow) ? cols.outflow : null;
      current = makeEvent({
        section: section.section_id,
        primary: l.id,
        labels: [label || 'Transaction'],
        type,
        date: tradeCell.text,
        priceDate: cols.priceDate ?? null,
        units, nav: cols.nav,
        gross: cols.gross, net: cols.net,
        amount: cols.gross || cols.net ? null : (cols.amount ?? inflowAmt ?? outflowAmt),
        amountHeader: cols.amount ? 'Amount' : inflowAmt ? 'Inflows' : outflowAmt ? 'Outflows' : null,
        balance: cols.balance,
        components: [
          component('cgt', cols.cgt, 'CGT / Tax', l.id),
          component(outflow ? 'back_load' : 'front_load', cols.load, 'Load', l.id),
          component('charge', cols.charges, 'Charges', l.id),
          component('zakat', cols.zakat, 'Zakat', l.id),
          component('wht', cols.wht, 'WHT', l.id),
        ],
        reason: [!label && 'No transaction description found.', unassigned.length && `Unplaced figures: ${unassigned.join(', ')}`].filter(Boolean).join(' ') || 'Read by the general table reader.',
        confidence: !label || unassigned.length || type === 'unknown' ? 'low' : 'medium',
      });
      out.events.push(current);
      continue;
    }

    // Undated line under a transaction: a tax/net sub-row, or a wrapped label.
    if (current) {
      const label = l.cells.filter((c) => !isFigure(c.text) && c.x0 < labelMaxX).map((c) => c.text).join(' ').trim();
      const figs = l.cells.filter((c) => isFigure(c.text) && c.x0 >= firstFigureX);
      if (!figs.length && label && label.length < 60) {
        current.labels_printed.push(label);
        current.line_ids.push(l.id);
        const t = classifyLabel(current.labels_printed.join(' '), { unitsSign: signOf(current.units_text) });
        if (t !== 'unknown' && t !== current.event_type) current.event_type = t;
        continue;
      }
      if (figs.length && label) {
        const { cols } = assignCells(figs, anchors, { maxDist: 60 });
        const v = cols.cgt ?? cols.net ?? cols.amount ?? cols.gross ?? figs[figs.length - 1].text;
        current.line_ids.push(l.id);
        current.labels_printed.push(label);
        if (/capital\s*gain|cgt/i.test(label)) current.components.push(component('cgt', v, label, l.id));
        else if (/zakat/i.test(label)) current.components.push(component('zakat', v, label, l.id));
        else if (/load/i.test(label)) current.components.push(component(/tax/i.test(label) ? 'load_tax' : 'front_load', v, label, l.id));
        else if (/^net\b/i.test(label)) current.net_amount_text = v;
      }
    }
  }
  return out;
}
