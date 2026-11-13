import { addMoney, autoDecimals, changePct, compactNumber, delta, group, MASK, money, pct, share, tone, units } from '../format';
import { addDays, dayHeading, fyOf, fyRange, lastDayOf, monthRange, shortDate } from '../dates';
import { utf8Decode, utf8Encode } from '../crypto';
import { pressKey } from '../amount';

describe('money format (plan §5 rules)', () => {
  test('no decimals at or above Rs 10,000; two below', () => {
    expect(money(1248300)).toBe('Rs 1,248,300');
    expect(money('9999.5')).toBe('Rs 9,999.50');
    expect(money(10000)).toBe('Rs 10,000');
    expect(autoDecimals(9999.99)).toBe(2);
  });
  test('signs, negatives, rounding half-up without float artefacts', () => {
    expect(money(3420, { sign: true })).toBe('+Rs 3,420');
    expect(money(8200)).toBe('Rs 8,200');
    expect(money('8200.5')).toBe('Rs 8,200.50');
    expect(money(-12.5)).toBe('-Rs 12.50');
    expect(money(0.1 + 0.2)).toBe('Rs 0.30');
    expect(money('1.005', { decimals: 2 })).toBe('Rs 1.01');
    expect(money(-0.001, { decimals: 2 })).toBe('Rs 0.00');
  });
  test('privacy mask replaces every digit', () => {
    expect(money(1248300, { hidden: true })).toBe(`Rs ${MASK}`);
    expect(delta(3420, 0.27, { hidden: true })).toBe(`Rs ${MASK} · +0.27%`);
  });
  test('compact form', () => {
    expect(compactNumber(1250000)).toBe('1.25M');
    expect(compactNumber(84000)).toBe('84K');
    expect(compactNumber(950)).toBe('950');
    expect(money(2_500_000_000, { compact: true })).toBe('Rs 2.5B');
  });
  test('change line, percent, tone, units, share, exact sums', () => {
    expect(delta(3420, 0.27)).toBe('+Rs 3,420 · +0.27%');
    expect(delta(-42.5, -0.01)).toBe('-Rs 42.50 · -0.01%');
    expect(pct(-1.054)).toBe('-1.05%');
    expect(pct(0.001)).toBe('0.00%');
    expect([tone(0.004), tone(1), tone(-1)]).toEqual(['flat', 'pos', 'neg']);
    expect(units('1234.5000')).toBe('1,234.5');
    expect(share(25, 200)).toBe(12.5);
    expect(share(1, 0)).toBeNull();
    expect(addMoney(0.1, 0.2, null, '1000.05')).toBe(1000.35);
    expect(changePct(1500, 150000.3)).toBe(1.01);
    expect(changePct(100, 100)).toBeNull();
    expect(group('-1234567.891', 2)).toBe('-1,234,567.89');
  });
});

describe('dates', () => {
  test('fiscal year runs 1 Jul – 30 Jun', () => {
    expect(fyOf('2026-11-14')).toBe(2026);
    expect(fyOf('2026-06-30')).toBe(2025);
    expect(fyRange(2026)).toEqual({ start: '2026-07-01', end: '2027-06-30' });
  });
  test('month ends, leap years, day arithmetic across months', () => {
    expect(lastDayOf('2028-02')).toBe('2028-02-29');
    expect(monthRange('2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  test('headings', () => {
    expect(dayHeading('2026-11-14', '2026-11-14')).toBe('Today');
    expect(dayHeading('2026-11-13', '2026-11-14')).toBe('Yesterday');
    expect(dayHeading('2026-11-10', '2026-11-14')).toBe('Tue 10 Nov');
    expect(shortDate('2025-10-13', '2026-11-14')).toBe('13 Oct 2025');
  });
});

describe('utf8 (session encryption encoding)', () => {
  test('round-trips ASCII, Urdu and emoji', () => {
    for (const s of ['{"access_token":"x.y.z"}', 'محمد سہیل', 'Rs 1,250 💸', '']) expect(utf8Decode(utf8Encode(s))).toBe(s);
  });
});

describe('amount keypad', () => {
  const type = (keys: string[]) => keys.reduce(pressKey, '');
  test('one dot, two decimals, no leading zeros, delete and clear', () => {
    expect(type(['0', '5'])).toBe('5');
    expect(type(['.', '5'])).toBe('0.5');
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23');
    expect(type(['1', '.', '.', '2'])).toBe('1.2');
    expect(type(['1', '2', 'del'])).toBe('1');
    expect(type(['9', '9', 'clear'])).toBe('');
    expect(type(Array(12).fill('9'))).toBe('9999999999');
  });
});
