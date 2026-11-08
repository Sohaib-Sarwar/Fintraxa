/**
 * Money typing: digits and one decimal point, at most two decimals, grouped
 * with commas as you type (1,000,000.50), and the caret kept where the user
 * is typing even as commas appear. Pure; tested in scripts/psx/amount-input.test.mjs.
 */

/** Whatever was typed or pasted → a clean amount string: "1000000.5" (no commas). */
export function cleanAmount(input) {
  let s = String(input ?? '').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  const [intRaw, fracRaw] = s.split('.');
  const int = intRaw.replace(/^0+(?=\d)/, '').slice(0, 12); // no leading zeros; up to 999 billion
  return fracRaw !== undefined ? `${int || '0'}.${fracRaw.slice(0, 2)}` : int;
}

/** "1000000.5" → "1,000,000.5". */
export function groupThousands(clean) {
  if (!clean) return '';
  const [int, frac] = clean.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac !== undefined ? `${grouped}.${frac}` : grouped;
}

/** How many digits / points sit before a caret position (commas don't count). */
export const significantBefore = (text, pos) => String(text).slice(0, pos).replace(/[^\d.]/g, '').length;

/** Caret position in the grouped text after `n` digits / points. */
export function caretFor(grouped, n) {
  let seen = 0;
  for (let i = 0; i < grouped.length; i++) {
    if (seen === n) return i;
    if (/[\d.]/.test(grouped[i])) seen += 1;
  }
  return grouped.length;
}
