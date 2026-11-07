import { useMemo, useState } from 'react';
import { Box, Typography, InputBase, ButtonBase, Skeleton, useMediaQuery } from '@mui/material';
import { SearchRounded } from '@mui/icons-material';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import { supabase } from '../../lib/supabase';
import { fetchMfCashFlows } from '../../lib/mf/useMfPortfolio';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useCategories, useFinanceRefresh, useFinanceTransactions, categoryMatches } from '../../lib/finance/useFinance';
import { useFx, PageHeader, Seg, FONT_NUM } from '../../components/fx';
import CategoryBadge from './CategoryBadge';

const DECIMAL = /^\d+(\.\d+)?$/;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const yesterday = () => daysAgo(1);
const QUICK = [500, 1000, 5000, 10000];
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Record one income or expense: what it is on the left, the details and a live preview on the right. */
export default function AddTransaction() {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useFinanceRefresh();
  const { data: categories = [], isLoading } = useCategories();
  const { data: txns = [] } = useFinanceTransactions();
  const [type, setType] = useState('debit');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [find, setFind] = useState('');

  const cats = categories.filter((c) => categoryMatches(c, type));
  const selected = categories.find((c) => c.id === categoryId);
  const isMF = !!selected?.name?.includes('Mutual Funds');
  const income = type === 'credit';

  // Most-used categories of this type in the last 90 days, shown first.
  const recentIds = useMemo(() => {
    const since = daysAgo(90);
    const counts = new Map();
    for (const x of txns) if (x.type === type && x.date >= since && x.category_id) counts.set(x.category_id, (counts.get(x.category_id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([id]) => id);
  }, [txns, type]);
  const recent = recentIds.map((id) => cats.find((c) => c.id === id)).filter(Boolean);
  const needle = find.trim().toLowerCase();
  const list = cats.filter((c) => !needle || c.name.toLowerCase().includes(needle));

  // Context for the preview: this month in the chosen category.
  const month = useMemo(() => {
    if (!categoryId) return null;
    const m = date.slice(0, 7);
    const rows = txns.filter((x) => x.category_id === categoryId && x.date.slice(0, 7) === m);
    return { total: rows.reduce((s, x) => s + Number(x.amount), 0), count: rows.length };
  }, [txns, categoryId, date]);

  // Mutual-fund investment deposits feed the MF cash figure; show what is there. (PSX has no cash pot.)
  const { data: freeCash } = useQuery({
    queryKey: ['ie-free-cash', user?.id, selected?.name],
    enabled: !!user?.id && isMF,
    queryFn: async () => {
      const { data: cs } = await supabase.from('categories').select('id').eq('user_id', user.id)
        .ilike('name', '%Investment - Mutual Funds%');
      const ids = (cs || []).map((c) => c.id);
      let deposited = 0;
      if (ids.length) {
        const { data: rows } = await supabase.from('income_expense_transactions').select('amount').eq('user_id', user.id).eq('type', 'debit').in('category_id', ids);
        deposited = (rows || []).reduce((s, r) => s + Number(r.amount), 0);
      }
      const { bought, sold } = await fetchMfCashFlows(user.id);
      return deposited - bought + sold;
    },
  });

  const amt = amount.replace(/,/g, '').trim();
  const value = DECIMAL.test(amt) ? Number(amt) : 0;
  const problem = !value ? 'Enter an amount' : !categoryId ? 'Choose a category' : date > today() ? 'The date cannot be in the future' : null;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('income_expense_transactions').insert({
        user_id: user.id, category_id: categoryId, type, amount: value, date, notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      showSnackbar(`${income ? 'Income' : 'Expense'} of ${formatCurrency(value)} saved`, 'success');
      setAmount(''); setNotes(''); setCategoryId(''); setDate(today()); setFind('');
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
  const submit = () => { if (!problem && !save.isPending) save.mutate(); };
  const addQuick = (n) => setAmount((a) => new Decimal(DECIMAL.test(a.replace(/,/g, '').trim()) ? a.replace(/,/g, '').trim() : 0).plus(n).toString());

  const panel = { bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '24px', boxShadow: t.shadow, p: isMobile ? 2 : 2.75 };
  const label = (text) => <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.muted, mb: 0.75 }}>{text}</Typography>;
  const chip = (text, on, onClick) => (
    <ButtonBase onClick={onClick} aria-pressed={on} sx={{
      height: 32, px: 1.5, borderRadius: 999, fontSize: '0.74rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
      border: `1px solid ${on ? t.ink : t.border}`, bgcolor: on ? t.inv : 'transparent', color: on ? t.invInk : t.ink2, transition: 'background-color .15s, color .15s',
      '@media (hover: hover)': { '&:hover': on ? {} : { bgcolor: t.surface2 } },
    }}>{text}</ButtonBase>
  );
  const tile = (c) => {
    const on = c.id === categoryId;
    return (
      <ButtonBase key={c.id} onClick={() => setCategoryId(c.id)} aria-pressed={on} sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.6, py: 1.1, px: 0.5, borderRadius: '14px', fontFamily: 'inherit', minWidth: 0,
        border: `1px solid ${on ? t.ink : t.hairline}`, bgcolor: on ? t.surface2 : 'transparent', transition: 'border-color .15s, background-color .15s',
        '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 } },
      }}>
        <CategoryBadge icon={c.icon} name={c.name} size={32} />
        <Typography sx={{ fontSize: '0.68rem', fontWeight: on ? 650 : 500, color: on ? t.ink : t.ink2, textAlign: 'center', lineHeight: 1.2, width: '100%', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {c.name.replace(/^Investment - /, 'Invest: ')}
        </Typography>
      </ButtonBase>
    );
  };
  const saveButton = (
    <ButtonBase disabled={!!problem || save.isPending} onClick={submit} sx={{
      width: '100%', height: 50, borderRadius: 999, bgcolor: income ? t.pos : t.inv, color: income ? '#fff' : t.invInk,
      fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit', opacity: problem || save.isPending ? 0.35 : 1, transition: 'opacity .16s, background-color .2s',
    }}>
      {save.isPending ? 'Saving…' : problem ?? `Add ${income ? 'income' : 'expense'} · ${formatCurrency(value)}`}
    </ButtonBase>
  );

  return (
    <Box sx={{ pb: isMobile ? 10 : 0 }}>
      <PageHeader title="Add transaction" filter={false} sub={false}
        actions={<ButtonBase onClick={() => navigate('/transactions')} sx={{ height: 34, px: 1.75, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.76rem', fontWeight: 650, fontFamily: 'inherit' }}>All transactions</ButtonBase>} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2, alignItems: 'start' }}>
        {/* What it is */}
        <Box sx={panel}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2.5 }}>
            <Seg label="Type" value={type} onChange={(v) => { setType(v); setCategoryId(''); setFind(''); }}
              options={[{ value: 'debit', label: 'Expense' }, { value: 'credit', label: 'Income' }]} />
          </Box>

          <Box sx={{ textAlign: 'center', mb: 1.5 }}>
            <Box component="label" sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 1, maxWidth: '100%', cursor: 'text' }}>
              <Typography component="span" sx={{ fontFamily: FONT_NUM, fontSize: { xs: '1.4rem', md: '1.7rem' }, fontWeight: 600, color: t.muted }}>Rs</Typography>
              <InputBase value={amount} autoFocus={!isMobile} placeholder="0"
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                inputProps={{ inputMode: 'decimal', 'aria-label': 'Amount', size: Math.max(1, amount.length || 1) }}
                sx={{ fontFamily: FONT_NUM, fontSize: { xs: '2.4rem', md: '3rem' }, fontWeight: 650, letterSpacing: '-0.045em', color: income ? t.pos : t.ink,
                  '& input': { textAlign: 'left', p: 0, minWidth: '1ch' }, '& input::placeholder': { color: t.muted, opacity: 0.5 } }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', flexWrap: 'wrap', mt: 1.25 }}>
              {QUICK.map((n) => chip(`+${formatNumber(n, 0)}`, false, () => addQuick(n)))}
            </Box>
          </Box>

          <Box sx={{ borderTop: `1px solid ${t.hairline}`, pt: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.muted }}>Category</Typography>
              {cats.length > 8 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 30, px: 1.1, borderRadius: 999, border: `1px solid ${t.border}`, width: 180 }}>
                  <SearchRounded sx={{ fontSize: 15, color: t.muted }} />
                  <InputBase value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find" inputProps={{ 'aria-label': 'Find category' }} sx={{ fontSize: '0.74rem', flex: 1 }} />
                </Box>
              )}
            </Box>
            {isLoading ? <Skeleton variant="rounded" height={160} sx={{ borderRadius: '14px' }} /> : (
              <>
                {recent.length > 0 && !needle && (
                  <>
                    <Typography sx={{ fontSize: '0.64rem', color: t.muted, mb: 0.6 }}>Used recently</Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 0.75, mb: 1.5 }}>{recent.map(tile)}</Box>
                    <Typography sx={{ fontSize: '0.64rem', color: t.muted, mb: 0.6 }}>All</Typography>
                  </>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 0.75 }}>
                  {list.map(tile)}
                </Box>
                {list.length === 0 && <Typography sx={{ fontSize: '0.78rem', color: t.muted, py: 2, textAlign: 'center' }}>No category matches “{find}”.</Typography>}
              </>
            )}
          </Box>
        </Box>

        {/* Details and preview */}
        <Box sx={{ ...panel, position: isMobile ? 'static' : 'sticky', top: 104 }}>
          {label('Date')}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
            {chip('Today', date === today(), () => setDate(today()))}
            {chip('Yesterday', date === yesterday(), () => setDate(yesterday()))}
            <InputBase type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} inputProps={{ max: today(), 'aria-label': 'Date' }}
              sx={{ height: 32, px: 1.25, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.74rem', '& input': { colorScheme: 'inherit', p: 0 } }} />
          </Box>

          {label('Note')}
          <InputBase value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional, e.g. groceries at Imtiaz" fullWidth inputProps={{ 'aria-label': 'Note' }}
            sx={{ height: 42, px: 1.5, borderRadius: '14px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.84rem', mb: 2.25, '&.Mui-focused': { borderColor: t.ink } }} />

          {label('Preview')}
          <Box sx={{ p: 1.75, borderRadius: '16px', border: `1px dashed ${t.border}`, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              {selected ? <CategoryBadge icon={selected.icon} name={selected.name} size={38} /> : <Box sx={{ width: 38, height: 38, borderRadius: '50%', bgcolor: t.surface2 }} />}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.88rem', fontWeight: 650, color: selected ? t.ink : t.muted }}>{selected?.name ?? 'No category yet'}</Typography>
                <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{fmtDate(date)}{notes.trim() ? `, ${notes.trim()}` : ''}</Typography>
              </Box>
              <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.02em', color: income ? t.pos : t.ink, whiteSpace: 'nowrap' }}>
                {income ? '+' : '−'}{formatCurrency(value)}
              </Typography>
            </Box>
            {month && (
              <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 1.25, pt: 1.25, borderTop: `1px solid ${t.hairline}` }}>
                {month.count
                  ? `${new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { month: 'long' })} so far: ${formatCurrency(month.total)} in ${month.count} entr${month.count === 1 ? 'y' : 'ies'}, ${formatCurrency(month.total + value)} with this one.`
                  : `First ${selected?.name} entry this month.`}
              </Typography>
            )}
            {isMF && (
              <Typography sx={{ fontSize: '0.7rem', color: t.ink2, mt: 1 }}>
                Moves money into your mutual fund cash{freeCash !== undefined && freeCash !== null ? `; available now ${formatCurrency(freeCash)}` : ''}.
              </Typography>
            )}
          </Box>

          {!isMobile && saveButton}
        </Box>
      </Box>

      {isMobile && (
        <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))', px: 2, py: 1.25, zIndex: 1100,
          bgcolor: t.surface, borderTop: `1px solid ${t.border}` }}>
          {saveButton}
        </Box>
      )}
    </Box>
  );
}
