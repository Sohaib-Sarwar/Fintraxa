/**
 * Permanent delete and in-place edit for mutual-fund data. Each goes through
 * a SECURITY DEFINER RPC that checks ownership and writes the audit log
 * (see migration 20261107130000_mf_delete_and_edit.sql).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAppStore } from '../../store/appStore';
import { dbErrorHandler } from '../dbErrors';
import { MF_LEDGER_KEY } from './useMfPortfolio';

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [MF_LEDGER_KEY] });
    qc.invalidateQueries({ queryKey: ['mf-imports'] });
    qc.invalidateQueries({ queryKey: ['mf-import'] });
  };
}

export function useDeleteEntry({ onDone } = {}) {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (entryId) => {
      const { data, error } = await supabase.rpc('mf_delete_entry', { p_entry_id: entryId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { showSnackbar('Transaction deleted permanently', 'success'); refresh(); onDone?.(); },
    onError: dbErrorHandler(showSnackbar, 'Could not delete'),
  });
}

export function useEditEntry({ onDone } = {}) {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ id, edits }) => {
      const { data, error } = await supabase.rpc('mf_edit_entry', { p_entry_id: id, p_edits: edits });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { showSnackbar('Transaction updated', 'success'); refresh(); onDone?.(); },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
}

/** Deletes the import and everything derived from it, then the PDF itself. */
export function useDeleteImport({ onDone } = {}) {
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (importId) => {
      const { data, error } = await supabase.rpc('mf_delete_import', { p_import_id: importId });
      if (error) throw error;
      if (data?.storage_path) {
        // The rows are already gone; a leftover file is harmless and private,
        // so a storage hiccup is not reported as a failed delete.
        await supabase.storage.from('mf-statements').remove([data.storage_path]).catch(() => null);
      }
      return data;
    },
    onSuccess: (r) => {
      showSnackbar(`Statement deleted${r?.entries_deleted ? ` with ${r.entries_deleted} transaction${r.entries_deleted === 1 ? '' : 's'}` : ''}`, 'success');
      refresh();
      onDone?.();
    },
    onError: dbErrorHandler(showSnackbar, 'Could not delete the statement'),
  });
}
