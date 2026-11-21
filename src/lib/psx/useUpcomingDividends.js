/**
 * Upcoming dividends for the signed-in user (web): the pending list, approve / reject, and "Check now"
 * (Edge Function dividends-scan for this user's stocks). Rules and wording: ./upcomingDividends.js.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../dbErrors';
import { UPCOMING_SELECT, sortUpcoming } from './upcomingDividends';

export const UPCOMING_KEY = 'upcoming-dividends';

export function useUpcomingDividends() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: [UPCOMING_KEY, userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('upcoming_dividends').select(UPCOMING_SELECT)
        .eq('user_id', userId).eq('status', 'pending');
      if (error) throw error;
      return sortUpcoming(data ?? []);
    },
  });
}

function useRefreshAfter() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: [UPCOMING_KEY] }),
    qc.invalidateQueries({ queryKey: ['stock-dividends'] }),
  ]);
}

/** Approve with what actually arrived: { id, paymentDate, net, gross?, shares? }. */
export function useApproveUpcoming() {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: async ({ id, paymentDate, net, gross = null, shares = null }) => {
      const { data, error } = await supabase.rpc('upcoming_dividend_approve', { p_id: id, p_payment_date: paymentDate, p_net: net, p_gross: gross, p_shares: shares });
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      refresh();
      showSnackbar(r?.added ? 'Dividend approved and added to your dividends' : 'Dividend approved — it was already on file, so nothing was added twice', 'success');
    },
    onError: dbErrorHandler(showSnackbar, 'Could not approve the dividend'),
  });
}

/** status: 'rejected' (not received / not mine) or 'pending' (undo). */
export function useDecideUpcoming() {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.rpc('upcoming_dividend_decide', { p_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: (_r, v) => { refresh(); showSnackbar(v.status === 'rejected' ? 'Removed from upcoming dividends' : 'Back in upcoming dividends', 'success'); },
    onError: dbErrorHandler(showSnackbar, 'Could not update the dividend'),
  });
}

/** Check PSX now for this user's stocks (the nightly run does the same for everyone). */
export function useCheckDividendsNow() {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('dividends-scan', { body: {} });
      if (error) throw error;
      return data;
    },
    onSuccess: (r) => {
      refresh();
      const n = r?.found?.length ?? 0;
      showSnackbar(n ? `Checked PSX: ${n} cash dividend${n === 1 ? '' : 's'} announced on your stocks; ${r?.sync?.matched ? `${r.sync.matched} already on file. ` : ''}See the list.` : 'Checked PSX: no new cash dividends on your stocks.', 'success');
    },
    onError: () => showSnackbar('The dividend check did not finish. It also runs every night on its own.', 'error'),
  });
}
