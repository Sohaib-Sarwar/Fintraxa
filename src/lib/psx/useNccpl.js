/**
 * Capital gains on the signed-in user's shares the way NCCPL computes them (./nccpl.js), over
 * ALL their trades: the tax is charged on the taxpayer's total across stocks and brokers, so a
 * stock or broker filter never changes it. Shares the cached trades query with the other pages.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { stockTradesQuery } from './usePsxPortfolio';
import { nccplReport, taxYearOf } from './nccpl';
import { todayIso } from '../dateRange';

export function useNccpl() {
  const user = useAuthStore((s) => s.user);
  const trades = useQuery(stockTradesQuery(user?.id));
  const report = useMemo(() => (trades.data ? nccplReport(trades.data, { today: todayIso() }) : null), [trades.data]);
  return { report, isLoading: trades.isLoading, currentTaxYear: taxYearOf(todayIso()) };
}
