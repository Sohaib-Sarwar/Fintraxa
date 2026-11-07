import { useTheme, Box, Typography } from '@mui/material';
import { ResponsiveContainer, ComposedChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useFx, FONT_NUM, earningsColors } from './tokens';
import { formatCurrency } from '../../lib/formatters';

const PRICED = { live: 'Value at live prices', close: 'Value at closing prices', trade: 'Value at your last trade price', mixed: 'Value at the last known prices' };
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const kAxis = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e7 ? `${+(a / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `${+(a / 1e5).toFixed(1)}L` : a >= 1e3 ? `${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k` : `${Math.round(a)}`;
  return v < 0 ? `−${s}` : s;
};

/**
 * Invested vs current value, month by month, in the same line style as the
 * earnings chart: violet for value, cyan for invested, soft glow, no grid.
 * Hover pins a dark card above the value point.
 * points: [{ month, label, invested, value, live?, priced?, tick?, title? }] — tick/title override month labels (fiscal years)
 */
/**
 * keys: which fields to plot. Defaults are value (primary, violet) vs invested
 * (secondary, cyan); Finance passes income vs expense. diffLabel names
 * primary − secondary in the hover card; caption is the line under the big figure.
 */
const DEFAULT_KEYS = { primary: 'value', secondary: 'invested', primaryLabel: 'Value', secondaryLabel: 'Invested', diffLabel: 'Gain' };

export default function GrowthChart({ points, height = 260, keys: keysIn, caption, emptyText = 'No trades yet' }) {
  const keys = { ...DEFAULT_KEYS, ...keysIn };
  const t = useFx();
  const mode = useTheme().palette.mode;
  const c = earningsColors(mode);
  if (!points.length) {
    return <Box sx={{ height, display: 'grid', placeItems: 'center' }}><Typography sx={{ fontSize: '0.8rem', color: t.muted }}>{emptyText}</Typography></Box>;
  }
  const long = points.length <= 7;
  const data = points.map((p) => ({ ...p, tick: p.tick ?? (long ? MONTHS_LONG[Number(p.month.slice(5, 7)) - 1] : p.label) }));
  const axis = { axisLine: false, tickLine: false, tick: { fontSize: 11.5, fill: c.axis, fontFamily: FONT_NUM } };
  return (
    <Box sx={{ position: 'relative', height, '& .recharts-surface': { overflow: 'visible' }, '& .recharts-wrapper': { overflow: 'visible' } }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {[['v', c.gross], ['i', c.net]].map(([id, col]) => (
              <g key={id}>
                <linearGradient id={`gr-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={col} stopOpacity={mode === 'dark' ? 0.22 : 0.14} />
                  <stop offset="100%" stopColor={col} stopOpacity={0} />
                </linearGradient>
                <filter id={`gr-glow-${id}`} x="-10%" y="-30%" width="120%" height="160%">
                  <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor={col} floodOpacity={mode === 'dark' ? 0.45 : 0.3} />
                </filter>
              </g>
            ))}
          </defs>
          <XAxis dataKey="tick" {...axis} interval="preserveStartEnd" minTickGap={8} dy={8} height={34} />
          <YAxis {...axis} width={48} tickCount={6} tickFormatter={kAxis} domain={['auto', 'auto']} />
          <Tooltip cursor={false} content={() => null} isAnimationActive={false} />
          <Area type="monotone" dataKey={keys.secondary} name={keys.secondaryLabel} stroke={c.net} strokeWidth={3} fill="url(#gr-fill-i)" filter="url(#gr-glow-i)"
            dot={false} activeDot={<Ring color={c.net} surface={t.surface} />} animationDuration={600} />
          <Area type="monotone" dataKey={keys.primary} name={keys.primaryLabel} stroke={c.gross} strokeWidth={3} fill="url(#gr-fill-v)" filter="url(#gr-glow-v)"
            dot={false} activeDot={(p) => <Card {...p} colors={c} surface={t.surface} keys={keys} caption={caption} key={`gc-${p.index}`} />} animationDuration={600} />
        </ComposedChart>
      </ResponsiveContainer>
    </Box>
  );
}

function Ring({ cx, cy, color, surface }) {
  if (cx === undefined || cy === undefined) return null;
  return <circle cx={cx} cy={cy} r={6.5} fill={surface} stroke={color} strokeWidth={3} />;
}

function Card({ cx, cy, payload: p, colors, surface, keys, caption }) {
  if (cx === undefined || cy === undefined || !p) return null;
  const FW = 360; const FH = 220;
  const primary = p[keys.primary] ?? 0;
  const secondary = p[keys.secondary] ?? 0;
  const pl = primary - secondary;
  const muted = 'rgba(196,205,230,0.85)';
  const line = (label, value, color) => (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, fontSize: '0.72rem', lineHeight: 1.6 }}>
      <Box component="span" sx={{ color: muted }}>{label}</Box>
      <Box component="span" sx={{ fontFamily: FONT_NUM, fontWeight: 600, color, letterSpacing: '-0.01em' }}>{value}</Box>
    </Box>
  );
  return (
    <g style={{ pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={6.5} fill={surface} stroke={colors.gross} strokeWidth={3} />
      <foreignObject x={cx - FW / 2} y={cy - FH - 16} width={FW} height={FH} style={{ overflow: 'visible' }}>
        <Box sx={{ width: FW, height: FH, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <Box sx={{
            position: 'relative', width: 'max-content', minWidth: 176, boxSizing: 'border-box', borderRadius: '12px', px: 1.75, py: 1.25,
            bgcolor: colors.tip, color: '#fff', whiteSpace: 'nowrap', boxShadow: '0 12px 28px -10px rgba(5,10,30,.55)',
            '&::after': { content: '""', position: 'absolute', left: '50%', bottom: -6, width: 12, height: 12, bgcolor: colors.tip, transform: 'translateX(-50%) rotate(45deg)', borderRadius: '2px' },
          }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              {p.title ?? (p.live ? 'Today' : `${MONTHS_LONG[Number(p.month.slice(5, 7)) - 1]} ${p.month.slice(0, 4)}`)}
            </Typography>
            <Typography sx={{ fontFamily: FONT_NUM, fontSize: '1.3rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.2, mt: 0.5 }}>{formatCurrency(primary, 2)}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: muted, mb: 0.75 }}>{caption ?? PRICED[p.priced] ?? (p.live ? 'Value at live price' : keys.primaryLabel)}</Typography>
            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)', pt: 0.6 }}>
              {line(keys.secondaryLabel, formatCurrency(secondary, 2), '#7fe3f2')}
              {line(keys.diffLabel, `${pl >= 0 ? '+' : '−'}${formatCurrency(Math.abs(pl), 2)}`, pl >= 0 ? '#34d399' : '#f87171')}
            </Box>
          </Box>
        </Box>
      </foreignObject>
    </g>
  );
}

/** Legend chips matching the chart. */
export function GrowthLegend() {
  const t = useFx();
  const c = earningsColors(useTheme().palette.mode);
  return (
    <Box sx={{ display: 'flex', gap: 1 }}>
      {[['Value', c.gross], ['Invested', c.net]].map(([label, color]) => (
        <Box key={label} component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.9, height: 30, px: 1.25, borderRadius: '8px', border: `1px solid ${t.border}`, fontSize: '0.76rem', color: c.axis, fontWeight: 500 }}>
          <Box component="i" sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: color }} />{label}
        </Box>
      ))}
    </Box>
  );
}
