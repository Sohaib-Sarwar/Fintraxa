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
const AFFECTED = ['ie-all-transactions', 'ie-transactions', 'ie-free-cash', 'mf-free-cash', 'home-ie-txns', 'home-ie-txns-all', 'categories'];

export function useFinanceRefresh() {
  const qc = useQueryClient();
  return () => AFFECTED.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/**
 * True when PostgREST says a column or table is missing: the app is newer than
 * the database (the personal-finance migration not applied yet). Reads then
 * fall back to the older shape instead of failing the whole page.
 */
const isSchemaLag = (e) => !!e && (['42703', '42P01', 'PGRST204', 'PGRST205', 'PGRST200'].includes(e.code) || /does not exist|schema cache/i.test(e.message ?? ''));
const TXN_SELECT = '*, categories(name, icon, kind, default_tax_rate), savings_accounts(name, bank_symbol, bank_name)';
const TXN_SELECT_LEGACY = '*, categories(name, icon)';

export function useFinanceTransactions() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: ['ie-all-transactions', user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const out = [];
      let select = TXN_SELECT;
      for (let from = 0; ; from += 1000) {
        let { data, error } = await supabase.from('income_expense_transactions')
          .select(select).eq('user_id', user.id)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999);
        if (error && isSchemaLag(error) && select === TXN_SELECT) {
          select = TXN_SELECT_LEGACY; // kinds then come from category names (summary.kindOf)
          ({ data, error } = await supabase.from('income_expense_transactions')
            .select(select).eq('user_id', user.id)
            .order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999));
        }
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
        const seed = (rows) => supabase.from('categories').upsert(rows, { onConflict: 'user_id,name', ignoreDuplicates: true }).select();
        let { data: seeded, error: seedErr } = await seed(missing.map((c) => ({ ...c, user_id: user.id, is_default: true })));
        if (seedErr && isSchemaLag(seedErr)) {
          // Older database: seed without the kind / tax columns.
          ({ data: seeded, error: seedErr } = await seed(missing.map(({ kind: _k, default_tax_rate: _r, ...c }) => ({ ...c, user_id: user.id, is_default: true }))));
        }
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
