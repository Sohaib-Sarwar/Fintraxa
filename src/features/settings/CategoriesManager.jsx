import { useState } from 'react';
import { Box, Typography, IconButton, ButtonBase, InputBase, Tooltip } from '@mui/material';
import { EditRounded, DeleteOutlineRounded, AddRounded, ArrowBackRounded } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { describeDbError, dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { useCategories } from '../../lib/finance/useFinance';
import { useFx, Seg } from '../../components/fx';
import CategoryBadge from '../income-expense/CategoryBadge';

/** Icon names a category may use (MUI icon names, stored in categories.icon). */
const ICONS = [
  'Work', 'Computer', 'TrendingUp', 'Business', 'CardGiftcard', 'AttachMoney', 'Savings', 'AccountBalance', 'ShowChart',
  'Restaurant', 'DirectionsCar', 'ShoppingBag', 'Receipt', 'SportsEsports', 'LocalHospital', 'School', 'Home', 'ShoppingCart',
  'MoreHoriz', 'Shield', 'LocalGroceryStore', 'Movie', 'Pets', 'Flight', 'FitnessCenter', 'CreditCard', 'Checkroom',
  'PhoneAndroid', 'Build', 'VolunteerActivism', 'LocalCafe', 'LocalLaundryService', 'SelfImprovement', 'ChildCare', 'Handyman', 'Redeem',
];
const KINDS = {
  income: [{ value: 'active', label: 'Active income' }, { value: 'passive', label: 'Passive income' }],
  expense: [{ value: 'spend', label: 'Spending' }, { value: 'transfer', label: 'Transfer' }],
};
const KIND_HELP = {
  active: 'Counts toward what you saved.', passive: 'Shows under Passive income.',
  spend: 'Counts as an expense.', transfer: 'Money moved to savings or investments: not an expense.',
};
/** Categories the app relies on: their name and type stay fixed. */
const isSystem = (c) => c.name === 'Savings profit' || c.name?.startsWith('Investment -');
const typeOf = (c) => (c.type === 'income' || c.type === 'credit' ? 'income' : 'expense');

/** Income and expense categories: what each is (kind), its icon, add, rename, delete. */
export default function CategoriesManager() {
  const t = useFx();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const { data: categories = [] } = useCategories();
  const [type, setType] = useState('expense');
  const [form, setForm] = useState(null); // null = list; { id?, name, kind, icon }
  const [err, setErr] = useState(null);
  const list = categories.filter((c) => typeOf(c) === type);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['categories'] }); qc.invalidateQueries({ queryKey: ['ie-all-transactions'] }); };

  const save = useMutation({
    mutationFn: async (f) => {
      const row = { name: f.name.trim(), type, icon: f.icon, kind: f.kind };
      const { error } = f.id
        ? await supabase.from('categories').update(f.system ? { icon: f.icon, kind: f.kind } : row).eq('id', f.id)
        : await supabase.from('categories').insert({ ...row, user_id: user.id, is_default: false });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); showSnackbar(form?.id ? 'Category updated' : 'Category added', 'success'); setForm(null); },
    onError: dbErrorHandler(showSnackbar, 'Could not save the category'),
  });
  const del = useMutation({
    mutationFn: async (c) => {
      const { count, error } = await supabase.from('income_expense_transactions').select('id', { count: 'exact', head: true }).eq('category_id', c.id);
      if (error) throw error;
      if (count === null) throw new Error('Could not check whether this category is in use. Try again.');
      if (count > 0) throw new Error(`${count} transaction${count === 1 ? '' : 's'} use this category. Move them to another category first.`);
      const { error: delErr } = await supabase.from('categories').delete().eq('id', c.id);
      if (delErr) throw delErr;
    },
    onSuccess: () => { refresh(); showSnackbar('Category deleted', 'success'); },
    onError: (e) => showSnackbar(describeDbError(e), 'error'),
  });

  const submit = () => {
    const name = form.name.trim();
    if (!name) return setErr('Give the category a name');
    if (name.length > 40) return setErr('Keep the name under 40 characters');
    if (categories.some((c) => c.id !== form.id && c.name.trim().toLowerCase() === name.toLowerCase())) return setErr('You already have a category with that name');
    setErr(null);
    return save.mutate(form);
  };

  if (form) {
    return (
      <Box>
        <ButtonBase onClick={() => setForm(null)} sx={{ gap: 0.5, mb: 1.5, fontSize: '0.76rem', fontWeight: 650, color: t.ink2, fontFamily: 'inherit', borderRadius: 999, px: 0.5 }}>
          <ArrowBackRounded sx={{ fontSize: 16 }} />All categories
        </ButtonBase>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.75 }}>
          <CategoryBadge icon={form.icon} name={form.name || 'New'} size={40} />
          <Box component="label" sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>Name</Box>
            <InputBase value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={form.system} inputProps={{ maxLength: 40, 'aria-label': 'Category name' }}
              sx={{ height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.86rem', '&.Mui-focused': { borderColor: t.ink } }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, mb: 0.75 }}>What it is</Typography>
        <Seg size="sm" label="Category kind" value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={KINDS[type]} />
        <Typography sx={{ fontSize: '0.68rem', color: t.muted, mt: 0.5, mb: 1.5 }}>{KIND_HELP[form.kind]}</Typography>
        <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, mb: 0.75 }}>Icon</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 0.75 }}>
          {ICONS.map((name) => (
            <ButtonBase key={name} onClick={() => setForm({ ...form, icon: name })} aria-pressed={form.icon === name} aria-label={name}
              sx={{ height: 40, borderRadius: '12px', border: `1px solid ${form.icon === name ? t.ink : t.hairline}`, bgcolor: form.icon === name ? t.surface2 : 'transparent' }}>
              <CategoryBadge icon={name} name={name} size={26} />
            </ButtonBase>
          ))}
        </Box>
        {err && <Typography sx={{ fontSize: '0.74rem', color: t.neg, mt: 1.25 }}>{err}</Typography>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <ButtonBase onClick={() => setForm(null)} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
          <ButtonBase onClick={submit} disabled={save.isPending} sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: save.isPending ? 0.5 : 1 }}>
            {save.isPending ? 'Saving…' : form.id ? 'Save' : 'Add category'}
          </ButtonBase>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.25 }}>
        <Seg size="sm" label="Category type" value={type} onChange={setType} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
        <ButtonBase onClick={() => { setErr(null); setForm({ name: '', kind: type === 'income' ? 'active' : 'spend', icon: 'MoreHoriz' }); }}
          sx={{ height: 32, px: 1.5, borderRadius: 999, gap: 0.5, border: `1px solid ${t.border}`, fontSize: '0.74rem', fontWeight: 650, fontFamily: 'inherit' }}>
          <AddRounded sx={{ fontSize: 16 }} />Add
        </ButtonBase>
      </Box>
      {/* Two columns so the whole list fits the window without an inner scroll. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.6 }}>
        {list.map((c) => {
          const kind = c.kind ?? (type === 'income' ? 'active' : 'spend');
          return (
            <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.9, pl: 0.9, pr: 0.4, py: 0.45, borderRadius: '12px', border: `1px solid ${t.hairline}`, minWidth: 0 }}>
              <CategoryBadge icon={c.icon} name={c.name} size={26} />
              <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 600, flex: 1, minWidth: 0 }}>{c.name}</Typography>
              <Box component="span" sx={{ fontSize: '0.6rem', fontWeight: 650, px: 0.75, py: '1px', borderRadius: 999, whiteSpace: 'nowrap',
                color: kind === 'passive' ? t.pos : kind === 'transfer' ? t.ink2 : t.muted, bgcolor: kind === 'passive' ? t.posSoft : t.surface2 }}>
                {{ active: 'Active', passive: 'Passive', spend: 'Spending', transfer: 'Transfer' }[kind]}
              </Box>
              <Tooltip title="Edit" arrow><IconButton size="small" aria-label={`Edit ${c.name}`} onClick={() => { setErr(null); setForm({ id: c.id, name: c.name, kind, icon: c.icon || 'MoreHoriz', system: isSystem(c) }); }}><EditRounded sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              {!isSystem(c) && (
                <Tooltip title="Delete" arrow>
                  <IconButton size="small" aria-label={`Delete ${c.name}`} onClick={() => showConfirm('Delete category', `"${c.name}" will be removed. This cannot be undone.`, () => del.mutate(c))}>
                    <DeleteOutlineRounded sx={{ fontSize: 16, color: t.neg }} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          );
        })}
        {!list.length && <Typography sx={{ gridColumn: '1 / -1', fontSize: '0.78rem', color: t.muted, p: 2, textAlign: 'center' }}>No {type} categories yet.</Typography>}
      </Box>
    </Box>
  );
}
