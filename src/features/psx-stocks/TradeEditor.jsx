import { useRef, useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery } from '@mui/material';
import { DeleteOutlineRounded } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { getStockName } from '../../lib/stockMeta';
import { useFx, FONT_NUM } from '../../components/fx';
import DateField from '../../components/fx/DateField';
import StockLogo from '../../components/StockLogo';
import BrokerLogo from './BrokerLogo';
import { BROKERS } from '../../lib/psx/confirmations';
import Receipt, { ReceiptToolbar, EditHeader } from '../../components/Receipt';
import { downloadReceipt, receiptDate } from '../../lib/receipt';

const DECIMAL = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** One trade: a receipt you can download, the fields to correct it, and delete. */
export default function TradeEditor({ trade, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const qc = useQueryClient();
  const slip = useRef(null);
  // The saved values: Cancel goes back to these.
  const [saved] = useState(() => ({
    date: trade.date ?? today(), quantity: String(trade.quantity ?? ''), price: String(trade.price ?? ''), fee: String(trade.fee ?? 0), notes: trade.notes ?? '',
  }));
  const [f, setF] = useState(saved);
  const [err, setErr] = useState(null);
  // Opening a record shows its receipt; Edit swaps it for the form alone.
  const [mode, setMode] = useState('view');
  const isBuy = trade.type === 'buy';
  const qty = Number(f.quantity) || 0;
  const price = Number(f.price) || 0;
  const fee = Number(f.fee) || 0;
  const total = isBuy ? qty * price + fee : qty * price - fee;
  const refresh = () => ['stock-transactions', 'home-st-txns'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('stock_transactions').update({
        date: f.date, quantity: Number(f.quantity), price: Number(f.price), fee: Number(f.fee) || 0, notes: f.notes.trim() || null,
      }).eq('id', trade.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); showSnackbar('Trade updated', 'success'); onClose(); },
    onError: dbErrorHandler(showSnackbar, 'Could not save'),
  });
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('stock_transactions').delete().eq('id', trade.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); showSnackbar('Trade deleted', 'success'); onClose(); },
    onError: dbErrorHandler(showSnackbar, 'Could not delete'),
  });

  const submit = () => {
    setErr(null);
    if (!DECIMAL.test(f.quantity.trim()) || Number(f.quantity) <= 0) return setErr('Shares must be more than zero');
    if (!DECIMAL.test(f.price.trim()) || Number(f.price) <= 0) return setErr('Price must be more than zero');
    if (f.fee.trim() && !DECIMAL.test(f.fee.trim())) return setErr('Fee must be a plain number');
    if (!f.date || f.date > today()) return setErr('The date cannot be empty or in the future');
    if (trade.settlement_date && f.date > trade.settlement_date) return setErr(`The trade date cannot be after its settlement date (${fmtDate(trade.settlement_date)})`);
    return save.mutate();
  };

  const download = async () => {
    if (!slip.current) return;
    try {
      await downloadReceipt(slip.current, `trade-${trade.symbol}-${f.date}.png`, t.surface, t.muted);
    } catch {
      showSnackbar('Could not create the receipt', 'error');
    }
  };

  const field = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      {props.type === 'date' ? <DateField value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} min={props.inputProps?.min} max={props.inputProps?.max} label={label} /> : <InputBase value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} type={props.type} inputProps={{ inputMode: props.type ? undefined : 'decimal', 'aria-label': label, ...props.inputProps }}
        sx={{ height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink, fontSize: '0.84rem',
          fontFamily: props.type || k === 'notes' ? 'inherit' : FONT_NUM, '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' } }} />}
    </Box>
  );

  const askDelete = () => showConfirm('Delete this trade?', 'It is removed permanently and your holdings are recalculated. This cannot be undone.', () => del.mutate());
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        {mode === 'view' ? (
          <>
        <ReceiptToolbar onDelete={askDelete} onDownload={download} onEdit={() => setMode('edit')} onClose={onClose} busy={del.isPending} />

        {/* Receipt: also what "Download" captures. Its rows are the fields below. */}
        <Receipt boxRef={slip}
          label={isBuy ? 'Bought, total paid' : 'Sold, total received'}
          tone={isBuy ? 'neutral' : 'pos'}
          amount={formatCurrency(total, 2)}
          date={receiptDate(f.date)}
          subject={{ logo: <StockLogo symbol={trade.symbol} size="sm" />, title: trade.symbol, sub: getStockName(trade.symbol, trade.company_name) }}
          rows={[
            ['Shares', formatNumber(qty, qty % 1 ? 2 : 0)],
            ['Price', formatNumber(price, 2)],
            ['Broker fee', formatCurrency(fee, 2)],
            ['Settlement', trade.settlement_date ? receiptDate(trade.settlement_date) : null],
            ['Broker', trade.broker ? (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                <BrokerLogo broker={trade.broker} size={18} />{BROKERS[trade.broker]?.name ?? trade.broker}{trade.account_ref ? `, ${trade.account_ref}` : ''}
              </Box>
            ) : null],
            ['Note', f.notes.trim()],
          ]}
          reference={trade.confirmation_no || String(trade.id).slice(0, 8).toUpperCase()} />
          </>
        ) : (
          <>
            <EditHeader title={isBuy ? 'Edit buy' : 'Edit sell'} sub={getStockName(trade.symbol, trade.company_name)} onClose={onClose}
              logo={<StockLogo symbol={trade.symbol} size="sm" />} />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25, mt: 2 }}>
          {field('date', 'Date', { type: 'date', inputProps: { max: today() } })}
          {field('quantity', 'Shares')}
          {field('price', 'Price')}
          {field('fee', 'Broker fee')}
          <Box sx={{ gridColumn: '1 / -1' }}>{field('notes', 'Note')}</Box>
        </Box>
        {err && <Typography sx={{ fontSize: '0.72rem', color: t.neg, mt: 1.25 }}>{err}</Typography>}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.25 }}>
          <IconButton aria-label="Delete trade" disabled={del.isPending}
            onClick={askDelete}
            sx={{ border: `1px solid ${t.border}`, color: t.neg, width: 40, height: 40 }}>
            <DeleteOutlineRounded fontSize="small" />
          </IconButton>
          <Box sx={{ flex: 1 }} />
          <ButtonBase onClick={() => { setErr(null); setF(saved); setMode('view'); }} sx={{ height: 40, px: 2, borderRadius: 999, border: `1px solid ${t.border}`, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit' }}>Cancel</ButtonBase>
          <ButtonBase onClick={submit} disabled={save.isPending}
            sx={{ height: 40, px: 2.5, borderRadius: 999, bgcolor: t.inv, color: t.invInk, fontSize: '0.8rem', fontWeight: 650, fontFamily: 'inherit', opacity: save.isPending ? 0.5 : 1 }}>
            {save.isPending ? 'Saving…' : 'Save'}
          </ButtonBase>
        </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
