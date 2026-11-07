/**
 * Parse figures exactly as statements print them. Output is a decimal
 * *string* (never a JS number) so no value passes through binary floating
 * point on its way to Postgres `numeric`.
 *
 * Conventions seen across the supplied statements:
 *   "(9,503.00)"  "( 905.6945)"  "-334.4915"  → negative
 *   ".0001"  "1,173.4196"  "20,000"            → positive
 *   "-"  ""  "N/A"  "nil"                      → not reported (null)
 *   "0"  "0.00"  "0.0000"                      → reported zero (0)
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

const NOT_REPORTED = /^(?:-+|–|—|n\/?a|nil|null|none)$/i;

/**
 * @param {string|number|null|undefined} text
 * @returns {{ value: string|null, negative: boolean, dp: number, raw: string }|null}
 *   null when nothing was printed; `value` null when the cell says "not reported".
 */
export function parseFigure(text) {
  if (text === null || text === undefined) return null;
  const raw = String(text).trim();
  if (raw === '') return null;
  if (NOT_REPORTED.test(raw)) return { value: null, negative: false, dp: 0, raw };

  let s = raw.replace(/^(?:rs\.?|pkr)\s*/i, '').replace(/\s+/g, '');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (s.endsWith('-')) { negative = !negative; s = s.slice(0, -1); }   // "1,000-" trailing minus
  s = s.replace(/^\+/, '');
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?$/.test(s) || s === '' || s === '.') {
    throw new FigureError(`Not a number: "${raw}"`);
  }
  s = s.replace(/,/g, '');
  if (s.startsWith('.')) s = '0' + s;
  const dp = s.includes('.') ? s.length - s.indexOf('.') - 1 : 0;
  const d = new Decimal(s);
  const value = (negative && !d.isZero() ? d.negated() : d).toFixed(dp);
  return { value, negative: negative && !d.isZero(), dp, raw };
}

export class FigureError extends Error {}

/** Absolute value of a parsed figure as a decimal string, or null. */
export const magnitude = (fig) => (fig?.value == null ? null : new Decimal(fig.value).abs().toFixed(fig.dp));

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
};

const pad = (n) => String(n).padStart(2, '0');

function iso(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Pakistani statements print day-first. Accepts 08-Oct-2026, 05-OCT-26,
 * OCT-31-2026, 27-02-2026, 04/11/2026, "January 01, 2026", 2026-10-08.
 * @returns {string|null} ISO date
 */
export function parseDate(text) {
  if (!text) return null;
  const s = String(text).trim().replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/ .]([A-Za-z]{3,9})[-/ .,]+(\d{2,4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    return mo ? iso(+m[3], mo, +m[1]) : null;
  }
  if ((m = s.match(/^([A-Za-z]{3,9})\.?[-/ .]+(\d{1,2})[-/ .,]+(\d{2,4})$/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? iso(+m[3], mo, +m[2]) : null;
  }
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) return iso(+m[3], +m[2], +m[1]);
  return null;
}

/** Half a unit of the last printed digit — the most a rounded figure can be off. */
export const halfUlp = (dp) => new Decimal(5).times(new Decimal(10).pow(-(dp + 1)));

/** Collapse whitespace so "( 905.6945)" and "(905.6945)" compare equal. */
export const squash = (s) => String(s ?? '').replace(/\s+/g, '');
