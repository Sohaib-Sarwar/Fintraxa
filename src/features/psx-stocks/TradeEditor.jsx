import { useRef, useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery, useTheme } from '@mui/material';
import { CloseRounded, DeleteOutlineRounded, FileDownloadOutlined } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { getStockName } from '../../lib/stockMeta';
import { useFx, FONT_NUM } from '../../components/fx';
import StockLogo from '../../components/StockLogo';

const DECIMAL = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** One trade: a receipt you can download, the fields to correct it, and delete. */
export default function TradeEditor({ trade, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const isDark = useTheme().palette.mode === 'dark';
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const showConfirm = useAppStore((s) => s.showConfirm);
  const qc = useQueryClient();
  const slip = useRef(null);
  const [f, setF] = useState({
    date: trade.date ?? today(), quantity: String(trade.quantity ?? ''), price: String(trade.price ?? ''), fee: String(trade.fee ?? 0), notes: trade.notes ?? '',
  });
  const [err, setErr] = useState(null);
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
    return save.mutate();
  };

  const download = async () => {
    if (!slip.current) return;
    try {
      // html2canvas is large and only needed here, so it loads on demand.
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(slip.current, { scale: 2, backgroundColor: isDark ? '#151517' : '#ffffff' });
      const a = document.createElement('a');
      a.download = `trade-${trade.symbol}-${trade.date}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch {
      showSnackbar('Could not create the receipt', 'error');
    }
  };

  const field = (k, label, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      <InputBase value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} type={props.type} inputProps={{ inputMode: props.type ? undefined : 'decimal', 'aria-label': label, ...props.inputProps }}
        sx={{ height: 40, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink, fontSize: '0.84rem',
          fontFamily: props.type || k === 'notes' ? 'inherit' : FONT_NUM, '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' } }} />
    </Box>
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: -1 }}>
          <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>

        {/* Receipt — also what "Download" captures */}
        <Box ref={slip} sx={{ p: 1.75, borderRadius: '16px', border: `1px solid ${t.border}`, bgcolor: t.surface }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <StockLogo symbol={trade.symbol} size="lg" />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 750 }}>{trade.symbol}</Typography>
              <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{getStockName(trade.symbol, trade.company_name)}</Typography>
            </Box>
            <Box component="span" sx={{ px: 1, py: '2px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: isBuy ? t.pos : t.neg, bgcolor: isBuy ? t.posSoft : t.negSoft }}>{isBuy ? 'Buy' : 'Sell'}</Box>
          </Box>
          <Box sx={{ mt: 1.5 }}>
            {[['Date', fmtDate(f.date)], ['Shares', formatNumber(qty, qty % 1 ? 2 : 0)], ['Price', formatNumber(price, 2)], ['Broker fee', formatCurrency(fee, 2)]].map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', lineHeight: 1.9 }}>
                <Box component="span" sx={{ color: t.ink2 }}>{k}</Box>
                <Box component="span" sx={{ fontFamily: FONT_NUM }}>{v}</Box>
              </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${t.hairline}`, mt: 0.5, pt: 0.75 }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{isBuy ? 'Total paid' : 'Total received'}</Typography>
              <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.96rem', fontWeight: 700 }}>{formatCurrency(total, 2)}</Typography>
            </Box>
          </Box>
        </Box>

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
            onClick={() => showConfirm('Delete this trade?', 'It is removed permanently and your holdings are recalculated. This cannot be undone.', () => del.mutate())}
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
