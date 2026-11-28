/**
 * The widget's geometry for any size the launcher gives it (dp) — one function, so the picture
 * (EarningsWidget.tsx), the live number's slot (native ticker) and the in-app preview (WidgetFace.tsx) always agree.
 * Apple-widget proportions (owner, 2026-11-28: "numbers too small, take inspiration from Apple's widgets"): a clear
 * label, one big figure filling the middle, larger secondary figures; content grows with the widget, not just scales.
 *
 *   row      one cell high (2×1, 4×1): label over the figure
 *   compact  two cells wide (2×2): label, figure, This month
 *   regular  3–5 cells wide, two high (4×2): label + mark, figure, up to three figures side by side
 *   tall     three or more high (4×3+): the figures as a list
 */
import type { Slot } from './ticker';

export type WidgetLayout = {
  mode: 'row' | 'compact' | 'regular' | 'tall';
  pad: number;
  label: number;
  mark: number;
  topH: number;
  figures: number;
  figLabel: number;
  figValue: number;
  bottomH: number;
  rowH: number;
  /** Where the big figure goes, as insets from each edge. */
  slot: Slot;
  /** The largest the big figure may be (a still figure is also limited by its width). */
  bigMax: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const GAP = 4;

export function widgetLayout(width: number, height: number, wanted: number): WidgetLayout {
  const w = Math.max(100, width);
  const h = Math.max(48, height);
  const mode: WidgetLayout['mode'] = h < 100 ? 'row' : w < 230 ? 'compact' : h >= 250 ? 'tall' : 'regular';
  const pad = mode === 'row' ? 12 : Math.round(clamp(Math.min(w, h) * 0.09, 13, 18));
  const label = Math.round(clamp(w * 0.044, 13, 15.5) * 2) / 2;
  const mark = Math.round(label * 1.9);
  const figLabel = Math.round(clamp(w * 0.036, 11.5, 13) * 2) / 2;
  const figValue = Math.round(clamp(w * 0.05, 15, 19) * 2) / 2;
  const figures = mode === 'row' ? 0
    : mode === 'compact' ? (h >= 140 ? Math.min(1, wanted) : 0)
    : mode === 'tall' ? Math.min(3, wanted)
    : Math.min(wanted, w < 300 ? 2 : 3);
  const rowH = Math.round(figValue * 1.3 + 12);
  const bottomH = !figures ? 0 : mode === 'tall' ? figures * rowH : Math.round(figLabel * 1.35 + figValue * 1.3 + 2);
  if (mode === 'row') {
    const topH = Math.round(label * 1.3);
    const slot = { left: pad, right: pad, top: 8 + topH, bottom: 8 };
    return { mode, pad, label, mark: 0, topH, figures, figLabel, figValue, bottomH, rowH, slot, bigMax: Math.min(h - slot.top - slot.bottom, 40) };
  }
  const topH = Math.max(Math.round(label * 1.35), mark);
  const slot = { left: pad, right: pad, top: pad + topH + GAP, bottom: pad + bottomH + (bottomH ? GAP : 0) };
  const slotH = h - slot.top - slot.bottom;
  return { mode, pad, label, mark, topH, figures, figLabel, figValue, bottomH, rowH, slot, bigMax: Math.round(clamp(slotH * 0.8, 18, 64)) };
}

/** A still big figure's size: as large as the slot allows, its width included ("1,234.56" + " PKR"). */
export function stillFigureSize(text: string, l: WidgetLayout, width: number): number {
  const room = Math.max(40, width - l.slot.left - l.slot.right);
  const ems = [...text].reduce((s, ch) => s + (/[0-9•]/.test(ch) ? 0.62 : ch === ',' || ch === '.' ? 0.3 : 0.6), 0) + 0.32 * 2.6;
  return Math.max(14, Math.min(l.bigMax, Math.floor(room / ems)));
}
