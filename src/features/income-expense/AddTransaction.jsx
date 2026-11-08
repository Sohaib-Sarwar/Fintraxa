import { useMemo, useRef, useState } from 'react';
import { Box, Typography, InputBase, ButtonBase, Skeleton, useMediaQuery, useTheme } from '@mui/material';
import { SearchRounded, AddRounded, ExpandMoreRounded, NorthEastRounded, SouthWestRounded } from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import Decimal from 'decimal.js';
import { supabase } from '../../lib/supabase';
import { savingsTax } from '../../lib/finance/passive';
import { cleanAmount, groupThousands, significantBefore, caretFor } from '../../lib/finance/amountInput';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useCategories, useFinanceRefresh, useFinanceTransactions, categoryMatches } from '../../lib/finance/useFinance';
import { useSavingsAccounts } from '../../lib/finance/useSavingsAccounts';
import { useFx, PageHeader, Seg, FONT_NUM } from '../../components/fx';
import TypeSwitch from './TypeSwitch';
import StockLogo from '../../components/StockLogo';
import CategoryBadge from './CategoryBadge';
import SavingsAccountsDialog from './SavingsAccountsDialog';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
const QUICK = [500, 1000, 5000, 10000];
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const GRID_PREVIEW = 10; // categories shown before "Show all"
const NONE = []; // one shared empty list, so memoised values stay stable while data loads

/**
 * Record one income or expense. The steps on the left (type, amount, category,
 * account, date, note); the receipt on the right builds itself as they are filled.
 */
