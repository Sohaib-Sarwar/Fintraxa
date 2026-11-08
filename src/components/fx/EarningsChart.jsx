import { useTheme, Box, Typography } from '@mui/material';
import { NorthEastRounded, SouthEastRounded } from '@mui/icons-material';
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useFx, FONT_NUM, earningsColors } from './tokens';
import { useWidth, useHoverLayer } from './hooks';
import { HoverLayerHost, HoverPortal } from './HoverLayer';
import { formatCurrency, compactNumber } from '../../lib/formatters';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const kAxis = (v) => compactNumber(v);
/**
 * Where the hover card sits relative to its point so it never leaves the chart
 * (and slides under the next card on the page): centred, or anchored to the
 * left / right edge near the sides. Returns the card x, the flex
 * alignment and where the caret points.
 */
function placeCard(cx, width, FW) {
  const HALF = 118;  // about half a typical card
  const PAD = 26;    // caret distance from the card's edge
  if (width && cx + HALF > width) return { x: cx - FW + PAD, justify: 'flex-end', caret: `calc(100% - ${PAD}px)` };
  if (cx < HALF) return { x: cx - PAD, justify: 'flex-start', caret: `${PAD}px` };
  return { x: cx - FW / 2, justify: 'center', caret: '50%' };
}


/**
 * Earnings by month as two smooth lines (after the "line chart UI"
 * reference, without gridlines): gross profit and net profit. The gap
 * between them is the CGT. Hover shows a dark card pinned above the gross point.
 * months: [{ month, label, gross, cgt, net, tick?, title? }] — tick/title
 * override the month labels (used for fiscal years).
 */
