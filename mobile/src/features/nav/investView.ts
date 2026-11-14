import { create } from 'zustand';

export type InvestView = 'funds' | 'stocks';

/**
 * Which half of Invest is open (owner, 2026-11-14: tapping Invest splits it into "Funds" and "Stocks" in the
 * nav, funds first). Not persisted: every fresh visit to Invest from another tab opens Mutual funds.
 */
export const useInvestView = create<{ view: InvestView; setView: (v: InvestView) => void }>()((set) => ({
  view: 'funds',
  setView: (view) => set({ view }),
}));
