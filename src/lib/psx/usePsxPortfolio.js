/**
 * PSX holdings for the signed-in user: their trades + live prices from the
 * market-data microservice (psxStocksQuery — one cached download of the
 * whole board, refreshed on the service's schedule). Figures come from
 * ./portfolio.js.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { psxStocksQuery, stockPriceMap } from '../marketQueries';
import { analyzeStocks, normSymbol } from './portfolio';
import { getStockSector } from '../psxSectors';

/** Same key the Trades/Analytics pages use, so the trades are fetched once. */
export const stockTradesQuery = (userId) => ({
  queryKey: ['stock-transactions', userId],
  enabled: !!userId,
  staleTime: 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from('stock_transactions').select('*')
      .eq('user_id', userId).order('date', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

/** Captured daily closes (public.psx_price_history) for the given symbols, oldest first. */
export const stockClosesQuery = (symbols) => ({
  queryKey: ['psx-closes', symbols],
  enabled: symbols.length > 0,
  staleTime: 30 * 60_000,
  queryFn: async () => {
    const out = {};
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('psx_price_history').select('symbol, price_date, close::text')
        .in('symbol', symbols).order('price_date').order('symbol').range(from, from + 999);
      if (error) throw error;
      for (const r of data ?? []) (out[r.symbol] ??= []).push({ date: r.price_date, close: r.close });
      if (!data || data.length < 1000) return out;
    }
  },
});

/**
 * range: { start, end } from the global date filter; omit for all time.
 * filter: { sector, symbol } ('all' or missing = no filter), for Analytics.
 */
export function usePsxPortfolio(range, filter = {}) {
  const user = useAuthStore((s) => s.user);
  const trades = useQuery(stockTradesQuery(user?.id));
  const market = useQuery(psxStocksQuery());
  const symbols = useMemo(() => [...new Set((trades.data ?? []).map((t) => normSymbol(t.symbol)).filter(Boolean))].sort(), [trades.data]);
  const closes = useQuery(stockClosesQuery(symbols));
  const live = useMemo(() => stockPriceMap(market.data), [market.data]);
  const start = range?.start; const end = range?.end;
  const sector = filter.sector ?? 'all'; const symbol = filter.symbol ?? 'all';
  const portfolio = useMemo(() => {
    if (!trades.data) return null;
    const rows = trades.data.filter((t) => (symbol === 'all' || normSymbol(t.symbol) === symbol)
      && (sector === 'all' || getStockSector(normSymbol(t.symbol)) === sector));
    return analyzeStocks(rows, { live, history: closes.data ?? {}, start, end });
  }, [trades.data, live, closes.data, start, end, sector, symbol]);
  return {
    portfolio,
    trades: trades.data ?? [],
    live,
    isLoading: trades.isLoading,
    pricesLoading: market.isLoading,
    pricesFailed: market.isError,
    pricesAsOf: market.data?.freshness?.data_as_of ?? market.data?.data_as_of ?? null,
  };
}
