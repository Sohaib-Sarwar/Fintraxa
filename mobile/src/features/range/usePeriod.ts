import { useMemo } from 'react';
import { create } from 'zustand';
import { todayIso } from '@/lib/dates';
import { effectiveEnd, rangePillLabel, rangeMonths, resolveRange, type RangeChoice } from '@/lib/range';
import { useApp } from '@/lib/store';

/** Open state of the period sheet (drawn by the tabs layout so it can blur the whole screen). */
export const usePeriodSheet = create<{ open: boolean; show: () => void; hide: () => void }>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

/**
 * The app-wide period (owner, 2026-11-14): `range` as chosen, `upTo` = the part that has happened (for
 * figures), `months` = the chart's bars, `label` = the button text ("FY 2026-27").
 */
export function usePeriod() {
  const choice = useApp((s) => s.range);
  const today = todayIso();
  return useMemo(() => {
    const range = resolveRange(choice, today);
    return {
      choice, range, label: rangePillLabel(range, today),
      upTo: { start: range.start, end: effectiveEnd(range, today) },
      months: rangeMonths(range, today),
      set: (c: RangeChoice) => useApp.getState().set({ range: c }),
    };
  }, [choice, today]);
}
