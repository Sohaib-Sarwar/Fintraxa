import { useTheme, Box, Typography } from '@mui/material';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { useFx, FONT_NUM, earningsColors } from './tokens';
import { useWidth, useHoverLayer } from './hooks';
import { HoverLayerHost, HoverPortal } from './HoverLayer';
import { formatCurrency, compactNumber } from '../../lib/formatters';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Card placement that keeps it inside the chart near the edges (same rule as the other charts). */
function placeCard(cx, width, FW) {
  const HALF = 118; const PAD = 26;
  if (width && cx + HALF > width) return { x: cx - FW + PAD, justify: 'flex-end', caret: `calc(100% - ${PAD}px)` };
  if (cx < HALF) return { x: cx - PAD, justify: 'flex-start', caret: `${PAD}px` };
  return { x: cx - FW / 2, justify: 'center', caret: '50%' };
}

/**
 * Several money series over months (or fiscal years), drawn exactly like the
 * other line charts in the app: 3px lines with a soft glow and a fading fill,
 * no grid, a ring on the hovered point. Hover pins the same dark card: a
 * headline figure with its caption, then each series in its colour.
 *
 * points:   [{ month, label, tick?, title?, live?, [series.key]: number }]
 * series:   [{ key, label, color }]
 * headline: (point) => ({ value: number, caption: string, signed?: boolean })  the big figure
 * rows:     (point) => [{ label, value: string, color? }]                       extra rows after the series
 */
export default function FlowChart({ points, series, height = 260, headline, rows, emptyText = 'Nothing recorded in this period' }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const c = earningsColors(mode);
  const [wrapRef, width] = useWidth();
  const [layer, layerRef] = useHoverLayer();
  const any = points.some((p) => series.some((s) => Number(p[s.key])));
  if (!points.length || !any) {
    return <Box sx={{ height, display: 'grid', placeItems: 'center' }}><Typography sx={{ fontSize: '0.8rem', color: t.muted }}>{emptyText}</Typography></Box>;
  }
  const long = points.length <= 7;
  const data = points.map((p) => ({
    ...p,
    tick: p.tick ?? (long ? MONTHS_LONG[Number(p.month.slice(5, 7)) - 1] : p.label),
    __top: Math.max(...series.map((s) => Number(p[s.key]) || 0)),
  }));
  const axis = { axisLine: false, tickLine: false, tick: { fontSize: 11.5, fill: c.axis, fontFamily: FONT_NUM } };
  return (
    <Box ref={wrapRef} sx={{ position: 'relative', height, '& .recharts-surface': { overflow: 'visible' }, '& .recharts-wrapper': { overflow: 'visible' } }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <g key={s.key}>
                <linearGradient id={`flow-fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  {/* The first series gets the full fill like the other charts; the rest a lighter one so fills never muddy. */}
                  <stop offset="0%" stopColor={s.color} stopOpacity={(mode === 'dark' ? 0.22 : 0.14) * (i === 0 ? 1 : 0.6)} />
                  <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
                <filter id={`flow-glow-${s.key}`} x="-10%" y="-30%" width="120%" height="160%">
                  <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor={s.color} floodOpacity={mode === 'dark' ? 0.45 : 0.3} />
                </filter>
              </g>
            ))}
          </defs>
          <XAxis dataKey="tick" {...axis} interval="preserveStartEnd" minTickGap={8} dy={8} height={34} />
          <YAxis {...axis} width={48} tickCount={6} tickFormatter={(v) => compactNumber(v)} domain={[(min) => Math.min(0, min), 'auto']} />
          <Tooltip cursor={false} content={() => null} isAnimationActive={false} />
          {series.map((s) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={3} fill={`url(#flow-fill-${s.key})`} filter={`url(#flow-glow-${s.key})`}
              dot={false} activeDot={<Ring color={s.color} surface={t.surface} />} animationDuration={600} />
          ))}
          {/* Invisible line along the highest series: its hover point anchors the card above every line. */}
          <Line dataKey="__top" stroke="transparent" dot={false} isAnimationActive={false} legendType="none"
            activeDot={(p) => <Card {...p} layer={layer} colors={c} series={series} headline={headline} rows={rows} chartWidth={width} key={`fc-${p.index}`} />} />
        </ComposedChart>
      </ResponsiveContainer>
      <HoverLayerHost ref={layerRef} />
    </Box>
  );
}

function Ring({ cx, cy, color, surface }) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={6.5} fill={surface} stroke={color} strokeWidth={3} />;
}

function Card({ layer, cx, cy, payload: p, colors, series, headline, rows, chartWidth }) {
  if (cx === undefined || cy === undefined || !p) return null;
  const FW = 360; const FH = 300;
  const place = placeCard(cx, chartWidth, FW);
  const muted = 'rgba(196,205,230,0.85)';
  const head = headline ? headline(p) : null;
  const extra = rows ? rows(p) : [];
  const line = (label, value, color, dot) => (
    <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2.5, fontSize: '0.72rem', lineHeight: 1.6 }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: muted }}>
        {dot && <Box component="span" sx={{ width: 8, height: 8, borderRadius: 999, bgcolor: dot, flexShrink: 0 }} />}{label}
      </Box>
      <Box component="span" sx={{ fontFamily: FONT_NUM, fontWeight: 600, color: color ?? '#fff', letterSpacing: '-0.01em' }}>{value}</Box>
    </Box>
  );
  const big = head ? `${head.signed && head.value > 0 ? '+' : head.value < 0 ? '−' : ''}${formatCurrency(Math.abs(head.value), 2)}` : null;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <HoverPortal layer={layer} x={place.x} y={cy - FH - 16} width={FW} height={FH}>
        <Box sx={{ width: FW, height: FH, display: 'flex', alignItems: 'flex-end', justifyContent: place.justify }}>
          <Box sx={{
            position: 'relative', width: 'max-content', minWidth: 196, boxSizing: 'border-box', borderRadius: '12px', px: 1.75, py: 1.25,
            bgcolor: colors.tip, color: '#fff', whiteSpace: 'nowrap', border: `1px solid ${colors.tipBorder}`, boxShadow: '0 14px 32px -12px rgba(0,0,0,.6)',
            '&::after': { content: '""', position: 'absolute', left: place.caret, bottom: -6, width: 12, height: 12, bgcolor: colors.tip, borderRight: `1px solid ${colors.tipBorder}`, borderBottom: `1px solid ${colors.tipBorder}`, transform: 'translateX(-50%) rotate(45deg)', borderRadius: '2px' },
          }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              {p.title ?? (p.live ? 'This month so far' : `${MONTHS_LONG[Number(p.month.slice(5, 7)) - 1]} ${p.month.slice(0, 4)}`)}
            </Typography>
            {head && (
              <>
                <Typography sx={{ fontFamily: FONT_NUM, fontSize: '1.3rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.2, mt: 0.5, color: head.value < 0 ? '#f87171' : '#fff' }}>{big}</Typography>
                <Typography sx={{ fontSize: '0.7rem', color: muted, mb: 0.75 }}>{head.caption}</Typography>
              </>
            )}
            <Box sx={{ borderTop: head ? '1px solid rgba(255,255,255,0.1)' : 0, pt: head ? 0.6 : 0.25 }}>
              {series.map((s) => { const v = Number(p[s.key]) || 0; return line(s.label, `${v < 0 ? '−' : ''}${formatCurrency(Math.abs(v), 2)}`, '#fff', s.color); })}
              {extra.map((x) => line(x.label, x.value, x.color))}
            </Box>
          </Box>
        </Box>
      </HoverPortal>
    </g>
  );
}
