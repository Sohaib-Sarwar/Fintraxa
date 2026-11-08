/**
 * The user's savings accounts (public.savings_accounts, own rows via RLS) and
 * the writes. An account with profit entries cannot be deleted (the database
 * refuses); it is archived instead, which hides it from new entries.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { bankName } from './banks';

export const savingsAccountsQuery = (userId) => ({
  queryKey: ['savings-accounts', userId],
  enabled: !!userId,
  staleTime: 5 * 60_000,
  queryFn: async () => {
    const { data, error } = await supabase.from('savings_accounts')
      .select('id, bank_symbol, bank_name, name, profit_rate::text, tax_rate::text, archived, created_at')
      .eq('user_id', userId).order('archived').order('name');
    if (error) {
      // An older database without the table: no accounts rather than a broken page.
      if (['42P01', 'PGRST205'].includes(error.code)) return [];
      throw error;
    }
    return (data ?? []).map((a) => ({ ...a, profit_rate: a.profit_rate === null ? null : Number(a.profit_rate), tax_rate: Number(a.tax_rate) }));
  },
});

export function useSavingsAccounts() {
  const user = useAuthStore((s) => s.user);
  return useQuery(savingsAccountsQuery(user?.id));
}

/** Validate an account form; returns a message or null. */
export function validateAccount(f, existing = [], id = null) {
  const name = String(f.name ?? '').trim();
  if (!f.bank_symbol) return 'Choose the bank';
  if (!name) return 'Give the account a name';
  if (name.length > 60) return 'Keep the name under 60 characters';
  if (existing.some((a) => a.id !== id && a.name.trim().toLowerCase() === name.toLowerCase())) return 'You already have an account with that name';
  if (f.profit_rate !== '' && f.profit_rate !== null && f.profit_rate !== undefined) {
    const r = Number(String(f.profit_rate).replace('%', ''));
    if (!Number.isFinite(r) || r < 0 || r > 100) return 'Profit rate must be between 0% and 100%';
  }
  return null;
}

const row = (f) => ({
  bank_symbol: f.bank_symbol,
  bank_name: bankName(f.bank_symbol),
  name: String(f.name).trim(),
  profit_rate: f.profit_rate === '' || f.profit_rate === null || f.profit_rate === undefined ? null : Number(String(f.profit_rate).replace('%', '')),
  tax_rate: Number(f.tax_rate ?? 0.2),
});

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['savings-accounts'] });
    qc.invalidateQueries({ queryKey: ['ie-all-transactions'] });
  };
}

export function useSaveAccount() {
  const user = useAuthStore((s) => s.user);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, ...f }) => {
      const q = id
        ? supabase.from('savings_accounts').update(row(f)).eq('id', id).select('id').single()
        : supabase.from('savings_accounts').insert({ ...row(f), user_id: user.id }).select('id').single();
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    onSuccess: refresh,
  });
}

export function useArchiveAccount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, archived }) => {
      const { error } = await supabase.from('savings_accounts').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
}

export function useDeleteAccount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('savings_accounts').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') throw Object.assign(new Error('This account has profit entries. Archive it instead to keep their history.'), { friendly: true });
        throw error;
      }
    },
    onSuccess: refresh,
  });
}
