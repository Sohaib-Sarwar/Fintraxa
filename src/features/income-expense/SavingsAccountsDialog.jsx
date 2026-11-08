import { useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, Tooltip, useMediaQuery } from '@mui/material';
import { CloseRounded, EditRounded, AddRounded, ArrowBackRounded, Inventory2Outlined, UnarchiveOutlined, DeleteOutlineRounded } from '@mui/icons-material';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { PSX_BANKS, SAVINGS_TAX_RATES } from '../../lib/finance/banks';
import { useSavingsAccounts, useSaveAccount, useArchiveAccount, useDeleteAccount, validateAccount } from '../../lib/finance/useSavingsAccounts';
import { useProfile } from '../../lib/profile/useProfile';
import { useFx, Seg, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';

const describe = (a) => [a.bank_name, a.profit_rate !== null ? `${a.profit_rate}% a year` : null, `tax ${Math.round(a.tax_rate * 100)}%`].filter(Boolean).join(', ');

/**
 * Savings accounts: list, add, edit, archive, delete. Used inside Settings and
 * in a dialog from Add transaction.
 * startNew: open on the add form; onCreated(account) after a new one is saved; onDone when the form closes in startNew mode.
 */
export function SavingsAccountsManager({ startNew = false, onCreated, onDone }) {
  const t = useFx();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const { data: accounts = [], isLoading } = useSavingsAccounts();
  const { data: profile } = useProfile();
  const save = useSaveAccount();
  const archive = useArchiveAccount();
  const del = useDeleteAccount();
  // New accounts take the tax rate that matches the user's filer status.
  const blank = () => ({ bank_symbol: '', name: '', profit_rate: '', tax_rate: profile?.filer_status === 'non_filer' ? 0.4 : 0.2 });
  const [form, setForm] = useState(startNew ? blank() : null); // null = list
  const [err, setErr] = useState(null);
  const editing = form?.id ? accounts.find((a) => a.id === form.id) : null;
  const closeForm = () => (startNew && onDone ? onDone() : setForm(null));

  const openForm = (a) => { setErr(null); setForm(a ? { id: a.id, bank_symbol: a.bank_symbol, name: a.name, profit_rate: a.profit_rate ?? '', tax_rate: a.tax_rate } : blank()); };
  const pickBank = (b) => setForm((f) => ({
    ...f, bank_symbol: b.symbol,
    name: !f.name || PSX_BANKS.some((x) => f.name === `${x.name} savings`) ? `${b.name} savings` : f.name, // suggest until the user types their own
  }));
  const submit = () => {
    const problem = validateAccount(form, accounts, form.id ?? null);
    if (problem) return setErr(problem);
    setErr(null);
    return save.mutate(form, {
      onSuccess: (r) => {
        showSnackbar(form.id ? 'Account updated' : 'Savings account added', 'success');
        if (!form.id && onCreated) onCreated({ ...form, id: r.id });
        closeForm();
      },
      onError: dbErrorHandler(showSnackbar, 'Could not save the account'),
    });
  };
  const remove = () => showConfirm('Delete this account?', `"${editing.name}" is removed permanently. Accounts with profit entries cannot be deleted; archive them instead.`, () => del.mutate(editing.id, {
    onSuccess: () => { showSnackbar('Account deleted', 'success'); setForm(null); },
    onError: (e) => (e.friendly ? showSnackbar(e.message, 'warning') : dbErrorHandler(showSnackbar, 'Could not delete the account')(e)),
  }));

  const field = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      <InputBase value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={props.placeholder}
        inputProps={{ inputMode: props.decimal ? 'decimal' : undefined, maxLength: props.max, 'aria-label': label }} endAdornment={props.end}
        sx={{ height: 42, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.86rem', fontFamily: props.decimal ? FONT_NUM : 'inherit', '&.Mui-focused': { borderColor: t.ink } }} />
    </Box>
  );

  if (!form) {
    return (
      <Box>
        {!isLoading && !accounts.length && (
          <Typography sx={{ fontSize: '0.82rem', color: t.muted, textAlign: 'center', py: 3 }}>No savings accounts yet. Add the accounts that pay you profit.</Typography>
        )}
        <Box sx={{ display: 'grid', gap: 1 }}>
          {accounts.map((a) => (
            <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: '14px', border: `1px solid ${t.border}`, opacity: a.archived ? 0.55 : 1 }}>
              <StockLogo symbol={a.bank_symbol} size="md" />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.86rem', fontWeight: 650 }}>{a.name}{a.archived && <Box component="span" sx={{ ml: 0.75, fontSize: '0.64rem', fontWeight: 600, color: t.muted }}>Archived</Box>}</Typography>
                <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{describe(a)}</Typography>
              </Box>
              {a.archived ? (
                <Tooltip title="Restore" arrow><IconButton size="small" aria-label={`Restore ${a.name}`} onClick={() => archive.mutate({ id: a.id, archived: false }, { onError: dbErrorHandler(showSnackbar, 'Could not restore') })}><UnarchiveOutlined fontSize="small" /></IconButton></Tooltip>
              ) : (
                <Tooltip title="Edit" arrow><IconButton size="small" aria-label={`Edit ${a.name}`} onClick={() => openForm(a)}><EditRounded fontSize="small" /></IconButton></Tooltip>
              )}
            </Box>
          ))}
        </Box>
        <ButtonBase onClick={() => openForm(null)} sx={{ mt: 1.5, width: '100%', height: 44, borderRadius: 999, border: `1px dashed ${t.border}`, gap: 0.75, fontSize: '0.82rem', fontWeight: 650, fontFamily: 'inherit', color: t.ink, '&:hover': { bgcolor: t.surface2 } }}>
          <AddRounded sx={{ fontSize: 18 }} />Add account
        </ButtonBase>
      </Box>
    );
  }

  return (
    <Box>
      {!startNew && (
        <ButtonBase onClick={() => setForm(null)} sx={{ gap: 0.5, mb: 1.5, fontSize: '0.76rem', fontWeight: 650, color: t.ink2, fontFamily: 'inherit', borderRadius: 999, px: 0.5 }}>
          <ArrowBackRounded sx={{ fontSize: 16 }} />All accounts
        </ButtonBase>
      )}
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted, mb: 0.75 }}>Bank</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' }, gap: 0.75, mb: 2 }}>
        {PSX_BANKS.map((b) => {
          const on = form.bank_symbol === b.symbol;
          return (
            <ButtonBase key={b.symbol} onClick={() => pickBank(b)} aria-pressed={on} aria-label={b.name}
              sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, py: 0.9, px: 0.5, borderRadius: '14px', fontFamily: 'inherit', minWidth: 0,
                border: `1px solid ${on ? t.ink : t.hairline}`, bgcolor: on ? t.surface2 : 'transparent', '&:hover': { bgcolor: t.surface2 } }}>
              <StockLogo symbol={b.symbol} size="sm" />
              <Typography sx={{ fontSize: '0.62rem', fontWeight: on ? 700 : 500, color: on ? t.ink : t.ink2, textAlign: 'center', lineHeight: 1.2, width: '100%', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.name}</Typography>
            </ButtonBase>
          );
        })}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 1.25 }}>
        {field('name', 'Account name', { placeholder: 'e.g. Meezan savings', max: 60 })}
        {field('profit_rate', 'Profit rate (optional)', { decimal: true, placeholder: '9.5', end: <Box component="span" sx={{ fontSize: '0.74rem', color: t.muted, whiteSpace: 'nowrap' }}>% a year</Box> })}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1.75, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.ink2 }}>Tax the bank withholds on profit</Typography>
        <Seg size="sm" label="Tax rate" value={String(form.tax_rate)} onChange={(v) => setForm({ ...form, tax_rate: Number(v) })}
          options={SAVINGS_TAX_RATES.map((r) => ({ value: String(r.value), label: r.label }))} />
      </Box>
      {err && <Typography sx={{ fontSize: '0.74rem', color: t.neg, mt: 1.5 }}>{err}</Typography>}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25 }}>
        {editing && (
          <>
            <Tooltip title="Archive: hide from new entries, keep its history" arrow>
              <IconButton aria-label="Archive account" onClick={() => archive.mutate({ id: editing.id, archived: true }, { onSuccess: () => { showSnackbar('Account archived', 'success'); setForm(null); }, onError: dbErrorHandler(showSnackbar, 'Could not archive') })}
                sx={{ border: `1px solid ${t.border}`, width: 40, height: 40 }}><Inventory2Outlined fontSize="small" /></IconButton>
            </Tooltip>
            <Tooltip title="Delete" arrow>
              <IconButton aria-label="Delete account" onClick={remove} sx={{ border: `1px solid ${t.border}`, width: 40, height: 40, color: t.neg }}><DeleteOutlineRounded fontSize="small" /></IconButton>
            </Tooltip>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <ButtonBase onClick={closeForm} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
        <ButtonBase onClick={submit} disabled={save.isPending}
          sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: save.isPending ? 0.5 : 1 }}>
          {save.isPending ? 'Saving…' : form.id ? 'Save' : 'Add account'}
        </ButtonBase>
      </Box>
    </Box>
  );
}

/** The manager in its own window (from Add transaction). */
export default function SavingsAccountsDialog({ open, onClose, startNew = false, onCreated }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '24px', bgcolor: t.surface, backgroundImage: 'none' } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.75 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" sx={{ fontSize: '1.05rem', fontWeight: 750 }}>{startNew ? 'Add a savings account' : 'Savings accounts'}</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>Its profit is recorded as passive income, after the bank withholds tax.</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>
        <SavingsAccountsManager startNew={startNew} onCreated={onCreated} onDone={onClose} />
      </DialogContent>
    </Dialog>
  );
}
