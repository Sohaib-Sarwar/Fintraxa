/**
 * Upcoming dividends on the phone: the pending list, approve / reject, Check now. Same queries and RPCs as the web
 * (src/lib/psx/useUpcomingDividends.js); wording from @core/psx/upcomingDividends.js.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeUpcoming as describeJs, sortUpcoming as sortJs, UPCOMING_SELECT } from '@core/psx/upcomingDividends.js';
import { supabase } from '@/lib/supabase';
import { useUid } from './queries';

export type UpcomingAnnouncement = {
  id: string; company_name: string | null; announced_on: string | null; period: string | null; dividend_type: 'interim' | 'final' | 'special';
  interim_no: number | null; percent: string | null; dps: string; face_value: string | null; book_closure_from: string; book_closure_to: string | null;
  agm_date: string | null; ex_date: string; last_cum_date: string; expected_pay_by: string | null; source: string; source_url: string | null;
};
export type Upcoming = {
  id: string; symbol: string; shares: string; dps: string; gross: string; tax_rate: string; tax: string; net: string;
  filer_status: string; status: string; dividend_id: string | null; created_at: string; announcement: UpcomingAnnouncement;
};
export type UpcomingView = {
  stage: 'hold' | 'entitled' | 'due'; stageLabel: string; title: string; perShare: string; status: string; note: string | null;
  gross: number; tax: number; net: number; shares: number; taxLabel: string; dates: [string, string][];
  source: string; sourceUrl: string | null; suggestDate: string; canApprove: boolean;
};
type Loose = unknown;
export const describeUpcoming = describeJs as Loose as (u: Upcoming) => UpcomingView;
const sortUpcoming = sortJs as Loose as (rows: Upcoming[]) => Upcoming[];

export const UPCOMING_KEY = 'upcoming-dividends';

export function useUpcoming() {
  const uid = useUid();
  return useQuery({
    queryKey: [UPCOMING_KEY, uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('upcoming_dividends').select(UPCOMING_SELECT as string).eq('user_id', uid!).eq('status', 'pending');
      if (error) throw error;
      return sortUpcoming((data ?? []) as unknown as Upcoming[]);
    },
  });
}

function useAfter() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: [UPCOMING_KEY] }), qc.invalidateQueries({ queryKey: ['stock-dividends'] })]);
}

export function useApproveUpcoming() {
  const after = useAfter();
  return useMutation({
    mutationFn: async (v: { id: string; paymentDate: string; net: number }) => {
      const { data, error } = await supabase.rpc('upcoming_dividend_approve', { p_id: v.id, p_payment_date: v.paymentDate, p_net: v.net });
      if (error) throw error;
      return data as { added: number; completed: number; skipped: number; dividend_id: string | null };
    },
    onSuccess: () => { after(); },
  });
}

export function useRejectUpcoming() {
  const after = useAfter();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('upcoming_dividend_decide', { p_id: id, p_status: 'rejected' });
      if (error) throw error;
    },
    onSuccess: () => { after(); },
  });
}

export function useCheckDividendsNow() {
  const after = useAfter();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('dividends-scan', { body: {} });
      if (error) throw error;
      return data as { found?: unknown[]; sync?: { matched?: number } };
    },
    onSuccess: () => { after(); },
  });
}
