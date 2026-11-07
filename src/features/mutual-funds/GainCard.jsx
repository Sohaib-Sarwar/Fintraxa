import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { formatCurrency } from '../../lib/formatters';
import { useFx, FONT_NUM, FONT_DISPLAY, signColor } from '../../components/fx';

const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), 2)}`);

const COPY = {
  realized: {
    title: 'Realized gain', taxLabel: 'CGT paid',
    hint: 'Profit on units sold in this period: sale proceeds − their FIFO cost (plus any distributions). CGT is what your statements deducted.',
  },
  unrealized: {
    title: 'Unrealized gain', taxLabel: 'CGT 15% (est.)',
    hint: 'Profit on units you still hold: their value today − their FIFO cost. No tax is due until you sell, so 15% is shown as an estimate.',
  },
};

/** Net in big figures; gross and tax in two small tiles. */
export function GainCard({ kind, net, gross, tax, title, compact }) {
  const t = useFx();
  const c = COPY[kind];
  return (
    <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: compact ? '20px' : '26px', boxShadow: compact ? 'none' : t.shadow, p: compact ? 1.75 : { xs: 2, md: 2.75 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontFamily: FONT_DISPLAY, fontSize: compact ? '0.8rem' : '0.95rem', fontWeight: 700, color: t.ink2 }}>{title ?? c.title}</Typography>
        <Tooltip title={c.hint} arrow><InfoOutlined sx={{ fontSize: 16, color: t.muted }} /></Tooltip>
      </Box>
      <Typography sx={{ fontSize: '0.7rem', color: t.muted, mt: compact ? 0.75 : 2 }}>Net</Typography>
      <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontWeight: 650, fontSize: compact ? '1.5rem' : 'clamp(1.8rem, 3vw, 2.5rem)', letterSpacing: '-0.045em', lineHeight: 1.05, color: signColor(t, net ?? 0) }}>
        {signed(net)}
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: compact ? 1.25 : 2.25 }}>
        <Tile label="Gross" value={signed(gross)} />
        <Tile label={c.taxLabel} value={formatCurrency(tax ?? 0, 2)} />
      </Box>
    </Box>
  );
}

function Tile({ label, value }) {
  const t = useFx();
  return (
    <Box sx={{ bgcolor: t.surface2, border: `1px solid ${t.hairline}`, borderRadius: '14px', px: 1.5, py: 1 }}>
      <Typography sx={{ fontSize: '0.66rem', color: t.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: '0.98rem', fontWeight: 650, letterSpacing: '-0.03em', color: t.ink }}>{value}</Typography>
    </Box>
  );
}
