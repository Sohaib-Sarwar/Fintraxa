/**
 * Daily closes of a PSX index (public.market_index_history), oldest first:
 * captured every evening from the market-data feed, backfilled from PSX's
 * closing-rate sheets. Includes the last close before `from`, which is the
 * base a "since 1 January" return is measured from.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export function useIndexHistory(code, from) {
  return useQuery({
    queryKey: ['index-history', code, from],
    enabled: !!code && !!from,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      // Two weeks of slack covers holidays before `from` (Eid, year end).
      const since = new Date(Date.parse(`${from}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
      const { data, error } = await supabase.from('market_index_history')
        .select('price_date, close::float8').eq('index_code', code).gte('price_date', since)
        .order('price_date').limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
}
