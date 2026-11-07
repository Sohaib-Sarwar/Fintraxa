import { Box, ButtonBase, Typography, useTheme } from '@mui/material';
import { useFx, FONT_NUM } from './tokens';
import { formatCurrency } from '../../lib/formatters';
import AnimatedValue from './AnimatedValue';

/** Card surface used by every block on the dashboards (matches the app's Card). */
export function Panel({ children, sx, component = 'section' }) {
  const t = useFx();
  return (
    <Box component={component} sx={{
      bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '20px', boxShadow: t.shadow,
      p: { xs: 1.75, md: 2.25 }, display: 'flex', flexDirection: 'column', minWidth: 0, ...sx,
    }}>
      {children}
    </Box>
  );
}

export function PanelHeader({ title, sub, right }) {
  const t = useFx();
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.5, flexWrap: 'wrap', minHeight: 32, flexShrink: 0 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" sx={{ fontSize: '0.92rem', fontWeight: 650, color: t.ink, letterSpacing: '-0.01em' }}>{title}</Typography>
        {sub && <Typography sx={{ fontSize: '0.72rem', color: t.muted }}>{sub}</Typography>}
      </Box>
      {right}
    </Box>
  );
}

/** The one large figure on a page; paisa set back in the muted ink. */
export function HeroValue({ value }) {
  const t = useFx();
  return (
    <Typography data-numeric component="p" sx={{
      fontFamily: FONT_NUM, fontWeight: 600, fontSize: { xs: '2.25rem', md: '3.1rem' }, letterSpacing: '-0.045em', lineHeight: 1.05,
      color: t.ink, mt: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {value === null || value === undefined ? '—' : <AnimatedValue value={value} format={(n) => formatCurrency(n, 2)} split dimColor={t.muted} />}
    </Typography>
  );
}

/**
 * The long summary card: a headline amount on the left, the figures behind
 * it on the right as a ledger separated by hairlines.
 * metrics: [{ label, amount?, format?, value?, note?, color?, onClick? }] — amount + format animates; value is shown as is
 */
export function SummaryCard({ label, value, sub, metrics = [], extra, background, labelSx }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const art = background ? background[mode] : null;
  return (
    <Panel sx={{
      mb: 2, p: { xs: 2, md: 3 }, flexShrink: 0, position: 'relative', overflow: 'hidden',
      ...(art ? {
        // The artwork sits to the right; a fade from the card colour keeps the figures legible.
        backgroundImage: `linear-gradient(90deg, ${t.surface} 0%, ${t.surface} 22%, transparent 68%), url(${art})`,
        backgroundSize: 'auto, cover', backgroundPosition: '0 0, 70% 62%', backgroundRepeat: 'no-repeat',
      } : {}),
    }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' }, alignItems: 'end', gap: { xs: 2.5, md: 4 } }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.82rem', color: t.ink2, fontWeight: 500, ...labelSx }}>{label}</Typography>
          <HeroValue value={value} />
          {sub && <Typography sx={{ fontSize: '0.74rem', color: t.muted, mt: 0.75 }}>{sub}</Typography>}
          {extra}
        </Box>
        {/* Four or more figures wrap to a 2 × 2 grid on phones; one row from md up. */}
        <Box sx={{
          display: 'grid', rowGap: 1.25,
          gridTemplateColumns: { xs: `repeat(${metrics.length > 3 ? 2 : metrics.length}, minmax(0, 1fr))`, md: `repeat(${metrics.length}, minmax(0, 1fr))` },
          borderTop: { xs: `1px solid ${t.hairline}`, md: 0 }, pt: { xs: 1.5, md: 0 },
        }}>
          {metrics.map((m, i) => <Metric key={m.label} {...m} first={i === 0} firstXs={metrics.length > 3 ? i % 2 === 0 : i === 0} />)}
        </Box>
      </Box>
    </Panel>
  );
}

function Metric({ label, value, amount, format, note, color, onClick, first, firstXs = first }) {
  const t = useFx();
  const body = (
    <>
      <Typography sx={{ fontSize: '0.74rem', color: t.ink2, fontWeight: 500 }}>{label}</Typography>
      <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: { xs: '0.98rem', md: '1.2rem' }, fontWeight: 600, letterSpacing: '-0.03em', color: color ?? t.ink, mt: 0.25 }}>{amount !== undefined && amount !== null ? <AnimatedValue value={amount} format={format ?? ((n) => formatCurrency(n))} /> : value}</Typography>
      {note && <Typography noWrap sx={{ fontSize: '0.68rem', color: t.muted }}>{note}</Typography>}
    </>
  );
  const sx = {
    display: 'block', textAlign: 'left', minWidth: 0, fontFamily: 'inherit',
    px: { xs: firstXs ? 0 : 1.25, md: 2.25 }, py: 0.5,
    borderLeft: { xs: firstXs ? 0 : `1px solid ${t.hairline}`, md: first ? 0 : `1px solid ${t.hairline}` },
  };
  return onClick ? (
    <ButtonBase onClick={onClick} aria-label={`${label}: open details`} sx={{ ...sx, borderRadius: 0, '@media (hover: hover)': { '&:hover p:nth-of-type(2)': { textDecoration: 'underline', textUnderlineOffset: '3px' } } }}>{body}</ButtonBase>
  ) : <Box sx={sx}>{body}</Box>;
}
