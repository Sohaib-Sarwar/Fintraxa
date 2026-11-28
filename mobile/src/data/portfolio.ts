/**
 * Engine-backed views of the user's investments: the same calls the web makes in useMfAnalysis /
 * usePsxPortfolio / useNccpl, with the same inputs, so every figure matches the web to the paisa (plan G4).
 */
import { useMemo } from 'react';
import { todayIso } from '@/lib/dates';
import { analyzeFunds, analyzePassive, analyzeStocks, nccplReport, normSymbol, passiveEvents, preferNewerPrices, summarizeDividends, taxYearOf, type PassiveSource } from './engines';
import { fundDayChanges, fundInputs, stockPriceMap } from './selectors';
import { useBoard, useCloses, useDividends, useFundsFeed, useLedger, useTrades, useTransactions, type Closes } from './queries';
import type { Board, FundsFeed, Ledger, Trade } from './types';

export type Range = { start: string; end: string };

/*
 * One analysis per (data, period, day), shared by every screen that asks (owner, 2026-11-28: slow start-up). The
 * engines replay the whole history; each hook used to run its own copy — Home, the widget sync, Invest and the
 * passive pages computed the same all-time analysis again and again on the JS thread. Results are keyed by the
 * very data objects TanStack Query hands out (a refetch makes new objects, so a new result), the period and today.
 * Engine outputs are read-only for the screens, so sharing them is safe.
 */
const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object | null | undefined) => {
  if (!o) return 0;
  let id = ids.get(o);
  if (!id) { id = nextId++; ids.set(o, id); }
  return id;
};
const MAX_PER_SOURCE = 12;
function memo<T>(cache: WeakMap<object, Map<string, T>>, source: object, key: string, make: () => T): T {
  let m = cache.get(source);
  if (!m) { m = new Map(); cache.set(source, m); }
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const v = make();
  if (m.size >= MAX_PER_SOURCE) m.delete(m.keys().next().value as string);
  m.set(key, v);
  return v;
}

type FundsResult = { analysis: ReturnType<typeof analyzeFunds>; day: ReturnType<typeof fundDayChanges> };
const fundsCache = new WeakMap<object, Map<string, FundsResult>>();
function fundsResult(d: Ledger, feedData: FundsFeed | undefined, start: string, end: string): FundsResult {
  const today = todayIso();
  return memo(fundsCache, d, `${start}|${end}|${today}|${idOf(feedData)}`, () => {
    const { funds, amcs, prices } = fundInputs(d, feedData);
    const analysis = analyzeFunds({ entries: d.entries, components: d.components, prices, funds, amcs, start, end, today });
    return { analysis, day: fundDayChanges(analysis.positions, prices) };
  });
}

const stocksCache = new WeakMap<object, Map<string, ReturnType<typeof analyzeStocks>>>();
function stocksResult(trades: Trade[], board: Board | undefined, closes: Closes | undefined, start: string, end: string) {
  const today = todayIso();
  return memo(stocksCache, trades, `${start}|${end}|${today}|${idOf(board)}|${idOf(closes)}`, () => {
    const boardAsOf = board?.asOf ? board.asOf.slice(0, 10) : null;
    const live = preferNewerPrices(stockPriceMap(board), closes, boardAsOf, board?.fetchedAt ?? null);
    return analyzeStocks(trades, { live, history: closes ?? {}, start, end, today });
  });
}

export function useFundsAnalysis(range: Range) {
  const ledger = useLedger();
  const feed = useFundsFeed();
  const { start, end } = range;
  const result = useMemo(() => (ledger.data ? fundsResult(ledger.data, feed.data, start, end) : null), [ledger.data, feed.data, start, end]);
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
  const { start, end } = range;
  const analysis = useMemo(() => (trades.data ? stocksResult(trades.data, board.data, closes.data, start, end) : null), [trades.data, board.data, closes.data, start, end]);
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

/** Passive income (web: usePassive): realized mutual-fund profit by month, dividends, and passive-category credits. */
/** `source`: only that source's payments (the web's source picker), else all passive income. */
export function usePassive(range: Range, source?: PassiveSource) {
  const allTime = useMemo(() => ({ start: '2000-01-01', end: todayIso() }), []);
  const funds = useFundsAnalysis(allTime);
  const divs = useDividends();
  const txns = useTransactions();
  const { start, end } = range;
  const events = useMemo(() => (funds.analysis && divs.data && txns.data
    ? passiveEvents({ mfMonths: funds.analysis.months ?? [], dividends: divs.data, transactions: txns.data, today: todayIso() })
    : null), [funds.analysis, divs.data, txns.data]);
  const scoped = useMemo(() => (events && source ? events.filter((e) => e.source === source) : events), [events, source]);
  const analysis = useMemo(() => (scoped ? analyzePassive(scoped, { start, end, today: todayIso() }) : null), [scoped, start, end]);
  return {
    analysis, events: scoped,
    isLoading: !analysis && (funds.isLoading || divs.isLoading || txns.isLoading),
    refetch: () => Promise.all([funds.refetch(), divs.refetch(), txns.refetch()]),
  };
}
