/**
 * Personal finance data: the user's categories (default ones seeded on first
 * use) and every income/expense transaction, plus the cache keys a write must
 * refresh.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuthStore } from '../../store/authStore';
import { DEFAULT_CATEGORIES } from '../defaultCategories';

/** Every query a finance write can change (the MF cash hint reads these deposits too). */
const AFFECTED = ['ie-all-transactions', 'ie-transactions', 'ie-free-cash', 'mf-free-cash', 'home-ie-txns', 'home-ie-txns-all'];

export function useFinanceRefresh() {
  const qc = useQueryClient();
  return () => AFFECTED.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useFinanceTransactions() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['ie-all-transactions', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('income_expense_transactions')
          .select('*, categories(name, icon)').eq('user_id', user.id)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) return out;
      }
    },
  });
}

export function useCategories() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['categories', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').eq('user_id', user.id).order('name');
      if (error) throw error;
      // Seed any missing default categories. `onConflict: 'user_id,name'` relies on the
      // categories_user_id_name_unique constraint; a failure is surfaced, not swallowed.
      const have = new Set(data.map((c) => c.name.toLowerCase()));
      const missing = DEFAULT_CATEGORIES.filter((c) => !have.has(c.name.toLowerCase()));
      if (missing.length) {
        const { data: seeded, error: seedErr } = await supabase.from('categories')
          .upsert(missing.map((c) => ({ ...c, user_id: user.id, is_default: true })), { onConflict: 'user_id,name', ignoreDuplicates: true })
          .select();
        if (seedErr) throw seedErr;
        if (seeded?.length) return [...data, ...seeded].sort((a, b) => a.name.localeCompare(b.name));
      }
      return data;
    },
  });
}

/** Category rows use 'income'/'expense' (older rows 'credit'/'debit'); transactions use 'credit'/'debit'. */
export const categoryMatches = (c, txnType) => (txnType === 'debit'
  ? c.type === 'expense' || c.type === 'debit'
  : c.type === 'income' || c.type === 'credit');
