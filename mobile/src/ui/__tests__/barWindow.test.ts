import { barPage, barPages, barWindow, MAX_BARS, pageOf } from '../barWindow';

const bars = Array.from({ length: 12 }, (_, i) => ({ key: `2026-${String(i + 1).padStart(2, '0')}`, label: String(i + 1), value: i }));

describe('barWindow (max 6 bars on every chart)', () => {
  it('keeps the newest six', () => {
    expect(MAX_BARS).toBe(6);
    expect(barWindow(bars).map((b) => b.key)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  });
  it('shows the six ending at an older selected month', () => {
    expect(barWindow(bars, '2026-03').map((b) => b.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(barWindow(bars, '2026-05').map((b) => b.key)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05']);
    expect(barWindow(bars, '2026-04').length).toBeLessThanOrEqual(6);
  });
  it('a selection inside the newest six keeps the newest six', () => {
    expect(barWindow(bars, '2026-09').map((b) => b.key)[5]).toBe('2026-12');
  });
  it('short series are untouched', () => {
    expect(barWindow(bars.slice(0, 4))).toHaveLength(4);
  });
});

describe('bar pages of six (swipe right for the previous six months)', () => {
  const months = Array.from({ length: 14 }, (_, i) => ({ key: `2025-${String(i + 1).padStart(2, '0')}` }));
  it('counts pages and gives the newest six first', () => {
    expect(barPages(14)).toBe(3);
    expect(barPages(6)).toBe(1);
    expect(barPages(0)).toBe(1);
    expect(barPage(months, 0).map((b) => b.key)).toEqual(months.slice(8).map((b) => b.key));
  });
  it('steps back six at a time; the oldest page may hold fewer', () => {
    expect(barPage(months, 1).map((b) => b.key)).toEqual(months.slice(2, 8).map((b) => b.key));
    expect(barPage(months, 2).map((b) => b.key)).toEqual(months.slice(0, 2).map((b) => b.key));
    expect(barPage(months, 3)).toEqual([]);
  });
  it('finds the page a month is on', () => {
    expect(pageOf(months, months[13].key)).toBe(0);
    expect(pageOf(months, months[8].key)).toBe(0);
    expect(pageOf(months, months[7].key)).toBe(1);
    expect(pageOf(months, months[0].key)).toBe(2);
    expect(pageOf(months, 'missing')).toBe(0);
  });
});
