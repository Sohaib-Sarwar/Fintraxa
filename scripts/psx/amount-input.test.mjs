/** Money typing (src/lib/finance/amountInput.js). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAmount, groupThousands, significantBefore, caretFor } from '../../src/lib/finance/amountInput.js';

test('typing is cleaned: digits, one point, two decimals, no leading zeros', () => {
  const cases = { '1000000': '1000000', '1,000,000': '1000000', '1000.5': '1000.5', '1000.567': '1000.56', '12.3.4': '12.34',
    '.5': '0.5', '007': '7', '0': '0', 'Rs 2,500': '2500', '': '', abc: '', '1234567890123456': '123456789012' };
  for (const [input, want] of Object.entries(cases)) assert.equal(cleanAmount(input), want, input);
});

test('grouping with commas as you type', () => {
  assert.equal(groupThousands('1000000'), '1,000,000');
  assert.equal(groupThousands('1000000.5'), '1,000,000.5');
  assert.equal(groupThousands('999'), '999');
  assert.equal(groupThousands('1234.'), '1,234.');
  assert.equal(groupThousands(''), '');
});

test('the caret stays after the same digit when commas appear', () => {
  // typing a 4th digit at the end of "123" → "1,234": caret at the end
  assert.equal(caretFor('1,234', significantBefore('1234', 4)), 5);
  // caret after the "2" in "1,234" stays after the "2" once it becomes "12,345"
  assert.equal(caretFor('12,345', significantBefore('1,2345', 3)), 2);
  assert.equal(caretFor('1,000,000.5', 9), '1,000,000.5'.length);
});
