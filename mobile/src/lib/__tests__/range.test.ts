import { effectiveEnd, presets, rangeLabel, rangeMonths, rangePillLabel, resolveRange } from '../range';

const TODAY = '2026-11-14';

describe('period presets (same as the web dateRange.js)', () => {
  test('this and last fiscal year run 1 Jul → 30 Jun', () => {
    expect(resolveRange({ id: 'fy' }, TODAY)).toEqual({ id: 'fy', start: '2026-07-01', end: '2027-06-30' });
    expect(resolveRange({ id: 'lfy' }, TODAY)).toEqual({ id: 'lfy', start: '2025-07-01', end: '2026-06-30' });
  });
  test('on 1 July the fiscal year rolls over', () => {
    expect(resolveRange({ id: 'fy' }, '2027-07-01').start).toBe('2027-07-01');
    expect(resolveRange({ id: 'fy' }, '2027-06-30').start).toBe('2026-07-01');
  });
  test('YTD, MTD and last month', () => {
    expect(resolveRange({ id: 'ytd' }, TODAY)).toEqual({ id: 'ytd', start: '2026-01-01', end: TODAY });
    expect(resolveRange({ id: 'mtd' }, TODAY)).toEqual({ id: 'mtd', start: '2026-11-01', end: TODAY });
    expect(resolveRange({ id: 'lm' }, TODAY)).toEqual({ id: 'lm', start: '2026-10-01', end: '2026-10-31' });
  });
  test('custom keeps its dates; an invalid one falls back to this FY', () => {
    expect(resolveRange({ id: 'custom', start: '2026-03-02', end: '2026-05-09' }, TODAY)).toEqual({ id: 'custom', start: '2026-03-02', end: '2026-05-09' });
    expect(resolveRange({ id: 'custom', start: '2026-05-09', end: '2026-03-02' }, TODAY).id).toBe('fy');
    expect(resolveRange(null, TODAY).id).toBe('fy');
  });
  test('labels', () => {
    expect(rangeLabel(resolveRange({ id: 'fy' }, TODAY), TODAY)).toBe('FY 2026-27');
    expect(rangeLabel(resolveRange({ id: 'mtd' }, TODAY), TODAY)).toBe('MTD Nov');
    expect(rangeLabel({ id: 'custom', start: '2026-03-02', end: '2026-05-09' }, TODAY)).toBe('2 Mar – 9 May 2026');
    expect(rangeLabel({ id: 'custom', start: '2025-12-30', end: '2026-01-02' }, TODAY)).toBe('30 Dec 2025 – 2 Jan 2026');
    expect(presets(TODAY)).toHaveLength(8);
  });
});

describe('rangeMonths (chart bars for a period)', () => {
  test('this FY so far: Jul → Nov', () => {
    expect(rangeMonths(resolveRange({ id: 'fy' }, TODAY), TODAY)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  });
  test('last FY: all twelve months', () => {
    const m = rangeMonths(resolveRange({ id: 'lfy' }, TODAY), TODAY);
    expect(m[0]).toBe('2025-07');
    expect(m[11]).toBe('2026-06');
  });
  test('all time: the last 12 months only', () => {
    const m = rangeMonths(resolveRange({ id: 'all' }, TODAY), TODAY);
    expect(m).toHaveLength(12);
    expect(m[11]).toBe('2026-11');
  });
  test('effective end is never after today', () => {
    expect(effectiveEnd(resolveRange({ id: 'fy' }, TODAY), TODAY)).toBe(TODAY);
  });
});

test('period button labels are short and one line: no current year, one other year, months across years', () => {
  expect(rangePillLabel(resolveRange({ id: 'fy' }, TODAY), TODAY)).toBe('FY 2026-27');
  expect(rangePillLabel({ id: 'custom', start: '2026-03-02', end: '2026-05-09' }, TODAY)).toBe('2 Mar – 9 May');
  expect(rangePillLabel({ id: 'custom', start: '2025-03-02', end: '2025-05-09' }, TODAY)).toBe('2 Mar – 9 May ’25');
  expect(rangePillLabel({ id: 'custom', start: '2025-12-30', end: '2026-01-02' }, TODAY)).toBe('Dec ’25 – Jan ’26');
  expect(rangePillLabel({ id: 'custom', start: '2026-05-09', end: '2026-05-09' }, TODAY)).toBe('9 May');
});
