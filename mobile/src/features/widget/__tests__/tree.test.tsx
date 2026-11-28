/**
 * The widget must build as react-native-android-widget builds it: by calling the components as plain functions.
 * 2026-11-28 regression: the React Compiler turned them into hook-using components ("Invalid hook call"), so every
 * draw failed — Save never finished and new widgets were discarded or left empty.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EarningsWidget, FallbackWidget } from '../EarningsWidget';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree') as { buildWidgetTree: (el: React.JSX.Element) => { type: string; children?: unknown[] } };

const figures = { perSecond: 0.001, avgPerMonth: 2600, today: 52.4, overnight: 28.8, yesterday: 85.4, month: 3000, average: 2600, months: 5, hasIncome: true };
const base = { card: 'obsidian' as const, show: ['month', 'yesterday', 'overnight'] as const, hide: false, builtAt: Date.now(), now: Date.now(), live: false };

describe('widget tree', () => {
  test('the widget file keeps the React Compiler off', () => {
    const src = readFileSync(join(__dirname, '..', 'EarningsWidget.tsx'), 'utf8');
    expect(src.split('\n').find((l) => l.trim() && !l.trim().startsWith('//'))?.trim()).toBe("'use no memo';");
  });

  test.each([
    ['4×2', 340, 170], ['2×2', 170, 170], ['4×1', 340, 70], ['4×3', 340, 270], ['5×2', 420, 170],
  ])('builds at %s', (_name, width, height) => {
    const tree = buildWidgetTree(<EarningsWidget {...base} show={[...base.show]} width={width} height={height} figures={figures} />);
    expect(tree.type).toBe('FrameLayoutWidget'); // OverlapWidget's native name
    expect(JSON.stringify(tree)).toContain('OPEN_APP');
    // Still figure (no ticker): drawn with PKR right after it; live: the slot is left to the native ticker.
    expect(JSON.stringify(tree)).toContain('"text":"52.40"');
    const live = JSON.stringify(buildWidgetTree(<EarningsWidget {...base} live show={[...base.show]} width={width} height={height} figures={figures} />));
    expect(live).not.toContain('"text":"52.40"');
  });

  test('builds with no saved data, hidden amounts, and the fallback', () => {
    expect(JSON.stringify(buildWidgetTree(<EarningsWidget {...base} show={[]} width={340} height={170} figures={null} builtAt={null} />))).toContain('Open Fintraxa once');
    expect(JSON.stringify(buildWidgetTree(<EarningsWidget {...base} show={['month']} hide width={340} height={170} figures={figures} />))).toContain('••••••');
    expect(JSON.stringify(buildWidgetTree(<FallbackWidget />))).toContain('OPEN_APP');
  });
});
