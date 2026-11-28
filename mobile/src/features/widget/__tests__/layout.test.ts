import { stillFigureSize, widgetLayout } from '../layout';

describe('widget layout', () => {
  test.each([
    ['2×1', 170, 70, 'row', 0], ['4×1', 340, 70, 'row', 0], ['2×2', 170, 170, 'compact', 1],
    ['4×2', 340, 170, 'regular', 3], ['3×2', 260, 170, 'regular', 2], ['4×3', 340, 270, 'tall', 3],
  ] as const)('%s', (_n, w, h, mode, figs) => {
    const l = widgetLayout(w, h, 3);
    expect(l.mode).toBe(mode);
    expect(l.figures).toBe(figs);
    // The big figure always has room, and the slot stays inside the widget.
    const slotH = h - l.slot.top - l.slot.bottom;
    expect(slotH).toBeGreaterThanOrEqual(24);
    expect(l.slot.left + l.slot.right).toBeLessThan(w);
  });

  test('numbers are big: the figure fills the middle of a 4×2', () => {
    const l = widgetLayout(340, 170, 3);
    expect(l.bigMax).toBeGreaterThanOrEqual(40);
    expect(l.label).toBeGreaterThanOrEqual(13);
    expect(l.figValue).toBeGreaterThanOrEqual(15);
    expect(stillFigureSize('1,234.56', l, 340)).toBeGreaterThanOrEqual(36);
  });
});
