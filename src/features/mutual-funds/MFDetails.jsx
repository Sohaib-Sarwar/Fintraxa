import { Box, Dialog, DialogContent, Typography, IconButton, useMediaQuery } from '@mui/material';
import { CloseRounded } from '@mui/icons-material';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import { useFx, FONT_NUM, GainCard, PeriodProfit } from '../../components/fx';
import { fmtDate } from './mfLabels';
import AmcLogo from './AmcLogo';

/**
 * One fund at a glance: what it is worth, what it cost, what it earned over
 * the last day / 7 / 30 days, and realized vs unrealized. Sales, lots and the
 * full transaction list live on the Transactions page (where entries are edited).
 */
export function FundDetailsDialog({ open, onClose, position: p, rangeLabel }) {
  const t = useFx();
  const isMobile = useMediaQuery('(max-width:768px)');
  if (!p) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={isMobile}
      slotProps={{ paper: { sx: { borderRadius: isMobile ? 0 : '26px', bgcolor: t.surface, backgroundImage: 'none', p: 0 } } }}>
      <DialogContent sx={{ p: isMobile ? 2 : 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
          <AmcLogo code={p.amcCode} name={p.amcName} size={46} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 750, letterSpacing: '-0.02em' }}>{p.fundName ?? 'Fund'}</Typography>
            <Typography sx={{ fontSize: '0.74rem', color: t.muted }}>{[p.amcName, p.unitClass, p.account?.account_ref_masked && `Account ${p.account.account_ref_masked}`].filter(Boolean).join(' · ')}</Typography>
          </Box>
          <IconButton aria-label="Close" onClick={onClose}><CloseRounded /></IconButton>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25, mb: 1.5 }}>
          <Stat label="Value" value={p.value === null ? '—' : formatCurrency(p.value, 2)} />
          <Stat label="Invested" value={formatCurrency(p.invested, 2)} />
          <Stat label="Units" value={formatNumber(p.units, 4)} />
          <Stat label="Price" value={p.price ? formatNumber(p.price.value, 4) : '—'} sub={p.price ? fmtDate(p.price.date) : null} />
        </Box>

        <PeriodProfit assetType="mf" assetKey={p.key} />

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
          <GainCard kind="realized" compact title={`Realized · ${rangeLabel ?? ''}`} net={p.realized.net} gross={p.realized.gross} tax={p.realized.cgt} />
          <GainCard kind="unrealized" compact title="Unrealized" net={p.unrealized.net} gross={p.unrealized.gross} tax={p.unrealized.tax} />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, borderRadius: '14px', px: 1.5, py: 1.1 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.03em' }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: '0.62rem', color: t.muted }}>{sub}</Typography>}
    </Box>
  );
}
