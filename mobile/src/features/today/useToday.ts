import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useFundsAnalysis, useStocksAnalysis } from '@/data/portfolio';
import { useFeedHealth, usePendingReview, useProfile, useSnapshots, useTransactions, useUid } from '@/data/queries';
import { holdingsPoints, needsYou, sinceLastLooked, todayFigures, type SinceItem } from '@/data/selectors';
import { ALL_TIME_START, addMonths, monthOf, monthRange, todayIso } from '@/lib/dates';
import { useApp, useTracks, type LastSeen } from '@/lib/store';

/** Everything Today shows, from cached data first (persisted queries), refreshed silently. */
export function useToday() {
  const uid = useUid();
  const tracks = useTracks(uid);
  const today = todayIso();
  const allTime = useMemo(() => ({ start: ALL_TIME_START, end: today }), [today]);
  const funds = useFundsAnalysis(allTime);
  const stocks = useStocksAnalysis(allTime);
  const txns = useTransactions();
  const snaps = useSnapshots();
  const pending = usePendingReview();
  const health = useFeedHealth();
  const profile = useProfile();

  const figures = useMemo(() => todayFigures({
    funds: funds.analysis, stocks: stocks.analysis, fundDay: funds.day, txns: txns.data ?? [],
    month: monthRange(monthOf(today)), today, boardAsOf: stocks.boardAsOf, tracks,
  }), [funds.analysis, stocks.analysis, funds.day, txns.data, today, stocks.boardAsOf, tracks]);

  const points = useMemo(() => holdingsPoints(snaps.data ?? [], {
    date: today, value: figures.worth, cost: figures.invested,
  }), [snaps.data, today, figures.worth, figures.invested]);

  const needs = useMemo(() => needsYou({
    pendingReview: pending.data ?? 0, health: health.data, funds: funds.analysis, stocks: stocks.analysis, tracks,
  }), [pending.data, health.data, funds.analysis, stocks.analysis, tracks]);

  // "Since you last looked": compare with the mark saved on the previous visit, then save a new one.
  // Read once per mount: the mark from the previous visit (a new one is saved below).
  const [prevSeen] = useState<LastSeen | undefined>(() => (uid ? useApp.getState().lastSeen[uid] : undefined));
  const [openedAt] = useState(() => Date.now());
  const ready = !!funds.analysis && !!stocks.analysis && !stocks.pricesLoading;
  const since: SinceItem[] = useMemo(() => (ready
    ? sinceLastLooked(prevSeen, { at: openedAt, stocks: figures.stocks, funds: figures.funds, navDate: figures.navAsOf }, tracks)
    : []), [ready, prevSeen, openedAt, figures.stocks, figures.funds, figures.navAsOf, tracks]);
  useEffect(() => {
    if (!uid || !ready) return;
    const t = setTimeout(() => {
      useApp.getState().setLastSeen(uid, { at: Date.now(), stocks: figures.stocks, funds: figures.funds, navDate: figures.navAsOf, worth: figures.worth, psxDate: figures.psxAsOf });
    }, 4000);
    return () => clearTimeout(t);
  }, [uid, ready, figures]);

  const hasAnything = (funds.analysis?.allPositions.length ?? 0) > 0 || (stocks.analysis?.allPositions.length ?? 0) > 0 || (txns.data?.length ?? 0) > 0;
  // Loading until every source has answered (owner, 2026-11-15: "Nothing tracked" flashed after a fingerprint sign-in).
  // `isLoading` is only "pending AND fetching": while the saved cache is still being restored, or before a fetch
  // starts, it is false with no data — which read as an empty account. Anything already present shows at once; the
  // empty state needs funds, shares and transactions all answered (data or an error) and the restore finished.
  const restoring = useIsRestoring();
  const answered = (!!funds.analysis || !!funds.error) && (!!stocks.analysis || !!stocks.error) && (txns.data !== undefined || txns.isError);
  const loading = !hasAnything && (restoring || !answered);

  return {
    uid, tracks, figures, points, needs, since, prevSeenAt: prevSeen?.at ?? null,
    recent: (txns.data ?? []).slice(0, 4),
    funds: funds.analysis, stocks: stocks.analysis,
    profileName: profile.data?.full_name ?? null,
    hasAnything, loading,
    error: !funds.analysis && !txns.data ? (funds.error ?? txns.error) : null,
    lastMonth: addMonths(monthOf(today), -1),
    refetch: () => Promise.all([funds.refetch(), stocks.refetch(), txns.refetch(), snaps.refetch(), pending.refetch(), health.refetch()]),
  };
}
