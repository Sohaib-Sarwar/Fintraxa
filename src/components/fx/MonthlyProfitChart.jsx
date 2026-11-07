import { Box, Typography } from '@mui/material';
import { BarChartRounded } from '@mui/icons-material';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, ReferenceLine } from 'recharts';
import { useFx, FONT_NUM, FONT_DISPLAY } from './tokens';
import { compactNum } from './format';
import { formatCurrency } from '../../lib/formatters';

const GREEN = '#5fd3a3';
const CORAL = '#f58f86';
const LOSS = '#ef6b62';

/**
 * Profit by month (after the "BAR CHART UI" reference): one rounded bar per
 * month on a pale track. The bar is the gross profit; its green part is what
 * you kept (net) and the coral cap is the CGT. A refund month is all green.
 * months: [{ month, label, gross, cgt, net }]
 */
export default function MonthlyProfitChart({ months, title = 'Profit by month', subtitle, height = 240, monthName = (m) => m }) {
  const t = useFx();
  const data = months.map((m) => ({ ...m, bar: m.net >= 0 ? Math.max(m.gross, m.net, 0) : Math.min(m.gross, m.net) }));
  const empty = !data.some((m) => m.gross || m.cgt || m.net);
  return (
    <Box sx={{
      bgcolor: t.surface, border: `1px solid ${t.border}`, borderRadius: '26px', boxShadow: t.shadow, height: '100%',
      px: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.75 }, pb: 2, display: 'flex', flexDirection: 'column', minWidth: 0,
    }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={{ fontFamily: FONT_DISPLAY, fontSize: { xs: '1.15rem', md: '1.4rem' }, fontWeight: 800, letterSpacing: '-0.03em', color: t.ink, lineHeight: 1.15 }}>{title}</Typography>
          {subtitle && <Typography sx={{ fontSize: '0.84rem', color: t.ink2, mt: 0.5 }}>{subtitle}</Typography>}
        </Box>
        <Box sx={{ width: 40, height: 40, borderRadius: '12px', display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff', background: 'linear-gradient(180deg, #ff7a9a 0%, #f0436c 100%)', boxShadow: '0 4px 10px -4px rgba(240,67,108,.6)' }}>
          <BarChartRounded sx={{ fontSize: 22 }} />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 1, fontSize: '0.72rem', color: t.ink2 }}>
        {[['Net', GREEN], ['CGT', CORAL]].map(([l, c]) => (
          <Box key={l} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="i" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: c }} />{l}
          </Box>
        ))}
        <Box component="span" sx={{ color: t.muted }}>Bar = gross profit</Box>
      </Box>

      {/* A definite height (not min-height): ResponsiveContainer measures its
          parent, and a box with only min-height measures 0 when nothing
          stretches it. flex-grow still fills a taller card on the dashboard. */}
      <Box sx={{ flex: '1 1 auto', height, minHeight: height, position: 'relative' }}>
        {empty ? (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: t.muted }}>No profit realized in this period</Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 0, left: 0, bottom: 0 }} barCategoryGap="18%">
              <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} tick={{ fontSize: 11, fill: t.muted }} />
              <YAxis hide domain={[(min) => Math.min(0, min), (max) => Math.max(0, max)]} />
              <ReferenceLine y={0} stroke={t.hairline} />
              <Tooltip cursor={false} content={<ProfitTip monthName={monthName} />} />
              <Bar dataKey="bar" maxBarSize={56} background={{ fill: t.surface2, radius: 14 }} shape={<ProfitShape />} isAnimationActive animationDuration={500}>
                <LabelList dataKey="net" position="top" formatter={(v) => (v ? compactNum(v) : '')}
                  style={{ fontFamily: FONT_NUM, fontSize: 12, fontWeight: 650, fill: t.ink, letterSpacing: '-0.02em' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Box>
  );
}

/** Draws one month: green (net) below, coral (CGT) on top, clipped to one rounded bar. */
function ProfitShape({ x, y, width, height, payload }) {
  if (!height || !width) return null;
  const top = height < 0 ? y + height : y;
  const h = Math.abs(height);
  const r = Math.min(14, width / 2, h / 2);
  const id = `pb-${payload.month}`;
  if (payload.bar < 0) return <rect x={x} y={top} width={width} height={h} rx={r} fill={LOSS} />;
  const share = payload.gross > 0 && payload.cgt > 0 ? Math.min(1, payload.cgt / payload.bar) : 0;
  const cgtH = h * share;
  return (
    <g>
      <defs><clipPath id={id}><rect x={x} y={top} width={width} height={h} rx={r} /></clipPath></defs>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={top + cgtH} width={width} height={h - cgtH} fill={GREEN} />
        {cgtH > 0 && <rect x={x} y={top} width={width} height={cgtH} fill={CORAL} />}
      </g>
    </g>
  );
}

function ProfitTip({ active, payload, monthName }) {
  const t = useFx();
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  const row = (label, v, c) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.74rem', lineHeight: 1.75 }}>
      <Box sx={{ width: 9, height: 9, borderRadius: '3px', bgcolor: c }} />
      <span style={{ opacity: 0.85 }}>{label}</span>
      <Box component="span" sx={{ ml: 'auto', pl: 2, fontFamily: FONT_NUM, fontWeight: 650 }}>{formatCurrency(v, 2)}</Box>
    </Box>
  );
  return (
    <Box sx={{ bgcolor: t.tipBg, color: t.tipInk, borderRadius: '12px', px: 1.5, py: 1.25, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
      <Typography sx={{ fontSize: '0.74rem', fontWeight: 650, mb: 0.25, color: t.tipInk }}>{monthName(m.month)}</Typography>
      {row('Gross profit', m.gross, '#9aa3ad')}
      {row('CGT', m.cgt, CORAL)}
      {row('Net profit', m.net, GREEN)}
    </Box>
  );
}