export default function AddTransaction() {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const isMobile = useMediaQuery('(max-width:900px)');
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const refresh = useFinanceRefresh();
  const { data: categories = NONE, isLoading } = useCategories();
  const { data: txns = NONE } = useFinanceTransactions();
  const { data: allAccounts = NONE } = useSavingsAccounts();
  const accounts = allAccounts.filter((a) => !a.archived);
  const amountRef = useRef(null);

  const [type, setType] = useState('debit');
  const [categoryId, setCategoryId] = useState('');
  const [picking, setPicking] = useState(true);     // category grid open
  const [showAll, setShowAll] = useState(false);
  const [amount, setAmount] = useState('');          // clean: "1000000.5"
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [find, setFind] = useState('');
  const [rateOverride, setRate] = useState(null);
  const [accountPick, setAccount] = useState(null);
  const [addingAccount, setAddingAccount] = useState(false);

  const income = type === 'credit';
  const expenseInk = mode === 'dark' ? '#f87171' : '#b42318'; // a deep, formal red for money going out
  const tone = income ? t.pos : expenseInk;
  const selected = categories.find((c) => c.id === categoryId);
  // A passive category with a tax rate (Savings profit): the amount typed is the gross; the bank withholds tax.
  const taxed = income && selected?.default_tax_rate !== null && selected?.default_tax_rate !== undefined;
  const account = taxed ? (accounts.find((a) => a.id === accountPick) ?? (accounts.length === 1 ? accounts[0] : null)) : null;
  const baseRate = account?.tax_rate ?? (taxed ? Number(selected.default_tax_rate) : null);
  const rate = taxed ? (rateOverride ?? baseRate) : null;
  const rateOptions = taxed ? [...new Set([baseRate, 0.2, 0.4])].sort((a, b) => a - b) : [];

  const recentIds = useMemo(() => {
    const since = daysAgo(90);
    const counts = new Map();
    for (const x of txns) if (x.type === type && x.date >= since && x.category_id) counts.set(x.category_id, (counts.get(x.category_id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [txns, type]);
  // Most used first, then alphabetical.
  const ordered = useMemo(() => categories.filter((c) => categoryMatches(c, type)).sort((a, b) => {
    const ra = recentIds.indexOf(a.id); const rb = recentIds.indexOf(b.id);
    if (ra !== -1 || rb !== -1) return (ra === -1 ? 999 : ra) - (rb === -1 ? 999 : rb);
    return a.name.localeCompare(b.name);
  }), [categories, type, recentIds]);
  const needle = find.trim().toLowerCase();
  const matches = ordered.filter((c) => !needle || c.name.toLowerCase().includes(needle));
  const visible = needle || showAll ? matches : matches.slice(0, GRID_PREVIEW);

  const month = useMemo(() => {
    if (!categoryId) return null;
    const m = date.slice(0, 7);
    const rows = txns.filter((x) => x.category_id === categoryId && x.date.slice(0, 7) === m);
    return { total: rows.reduce((s, x) => s + Number(x.amount), 0), count: rows.length };
  }, [txns, categoryId, date]);

  const typed = amount && Number(amount) > 0 ? Number(amount) : 0;
  const split = taxed && typed ? savingsTax(amount, rate) : null;
  const value = split ? Number(split.net) : typed;
  const steps = [
    { key: 'amount', label: taxed ? 'Gross profit' : 'Amount', done: typed > 0 },
    { key: 'category', label: 'Category', done: !!categoryId },
    ...(taxed ? [{ key: 'account', label: 'Bank account', done: !!account }] : []),
    { key: 'date', label: 'Date', done: !!date && date <= today() },
  ];
  const missing = steps.filter((s) => !s.done).map((s) => s.label.toLowerCase());
  const ready = !missing.length;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('income_expense_transactions').insert({
        user_id: user.id, category_id: categoryId, type, amount: split ? split.net : value, date, notes: notes.trim() || null,
        ...(split ? { gross_amount: split.gross, tax_amount: split.tax, tax_rate: rate, savings_account_id: account?.id ?? null } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      showSnackbar(`${income ? 'Income' : 'Expense'} of ${formatCurrency(value, 2)} saved`, 'success');
      setAmount(''); setNotes(''); setCategoryId(''); setPicking(true); setShowAll(false); setDate(today()); setFind(''); setRate(null); setAccount(null);
      amountRef.current?.focus();
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
  const submit = () => { if (ready && !save.isPending) save.mutate(); };

  const onAmount = (e) => {
    const el = e.target;
    const n = significantBefore(el.value, el.selectionStart ?? el.value.length);
    const next = cleanAmount(el.value);
    setAmount(next);
    // Keep the caret after the same digit once commas are re-inserted.
    requestAnimationFrame(() => { const g = groupThousands(next); const p = caretFor(g, Math.min(n, next.length)); el.setSelectionRange?.(p, p); });
  };
  const addQuick = (n) => setAmount((a) => cleanAmount(new Decimal(a || 0).plus(n).toFixed(2).replace(/\.00$/, '')));
  const chooseCategory = (c) => { setCategoryId(c.id); setRate(null); setPicking(false); setFind(''); };
  const switchType = (v) => { setType(v); setCategoryId(''); setPicking(true); setShowAll(false); setFind(''); setRate(null); setAccount(null); };

  // ── pieces ──
  const panel = { bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '24px', boxShadow: t.shadow, p: isMobile ? 2 : 2.5, minHeight: 0 };
  const section = (title, body, extra) => (
    <Box sx={{ py: 1.5, '& + &': { borderTop: `1px solid ${t.hairline}` } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 650, color: t.muted }}>{title}</Typography>
        {extra}
      </Box>
      {body}
    </Box>
  );
  const chip = (text, on, onClick) => (
    <ButtonBase key={text} onClick={onClick} aria-pressed={on} sx={{
      height: 30, px: 1.4, borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit', whiteSpace: 'nowrap',
      border: `1px solid ${on ? t.ink : t.border}`, bgcolor: on ? t.inv : 'transparent', color: on ? t.invInk : t.ink2,
      '@media (hover: hover)': { '&:hover': on ? {} : { bgcolor: t.surface2 } },
    }}>{text}</ButtonBase>
  );
  const catLogo = (size) => (account ? <StockLogo symbol={account.bank_symbol} size={size >= 40 ? 'lg' : 'md'} /> : selected ? <CategoryBadge icon={selected.icon} name={selected.name} size={size} /> : null);

  const left = (
    <Box sx={{ ...panel, display: 'flex', flexDirection: 'column' }}>
      <TypeSwitch value={type} onChange={switchType} expenseInk={expenseInk} options={[
        { value: 'debit', label: 'Expense', hint: 'Money out', Icon: NorthEastRounded },
        { value: 'credit', label: 'Income', hint: 'Money in', Icon: SouthWestRounded },
      ]} />

      {section(taxed ? 'Gross profit, before tax' : 'Amount', (
        <>
          {/* Fixed-width field: the figure stays put as it grows. */}
          <Box component="label" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 1.5, py: 0.75, borderRadius: '16px', border: `1px solid ${t.border}`, bgcolor: t.surface2, cursor: 'text', '&:focus-within': { borderColor: t.ink } }}>
            <Typography component="span" sx={{ fontFamily: FONT_NUM, fontSize: '1.3rem', fontWeight: 600, color: t.muted }}>Rs</Typography>
            <InputBase inputRef={amountRef} value={groupThousands(amount)} onChange={onAmount} placeholder="0.00" autoFocus={!isMobile} fullWidth
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              inputProps={{ inputMode: 'decimal', 'aria-label': taxed ? 'Gross profit' : 'Amount', autoComplete: 'off' }}
              sx={{ fontFamily: FONT_NUM, fontSize: { xs: '1.9rem', md: '2.2rem' }, fontWeight: 650, letterSpacing: '-0.04em', color: typed ? tone : t.ink,
                '& input': { p: 0, textAlign: 'left' }, '& input::placeholder': { color: t.muted, opacity: 0.45 } }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', mt: 1 }}>{QUICK.map((n) => chip(`+${formatNumber(n, 0)}`, false, () => addQuick(n)))}</Box>
        </>
      ))}

      {section('Category', picking || !selected ? (
        isLoading ? <Skeleton variant="rounded" height={120} sx={{ borderRadius: '14px' }} /> : (
          <>
            {ordered.length > GRID_PREVIEW && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, height: 32, px: 1.1, mb: 1, borderRadius: 999, border: `1px solid ${t.border}` }}>
                <SearchRounded sx={{ fontSize: 15, color: t.muted }} />
                <InputBase value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a category" inputProps={{ 'aria-label': 'Find category' }} sx={{ fontSize: '0.76rem', flex: 1 }} />
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 0.6 }}>
              {visible.map((c) => (
                <ButtonBase key={c.id} onClick={() => chooseCategory(c)} aria-pressed={c.id === categoryId}
                  sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.9, px: 0.4, borderRadius: '12px', minWidth: 0, fontFamily: 'inherit',
                    border: `1px solid ${c.id === categoryId ? t.ink : t.hairline}`, '@media (hover: hover)': { '&:hover': { bgcolor: t.surface2 } } }}>
                  <CategoryBadge icon={c.icon} name={c.name} size={28} />
                  <Typography sx={{ fontSize: '0.64rem', fontWeight: 550, color: t.ink2, textAlign: 'center', lineHeight: 1.15, width: '100%', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {c.name.replace(/^Investment - /, 'Invest: ')}
                  </Typography>
                </ButtonBase>
              ))}
            </Box>
            {!needle && matches.length > GRID_PREVIEW && (
              <ButtonBase onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.75, gap: 0.25, fontSize: '0.72rem', fontWeight: 600, color: t.ink2, fontFamily: 'inherit', borderRadius: 999, px: 0.75 }}>
                {showAll ? 'Show fewer' : `Show all ${matches.length}`}<ExpandMoreRounded sx={{ fontSize: 16, transform: showAll ? 'rotate(180deg)' : 'none' }} />
              </ButtonBase>
            )}
            {!matches.length && <Typography sx={{ fontSize: '0.76rem', color: t.muted, py: 1 }}>No category matches “{find}”.</Typography>}
          </>
        )
      ) : (
        // Chosen: one line, the grid tucked away.
        <ButtonBase onClick={() => setPicking(true)} sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.1, p: 1, borderRadius: '14px', border: `1px solid ${t.border}`, fontFamily: 'inherit', textAlign: 'left' }}>
          <CategoryBadge icon={selected.icon} name={selected.name} size={32} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.84rem', fontWeight: 650 }}>{selected.name}</Typography>
            <Typography noWrap sx={{ fontSize: '0.66rem', color: t.muted }}>{month?.count ? `${formatCurrency(month.total)} this month in ${month.count} entr${month.count === 1 ? 'y' : 'ies'}` : 'First entry this month'}</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 650, color: t.ink2 }}>Change</Typography>
        </ButtonBase>
      ))}

      {taxed && section('Bank account', accounts.length === 0 ? (
        <ButtonBase onClick={() => setAddingAccount(true)} sx={{ width: '100%', p: 1.25, borderRadius: '14px', border: `1px dashed ${t.border}`, justifyContent: 'flex-start', gap: 1, fontFamily: 'inherit', textAlign: 'left' }}>
          <AddRounded sx={{ fontSize: 18 }} />
          <Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }}>Add your savings account</Typography>
            <Typography sx={{ fontSize: '0.66rem', color: t.muted }}>Choose the bank once, then pick it here each time.</Typography>
          </Box>
        </ButtonBase>
      ) : (
        <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', alignItems: 'center' }}>
          {accounts.map((a) => {
            const on = account?.id === a.id;
            return (
              <ButtonBase key={a.id} onClick={() => { setAccount(a.id); setRate(null); }} aria-pressed={on}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.8, pl: 0.6, pr: 1.3, py: 0.5, borderRadius: 999, fontFamily: 'inherit', border: `1px solid ${on ? t.ink : t.border}`, bgcolor: on ? t.surface2 : 'transparent' }}>
                <StockLogo symbol={a.bank_symbol} size="sm" />
                <Typography sx={{ fontSize: '0.74rem', fontWeight: on ? 700 : 600 }}>{a.name}</Typography>
              </ButtonBase>
            );
          })}
          <ButtonBase onClick={() => setAddingAccount(true)} aria-label="Add a savings account" sx={{ height: 34, px: 1.1, borderRadius: 999, border: `1px dashed ${t.border}`, fontFamily: 'inherit', fontSize: '0.72rem', fontWeight: 600, color: t.ink2, gap: 0.4 }}>
            <AddRounded sx={{ fontSize: 15 }} />Account
          </ButtonBase>
        </Box>
      ), (
        <Seg size="sm" label="Tax rate" value={String(rate)} onChange={(v) => setRate(Number(v))}
          options={rateOptions.map((r) => ({ value: String(r), label: `${Math.round(r * 100)}% ${r <= 0.2 ? 'filer' : 'non-filer'}` }))} />
      ))}

      {section('Date and note', (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto minmax(0, 1fr)' }, gap: 1, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0.6, alignItems: 'center', flexWrap: 'wrap' }}>
            {chip('Today', date === today(), () => setDate(today()))}
            {chip('Yesterday', date === daysAgo(1), () => setDate(daysAgo(1)))}
            <InputBase type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} inputProps={{ max: today(), 'aria-label': 'Date' }}
              sx={{ height: 30, px: 1.1, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.72rem', '& input': { colorScheme: 'inherit', p: 0 } }} />
          </Box>
          <InputBase value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note (optional)" inputProps={{ 'aria-label': 'Note', maxLength: 200 }}
            sx={{ height: 34, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.8rem', '&.Mui-focused': { borderColor: t.ink } }} />
        </Box>
      ))}
    </Box>
  );

  const line = (k, v, opts = {}) => (
    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.55, fontSize: '0.78rem', borderBottom: `1px dashed ${t.hairline}` }}>
      <Box component="span" sx={{ color: t.muted }}>{k}</Box>
      <Box component="span" sx={{ fontFamily: opts.num ? FONT_NUM : 'inherit', fontWeight: opts.strong ? 700 : 500, color: v ? (opts.color ?? t.ink) : t.muted, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v || '—'}</Box>
    </Box>
  );

  const receipt = (
    <Box sx={{ ...panel, display: 'flex', flexDirection: 'column' }}>
      {/* The receipt, filling in as the steps are done */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', pb: 1.5 }}>
        <Box sx={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: '50%', border: catLogo(52) ? 0 : `1.5px dashed ${t.border}` }}>{catLogo(52)}</Box>
        <Typography noWrap sx={{ fontSize: '0.92rem', fontWeight: 700, mt: 1, maxWidth: '100%' }}>{account ? account.name : selected?.name ?? (income ? 'New income' : 'New expense')}</Typography>
        <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted, maxWidth: '100%' }}>{account ? `${account.bank_name}, ${selected?.name}` : fmtDate(date)}</Typography>
        <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '2rem', fontWeight: 650, letterSpacing: '-0.04em', mt: 1, color: value ? tone : t.muted }}>
          {value ? `${income ? '+' : '−'}${formatCurrency(value, 2)}` : formatCurrency(0, 2)}
        </Typography>
        {split && <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>You receive this after the bank withholds tax</Typography>}
      </Box>
      <Box sx={{ borderTop: `1px solid ${t.hairline}`, pt: 0.5 }}>
        {line('Type', income ? 'Income' : 'Expense', { color: tone })}
        {line('Category', selected?.name)}
        {taxed && line('Bank account', account ? `${account.name}, ${account.bank_name}` : null)}
        {split && line('Gross profit', formatCurrency(Number(split.gross), 2), { num: true })}
        {split && line(`Tax withheld (${Math.round(rate * 100)}%)`, `−${formatCurrency(Number(split.tax), 2)}`, { num: true })}
        {line('Date', date ? fmtDate(date) : null)}
        {line('Note', notes.trim() || null)}
        {line(income ? 'Total received' : 'Total paid', value ? formatCurrency(value, 2) : null, { num: true, strong: true, color: tone })}
      </Box>

      <Box sx={{ pt: 1.75 }}>
        <ButtonBase onClick={submit} disabled={!ready || save.isPending}
          sx={{ width: '100%', height: 48, borderRadius: 999, bgcolor: ready ? tone : t.surface3, color: ready ? '#fff' : t.muted, fontSize: '0.92rem', fontWeight: 700, fontFamily: 'inherit', transition: 'background-color .2s' }}>
          {save.isPending ? 'Saving…' : 'Save'}
        </ButtonBase>
        <Typography sx={{ fontSize: '0.68rem', color: t.muted, textAlign: 'center', mt: 0.75, minHeight: 16 }}>
          {ready ? 'Press Enter or Save' : `Add ${missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0]} to save`}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ pb: isMobile ? 2 : 0 }}>
      <PageHeader title="Add transaction" filter={false} sub={false}
        actions={<ButtonBase onClick={() => navigate('/transactions')} sx={{ height: 34, px: 1.75, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.76rem', fontWeight: 650, fontFamily: 'inherit' }}>All transactions</ButtonBase>} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, gap: 2, alignItems: 'start' }}>
        {left}
        <Box sx={{ position: isMobile ? 'static' : 'sticky', top: 96 }}>{receipt}</Box>
      </Box>
      {addingAccount && <SavingsAccountsDialog open startNew onClose={() => setAddingAccount(false)} onCreated={(a) => { setAccount(a.id); setRate(null); }} />}
    </Box>
  );
}
