import { useEffect, useRef, useState } from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { useFx, FONT_NUM } from './tokens';
import { formatCurrency } from '../../lib/formatters';

/**
 * Drawn from the app's own palette so the ring belongs to the theme: the
 * ink colour first (black in light mode, white in dark), then the violet and
 * cyan of the line charts, then their soft tints. Others is a quiet grey.
 */
const PALETTE = {
  light: ['#1b1d22', '#4f3fa6', '#3fb8d0', '#8e86d8', '#9fdcea', '#6b7079'],
  dark: ['#f2f2f4', '#9c8cff', '#5fdcef', '#c4bbff', '#a9ecf6', '#8b8b93'],
};
const OTHERS = { light: '#d9dce1', dark: '#3a3a40' };
const MAX_SLICES = 5;
const rad = (deg) => (deg * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/**
 * Allocation donut: thick ring of rounded segments, each end overlapping the
 * next, with the holding's logo in its end cap and quiet % labels outside.
 * The largest holdings get their own segment; the rest fold into "Others".
 * Hover (or tap) a segment to see its name, value and share in the centre.
 *
 * items: [{ key, label, sub?, value, logo?, onClick? }]
 */
export default function AllocationDonut({ items, centerLabel = 'Total' }) {
  const t = useFx();
  const mode = useTheme().palette.mode;
  const wrap = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sorted = [...items].filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0);
  const head = sorted.slice(0, sorted.length > MAX_SLICES + 1 ? MAX_SLICES : sorted.length);
  const rest = sorted.slice(head.length);
  const slices = [
    ...head.map((i, k) => ({ ...i, color: PALETTE[mode][k] })),
    ...(rest.length ? [{ key: 'others', label: `Others (${rest.length})`, value: rest.reduce((s, i) => s + i.value, 0), color: OTHERS[mode] }] : []),
  ].map((s) => ({ ...s, share: total > 0 ? s.value / total : 0 }));


  // The ring alone, centred and as large as the card allows.
  const size = Math.max(170, Math.min(box.w, box.h || 300, 340));
  const W = size * 0.15;                 // ring thickness
  const labelPad = 26;                   // room for % labels outside the ring
  const R = size / 2 - W / 2 - labelPad;
  const C = size / 2;
  const capDeg = (W / 2 / R) * (180 / Math.PI);
  let a = -200;                          // start near ten o'clock, like the reference
  const segs = slices.map((s) => {
    const span = s.share * 360;
    const seg = { ...s, a0: a, a1: a + span };
    a += span;
    return seg;
  });
  const active = hover !== null ? segs.find((s) => s.key === hover) : null;
  const single = segs.length === 1;

  if (!segs.length) {
    return (
      <Box ref={wrap} sx={{ flex: 1, minHeight: 200, display: 'grid', placeItems: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', color: t.muted }}>Nothing held</Typography>
      </Box>
    );
  }

  return (
    <Box ref={wrap} sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={`Allocation: ${segs.map((s) => `${s.label} ${(s.share * 100).toFixed(0)}%`).join(', ')}`} style={{ overflow: 'visible' }}>
          <circle cx={C} cy={C} r={R} fill="none" stroke={t.surface2} strokeWidth={W} />
          {single ? (
            <circle cx={C} cy={C} r={R} fill="none" stroke={segs[0].color} strokeWidth={W} />
          ) : (
            // Drawn last-to-first so each segment's rounded end sits over the next one's start.
            [...segs].reverse().map((s) => {
              const end = Math.min(s.a1 + capDeg * 0.15, s.a0 + 359.5);
              return (
                <path key={s.key} d={arc(C, C, R, s.a0 + capDeg * 0.15, end)} fill="none" stroke={s.color} strokeWidth={W} strokeLinecap="round"
                  opacity={active && active.key !== s.key ? 0.4 : 1} style={{ transition: 'opacity .2s', cursor: s.onClick ? 'pointer' : 'default' }}
                  onMouseEnter={() => setHover(s.key)} onMouseLeave={() => setHover(null)} onClick={s.onClick ?? (() => setHover(hover === s.key ? null : s.key))} />
              );
            })
          )}
          {segs.map((s) => {
            const showLogo = s.logo && (single || s.share >= 0.06);
            const showPct = !single && s.share >= 0.04;
            const [lx, ly] = pt(C, C, R, s.a1 - (single ? 90 : Math.min(capDeg * 0.9, (s.a1 - s.a0) / 2)));
            const [px, py] = pt(C, C, R + W / 2 + 15, (s.a0 + s.a1) / 2);
            const d = W * 0.78;
            return (
              <g key={`m-${s.key}`} style={{ pointerEvents: 'none' }} opacity={active && active.key !== s.key ? 0.4 : 1}>
                {showLogo && (
                  <>
                    <circle cx={lx} cy={ly} r={d / 2 + 2} fill={t.surface} />
                    <foreignObject x={lx - d / 2} y={ly - d / 2} width={d} height={d}>
                      <Box sx={{ width: d, height: d, borderRadius: '50%', overflow: 'hidden', display: 'grid', placeItems: 'center', '& > *': { width: `${d}px !important`, height: `${d}px !important`, borderRadius: '50% !important' } }}>
                        {s.logo}
                      </Box>
                    </foreignObject>
                  </>
                )}
                {showPct && (
                  <text x={px} y={py} textAnchor="middle" dominantBaseline="central" fill={t.muted}
                    style={{ fontFamily: FONT_NUM, fontSize: 12, fontWeight: 500, letterSpacing: '-0.02em' }}>
                    {(s.share * 100).toFixed(0)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <Box sx={{ maxWidth: R * 1.35 }}>
            <Typography noWrap sx={{ fontSize: '0.7rem', color: t.muted }}>{active ? active.label : centerLabel}</Typography>
            <Typography data-numeric noWrap sx={{ fontFamily: FONT_NUM, fontSize: size > 220 ? '1.08rem' : '0.92rem', fontWeight: 650, letterSpacing: '-0.03em', color: t.ink }}>
              {formatCurrency(active ? active.value : total)}
            </Typography>
            {active && <Typography data-numeric sx={{ fontFamily: FONT_NUM, fontSize: '0.68rem', color: t.muted }}>{(active.share * 100).toFixed(1)}%</Typography>}
          </Box>
        </Box>
      </Box>

    </Box>
  );
}