export default function EarningsChart({ months, height = 260, taxLabel = 'CGT' }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const c = earningsColors(mode);
  const [wrapRef, width] = useWidth();
  const [layer, layerRef] = useHoverLayer();
  const empty = !months.some((m) => m.gross || m.cgt || m.net);
  if (empty) {
    return (
      <Box sx={{ height, display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', color: t.muted }}>No earnings in this period</Typography>
      </Box>
    );
  }
  const long = months.length <= 7;
  const data = months.map((m, i) => ({
    ...m,
    __x: i,
    tick: m.tick ?? (long ? MONTHS_LONG[Number(m.month.slice(5, 7)) - 1] : m.label),
    change: i > 0 && months[i - 1].net ? ((m.net - months[i - 1].net) / Math.abs(months[i - 1].net)) * 100 : null,
  }));
  const axis = { axisLine: false, tickLine: false, tick: { fontSize: 11.5, fill: c.axis, fontFamily: FONT_NUM } };

  return (
    <Box ref={wrapRef} sx={{ position: 'relative', height, '& .recharts-surface': { overflow: 'visible' }, '& .recharts-wrapper': { overflow: 'visible' } }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {[['g', c.gross], ['n', c.net]].map(([id, col]) => (
              <g key={id}>
                <linearGradient id={`fx-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={col} stopOpacity={mode === 'dark' ? 0.22 : 0.14} />
                  <stop offset="100%" stopColor={col} stopOpacity={0} />
                </linearGradient>
                <filter id={`fx-glow-${id}`} x="-10%" y="-30%" width="120%" height="160%">
                  <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor={col} floodOpacity={mode === 'dark' ? 0.45 : 0.3} />
                </filter>
              </g>
            ))}
          </defs>
          {/* Keyed by position, not by label: daily labels repeat across years ("3 Mar"), and a
              repeated category made the hover land on the first match, not the day under the mouse. */}
          <XAxis dataKey="__x" type="category" tickFormatter={(i) => data[i]?.tick ?? ''} {...axis} interval="preserveStartEnd" minTickGap={8} dy={8} height={34} />
          <YAxis {...axis} width={44} tickCount={6} tickFormatter={kAxis} domain={[(min) => Math.min(0, min), 'auto']} />
          <Tooltip cursor={false} content={() => null} isAnimationActive={false} />
          <Area type="monotone" dataKey="gross" name="Gross" stroke={c.gross} strokeWidth={3} fill="url(#fx-fill-g)" filter="url(#fx-glow-g)"
            dot={false} activeDot={<Ring color={c.gross} surface={t.surface} />} animationDuration={600} />
          {/* Net is drawn last so its hover card sits above both lines. */}
          <Area type="monotone" dataKey="net" name="Net" stroke={c.net} strokeWidth={3} fill="url(#fx-fill-n)" filter="url(#fx-glow-n)"
            dot={false} activeDot={(p) => <HoverCard {...p} layer={layer} colors={c} surface={t.surface} taxLabel={taxLabel} chartWidth={width} key={`hc-${p.index}`} />} animationDuration={600} />
        </ComposedChart>
      </ResponsiveContainer>
      <HoverLayerHost ref={layerRef} />
    </Box>
  );
}

/** The hollow point under the cursor. */
function Ring({ cx, cy, color, surface }) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={6.5} fill={surface} stroke={color} strokeWidth={3} />;
}

/**
 * Ring on the net line plus the dark card pinned above it, caret down: net
 * large, gross and CGT small. The card sizes to its content (no fixed box),
 * inside a generous box anchored bottom-centre on the point.
 */
function HoverCard({ layer, cx, cy, payload, colors, surface, taxLabel, chartWidth }) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const m = payload;
  const FW = 360;   // room the card may use; the card itself is only as wide as its text
  const FH = 220;
  const place = placeCard(cx, chartWidth, FW);
  const up = m.change === null ? null : m.change >= 0;
  const muted = 'rgba(196,205,230,0.85)';
  const line = (label, value, color) => (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, fontSize: '0.72rem', lineHeight: 1.6 }}>
      <Box component="span" sx={{ color: muted }}>{label}</Box>
      <Box component="span" sx={{ fontFamily: FONT_NUM, fontWeight: 600, color, letterSpacing: '-0.01em' }}>{value}</Box>
    </Box>
  );
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={6.5} fill={surface} stroke={colors.net} strokeWidth={3} />
      <HoverPortal layer={layer} x={place.x} y={cy - FH - 16} width={FW} height={FH}>
        <Box sx={{ width: FW, height: FH, display: 'flex', alignItems: 'flex-end', justifyContent: place.justify }}>
          <Box sx={{
            position: 'relative', width: 'max-content', minWidth: 176, maxWidth: FW, boxSizing: 'border-box', borderRadius: '12px',
            px: 1.75, pt: 1.25, pb: 1.25, bgcolor: colors.tip, color: '#fff', whiteSpace: 'nowrap',
            border: `1px solid ${colors.tipBorder}`, boxShadow: '0 14px 32px -12px rgba(0,0,0,.6)', fontFamily: 'inherit',
            '&::after': { content: '""', position: 'absolute', left: place.caret, bottom: -6, width: 12, height: 12, bgcolor: colors.tip, borderRight: `1px solid ${colors.tipBorder}`, borderBottom: `1px solid ${colors.tipBorder}`, transform: 'translateX(-50%) rotate(45deg)', borderRadius: '2px' },
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
                {m.title ?? `${MONTHS_LONG[Number(m.month.slice(5, 7)) - 1]} ${m.month.slice(0, 4)}`}
              </Typography>
              {up !== null && (
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4 }}>
                  <Box sx={{ width: 16, height: 16, borderRadius: 999, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.12)' }}>
                    {up ? <NorthEastRounded sx={{ fontSize: 10 }} /> : <SouthEastRounded sx={{ fontSize: 10 }} />}
                  </Box>
                  <Box component="span" sx={{ fontFamily: FONT_NUM, fontSize: '0.68rem', fontWeight: 650, color: up ? '#34d399' : '#f87171' }}>
                    {up ? '+' : '−'}{Math.abs(m.change).toFixed(2)}%
                  </Box>
                </Box>
              )}
            </Box>
            <Typography sx={{ fontFamily: FONT_NUM, fontSize: '1.3rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.2, mt: 0.5 }}>
              {formatCurrency(m.net, 2)}
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: muted, mb: 0.75 }}>Net profit</Typography>
            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', pt: 0.6 }}>
              {line('Gross', formatCurrency(m.gross, 2), colors.grossOnTip)}
              {line(m.cgt < 0 ? `${taxLabel} refunded` : taxLabel, formatCurrency(Math.abs(m.cgt), 2), '#ffffff')}
            </Box>
          </Box>
        </Box>
      </HoverPortal>
    </g>
  );
}

/** Legend as bordered chips, top-right of the card. */
export function EarningsLegend() {
  const t = useFx();
  const c = earningsColors(useTheme().palette.mode);
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {[['Gross', c.gross], ['Net', c.net]].map(([label, color]) => (
        <Box key={label} component="span" sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.9, height: 30, px: 1.25, borderRadius: '8px',
          border: `1px solid ${t.border}`, fontSize: '0.76rem', color: c.axis, fontWeight: 500,
        }}>
          <Box component="i" sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: color }} />{label}
        </Box>
      ))}
    </Box>
  );
}
