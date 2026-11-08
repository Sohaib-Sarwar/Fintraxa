import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { useFx, FONT_NUM, FONT_DISPLAY, signColor } from './tokens';
import FitMoney from './FitMoney';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), 2)}`);

const COPY = {
  realized: {
    title: 'Realized gain', taxLabel: 'CGT paid', netLabel: 'After CGT', grossLabel: 'Before CGT', headline: 'net',
    hint: 'Profit on units sold in this period: sale proceeds − their FIFO cost (plus any distributions). CGT is what your statements deducted.',
  },
  unrealized: {
    title: 'Unrealized gain', taxLabel: 'CGT 15% (est.)', netLabel: 'After est. CGT', grossLabel: 'Gross', headline: 'gross',
    hint: 'Profit on what you still hold: its value today − its cost. No tax is due until you sell; the estimate is 15% of the net gain, and nothing on a net loss.',
  },
};

/**
 * One figure large, the other and the tax (or fees) in two small tiles.
 *   realized:   what you actually made is large (after fees / CGT); before-fees in a tile
 *   unrealized: gross is large; after the estimated CGT in a tile
 * kind picks the default copy; grossLabel / netLabel / taxLabel / hint / headline override it.
 */
export default function GainCard({ kind, net, gross, tax, title, compact, grossLabel, netLabel, taxLabel, hint, headline }) {
  const t = useFx();
  const c = {
    ...COPY[kind], ...(taxLabel ? { taxLabel } : {}), ...(netLabel ? { netLabel } : {}),
    ...(grossLabel ? { grossLabel } : {}), ...(hint ? { hint } : {}), ...(headline ? { headline } : {}),
  };
  const big = c.headline === 'net' ? { label: c.netLabel ?? 'Net', value: net } : { label: c.grossLabel ?? 'Gross', value: gross };
  const small = c.headline === 'net' ? { label: c.grossLabel ?? 'Gross', value: gross } : { label: c.netLabel ?? 'Net', value: net };
  return (
    <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: compact ? '20px' : '26px', boxShadow: compact ? 'none' : t.shadow, p: compact ? 1.75 : { xs: 2, md: 2.75 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontFamily: FONT_DISPLAY, fontSize: compact ? '0.8rem' : '0.95rem', fontWeight: 700, color: t.ink2 }}>{title ?? c.title}</Typography>
        <Tooltip title={c.hint} arrow><InfoOutlined sx={{ fontSize: 16, color: t.muted }} /></Tooltip>
      </Box>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: compact ? 0.75 : 2 }}>{big.label}</Typography>
      <Typography data-numeric component="div" sx={{ fontFamily: FONT_NUM, fontWeight: 650, fontSize: compact ? '1.5rem' : 'clamp(1.8rem, 3vw, 2.5rem)', letterSpacing: '-0.045em', lineHeight: 1.05, color: signColor(t, big.value ?? 0), minWidth: 0 }}>
        {big.value === null || big.value === undefined ? '—' : <FitMoney value={big.value} format={signed} />}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: compact ? 1.25 : 2.25 }}>
        <Tile label={small.label} amount={small.value} format={signed} />
        <Tile label={c.taxLabel} amount={tax ?? 0} format={(n) => formatCurrency(n, 2)} />
      </Box>
    </Box>
  );
}

function Tile({ label, amount, format }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, border: `1px solid ${t.hairline}`, borderRadius: '14px', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</Typography>
      <Typography data-numeric component="div" sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.03em', color: t.ink, minWidth: 0 }}>{amount === null || amount === undefined ? '—' : <FitMoney value={amount} format={format} />}</Typography>
    </Box>
  );
}
