/**
 * Everything Xyro knows, gathered from the app's own cached queries (no extra
 * round trips when the dashboards were already visited) and turned into the
 * system instruction. Only active while the chat panel is open.
 */
import { useMemo } from 'react';
import { useFinanceTransactions } from '../finance/useFinance';
import { usePassiveIncome } from '../finance/usePassive';
import { useMfAnalysis } from '../mf/useMfPortfolio';
import { usePsxPortfolio } from '../psx/usePsxPortfolio';
import { useDividends } from '../psx/useDividends';
import { useSavingsAccounts } from '../finance/useSavingsAccounts';
import { useProfile } from '../profile/useProfile';
import { ALL_TIME_START, todayIso } from '../dateRange';
import { buildSnapshot, systemInstruction } from './context';
import { cashFlows, savingsAt, netWorth } from '../home/combine';

export function useXyroData() {
  const allTime = useMemo(() => ({ id: 'all', start: ALL_TIME_START, end: todayIso() }), []);
  const { data: transactions, isLoading: txLoading } = useFinanceTransactions();
  const { events, isLoading: passiveLoading } = usePassiveIncome(allTime);
  const { analysis: mf, isLoading: mfLoading } = useMfAnalysis(allTime);
  const { portfolio: psx, trades, isLoading: psxLoading } = usePsxPortfolio(allTime);
  const { all: dividends, isLoading: divLoading } = useDividends();
  const { data: savingsAccounts } = useSavingsAccounts();
  const { data: profile } = useProfile();
  const loading = txLoading || passiveLoading || mfLoading || psxLoading || divLoading;

  const system = useMemo(() => {
    if (loading) return null;
    const snapshot = buildSnapshot({
      today: todayIso(), profile, transactions: transactions ?? [], events, mf, psx, trades, dividends, savingsAccounts: savingsAccounts ?? [],
    }, { rows: false }); // records go with each question (lib/xyro/intent.js)
    const first = String(profile?.full_name ?? '').trim().split(/\s+/)[0] || undefined;
    return systemInstruction(snapshot, { name: first });
  }, [loading, profile, transactions, events, mf, psx, trades, dividends, savingsAccounts]);

  // Raw records and the names a question can mention, for lib/xyro/intent.js.
  const data = useMemo(() => {
    if (loading) return null;
    const tx = (transactions ?? []).filter((t) => t.date && t.date <= todayIso());
    const flows = cashFlows({ transactions: tx, dividends: dividends ?? [] });
    return {
      transactions: tx, dividends: dividends ?? [], trades: trades ?? [], events: events ?? [],
      worth: netWorth({ funds: mf?.totals?.value ?? 0, stocks: psx?.totals?.value ?? 0, savings: savingsAt(flows, todayIso()) }),
      categories: [...new Set(tx.map((t) => t.categories?.name).filter(Boolean))],
      notes: [...new Set(tx.map((t) => (t.notes ?? '').trim()).filter(Boolean))],
      symbols: [...new Set([...(dividends ?? []).map((d) => d.symbol), ...(trades ?? []).map((t) => t.symbol)].filter(Boolean))],
    };
  }, [loading, transactions, dividends, trades, events, mf, psx]);

  return { system, data, loading };
}
