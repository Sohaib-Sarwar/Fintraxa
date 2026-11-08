import { useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery } from '@mui/material';
import { CloseRounded, DeleteOutlineRounded } from '@mui/icons-material';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency } from '../../lib/formatters';
import { validateDividend, NET_ROUNDING } from '../../lib/psx/dividends';
import { useSaveDividends, useEditDividend, useDeleteDividend } from '../../lib/psx/useDividends';
import { useFx, Seg, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import DividendUpload from './DividendUpload';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const FILER = [{ value: 'filer', label: 'Filer' }, { value: 'non_filer', label: 'Non-filer' }, { value: 'unknown', label: 'Not sure' }];

/**
 * Add dividends (upload a CDC report, or one by hand) or edit / delete one.
 * dividend: an existing row to edit, or null to add.
 * existing: every dividend on file, to mark warrants already saved.
 */
export default function DividendDialog({ dividend, existing = [], onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const editing = !!dividend;
  const [mode, setMode] = useState(editing ? 'manual' : 'upload');

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={mode === 'upload' ? 'sm' : 'xs'}
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.02rem', fontWeight: 750, flex: 1 }}>{editing ? 'Dividend' : 'Add dividends'}</Typography>
          <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>
        {!editing && (
          <Box sx={{ mb: 2 }}>
            <Seg label="How to add" value={mode} onChange={setMode} options={[{ value: 'upload', label: 'Upload report' }, { value: 'manual', label: 'Enter manually' }]} />
          </Box>
        )}
        {mode === 'upload' ? <DividendUpload existing={existing} onClose={onClose} /> : <ManualForm dividend={dividend} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ManualForm({ dividend, onDone }) {
  const t = useFx();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const add = useSaveDividends();
  const edit = useEditDividend();
  const del = useDeleteDividend();
  const d = dividend;
  const [f, setF] = useState({
    symbol: d?.symbol ?? '', company_name: d?.company_name ?? '', payment_date: d?.payment_date ?? today(), issue_date: d?.issue_date ?? '',
    shares: d ? String(Number(d.shares)) : '', gross_amount: d?.gross_amount ?? '', tax_amount: d?.tax_amount ?? '', zakat_amount: d && Number(d.zakat_amount) ? d.zakat_amount : '',
    net_amount: d?.net_amount ?? '', filer_status: d?.filer_status ?? 'filer', warrant_no: d?.warrant_no ?? '', notes: d?.notes ?? '',
  });
  const [netEdited, setNetEdited] = useState(!!d);
  const [err, setErr] = useState(null);
  const autoNet = Math.max(0, num(f.gross_amount) - num(f.tax_amount) - num(f.zakat_amount) - num(d?.jh_tax_amount));
  const net = netEdited ? f.net_amount : (f.gross_amount === '' ? '' : autoNet.toFixed(2));
  const gap = num(net) - autoNet;
  const busy = add.isPending || edit.isPending || del.isPending;
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: k === 'symbol' ? v.toUpperCase() : v }));

  const submit = () => {
    const row = { ...d, ...f, net_amount: net, source: d?.source ?? 'manual', filer_status_raw: d && f.filer_status === d.filer_status ? d.filer_status_raw : null };
    const problem = validateDividend(row);
    if (problem) return setErr(problem);
    setErr(null);
    if (d) {
      return edit.mutate({ ...row, id: d.id }, {
        onSuccess: () => { showSnackbar('Dividend updated', 'success'); onDone(); },
        onError: dbErrorHandler(showSnackbar, 'Could not save the dividend'),
      });
    }
    return add.mutate([row], {
      onSuccess: ({ added }) => {
        showSnackbar(added ? `Added ${row.symbol} dividend` : 'That warrant is already saved', added ? 'success' : 'info');
        onDone();
      },
      onError: dbErrorHandler(showSnackbar, 'Could not save the dividend'),
    });
  };

  const field = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0, gridColumn: props.wide ? '1 / -1' : undefined }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      <InputBase value={props.value ?? f[k]} onChange={(e) => (props.onChange ?? set(k))(e.target.value)} type={props.type} placeholder={props.placeholder}
        inputProps={{ inputMode: props.decimal ? 'decimal' : undefined, 'aria-label': label, ...props.inputProps }}
        sx={{ height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink, fontSize: '0.84rem',
          fontFamily: props.decimal || props.type === 'date' ? FONT_NUM : 'inherit', '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' } }} />
    </Box>
  );

  return (
    <Box>
      {d && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.5, mb: 2, borderRadius: '16px', border: `1px solid ${t.border}` }}>
          <StockLogo symbol={d.symbol} size="lg" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: '0.95rem', fontWeight: 750 }}>{d.symbol}</Typography>
            <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>
              {d.company_name ?? ''}{d.warrant_no ? `, warrant ${d.warrant_no}` : ''}{d.source === 'statement' ? ', from statement' : ''}
            </Typography>
          </Box>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.1rem', fontWeight: 650, color: t.pos }}>+{formatCurrency(num(net), 2)}</Typography>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
        {field('symbol', 'Stock symbol', { placeholder: 'e.g. FFC', inputProps: { maxLength: 16, autoCapitalize: 'characters' } })}
        {field('shares', 'Shares held', { decimal: true })}
        {field('payment_date', 'Paid on', { type: 'date', inputProps: { max: today() } })}
        {field('issue_date', 'Issued on (optional)', { type: 'date', inputProps: { max: f.payment_date || today() } })}
        {field('gross_amount', 'Gross dividend', { decimal: true })}
        {field('tax_amount', 'Tax withheld', { decimal: true })}
        {field('zakat_amount', 'Zakat (if any)', { decimal: true })}
        {field('net_amount', 'Net received', { decimal: true, value: net, onChange: (v) => { setNetEdited(true); set('net_amount')(v); } })}
        <Box sx={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>Tax status on the warrant</Box>
          <Seg size="sm" label="Filer status" value={f.filer_status} onChange={set('filer_status')} options={FILER} />
        </Box>
        {field('warrant_no', 'Warrant no. (optional)', { placeholder: 'Stops it being saved twice' })}
        {field('notes', 'Note (optional)')}
      </Box>
      {netEdited && Math.abs(gap) > NET_ROUNDING && f.gross_amount !== '' && (
        <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: 1 }}>
          Net differs from gross − tax − zakat by {formatCurrency(Math.abs(gap), 2)}. Fine if that is what the statement shows.
        </Typography>
      )}
      {err && <Typography sx={{ fontSize: '0.72rem', color: t.neg, mt: 1.25 }}>{err}</Typography>}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25 }}>
        {d && (
          <IconButton aria-label="Delete dividend" disabled={busy}
            onClick={() => showConfirm('Delete this dividend?', `The ${d.symbol} dividend paid ${fmtDate(d.payment_date)} is removed permanently. This cannot be undone.`,
              () => del.mutate(d.id, {
                onSuccess: () => { showSnackbar('Dividend deleted', 'success'); onDone(); },
                onError: dbErrorHandler(showSnackbar, 'Could not delete the dividend'),
              }))}
            sx={{ border: `1px solid ${t.border}`, color: t.neg, width: 40, height: 40 }}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
        )}
        <Box sx={{ flex: 1 }} />
        <ButtonBase onClick={onDone} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
        <ButtonBase onClick={submit} disabled={busy}
          sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : d ? 'Save' : 'Add dividend'}
        </ButtonBase>
      </Box>
    </Box>
  );
}
