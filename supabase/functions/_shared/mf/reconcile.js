/**
 * Statement-internal reconciliation per fund section. Uses only what the
 * statement prints, so it is independent of the ledger. Nothing is ever
 * adjusted to make a figure fit — results are classified and reported.
 *
 *   exact          figures agree to the last printed digit
 *   rounding       within the rounding the printed precision allows
 *   missing_source the statement does not print what the check needs
 *   material       outside tolerance — something is missing or misread
 *
 * Tolerances come from each figure's OWN printed precision: UBL prints
 * units to 2 dp but the closing balance to 4 dp, and a running balance is
 * itself a rounded display of an exact one, so the allowance for a step is
 * half a unit in the last digit of every figure involved.
 */
import { Decimal, halfUlp } from './numbers.js';

const dpOf = (s) => (s && String(s).includes('.') ? String(s).split('.')[1].length : 0);
const slack = (...figs) => figs.filter((f) => f !== null && f !== undefined)
  .reduce((s, f) => s.plus(halfUlp(dpOf(f))), new Decimal('0.00000001'));

/**
 * @param {object} section from normalizeExtraction().sections
 * @param {object[]} events   normalised events of this section, statement order
 */
export function reconcileSection(section, events) {
  const issues = [];
  const unitEvents = events.filter((e) => e.unit_delta !== null);

  // Step check: printed balance = previous printed balance + this row's units.
  // A break pinpoints the row where something is missing or misread.
  let prev = section.opening?.units ?? null;
  let breaks = 0;
  for (const e of unitEvents) {
    const printed = e.running_balance_units;
    if (printed === null || printed === undefined) { prev = null; continue; }
    if (prev !== null) {
      const diff = new Decimal(prev).plus(e.unit_delta).minus(printed).abs();
      if (diff.gt(slack(prev, printed, e.unit_delta))) {
        breaks++;
        issues.push({ code: 'RUNNING_BALANCE_BREAK', severity: 'warning', source_key: e.source_key,
          message: 'The balance printed on this row does not follow from the previous balance and this row\'s units — a row may be missing or misread.' });
      }
    }
    prev = printed;
  }

  // Opening + Σ units = closing, allowing each figure's rounding.
  let chain = { status: 'missing_source' };
  const sum = unitEvents.reduce((s, e) => s.plus(e.unit_delta), new Decimal(0));
  if (section.closing) {
    const opening = section.opening?.units ?? '0';
    const computed = new Decimal(opening).plus(sum);
    const closing = new Decimal(section.closing.units);
    const diff = computed.minus(closing).abs();
    const tol = slack(opening, section.closing.units, ...unitEvents.map((e) => e.unit_delta));
    const dp = Math.max(dpOf(section.closing.units), ...unitEvents.map((e) => dpOf(e.unit_delta)), 0);
    chain = {
      status: diff.isZero() ? 'exact' : diff.lte(tol) ? 'rounding' : 'material',
      opening: new Decimal(opening).toFixed(dp), movements: sum.toFixed(dp),
      computed_closing: computed.toFixed(dp), printed_closing: closing.toFixed(dp),
      difference: computed.minus(closing).toFixed(dp), tolerance: tol.toFixed(dp + 1),
      opening_assumed_zero: !section.opening,
    };
    if (chain.status === 'material') {
      issues.push({ code: 'UNIT_CHAIN_MISMATCH', severity: 'warning',
        message: `Opening units plus movements (${chain.computed_closing}) does not equal the closing balance (${chain.printed_closing}).` });
    }
  }

  // Closing units × valuation price ≈ printed value (information only).
  let valuation = { status: 'missing_source' };
  if (section.valuation?.value != null && section.closing) {
    const v = new Decimal(section.closing.units).times(section.valuation.price);
    const printed = new Decimal(section.valuation.value);
    const tol = halfUlp(dpOf(section.valuation.value))
      .plus(new Decimal(section.valuation.price).times(halfUlp(dpOf(section.closing.units)))).plus('0.01');
    const diff = v.minus(printed).abs();
    valuation = { status: diff.isZero() ? 'exact' : diff.lte(tol) ? 'rounding' : 'material', computed: v.toFixed(2), printed: printed.toFixed(2) };
  }

  return {
    section_key: section.key,
    status: chain.status === 'material' || breaks > 0 ? 'material' : chain.status,
    unit_chain: chain,
    running_balance_breaks: breaks,
    valuation,
    issues,
  };
}
