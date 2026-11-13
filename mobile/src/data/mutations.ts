/**
 * Writes. Rules from CLAUDE.md "Writes": validate before the round-trip, never surface raw PostgREST text
 * (describeDbError, shared with the web), destructive actions confirm and offer Undo.
 *
 * Adding a transaction is optimistic and works offline: the id is generated on the phone, so the paused
 * mutation can be persisted, replayed after a restart, and retried without creating duplicates.
 */
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { describeDbError, validatePositiveNumber } from '@core/dbErrors.js';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { toast } from '@/ui/feedback';
import { FINANCE_KEYS, TXNS_KEY, useUid } from './queries';
import type { Category, Txn } from './types';

export const friendlyError = (e: unknown) => describeDbError(e) as string;
export const checkAmount = (v: string, label = 'Amount') => validatePositiveNumber(v, label) as string | null;

export type TxnInput = { id: string; user_id: string; amount: string; type: 'credit' | 'debit'; category_id: string; date: string; notes: string | null };

function refreshFinance(qc: QueryClient) {
  for (const k of FINANCE_KEYS) qc.invalidateQueries({ queryKey: [k] });
  // A write marks the user's snapshots dirty server-side (trigger); today's figures recompute on next read.
  qc.invalidateQueries({ queryKey: ['snapshots'] });
}

const isDuplicate = (e: unknown) => (e as { code?: string })?.code === '23505';

async function insertTxn(row: TxnInput) {
  const { error } = await supabase.from('income_expense_transactions').insert(row);
  if (error && !isDuplicate(error)) throw error; // a retry of a write that already landed is a success
}

// Registered at module load so mutations restored from the persisted cache know what to run.
queryClient.setMutationDefaults(['txn', 'add'], { mutationFn: insertTxn });

export function newTxnId() {
  return Crypto.randomUUID();
}

export function useAddTransaction(categories: Category[] | undefined) {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationKey: ['txn', 'add'],
    mutationFn: insertTxn,
    onMutate: async (row: TxnInput) => {
      await qc.cancelQueries({ queryKey: [TXNS_KEY, uid] });
      const prev = qc.getQueryData<Txn[]>([TXNS_KEY, uid]);
      const c = categories?.find((x) => x.id === row.category_id);
      const optimistic: Txn = {
        ...row, created_at: new Date().toISOString(),
        categories: c ? { name: c.name, icon: c.icon, kind: c.kind, type: c.type } : null,
      };
      qc.setQueryData<Txn[]>([TXNS_KEY, uid], (old) => [optimistic, ...(old ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)));
      return { prev };
    },
    onError: (e, _row, ctx) => {
      if (ctx?.prev) qc.setQueryData([TXNS_KEY, uid], ctx.prev);
      toast(friendlyError(e), { tone: 'error' });
    },
    onSettled: () => refreshFinance(qc),
  });
}

export function useUpdateTransaction() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<TxnInput> & { id: string }) => {
      const { error } = await supabase.from('income_expense_transactions').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      const prev = qc.getQueryData<Txn[]>([TXNS_KEY, uid]);
      qc.setQueryData<Txn[]>([TXNS_KEY, uid], (old) => old?.map((t) => (t.id === patch.id ? { ...t, ...patch } as Txn : t)));
      return { prev };
    },
    onError: (e, _p, ctx) => {
      if (ctx?.prev) qc.setQueryData([TXNS_KEY, uid], ctx.prev);
      toast(friendlyError(e), { tone: 'error' });
    },
    onSettled: () => refreshFinance(qc),
  });
}

const UNDO_MS = 5000;

/**
 * Delete with Undo (plan §6.3): the row disappears at once, the server delete runs after the 5 s undo
 * window. Undo simply puts the row back — nothing was deleted yet.
 */
export function useDeleteTransaction() {
  const qc = useQueryClient();
  const uid = useUid();
  return (txn: Txn) => {
    const key = [TXNS_KEY, uid];
    const prev = qc.getQueryData<Txn[]>(key);
    qc.setQueryData<Txn[]>(key, (old) => old?.filter((t) => t.id !== txn.id));
    let undone = false;
    const timer = setTimeout(async () => {
      if (undone) return;
      const { error } = await supabase.from('income_expense_transactions').delete().eq('id', txn.id);
      if (error) {
        if (prev) qc.setQueryData(key, prev);
        toast(friendlyError(error), { tone: 'error' });
      }
      refreshFinance(qc);
    }, UNDO_MS);
    toast('Transaction deleted', {
      action: { label: 'Undo', run: () => { undone = true; clearTimeout(timer); if (prev) qc.setQueryData(key, prev); } },
    });
  };
}

export function useSavePrefs() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async (patch: { tracks?: { spending: boolean; funds: boolean; stocks: boolean }; auto_lock_minutes?: number }) => {
      const { error } = await supabase.from('user_preferences').upsert({ user_id: uid, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-preferences'] }),
    onError: (e) => toast(friendlyError(e), { tone: 'error' }),
  });
}
