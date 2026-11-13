/** Pure amount-entry rules for the custom keypad (unit-tested in lib/__tests__/format.test.ts). */

/** Applies one keypad press to an amount string: max 2 decimals, one dot, 10 integer digits, no leading zeros. */
export function pressKey(current: string, key: string): string {
  if (key === 'clear') return '';
  if (key === 'del') return current.slice(0, -1);
  if (key === '.') return current.includes('.') ? current : `${current || '0'}.`;
  const [int, frac] = current.split('.');
  if (frac !== undefined) return frac.length >= 2 ? current : current + key;
  if (int === '0') return key;
  if (int.length >= 10) return current;
  return current + key;
}
