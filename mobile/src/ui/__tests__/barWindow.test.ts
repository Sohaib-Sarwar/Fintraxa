import { barWindow, MAX_BARS } from '../barWindow';

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
