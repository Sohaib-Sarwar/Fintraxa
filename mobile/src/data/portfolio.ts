/**
 * Engine-backed views of the user's investments: the same calls the web makes in useMfAnalysis /
 * usePsxPortfolio / useNccpl, with the same inputs, so every figure matches the web to the paisa (plan G4).
 */
import { useMemo } from 'react';
import { todayIso } from '@/lib/dates';
import { analyzeFunds, analyzeStocks, nccplReport, normSymbol, preferNewerPrices, summarizeDividends, taxYearOf } from './engines';
import { fundDayChanges, fundInputs, stockPriceMap } from './selectors';
import { useBoard, useCloses, useDividends, useFundsFeed, useLedger, useTrades } from './queries';

export type Range = { start: string; end: string };

export function useFundsAnalysis(range: Range) {
  const ledger = useLedger();
  const feed = useFundsFeed();
  const { start, end } = range;
  const result = useMemo(() => {
    const d = ledger.data;
    if (!d) return null;
    const { funds, amcs, prices } = fundInputs(d, feed.data);
    const analysis = analyzeFunds({ entries: d.entries, components: d.components, prices, funds, amcs, start, end, today: todayIso() });
    const day = fundDayChanges(analysis.positions, prices);
    return { analysis, day };
  }, [ledger.data, feed.data, start, end]);
  return {
    analysis: result?.analysis ?? null,
    day: result?.day ?? null,
    isLoading: ledger.isLoading,
    error: ledger.error,
    navAsOf: feed.data?.asOf ?? null,
    refetch: () => Promise.all([ledger.refetch(), feed.refetch()]),
  };
}

export function useStocksAnalysis(range: Range) {
  const trades = useTrades();
  const board = useBoard();
  const symbols = useMemo(() => [...new Set((trades.data ?? []).map((t) => normSymbol(t.symbol)).filter(Boolean))].sort(), [trades.data]);
  const closes = useCloses(symbols);
  const boardAsOf = board.data?.asOf ? board.data.asOf.slice(0, 10) : null;
  const { start, end } = range;
  const analysis = useMemo(() => {
    if (!trades.data) return null;
    const live = preferNewerPrices(stockPriceMap(board.data), closes.data, boardAsOf);
    return analyzeStocks(trades.data, { live, history: closes.data ?? {}, start, end, today: todayIso() });
  }, [trades.data, board.data, closes.data, boardAsOf, start, end]);
  return {
    analysis,
    trades: trades.data ?? [],
    board: board.data,
    boardAsOf: board.data?.asOf ?? null,
    isLoading: trades.isLoading,
    pricesLoading: board.isLoading,
    error: trades.error,
    refetch: () => Promise.all([trades.refetch(), board.refetch(), closes.refetch()]),
  };
}

/** NCCPL CGT over ALL trades (tax is on the taxpayer's total; filters never change it). */
export function useNccpl() {
  const trades = useTrades();
  const report = useMemo(() => (trades.data ? nccplReport(trades.data, { today: todayIso() }) : null), [trades.data]);
  return { report, isLoading: trades.isLoading, currentTaxYear: taxYearOf(todayIso()) };
}

export function useDividendSummary(range: Range) {
  const q = useDividends();
  const { start, end } = range;
  const summary = useMemo(() => (q.data ? summarizeDividends(q.data, { start, end, today: todayIso() }) : null), [q.data, start, end]);
  return { all: q.data ?? [], summary, isLoading: q.isLoading };
}
