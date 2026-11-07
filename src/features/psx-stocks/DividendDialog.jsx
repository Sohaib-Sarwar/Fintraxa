import { useMemo, useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery } from '@mui/material';
import { CloseRounded, DeleteOutlineRounded, CheckCircleRounded, ErrorOutlineRounded } from '@mui/icons-material';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { parseDividendStatement, validateDividend, dividendKey, NET_ROUNDING } from '../../lib/psx/dividends';
import { useSaveDividends, useEditDividend, useDeleteDividend } from '../../lib/psx/useDividends';
import { useFx, Seg, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0; };
const FILER = [{ value: 'filer', label: 'Filer' }, { value: 'non_filer', label: 'Non-filer' }, { value: 'unknown', label: 'Not sure' }];

/**
 * Add dividends (paste a statement, or one by hand) or edit / delete one.
 * dividend: an existing row to edit, or null to add.
 * existing: every dividend on file, to mark warrants already saved.
 */
export default function DividendDialog({ dividend, existing = [], onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const editing = !!dividend;
  const [mode, setMode] = useState(editing ? 'manual' : 'paste');

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={mode === 'paste' ? 'sm' : 'xs'}
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
          <Typography sx={{ fontSize: '1.02rem', fontWeight: 750, flex: 1 }}>{editing ? 'Dividend' : 'Add dividends'}</Typography>
          <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>
        {!editing && (
          <Box sx={{ mb: 2 }}>
            <Seg label="How to add" value={mode} onChange={setMode} options={[{ value: 'paste', label: 'Paste statement' }, { value: 'manual', label: 'Enter manually' }]} />
          </Box>
        )}
        {mode === 'paste' ? <PasteStatement existing={existing} onDone={onClose} /> : <ManualForm dividend={dividend} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PasteStatement({ existing, onDone }) {
  const t = useFx();
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const save = useSaveDividends();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseDividendStatement(text), [text]);
  const onFile = useMemo(() => new Set(existing.map(dividendKey)), [existing]);
  const fresh = parsed.rows.filter((x) => !onFile.has(dividendKey(x)));
  const allMatch = parsed.statements.length > 0 && parsed.statements.every((s) => s.matches !== false);

  const submit = () => save.mutate(fresh, {
    onSuccess: ({ added, skipped }) => {
      showSnackbar(`Added ${added} dividend${added === 1 ? '' : 's'}${skipped ? `, ${skipped} already saved` : ''}`, 'success');
      onDone();
    },
    onError: dbErrorHandler(showSnackbar, 'Could not save the dividends'),
  });

  return (
    <Box>
      <Typography sx={{ fontSize: '0.74rem', color: t.muted, mb: 1 }}>
        Open your CDC dividend statement, select the table from the header to the Total line, copy and paste it here. You can paste several statements at once.
      </Typography>
      <InputBase multiline minRows={5} maxRows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Payment Date  Dividend Issue Date  Sec. Symbol - Sec. Name …"
        inputProps={{ 'aria-label': 'Dividend statement text' }}
        sx={{ width: '100%', p: 1.25, borderRadius: '14px', border: `1px solid ${t.border}`, bgcolor: t.surface2, fontSize: '0.74rem', fontFamily: FONT_NUM, alignItems: 'flex-start', '&.Mui-focused': { borderColor: t.ink } }} />

      {text.trim() && (
        <Box sx={{ mt: 1.5 }}>
          {parsed.rows.length === 0 ? (
            <Typography sx={{ fontSize: '0.76rem', color: t.neg }}>No dividend rows found. Copy the whole table, including the dates and amounts.</Typography>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                {allMatch ? <CheckCircleRounded sx={{ fontSize: 17, color: t.pos }} /> : <ErrorOutlineRounded sx={{ fontSize: 17, color: t.neg }} />}
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 600 }}>
                  {parsed.rows.length} dividend{parsed.rows.length === 1 ? '' : 's'} read
                  {allMatch ? ', totals match the statement' : ''}
                  {parsed.rows.length - fresh.length ? `, ${parsed.rows.length - fresh.length} already saved` : ''}
                </Typography>
              </Box>
              {parsed.warnings.map((w) => <Typography key={w} sx={{ fontSize: '0.7rem', color: t.neg, mb: 0.5 }}>{w}</Typography>)}
              <Box sx={{ maxHeight: 230, overflowY: 'auto', border: `1px solid ${t.hairline}`, borderRadius: '14px', px: 1, scrollbarWidth: 'thin' }}>
                {parsed.rows.map((x) => {
                  const saved = onFile.has(dividendKey(x));
                  return (
                    <Box key={dividendKey(x)} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: `1px solid ${t.hairline}`, '&:last-of-type': { borderBottom: 0 }, opacity: saved ? 0.5 : 1 }}>
                      <StockLogo symbol={x.symbol} size="sm" />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: '0.76rem', fontWeight: 650 }}>{x.symbol} <Box component="span" sx={{ fontWeight: 400, color: t.muted }}>{fmtDate(x.payment_date)}</Box></Typography>
                        <Typography noWrap sx={{ fontSize: '0.64rem', color: t.muted }}>
                          {formatNumber(Number(x.shares), 0)} shares, gross {formatCurrency(Number(x.gross_amount), 2)}, tax {formatCurrency(Number(x.tax_amount), 2)}{saved ? ', already saved' : ''}
                        </Typography>
                      </Box>
                      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.8rem', fontWeight: 650, color: t.pos }}>+{formatCurrency(Number(x.net_amount), 2)}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
        <ButtonBase onClick={onDone} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
        <ButtonBase onClick={submit} disabled={!fresh.length || save.isPending}
          sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: !fresh.length || save.isPending ? 0.45 : 1 }}>
          {save.isPending ? 'Saving…' : fresh.length ? `Save ${fresh.length} dividend${fresh.length === 1 ? '' : 's'}` : 'Nothing new to save'}
        </ButtonBase>
      </Box>
    </Box>
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
