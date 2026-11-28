import { receiptDate, receiptFileName } from '../receiptFormat';

test('receiptDate: a slip date, no weekday', () => {
  expect(receiptDate('2026-11-14')).toBe('14 Nov 2026');
  expect(receiptDate('2026-01-05T10:00:00Z')).toBe('5 Jan 2026');
  expect(receiptDate(null)).toBe('—');
  expect(receiptDate('soon')).toBe('soon');
});

test('receiptFileName: safe, lower-case, dated, .png', () => {
  expect(receiptFileName('Food & Dining', '2026-11-14')).toBe('fintraxa-receipt-food-dining-2026-11-14.png');
  expect(receiptFileName('dividend', 'HBL', '2026-10-02')).toBe('fintraxa-receipt-dividend-hbl-2026-10-02.png');
  expect(receiptFileName('Al Meezan / Cash Fund (MCF)', null, 'redemption')).toBe('fintraxa-receipt-al-meezan-cash-fund-mcf-redemption.png');
  const long = receiptFileName('x'.repeat(200));
  expect(long.length).toBeLessThanOrEqual(84);
  expect(long).toMatch(/^[a-z0-9-]+\.png$/);
});
