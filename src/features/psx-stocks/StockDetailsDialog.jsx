import { Box, Dialog, DialogContent, Typography, IconButton, useMediaQuery } from '@mui/material';
import { CloseRounded } from '@mui/icons-material';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { getStockSector } from '../../lib/psxSectors';
import { useFx, FONT_NUM, signColor, PeriodProfit } from '../../components/fx';
import StockLogo from '../../components/StockLogo';
import { useDividends } from '../../lib/psx/useDividends';
import { useDateRange, rangeLabel } from '../../lib/dateRange';

const signed = (v, dp = 2) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), dp)}`);
const fmtDate = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** One stock: what it is worth now, what it cost, what it made, the dividends it paid in the range, and every trade. */
export default function StockDetailsDialog({ position: p, onClose }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  const { range } = useDateRange();
  const { summary: divs } = useDividends(range, { symbol: p?.symbol ?? '__none__' });
  if (!p) return null;
  const paid = divs?.count ? divs : null;
  const sector = getStockSector(p.symbol);
  const cell = { fontFamily: FONT_NUM, letterSpacing: '-0.02em', textAlign: 'right', whiteSpace: 'nowrap' };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '26px', bgcolor: t.surface, backgroundImage: 'none', p: 0 } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <StockLogo symbol={p.symbol} size="lg" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 750, letterSpacing: '-0.02em' }}>{p.symbol}</Typography>
            <Typography noWrap sx={{ fontSize: '0.74rem', color: t.muted }}>{p.companyName}{sector && sector !== 'Other' ? `, ${sector}` : ''}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25, mb: 1.5 }}>
          <Stat label="Value" value={p.isOpen ? (p.value === null ? '—' : formatCurrency(p.value, 2)) : 'Sold'} />
          <Stat label="Invested" value={formatCurrency(p.invested, 2)} />
          <Stat label="Shares" value={formatNumber(p.shares, p.shares % 1 ? 2 : 0)} sub={p.avgCost !== null ? `avg ${formatNumber(p.avgCost, 2)}` : null} />
          <Stat label="Live price" value={p.price !== null ? formatNumber(p.price, 2) : '—'}
            sub={p.dayChangePct !== null ? `${p.dayChangePct >= 0 ? '+' : ''}${p.dayChangePct.toFixed(2)}% today` : null}
            subColor={p.dayChangePct !== null ? signColor(t, p.dayChangePct) : undefined} />
        </Box>

        <PeriodProfit assetType="psx" assetKey={p.symbol} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25, mb: 2.5 }}>
          <Gain label="Unrealized" value={p.isOpen ? p.unrealized : null} sub={p.unrealizedPct !== null ? `${p.unrealizedPct >= 0 ? '+' : ''}${p.unrealizedPct.toFixed(2)}% on cost` : 'Nothing held'} />
          <Gain label="Realized" value={p.realizedAllTime ?? p.realized} sub="all shares sold, after fees" />
          <Gain label="Dividends" value={paid ? paid.net : null} muted={!paid}
            sub={paid ? `${paid.count} payment${paid.count === 1 ? '' : 's'} in ${rangeLabel(range)}, after ${formatCurrency(paid.deductions, 2)} tax` : `None paid in ${rangeLabel(range)}`} />
        </Box>

        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, mb: 0.75 }}>Trades · {p.trades.length}</Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{
            width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 480,
            '& th': { color: t.muted, fontWeight: 600, fontSize: '0.66rem', textAlign: 'right', pb: 0.5, px: 1 },
            '& th:first-of-type, & td:first-of-type, & th:nth-of-type(2), & td:nth-of-type(2)': { textAlign: 'left' },
            '& th:first-of-type, & td:first-of-type': { pl: 0 },
            '& td': { ...cell, py: 0.7, px: 1, borderTop: `1px solid ${t.hairline}` },
          }}>
            <thead><tr><th>Date</th><th>Type</th><th>Shares</th><th>Price</th><th>Fee</th><th>Amount</th></tr></thead>
            <tbody>
              {p.trades.map((x) => {
                const amt = Number(x.price) * Number(x.quantity) + (x.type === 'buy' ? Number(x.fee || 0) : -Number(x.fee || 0));
                return (
                  <tr key={x.id}>
                    <td>{fmtDate(x.date)}</td>
                    <Box component="td" sx={{ fontFamily: 'inherit !important', color: x.type === 'buy' ? t.pos : t.neg, fontWeight: 600 }}>{x.type === 'buy' ? 'Buy' : 'Sell'}</Box>
                    <td>{formatNumber(Number(x.quantity), Number(x.quantity) % 1 ? 2 : 0)}</td>
                    <td>{formatNumber(Number(x.price), 2)}</td>
                    <td>{x.fee ? formatNumber(Number(x.fee), 2) : '—'}</td>
                    <td>{formatNumber(amt, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Box>
        </Box>

        {paid && (
          <>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, mt: 2.5, mb: 0.75 }}>Dividends · {paid.count}</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{
                width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 420,
                '& th': { color: t.muted, fontWeight: 600, fontSize: '0.66rem', textAlign: 'right', pb: 0.5, px: 1 },
                '& th:first-of-type, & td:first-of-type': { textAlign: 'left', pl: 0 },
                '& td': { ...cell, py: 0.7, px: 1, borderTop: `1px solid ${t.hairline}` },
              }}>
                <thead><tr><th>Paid</th><th>Shares</th><th>Gross</th><th>Tax</th><th>Net</th></tr></thead>
                <tbody>
                  {paid.rows.map((d) => (
                    <tr key={d.id}>
                      <td>{fmtDate(d.payment_date)}</td>
                      <td>{formatNumber(Number(d.shares), Number(d.shares) % 1 ? 2 : 0)}</td>
                      <td>{formatNumber(Number(d.gross_amount), 2)}</td>
                      <td>{formatNumber(Number(d.tax_amount) + Number(d.jh_tax_amount ?? 0) + Number(d.zakat_amount ?? 0), 2)}</td>
                      <Box component="td" sx={{ color: t.pos, fontWeight: 650 }}>+{formatNumber(Number(d.net_amount), 2)}</Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, subColor }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 1.1 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.03em' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.64rem', color: subColor ?? t.muted, fontFamily: FONT_NUM }}>{sub}</Typography>}
    </Box>
  );
}

function Gain({ label, value, sub, muted }) {
  const t = useFx();
  return (
    <Box sx={{ border: `1px solid ${t.border}`, borderRadius: '16px', px: 1.75, py: 1.4 }}>
      <Typography sx={{ fontSize: '0.74rem', color: t.ink2, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '1.45rem', fontWeight: 650, letterSpacing: '-0.04em', color: muted ? t.muted : signColor(t, value ?? 0), lineHeight: 1.2 }}>{muted ? '—' : signed(value)}</Typography>
      <Typography sx={{ fontSize: '0.68rem', color: t.muted }}>{sub}</Typography>
    </Box>
  );
}
