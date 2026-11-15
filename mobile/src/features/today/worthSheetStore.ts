import { create } from 'zustand';

export type WorthBreakdown = { total: number; funds: number | null; stocks: number | null; dividends: number | null; period: string };

/** The net-worth sheet opened from Home's card; drawn by the tabs layout so its blur covers the whole screen. */
export const useWorthSheet = create<{ data: WorthBreakdown | null; open: (d: WorthBreakdown) => void; close: () => void }>()((set) => ({
  data: null,
  open: (data) => set({ data }),
  close: () => set({ data: null }),
}));
