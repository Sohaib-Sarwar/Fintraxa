import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  mufapFundsQuery, psxStocksQuery, fundPriceMap, stockPriceMap,
} from '../../lib/marketQueries';
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns';

/**
 * Custom hook to aggregate data from Finance, MF, and Stocks sections.
 * Returns total assets, per-section values, pie data, and growth history.
 */
export function useAggregatedAssets() {
  const user = useAuthStore((s) => s.user);
  
  // Current month date range
  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  /* ─── Finance: current month transactions ─── */
  const { data: ieTxns = [], isLoading: ieLoading } = useQuery({
    queryKey: ['home-ie-txns', user?.id, format(now, 'yyyy-MM')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_expense_transactions')
        .select('amount, type, date')
        .eq('user_id', user.id)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
  
  /* ─── Finance: all transactions for growth chart ─── */
  const { data: ieAllTxns = [] } = useQuery({
    queryKey: ['home-ie-txns-all', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('income_expense_transactions')
        .select('amount, type, date')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  /* ─── MF transactions ─── */
  const { data: mfTxns = [], isLoading: mfLoading } = useQuery({
    queryKey: ['home-mf-txns', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mutual_fund_transactions')
        .select('fund_id, fund_name, nav, investment_amount, units, type, date')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  /* ─── MF live NAVs ─── */
  const { data: mfApiData, isError: mfApiFailed } = useQuery(mufapFundsQuery());

  /* ─── Stock transactions ─── */
  const { data: stTxns = [], isLoading: stLoading } = useQuery({
    queryKey: ['home-st-txns', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select('symbol, company_name, price, quantity, type, date')
        .eq('user_id', user.id)
        .order('date', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  /* ─── Stock live prices ─── */
  const { data: liveStocks, isError: psxApiFailed } = useQuery(psxStocksQuery());

  const isLoading = ieLoading || mfLoading || stLoading;

  const result = useMemo(() => {
    /* ── Finance balance ── */
    const financeBalance = ieTxns.reduce((sum, t) => {
      return sum + (t.type === 'credit' ? Number(t.amount) : -Number(t.amount));
    }, 0);

    /* ── MF market value ── */
    const mfPriceMap = fundPriceMap(mfApiData);

    const mfHoldingMap = {};
    mfTxns.forEach((t) => {
      if (!mfHoldingMap[t.fund_id]) mfHoldingMap[t.fund_id] = { name: t.fund_name, units: 0, nav: t.nav };
      const h = mfHoldingMap[t.fund_id];
      if (t.type === 'buy') h.units += Number(t.units);
      else h.units -= Number(t.units);
    });

    // A holding with no live price falls back to its purchase price, which
    // makes the total look precise while quietly reporting cost as value.
    // Counting those lets the dashboard say so instead of implying otherwise.
    const mfOpen = Object.values(mfHoldingMap).filter((h) => h.units > 0);
    const fundsAtCost = mfOpen.filter((h) => !mfPriceMap[h.name]).length;
    const mfValue = mfOpen.reduce(
      (sum, h) => sum + h.units * (mfPriceMap[h.name] || h.nav), 0);

    /* ── Stocks market value ── */
    const stLive = stockPriceMap(liveStocks);

    const stHoldingMap = {};
    stTxns.forEach((t) => {
      const sym = t.symbol?.toUpperCase();
      if (!stHoldingMap[sym]) stHoldingMap[sym] = { shares: 0, avgPrice: Number(t.price) };
      const h = stHoldingMap[sym];
      if (t.type === 'buy') h.shares += Number(t.quantity);
      else h.shares -= Number(t.quantity);
    });

    const stOpen = Object.entries(stHoldingMap).filter(([, h]) => h.shares > 0);
    const holdingsAtCost = stOpen.filter(([sym]) => !stLive[sym]?.current).length;
    const stocksValue = stOpen.reduce(
      (sum, [sym, h]) => sum + h.shares * (stLive[sym]?.current || h.avgPrice), 0);

    /* ── Total assets ── */
    const totalAssets = financeBalance + mfValue + stocksValue;

    /* ── Pie data ── */
    const pieData = [
      { name: 'Finance', value: Math.max(0, financeBalance) },
      { name: 'Mutual Funds', value: Math.max(0, mfValue) },
      { name: 'Stocks', value: Math.max(0, stocksValue) },
    ].filter((d) => d.value > 0);

    /* ── Monthly growth (last 6 months) ── */
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      months.push({
        key: format(d, 'yyyy-MM'),
        label: format(d, 'MMM'),
        finance: 0,
        mf: 0,
        stocks: 0,
        total: 0,
      });
    }

    // Finance cumulative by month (use all transactions for growth chart)
    let finCum = 0;
    const finByMonth = {};
    ieAllTxns.forEach((t) => {
      finCum += t.type === 'credit' ? Number(t.amount) : -Number(t.amount);
      const m = t.date?.slice(0, 7);
      finByMonth[m] = finCum;
    });

    // MF cumulative cost by month (approximate, since we don't have monthly NAVs)
    let mfCum = 0;
    const mfByMonth = {};
    mfTxns.forEach((t) => {
      mfCum += t.type === 'buy' ? Number(t.units) * Number(t.nav) : -Number(t.units) * Number(t.nav);
      const m = t.date?.slice(0, 7);
      mfByMonth[m] = mfCum;
    });

    // Stock cumulative cost by month
    let stCum = 0;
    const stByMonth = {};
    stTxns.forEach((t) => {
      stCum += t.type === 'buy' ? Number(t.quantity) * Number(t.price) : -Number(t.quantity) * Number(t.price);
      const m = t.date?.slice(0, 7);
      stByMonth[m] = stCum;
    });

    // Fill months with latest-known cumulative values
    let lastFin = 0, lastMF = 0, lastST = 0;
    // Find the first known month across all data
    const allMonthKeys = [...new Set([...Object.keys(finByMonth), ...Object.keys(mfByMonth), ...Object.keys(stByMonth)])].sort();
    allMonthKeys.forEach((m) => {
      if (finByMonth[m] !== undefined) lastFin = finByMonth[m];
      if (mfByMonth[m] !== undefined) lastMF = mfByMonth[m];
      if (stByMonth[m] !== undefined) lastST = stByMonth[m];
    });

    // Reset for pass-through
    lastFin = 0; lastMF = 0; lastST = 0;
    months.forEach((mo) => {
      // Walk all months up to this key
      allMonthKeys.filter((k) => k <= mo.key).forEach((k) => {
        if (finByMonth[k] !== undefined) lastFin = finByMonth[k];
        if (mfByMonth[k] !== undefined) lastMF = mfByMonth[k];
        if (stByMonth[k] !== undefined) lastST = stByMonth[k];
      });
      mo.finance = lastFin;
      mo.mf = lastMF;
      mo.stocks = lastST;
      mo.total = lastFin + lastMF + lastST;
    });

    return {
      totalAssets, financeBalance, mfValue, stocksValue,
      pieData, growthData: months,
      // Valuation quality, for the dashboard to be honest about.
      holdingsAtCost, fundsAtCost,
    };
  }, [ieTxns, ieAllTxns, mfTxns, stTxns, mfApiData, liveStocks]);

  return {
    ...result,
    isLoading,
    // The market feed is separate from the user's own data: a portfolio still
    // renders when it is down, valued at cost. Surfaced so the UI can label
    // the number rather than present a cost basis as a market value.
    marketDataFailed: Boolean(mfApiFailed || psxApiFailed),
    freshness: liveStocks?.freshness ?? mfApiData?.freshness ?? null,
  };
}
