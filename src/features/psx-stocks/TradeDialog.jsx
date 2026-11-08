import { useState } from 'react';
import { Box, Dialog, DialogContent, Typography, IconButton, ButtonBase, InputBase, useMediaQuery } from '@mui/material';
import { CloseRounded } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { dbErrorHandler } from '../../lib/dbErrors';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { formatCurrency, formatNumber, calcBrokerFee } from '../../lib/formatters';
import { getStockName } from '../../lib/stockMeta';
import { getStockSector } from '../../lib/psxSectors';
import { useFx, Seg, FONT_NUM, signColor } from '../../components/fx';
import DateField from '../../components/fx/DateField';
import StockLogo from '../../components/StockLogo';

const DECIMAL = /^\d+(\.\d+)?$/;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Buy or sell one stock. Shows the live quote and your position, takes
 * price (market by default), shares or amount, date and broker fee (worked
 * out automatically, editable), and books the trade in one step.
 *
 * stock: live record ({ symbol, name, current, change, change_pct })
 * position: from analyzeStocks (shares, avgCost) or null
 */
export default function TradeDialog({ stock, position, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const user = useAuthStore((s) => s.user);
  const showSnackbar = useAppStore((s) => s.showSnackbar);
  const qc = useQueryClient();
  const held = position?.shares ?? 0;
  const [side, setSide] = useState('buy');
  const [by, setBy] = useState('shares');
  const [price, setPrice] = useState(stock.current ? String(stock.current) : '');
  const [qty, setQty] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [fee, setFee] = useState('');
  const [feeEdited, setFeeEdited] = useState(false);

  const p = DECIMAL.test(String(price).trim()) ? Number(price) : 0;
  const shares = by === 'shares'
    ? (DECIMAL.test(String(qty).trim()) ? Number(qty) : 0)
    : (p > 0 && DECIMAL.test(String(amount).trim()) ? Math.floor((Number(amount) / p) * 100) / 100 : 0);
  const subtotal = shares * p;
  const autoFee = calcBrokerFee(p, shares);
  const feeValue = feeEdited ? (DECIMAL.test(String(fee).trim()) ? Number(fee) : 0) : autoFee;
  const total = side === 'buy' ? subtotal + feeValue : subtotal - feeValue;

  const problem = !p ? 'Enter a price'
    : !shares ? 'Enter shares or an amount'
      : date > today() ? 'The date cannot be in the future'
        : side === 'sell' && shares > held + 1e-9 ? `You hold ${formatNumber(held, held % 1 ? 2 : 0)} shares`
          : null;

  const book = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('stock_transactions').insert({
        user_id: user.id, symbol: stock.symbol.toUpperCase(), company_name: stock.name || getStockName(stock.symbol) || stock.symbol,
        type: side, price: p, quantity: shares, fee: Math.round(feeValue * 100) / 100, date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      ['stock-transactions', 'home-st-txns'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      showSnackbar(`${side === 'buy' ? 'Bought' : 'Sold'} ${formatNumber(shares, shares % 1 ? 2 : 0)} ${stock.symbol}`, 'success');
      onClose();
    },
    onError: dbErrorHandler(showSnackbar, 'Could not record the trade'),
  });

  const sector = getStockSector(stock.symbol);
  const field = (label, value, onChange, props = {}) => (
    <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.muted }}>{label}</Box>
      {props.type === 'date' ? <DateField value={value} onChange={onChange} min={props.inputProps?.min} max={props.inputProps?.max} label={label} sx={{ height: 42, fontSize: '0.86rem' }} /> : <InputBase value={value} onChange={(e) => onChange(e.target.value)} inputProps={{ inputMode: props.type === 'date' ? undefined : 'decimal', 'aria-label': label, ...props.inputProps }}
        type={props.type} endAdornment={props.end}
        sx={{ height: 42, px: 1.25, borderRadius: '12px', border: `1px solid ${t.border}`, bgcolor: t.surface2, color: t.ink, fontSize: '0.86rem',
          fontFamily: props.type === 'date' ? 'inherit' : FONT_NUM, '&.Mui-focused': { borderColor: t.ink }, '& input': { colorScheme: 'inherit' } }} />}
    </Box>
  );

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: '24px', bgcolor: t.surface, backgroundImage: 'none', p: 0, m: isMobile ? 1.25 : 4, width: isMobile ? 'calc(100% - 20px)' : undefined } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <StockLogo symbol={stock.symbol} size="lg" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.02rem', fontWeight: 750, letterSpacing: '-0.02em' }}>{stock.symbol}</Typography>
            <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{getStockName(stock.symbol, stock.name)}{sector && sector !== 'Other' ? `, ${sector}` : ''}</Typography>
          </Box>
          <IconButton size="small" aria-label="Close" onClick={onClose}><CloseRounded fontSize="small" /></IconButton>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.5 }}>
          <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.7rem', fontWeight: 650, letterSpacing: '-0.04em', lineHeight: 1 }}>{formatNumber(stock.current ?? 0, 2)}</Typography>
          {stock.change_pct !== undefined && stock.change_pct !== null && (
            <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.78rem', fontWeight: 600, color: signColor(t, stock.change_pct) }}>
              {stock.change >= 0 ? '+' : '−'}{formatNumber(Math.abs(stock.change ?? 0), 2)} ({stock.change_pct >= 0 ? '+' : '−'}{Math.abs(stock.change_pct).toFixed(2)}%)
            </Typography>
          )}
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: t.muted, mt: 0.5, mb: 2 }}>
          {held > 0 ? `You hold ${formatNumber(held, held % 1 ? 2 : 0)} shares at ${formatNumber(position.avgCost ?? 0, 2)}` : 'You hold none'}
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, mb: 1.75, flexWrap: 'wrap' }}>
          <Seg label="Side" value={side} onChange={setSide} options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
          <Seg label="Enter by" value={by} onChange={(v) => { setBy(v); setQty(''); setAmount(''); }} options={[{ value: 'shares', label: 'Shares' }, { value: 'amount', label: 'Amount' }]} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
          {field('Price', price, setPrice, {
            end: <ButtonBase onClick={() => setPrice(String(stock.current ?? ''))} sx={{ fontSize: '0.66rem', fontWeight: 650, color: t.ink2, px: 0.75, py: 0.25, borderRadius: 999, bgcolor: t.surface3, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Market</ButtonBase>,
          })}
          {by === 'shares' ? field('Shares', qty, setQty, {
            end: side === 'sell' && held > 0
              ? <ButtonBase onClick={() => setQty(String(held))} sx={{ fontSize: '0.66rem', fontWeight: 650, color: t.ink2, px: 0.75, py: 0.25, borderRadius: 999, bgcolor: t.surface3, fontFamily: 'inherit' }}>All</ButtonBase>
              : null,
          }) : field('Amount (Rs)', amount, setAmount)}
          {field('Date', date, setDate, { type: 'date', inputProps: { max: today() } })}
          {field('Broker fee', feeEdited ? fee : String(autoFee), (v) => { setFee(v); setFeeEdited(true); })}
        </Box>

        <Box sx={{ mt: 2, p: 1.5, borderRadius: '14px', bgcolor: t.surface2 }}>
          {[['Shares', formatNumber(shares, shares % 1 ? 2 : 0)], ['Subtotal', formatCurrency(subtotal, 2)], ['Broker fee', `${side === 'buy' ? '+' : '−'}${formatCurrency(feeValue, 2)}`]].map(([k, v]) => (
            <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', lineHeight: 1.9 }}>
              <Box component="span" sx={{ color: t.ink2 }}>{k}</Box>
              <Box component="span" sx={{ fontFamily: FONT_NUM, color: t.ink, letterSpacing: '-0.01em' }}>{v}</Box>
            </Box>
          ))}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${t.hairline}`, mt: 0.5, pt: 0.75 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 650 }}>{side === 'buy' ? 'You pay' : 'You receive'}</Typography>
            <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 700, letterSpacing: '-0.02em' }}>{formatCurrency(Math.max(0, total), 2)}</Typography>
          </Box>
        </Box>

        {problem && (p || shares) ? <Typography sx={{ fontSize: '0.72rem', color: t.neg, mt: 1.25 }}>{problem}</Typography> : null}

        <ButtonBase disabled={!!problem || book.isPending} onClick={() => book.mutate()}
          sx={{
            mt: 2, width: '100%', height: 46, borderRadius: 999, fontSize: '0.86rem', fontWeight: 700, fontFamily: 'inherit', color: '#fff',
            bgcolor: side === 'buy' ? t.pos : t.neg, opacity: problem || book.isPending ? 0.4 : 1, transition: 'opacity .16s',
          }}>
          {book.isPending ? 'Saving…' : `${side === 'buy' ? 'Buy' : 'Sell'}${shares ? ` ${formatNumber(shares, shares % 1 ? 2 : 0)} ${stock.symbol}` : ''}`}
        </ButtonBase>
      </DialogContent>
    </Dialog>
  );
}
