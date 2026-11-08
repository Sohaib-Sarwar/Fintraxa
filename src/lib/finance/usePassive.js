/**
 * Passive income for the signed-in user, from what is already in the database:
 *   - mutual-fund realized profit (the ledger, via the profit engine)
 *   - PSX dividends (stock_dividends)
 *   - passive income entries (income_expense_transactions in passive categories)
 * and the monthly mutual-fund postings kept in passive_income_postings.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { useMfAnalysis } from '../mf/useMfPortfolio';
import { PROFIT_VERSION } from '../mf/profit';
import { useDividends } from '../psx/useDividends';
import { useFinanceTransactions } from './useFinance';
import { ALL_TIME_START, todayIso } from '../dateRange';
import { passiveEvents, analyzePassive, mfPostingRows } from './passive';

const postingsQuery = (userId) => ({
  queryKey: ['passive-postings', userId],
  enabled: !!userId,
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from('passive_income_postings')
      .select('period, gross::text, tax::text, charges::text, net::text, sales, engine_version')
      .eq('user_id', userId).eq('source', 'mutual_funds').order('period');
    if (error) throw error;
    return data ?? [];
  },
});

const signature = (rows) => rows.map((r) => [r.period, Number(r.gross).toFixed(2), Number(r.tax).toFixed(2), Number(r.charges ?? 0).toFixed(2), Number(r.net).toFixed(2)].join(':')).join('|');

/**
 * Keep passive_income_postings equal to the ledger's closed months: post new
 * months, correct changed ones, remove ones that no longer have activity.
 * Runs only when the two differ; a failure is logged and retried on the next change.
 */
function useMfPostingsSync(mfMonths) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const postings = useQuery(postingsQuery(user?.id));
  const inFlight = useRef(null);
  useEffect(() => {
    if (!user?.id || !mfMonths || !postings.data) return;
    const rows = mfPostingRows(mfMonths, todayIso());
    const want = signature(rows);
    const have = signature(postings.data.map((p) => ({ period: p.period, gross: p.gross, tax: p.tax, charges: p.charges, net: p.net })));
    const stale = postings.data.some((p) => p.engine_version !== PROFIT_VERSION);
    if ((want === have && !stale) || inFlight.current === want) return;
    inFlight.current = want;
    supabase.rpc('sync_passive_postings', { p_source: 'mutual_funds', p_rows: rows, p_engine: PROFIT_VERSION })
      .then(({ error }) => {
        if (error) { console.warn('[passive] could not post mutual fund months:', error.message); inFlight.current = null; return; }
        qc.invalidateQueries({ queryKey: ['passive-postings', user.id] });
      });
  }, [user?.id, mfMonths, postings.data, qc]);
  return postings;
}

/**
 * range: { start, end } (global date filter). Returns the analysis for the
 * range plus every event (for the calendar), all from cached queries.
 */
export function usePassiveIncome(range) {
  const allTime = useMemo(() => ({ id: 'all', start: ALL_TIME_START, end: todayIso() }), []);
  const { analysis: mf, isLoading: mfLoading } = useMfAnalysis(allTime);
  const { all: dividends, isLoading: divLoading } = useDividends();
  const { data: txns, isLoading: txLoading } = useFinanceTransactions();
  useMfPostingsSync(mf?.months);

  const events = useMemo(() => {
    if (!mf || !txns) return null;
    return passiveEvents({ mfMonths: mf.months, dividends, transactions: txns, today: todayIso() });
  }, [mf, dividends, txns]);
  const start = range?.start ?? ALL_TIME_START;
  const end = range?.end;
  const analysis = useMemo(() => (events ? analyzePassive(events, { start, end, today: todayIso() }) : null), [events, start, end]);
  const allTimeAnalysis = useMemo(() => (events ? analyzePassive(events, { start: ALL_TIME_START, end: todayIso(), today: todayIso() }) : null), [events]);
  return { analysis, allTime: allTimeAnalysis, events: events ?? [], isLoading: mfLoading || divLoading || txLoading || !events };
}
