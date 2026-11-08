import { useRef, useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery, useTheme } from '@mui/material';
import { CloseRounded, DeleteOutlineRounded, FileDownloadOutlined } from '@mui/icons-material';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency } from '../../lib/formatters';
import { useCategories, useFinanceRefresh, categoryMatches } from '../../lib/finance/useFinance';
import { useFx, PillSelect, Seg, FONT_NUM } from '../../components/fx';
import { savingsTax } from '../../lib/finance/passive';
import CategoryBadge from './CategoryBadge';
import StockLogo from '../../components/StockLogo';
import { useSavingsAccounts } from '../../lib/finance/useSavingsAccounts';

const DECIMAL = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** One transaction: a receipt you can download, the fields to correct it, and delete. */
export default function TransactionEditor({ txn, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const isDark = useTheme().palette.mode === 'dark';
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const refresh = useFinanceRefresh();
  const { data: categories = [] } = useCategories();
  const slip = useRef(null);
  // A taxed entry (Savings profit) is edited by its gross; tax and net follow.
  const [f, setF] = useState({ date: txn.date ?? today(), amount: String(txn.gross_amount ?? txn.amount ?? ''), category: txn.category_id ?? '', notes: txn.notes ?? '' });
  const [rateOverride, setRate] = useState(txn.tax_rate !== null && txn.tax_rate !== undefined ? Number(txn.tax_rate) : null);
  const [accountId, setAccountId] = useState(txn.savings_account_id ?? '');
  const { data: allAccounts = [] } = useSavingsAccounts();
  // Active accounts, plus this entry's own account even if it has been archived since.
  const accounts = allAccounts.filter((a) => !a.archived || a.id === txn.savings_account_id);
  const [err, setErr] = useState(null);
  const income = txn.type === 'credit';
  const cats = categories.filter((c) => categoryMatches(c, txn.type));
  const cat = categories.find((c) => c.id === f.category) ?? (txn.categories ? { name: txn.categories.name, icon: txn.categories.icon, default_tax_rate: txn.categories.default_tax_rate } : null);
  const taxed = income && cat?.default_tax_rate !== null && cat?.default_tax_rate !== undefined;
  const account = taxed ? accounts.find((a) => a.id === accountId) ?? null : null;
  const rate = taxed ? (rateOverride ?? account?.tax_rate ?? Number(cat.default_tax_rate)) : null;
  const split = taxed ? savingsTax(f.amount, rate) : null;
  const shownAmount = split ? Number(split.net) : (Number(f.amount) || 0);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('income_expense_transactions')
        .update({
          date: f.date, category_id: f.category || txn.category_id, notes: f.notes.trim() || null,
          ...(split
            ? { amount: split.net, gross_amount: split.gross, tax_amount: split.tax, tax_rate: rate, savings_account_id: account?.id ?? null }
            : { amount: Number(f.amount), gross_amount: null, tax_amount: null, tax_rate: null, savings_account_id: null }),
        })
        .eq('id', txn.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); showSnackbar('Transaction updated', 'success'); onClose(); },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('income_expense_transactions').delete().eq('id', txn.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); showSnackbar('Transaction deleted', 'success'); onClose(); },
    onError: dbErrorHandler(showSnackbar, 'Could not delete'),
  });

  const submit = () => {
    setErr(null);
    const a = f.amount.replace(/,/g, '').trim();
    if (!DECIMAL.test(a) || Number(a) <= 0) return setErr('Amount must be more than zero');
    if (!f.date || f.date > today()) return setErr('The date cannot be empty or in the future');
    setF((x) => ({ ...x, amount: a }));
    return save.mutate();
  };

  const download = async () => {
    if (!slip.current) return;
    try {
      // html2canvas is large and only needed here, so it loads on demand.
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(slip.current, { scale: 2, backgroundColor: isDark ? '#151517' : '#ffffff' });
      const a = document.createElement('a');
      a.download = `transaction-${txn.date}-${String(txn.id).slice(0, 8)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch {
      showSnackbar('Could not create the receipt', 'error');
    }
  };

  const input = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      <InputBase value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} type={props.type} inputProps={{ inputMode: k === 'amount' ? 'decimal' : undefined, 'aria-label': label, ...props.inputProps }}
        sx={{ height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink, fontSize: '0.84rem',
          fontFamily: k === 'amount' ? FONT_NUM : 'inherit', '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' } }} />
    </Box>
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: -1 }}>
          <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>

        {/* Receipt: also what "Download" captures */}
        {account ? (
          // Bank profit slip: the bank, what you received, how it was taxed. Nothing else.
          <Box ref={slip} sx={{ px: 2, pt: 2.25, pb: 1.75, borderRadius: '18px', border: `1px solid ${t.border}`, bgcolor: t.surface, textAlign: 'center' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}><StockLogo symbol={account.bank_symbol} size="lg" /></Box>
            <Typography noWrap sx={{ fontSize: '0.95rem', fontWeight: 750, mt: 1 }}>{account.name}</Typography>
            <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{account.bank_name}, {fmtDate(f.date)}</Typography>
            <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.9rem', fontWeight: 650, letterSpacing: '-0.04em', mt: 1.5, lineHeight: 1.1, color: t.pos }}>
              +{formatCurrency(shownAmount, 2)}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 0.25 }}>Profit received</Typography>
            {split && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', mt: 1.75, borderRadius: '12px', bgcolor: t.surface2, border: `1px solid ${t.hairline}` }}>
                {[['Gross profit', formatCurrency(Number(split.gross), 2)], [`Tax ${Math.round(rate * 100)}%`, `−${formatCurrency(Number(split.tax), 2)}`]].map(([k, v], i) => (
                  <Box key={k} sx={{ py: 1, px: 1, borderLeft: i ? `1px solid ${t.hairline}` : 0 }}>
                    <Typography sx={{ fontSize: '0.64rem', color: t.muted, fontWeight: 600 }}>{k}</Typography>
                    <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.86rem', fontWeight: 650, letterSpacing: '-0.02em' }}>{v}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {f.notes && <Typography sx={{ fontSize: '0.72rem', color: t.ink2, mt: 1.25 }}>{f.notes}</Typography>}
            <SlipBrand />
          </Box>
        ) : (
          <Box ref={slip} sx={{ p: 1.75, borderRadius: '16px', border: `1px solid ${t.border}`, bgcolor: t.surface }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <CategoryBadge icon={cat?.icon} name={cat?.name} size={40} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.98rem', fontWeight: 750 }}>{cat?.name ?? 'Uncategorized'}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: t.muted }}>{fmtDate(f.date)}</Typography>
              </Box>
              <Box component="span" sx={{ px: 1, py: '2px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: income ? t.pos : t.neg, bgcolor: income ? t.posSoft : t.negSoft }}>{income ? 'Income' : 'Expense'}</Box>
            </Box>
            <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.6rem', fontWeight: 650, letterSpacing: '-0.04em', mt: 1.5, color: income ? t.pos : t.ink }}>
              {income ? '+' : '−'}{formatCurrency(shownAmount, 2)}
            </Typography>
            {split && <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 0.25 }}>Gross {formatCurrency(Number(split.gross), 2)}, tax {formatCurrency(Number(split.tax), 2)} at {Math.round(rate * 100)}%</Typography>}
            {f.notes && <Typography sx={{ fontSize: '0.74rem', color: t.ink2, mt: 0.5 }}>{f.notes}</Typography>}
            <SlipBrand />
          </Box>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 2 }}>
          {input('amount', taxed ? 'Gross profit' : 'Amount')}
          {input('date', 'Date', { type: 'date', inputProps: { max: today() } })}
          {!account && <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>Category</Box>
            <PillSelect value={f.category} onChange={(v) => setF({ ...f, category: v })} label="Category" width="100%"
              items={cats.map((c) => ({ value: c.id, label: c.name, icon: <CategoryBadge icon={c.icon} name={c.name} size={20} /> }))} />
          </Box>}
          {taxed && (
            <Box sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, gap: 1, alignItems: 'end' }}>
              {accounts.length > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
                  <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>Bank account</Box>
                  <PillSelect value={accountId} onChange={(v) => { setAccountId(v); setRate(null); }} label="Savings account" width="100%"
                    items={accounts.map((a) => ({ value: a.id, label: a.name, icon: <StockLogo symbol={a.bank_symbol} size="sm" /> }))} />
                </Box>
              )}
              <Seg size="sm" label="Tax rate" value={String(rate)} onChange={(v) => setRate(Number(v))}
                options={[...new Set([account?.tax_rate ?? Number(cat.default_tax_rate), 0.2, 0.4])].sort((a, b) => a - b).map((r) => ({ value: String(r), label: `${Math.round(r * 100)}% ${r <= 0.2 ? 'filer' : 'non-filer'}` }))} />
            </Box>
          )}
          <Box sx={{ gridColumn: '1 / -1' }}>{input('notes', 'Note')}</Box>
        </Box>
        {err && <Typography sx={{ fontSize: '0.72rem', color: t.neg, mt: 1.25 }}>{err}</Typography>}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25 }}>
          <IconButton aria-label="Delete transaction" disabled={del.isPending}
            onClick={() => showConfirm('Delete this transaction?', 'It is removed permanently. This cannot be undone.', () => del.mutate())}
            sx={{ border: `1px solid ${t.border}`, color: t.neg, width: 40, height: 40 }}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
          <IconButton aria-label="Download receipt" onClick={download} sx={{ border: `1px solid ${t.border}`, width: 40, height: 40 }}>
            <FileDownloadOutlined fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <ButtonBase onClick={onClose} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
          <ButtonBase onClick={submit} disabled={save.isPending}
            sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: save.isPending ? 0.5 : 1 }}>
            {save.isPending ? 'Saving…' : 'Save'}
          </ButtonBase>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

/** The receipt's sign-off: the Fintraxa mark and name, so a downloaded slip says where it came from. */
function SlipBrand() {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mt: 1.5, pt: 1.25, borderTop: `1px dashed ${t.hairline}` }}>
      <Box component="img" src="/fintraxa-mark.webp" alt="" width={18} height={18} sx={{ borderRadius: '5px', display: 'block' }} />
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.01em', color: t.ink2 }}>Fintraxa</Typography>
    </Box>
  );
}
